import type { PushService } from '../push/push.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../common/enums/role.enum.js';
import { ReservationStatus } from '../../common/enums/reservation-status.enum.js';
import {
  ReservationsRepository,
  ReservationRecord,
} from './reservations.repository.js';
import { ReservationsService } from './reservations.service.js';

describe('ReservationsService', () => {
  const customer = {
    id: 1,
    email: 'customer@example.com',
    roles: [Role.CUSTOMER],
  };
  const manager = {
    id: 2,
    email: 'manager@example.com',
    roles: [Role.BRANCH_MANAGER],
  };
  const dto = {
    branchId: 1,
    approximateTime: '2035-09-11T15:00:00-04:00',
    items: [{ productId: 1, sizeId: 1, colorId: 1, quantity: 2 }],
  };
  const repository = {
    transaction: vi.fn(),
    findClient: vi.fn(),
    findBranch: vi.fn(),
    findEmployee: vi.fn(),
    create: vi.fn(),
    requireAvailableStock: vi.fn(),
    reserveStock: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    releaseStock: vi.fn(),
    updateStatus: vi.fn(),
    findExpired: vi.fn(),
  };
  const push = { notifyCustomerReservation: vi.fn() };
  const service = new ReservationsService(
    repository as unknown as ReservationsRepository,
    new ConfigService({ RESERVATION_TIME_ZONE: 'America/La_Paz' }),
    push as unknown as PushService,
  );
  let reservation: ReservationRecord;

  beforeEach(() => {
    vi.resetAllMocks();
    reservation = {
      id: 10,
      branchId: 1,
      status: 'PENDING',
      expiresAt: new Date('2035-09-12T04:00:00Z'),
      client: { userId: 1 },
      items: dto.items,
    } as ReservationRecord;
    repository.transaction.mockImplementation((callback) => callback({}));
    repository.findClient.mockResolvedValue({ id: 3 });
    repository.findBranch.mockResolvedValue({ active: true });
    repository.findEmployee.mockResolvedValue({
      id: 5,
      branchId: 1,
      active: true,
    });
    repository.findById.mockImplementation(async () => reservation);
    repository.create.mockResolvedValue(reservation);
    repository.updateStatus.mockImplementation(async (_id, status) => ({
      ...reservation,
      status,
    }));
    repository.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
  });

  it('uses the authenticated customer and persists the end-of-day deadline', async () => {
    await service.create(dto, customer);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 3,
        expiresAt: new Date('2035-09-12T04:00:00Z'),
      }),
      expect.anything(),
    );
    expect(repository.reserveStock).toHaveBeenCalledWith(
      1,
      dto.items[0],
      10,
      expect.anything(),
    );
  });

  it('rejects duplicate variants before writing', async () => {
    await expect(
      service.create({ ...dto, items: [...dto.items, ...dto.items] }, customer),
    ).rejects.toThrow(BadRequestException);
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('rejects past appointments', async () => {
    await expect(
      service.create(
        { ...dto, approximateTime: '2000-01-01T10:00:00Z' },
        customer,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects inactive branches', async () => {
    repository.findBranch.mockResolvedValue({ active: false });
    await expect(service.create(dto, customer)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not create a reservation if a requested variant is unavailable', async () => {
    repository.requireAvailableStock.mockRejectedValue(new ConflictException());
    await expect(service.create(dto, customer)).rejects.toThrow(
      ConflictException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('prevents reading another customer reservation', async () => {
    await expect(service.findOne(10, { ...customer, id: 99 })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('scopes the branch queue to the assigned branch', async () => {
    await service.findAll({ page: 1, limit: 20 }, manager);
    expect(repository.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      branchId: 1,
    });
    await expect(
      service.findAll({ page: 1, limit: 20, branchId: 2 }, manager),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects status changes by a manager from another branch', async () => {
    repository.findEmployee.mockResolvedValue({
      id: 5,
      branchId: 2,
      active: true,
    });
    await expect(
      service.updateStatus(
        10,
        { status: ReservationStatus.PREPARING },
        manager,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents skipping the preparation workflow', async () => {
    await expect(
      service.updateStatus(
        10,
        { status: ReservationStatus.COMPLETED },
        manager,
      ),
    ).rejects.toThrow(ConflictException);
    expect(repository.releaseStock).not.toHaveBeenCalled();
  });

  it('releases stock when the owner cancels', async () => {
    expect(await service.cancel(10, customer)).toMatchObject({
      status: 'CANCELLED',
    });
    expect(repository.releaseStock).toHaveBeenCalledOnce();
  });

  it('repeating cancellation does not release stock twice', async () => {
    reservation.status = 'CANCELLED';
    await service.cancel(10, customer);
    expect(repository.releaseStock).not.toHaveBeenCalled();
    expect(push.notifyCustomerReservation).not.toHaveBeenCalled();
  });

  it('the customer cannot cancel after checking in', async () => {
    reservation.status = 'CUSTOMER_PRESENT';
    await expect(service.cancel(10, customer)).rejects.toThrow(
      ConflictException,
    );
  });

  it('completing attendance releases unpurchased stock', async () => {
    reservation.status = 'CUSTOMER_PRESENT';
    await service.updateStatus(
      10,
      { status: ReservationStatus.COMPLETED },
      manager,
    );
    expect(repository.releaseStock).toHaveBeenCalledWith(
      reservation,
      expect.anything(),
      5,
    );
  });

  it('commits expiration before rejecting an overdue transition, including a repeated state', async () => {
    reservation.status = 'READY';
    reservation.expiresAt = new Date('2000-01-01');
    await expect(
      service.updateStatus(10, { status: ReservationStatus.READY }, manager),
    ).rejects.toThrow('expired');
    expect(repository.releaseStock).toHaveBeenCalledOnce();
    expect(push.notifyCustomerReservation).toHaveBeenCalledWith(10, 'EXPIRED');
    expect(repository.updateStatus).toHaveBeenCalledWith(
      10,
      'EXPIRED',
      expect.anything(),
    );
  });

  it('rechecks status when a worker races with customer arrival', async () => {
    reservation.status = 'CUSTOMER_PRESENT';
    repository.findExpired.mockResolvedValue([{ id: 10 }]);
    expect(await service.expireDueReservations(new Date('2040-01-01'))).toBe(0);
    expect(repository.releaseStock).not.toHaveBeenCalled();
  });

  it('notifies READY after commit and does not repeat the same state', async () => {
    reservation.status = 'PREPARING';
    let committed = false;
    repository.transaction.mockImplementation(async (fn) => {
      const result = await fn({});
      committed = true;
      return result;
    });
    push.notifyCustomerReservation.mockImplementation(() => {
      expect(committed).toBe(true);
    });
    await service.updateStatus(
      10,
      { status: ReservationStatus.READY },
      manager,
    );
    expect(push.notifyCustomerReservation).toHaveBeenCalledWith(10, 'READY');
    reservation.status = 'READY';
    await service.updateStatus(
      10,
      { status: ReservationStatus.READY },
      manager,
    );
    expect(push.notifyCustomerReservation).toHaveBeenCalledTimes(1);
  });

  it('does not notify a rolled back change', async () => {
    repository.transaction.mockImplementation(async (fn) => {
      await fn({});
      throw new Error('rollback');
    });
    await expect(service.cancel(10, customer)).rejects.toThrow('rollback');
    expect(push.notifyCustomerReservation).not.toHaveBeenCalled();
  });

  it('expires overdue reservations and releases stock', async () => {
    repository.findExpired.mockResolvedValue([{ id: 10 }]);
    expect(await service.expireDueReservations(new Date('2040-01-01'))).toBe(1);
    expect(push.notifyCustomerReservation).toHaveBeenCalledWith(10, 'EXPIRED');
    expect(repository.releaseStock).toHaveBeenCalledOnce();
  });
});
