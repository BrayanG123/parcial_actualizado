import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { SalesRepository } from '../sales/sales.repository.js';
import {
  CloseShiftDto,
  CreateRegisterDto,
  ListShiftsDto,
  OpenShiftDto,
} from './cash.dto.js';

const include = {
  offlineBatches: { where: { finishedAt: null }, select: { id: true } },
  register: { include: { branch: { select: { id: true, name: true } } } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.CashShiftInclude;
type Shift = Prisma.CashShiftGetPayload<{ include: typeof include }>;

@Injectable()
export class CashService {
  constructor(
    private readonly sales: SalesRepository,
    private readonly config: ConfigService,
  ) {}

  private async scope(user: AuthenticatedUser, tx: Prisma.TransactionClient) {
    if (user.roles.includes(Role.ADMINISTRATOR)) return undefined;
    const employee = await tx.employee.findUnique({
      where: { userId: user.id },
    });
    if (!employee?.active)
      throw new ForbiddenException('Se requiere un empleado activo.');
    return employee.branchId;
  }
  private async branch(
    branchId: number,
    user: AuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    const scoped = await this.scope(user, tx);
    if (scoped !== undefined && scoped !== branchId)
      throw new ForbiddenException('Solo puedes operar en tu sucursal.');
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch?.active)
      throw new BadRequestException('La sucursal no esta activa.');
  }
  registers(branchId: number, user: AuthenticatedUser) {
    return this.sales.transaction(async (tx) => {
      await this.branch(branchId, user, tx);
      const rows = await tx.cashRegister.findMany({
        where: { branchId },
        orderBy: { id: 'asc' },
        include: {
          shifts: {
            where: { closedAt: null },
            select: { id: true, user: { select: { name: true } } },
          },
        },
      });
      return rows.map(({ shifts, ...r }) => ({
        ...r,
        occupied: shifts.length > 0,
        cashier: shifts[0]?.user.name ?? null,
      }));
    });
  }
  createRegister(dto: CreateRegisterDto, user: AuthenticatedUser) {
    return this.sales.transaction(async (tx) => {
      await this.branch(dto.branchId, user, tx);
      return tx.cashRegister.upsert({
        where: { branchId_name: { branchId: dto.branchId, name: dto.name } },
        create: dto,
        update: {},
      });
    });
  }
  current(user: AuthenticatedUser) {
    return this.sales.transaction(async (tx) => {
      await this.scope(user, tx);
      const shift = await tx.cashShift.findFirst({
        where: { userId: user.id, closedAt: null },
        include,
      });
      return shift ? this.present(shift) : null;
    });
  }
  open(dto: OpenShiftDto, user: AuthenticatedUser) {
    return this.sales.transaction(async (tx) => {
      await this.scope(user, tx);
      const replay = await tx.cashShift.findUnique({
        where: {
          userId_openingKey: { userId: user.id, openingKey: dto.openingKey },
        },
        include,
      });
      if (replay) {
        if (
          replay.registerId !== dto.registerId ||
          !replay.openingCash.equals(dto.openingCash)
        )
          throw new ConflictException(
            'La apertura ya fue registrada con otros datos.',
          );
        return this.present(replay);
      }
      const register = await tx.cashRegister.findUnique({
        where: { id: dto.registerId },
      });
      if (!register) throw new NotFoundException('Caja no encontrada.');
      await this.branch(register.branchId, user, tx);
      const occupied = await tx.cashShift.findFirst({
        where: {
          closedAt: null,
          OR: [{ userId: user.id }, { registerId: dto.registerId }],
        },
      });
      if (occupied)
        throw new ConflictException(
          'Ya tienes un turno abierto o esa caja esta ocupada.',
        );
      return this.present(
        await tx.cashShift.create({
          data: {
            ...dto,
            userId: user.id,
            currency: this.config.get<string>('SALES_CURRENCY') ?? 'BOB',
          },
          include,
        }),
      );
    });
  }
  close(id: number, dto: CloseShiftDto, user: AuthenticatedUser) {
    return this.sales.transaction(async (tx) => {
      // The owner may close their historical branch even after reassignment/deactivation of the branch.
      await this.scope(user, tx);
      const shift = await tx.cashShift.findUnique({ where: { id }, include });
      if (!shift || shift.userId !== user.id)
        throw new NotFoundException('Turno propio no encontrado.');
      const note = dto.note?.trim() || null;
      if (shift.closedAt) {
        if (
          !shift.countedCash?.equals(dto.countedCash) ||
          shift.closingNote !== note
        )
          throw new ConflictException('El turno ya se cerro con otro arqueo.');
        return this.present(shift);
      }
      if (
        await tx.offlineBatch.findFirst({
          where: { shiftId: id, finishedAt: null },
        })
      )
        throw new ConflictException(
          'Sincroniza y finaliza el modo offline antes de cerrar el turno.',
        );
      const difference = new Prisma.Decimal(dto.countedCash).minus(
        shift.openingCash.plus(shift.cashTotal),
      );
      if (!difference.isZero() && !note)
        throw new BadRequestException(
          'Explica el faltante o sobrante en la observacion.',
        );
      // The sale also writes this row: serializable retries prevent a sale from escaping the closing totals.
      const updated = await tx.cashShift.updateMany({
        where: { id, closedAt: null },
        data: {
          closedAt: new Date(),
          countedCash: dto.countedCash,
          closingNote: note,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('El turno cambio. Consulta su estado.');
      return this.present(
        await tx.cashShift.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
  list(query: ListShiftsDto, user: AuthenticatedUser) {
    return this.sales.transaction(async (tx) => {
      const branch = await this.scope(user, tx);
      if (
        branch !== undefined &&
        query.branchId !== undefined &&
        query.branchId !== branch
      )
        throw new ForbiddenException('Solo puedes consultar tu sucursal.');
      const personal = !user.roles.some(
        (r) => r === Role.ADMINISTRATOR || r === Role.BRANCH_MANAGER,
      );
      const where: Prisma.CashShiftWhereInput = {
        ...(personal ? { userId: user.id } : {}),
        register: { branchId: branch ?? query.branchId },
      };
      const total = await tx.cashShift.count({ where });
      const data = await tx.cashShift.findMany({
        where,
        include,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      return {
        data: data.map((s) => this.present(s)),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    });
  }
  private present(s: Shift) {
    const expectedCash = s.openingCash.plus(s.cashTotal);
    return {
      id: s.id,
      offlineActive: s.offlineBatches.length > 0,
      registerId: s.registerId,
      branchId: s.register.branchId,
      registerName: s.register.name,
      branchName: s.register.branch.name,
      userId: s.userId,
      cashier: s.user.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      currency: s.currency,
      openingCash: s.openingCash.toNumber(),
      cashTotal: s.cashTotal.toNumber(),
      cardTotal: s.cardTotal.toNumber(),
      qrTotal: s.qrTotal.toNumber(),
      transferTotal: s.transferTotal.toNumber(),
      totalSales: s.cashTotal
        .plus(s.cardTotal)
        .plus(s.qrTotal)
        .plus(s.transferTotal)
        .toNumber(),
      saleCount: s.saleCount,
      expectedCash: expectedCash.toNumber(),
      countedCash: s.countedCash?.toNumber() ?? null,
      difference: s.countedCash?.minus(expectedCash).toNumber() ?? null,
      closingNote: s.closingNote,
    };
  }
}
