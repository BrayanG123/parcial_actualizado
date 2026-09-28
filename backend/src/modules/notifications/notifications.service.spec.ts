import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { Role } from '../../common/enums/role.enum.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';

describe('NotificationsService permissions', () => {
  const repository = {
    employee: vi.fn(),
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
  };
  const service = new NotificationsService(
    repository as unknown as NotificationsRepository,
  );
  const user = {
    id: 10,
    email: 'manager@test.local',
    roles: [Role.BRANCH_MANAGER],
  };
  beforeEach(() => {
    vi.resetAllMocks();
    repository.employee.mockResolvedValue({ active: true, branchId: 2 });
    repository.unreadCount.mockResolvedValue(3);
    repository.markRead.mockResolvedValue({ id: 5, isRead: true });
  });
  it('scopes both list and counter to the manager and current branch', async () => {
    await service.list(new ListNotificationsQueryDto(), user);
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 2 }),
      10,
    );
    expect(await service.unreadCount({}, user)).toEqual({ unreadCount: 3 });
    expect(repository.unreadCount).toHaveBeenCalledWith(10, 2);
  });
  it('rejects a foreign branch before reading notification data', async () => {
    await expect(
      service.list({ ...new ListNotificationsQueryDto(), branchId: 3 }, user),
    ).rejects.toThrow('assigned branch');
    expect(repository.list).not.toHaveBeenCalled();
  });
  it.each([null, { active: false, branchId: 2 }])(
    'rejects missing or inactive employee profiles (%j)',
    async (employee) => {
      repository.employee.mockResolvedValue(employee);
      await expect(service.markRead(5, user)).rejects.toThrow(
        'active employee',
      );
      expect(repository.markRead).not.toHaveBeenCalled();
    },
  );
  it.each([Role.CUSTOMER, Role.CASHIER, Role.SUPPLIER])(
    'rejects %s even when invoked without the controller',
    async (role) => {
      await expect(
        service.unreadCount({}, { ...user, roles: [role] }),
      ).rejects.toThrow('administrator');
      expect(repository.unreadCount).not.toHaveBeenCalled();
    },
  );
  it('allows administrator global access and an optional branch filter', async () => {
    const admin = { ...user, roles: [Role.ADMINISTRATOR] };
    await service.unreadCount({}, admin);
    expect(repository.unreadCount).toHaveBeenLastCalledWith(10, undefined);
    await service.unreadCount({ branchId: 3 }, admin);
    expect(repository.unreadCount).toHaveBeenLastCalledWith(10, 3);
    expect(repository.employee).not.toHaveBeenCalled();
  });
  it('marks only for the authenticated user and hides missing or foreign IDs', async () => {
    await service.markRead(5, user);
    expect(repository.markRead).toHaveBeenCalledWith(5, 10, 2);
    repository.markRead.mockResolvedValue(null);
    await expect(service.markRead(6, user)).rejects.toThrow('was not found');
  });
});
