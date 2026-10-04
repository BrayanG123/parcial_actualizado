import { PushService } from '../push/push.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { Prisma, ReservationStatus } from '../../generated/prisma/client.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto.js';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto.js';
import {
  expirableStatuses,
  reservationDeadline,
  terminalStatuses,
  transitions,
} from './reservation-policy.js';
import { ReservationsRepository } from './reservations.repository.js';
import type { ReservationRecord } from './reservations.repository.js';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly config: ConfigService,
    @Optional() private readonly push?: PushService,
  ) {}

  async create(dto: CreateReservationDto, user: AuthenticatedUser) {
    if (!user.roles.includes(Role.CUSTOMER))
      throw new ForbiddenException('A customer role is required');
    const approximateTime = new Date(dto.approximateTime);
    if (
      !Number.isFinite(approximateTime.getTime()) ||
      approximateTime <= new Date()
    ) {
      throw new BadRequestException('approximateTime must be in the future');
    }
    const keys = dto.items.map(
      (item) => `${item.productId}:${item.sizeId}:${item.colorId}`,
    );
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException(
        'Duplicate variants are not allowed; combine their quantities',
      );
    }
    const items = [...dto.items].sort(
      (a, b) =>
        a.productId - b.productId ||
        a.sizeId - b.sizeId ||
        a.colorId - b.colorId,
    );
    const expiresAt = reservationDeadline(
      approximateTime,
      this.config.get<string>('RESERVATION_TIME_ZONE') ?? 'America/La_Paz',
    );

    const created = await this.reservationsRepository.transaction(
      async (tx) => {
        const client = await this.reservationsRepository.findClient(
          user.id,
          tx,
        );
        if (!client)
          throw new ForbiddenException('A customer profile is required');
        const branch = await this.reservationsRepository.findBranch(
          dto.branchId,
          tx,
        );
        if (!branch?.active)
          throw new BadRequestException('Branch does not exist or is inactive');
        for (const item of items) {
          await this.reservationsRepository.requireAvailableStock(
            dto.branchId,
            item,
            tx,
          );
        }
        const reservation = await this.reservationsRepository.create(
          {
            clientId: client.id,
            branchId: dto.branchId,
            approximateTime,
            expiresAt,
            observation: dto.observation,
            items,
          },
          tx,
        );
        for (const item of items) {
          await this.reservationsRepository.reserveStock(
            dto.branchId,
            item,
            reservation.id,
            tx,
          );
        }
        return reservation;
      },
    );
    // Aviso fuera de la transaccion: solo se anuncia una reserva confirmada.
    this.notifyCustomer(created.id, 'PENDING');
    return created;
  }

  async findMine(query: ListReservationsQueryDto, user: AuthenticatedUser) {
    this.validateDates(query);
    const client = await this.reservationsRepository.findClient(user.id);
    if (!client) throw new ForbiddenException('A customer profile is required');
    return this.reservationsRepository.findAll(query, client.id);
  }

  async findAll(query: ListReservationsQueryDto, user: AuthenticatedUser) {
    this.validateDates(query);
    if (user.roles.includes(Role.ADMINISTRATOR))
      return this.reservationsRepository.findAll(query);
    const employee = await this.manager(user);
    if (query.branchId && query.branchId !== employee.branchId) {
      throw new ForbiddenException('You can only consult your assigned branch');
    }
    return this.reservationsRepository.findAll({
      ...query,
      branchId: employee.branchId,
    });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    const reservation = await this.getReservation(id);
    await this.assertAccess(reservation, user);
    return reservation;
  }

  updateStatus(
    id: number,
    dto: UpdateReservationStatusDto,
    user: AuthenticatedUser,
  ) {
    return this.changeStatus(id, dto.status, user, false);
  }

  cancel(id: number, user: AuthenticatedUser) {
    return this.changeStatus(id, 'CANCELLED', user, true);
  }

  private async changeStatus(
    id: number,
    status: ReservationStatus,
    user: AuthenticatedUser,
    allowOwner: boolean,
  ) {
    const result = await this.reservationsRepository.transaction(async (tx) => {
      const reservation = await this.getReservation(id, tx);
      const owner =
        allowOwner &&
        user.roles.includes(Role.CUSTOMER) &&
        reservation.client.userId === user.id;
      let employeeId: number | undefined;
      if (!owner)
        employeeId = await this.assertManager(reservation.branchId, user, tx);
      if (
        terminalStatuses.includes(reservation.status) &&
        reservation.status !== status
      ) {
        throw new ConflictException('The reservation is already closed');
      }
      if (owner && reservation.status === 'CUSTOMER_PRESENT') {
        throw new ConflictException(
          'The branch must close the reservation once the customer is present',
        );
      }
      if (
        expirableStatuses.includes(reservation.status) &&
        reservation.expiresAt <= new Date()
      ) {
        await this.reservationsRepository.releaseStock(reservation, tx);
        return {
          reservation: await this.reservationsRepository.updateStatus(
            id,
            'EXPIRED',
            tx,
          ),
          expired: true,
          changed: true,
        };
      }
      if (reservation.status === status)
        return { reservation, expired: false, changed: false };
      if (!transitions[reservation.status].includes(status)) {
        throw new ConflictException(
          `Invalid transition from ${reservation.status} to ${status}`,
        );
      }
      if (terminalStatuses.includes(status)) {
        await this.reservationsRepository.releaseStock(
          reservation,
          tx,
          employeeId,
        );
      }
      return {
        reservation: await this.reservationsRepository.updateStatus(
          id,
          status,
          tx,
        ),
        expired: false,
        changed: true,
      };
    });
    if (result.changed)
      this.notifyCustomer(result.reservation.id, result.reservation.status);
    // Raise only after committing the automatic expiration and stock release.
    if (result.expired)
      throw new ConflictException(
        'The reservation expired and its stock was released',
      );
    return result.reservation;
  }

  async expireDueReservations(now = new Date()): Promise<number> {
    let afterId = 0;
    let expired = 0;
    for (;;) {
      const batch = await this.reservationsRepository.findExpired(
        now,
        afterId,
        100,
      );
      for (const { id } of batch) {
        try {
          const changed = await this.reservationsRepository.transaction(
            async (tx) => {
              const reservation = await this.reservationsRepository.findById(
                id,
                tx,
              );
              if (
                !reservation ||
                !expirableStatuses.includes(reservation.status) ||
                reservation.expiresAt > now
              )
                return false;
              await this.reservationsRepository.releaseStock(reservation, tx);
              await this.reservationsRepository.updateStatus(id, 'EXPIRED', tx);
              return true;
            },
          );
          if (changed) {
            expired++;
            this.notifyCustomer(id, 'EXPIRED');
          }
        } catch (error) {
          // One inconsistent record must not block expiration of other reservations.
          this.logger.error(
            `Could not expire reservation ${id}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
        afterId = id;
      }
      if (batch.length < 100) return expired;
    }
  }

  /** Todo cambio de estado confirmado avisa al cliente en su movil. */
  private notifyCustomer(id: number, status: ReservationStatus) {
    void this.push?.notifyCustomerReservation(id, status);
  }

  private async getReservation(id: number, tx?: Prisma.TransactionClient) {
    const reservation = await this.reservationsRepository.findById(id, tx);
    if (!reservation)
      throw new NotFoundException(`Reservation ${id} was not found`);
    return reservation;
  }

  private async assertAccess(
    reservation: ReservationRecord,
    user: AuthenticatedUser,
  ) {
    if (
      user.roles.includes(Role.CUSTOMER) &&
      reservation.client.userId === user.id
    )
      return;
    await this.assertManager(reservation.branchId, user);
  }

  private async assertManager(
    branchId: number,
    user: AuthenticatedUser,
    tx?: Prisma.TransactionClient,
  ) {
    if (user.roles.includes(Role.ADMINISTRATOR)) return undefined;
    const employee = await this.manager(user, tx);
    if (employee.branchId !== branchId)
      throw new ForbiddenException('You can only manage your assigned branch');
    return employee.id;
  }

  private async manager(
    user: AuthenticatedUser,
    tx?: Prisma.TransactionClient,
  ) {
    if (!user.roles.includes(Role.BRANCH_MANAGER))
      throw new ForbiddenException('A branch manager role is required');
    const employee = await this.reservationsRepository.findEmployee(
      user.id,
      tx,
    );
    if (!employee?.active)
      throw new ForbiddenException('An active employee profile is required');
    return employee;
  }

  private validateDates(query: ListReservationsQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('to cannot be earlier than from');
    }
  }
}
