import { ReportsService } from './reports.service.js';
import { ReportsRepository } from './reports.repository.js';
import { Role } from '../../common/enums/role.enum.js';
import { InventoryReportQueryDto } from './dto/report-query.dto.js';

describe('ReportsService permissions', () => {
  const repository = { employee: vi.fn(), sales: vi.fn(), inventory: vi.fn() };
  const service = new ReportsService(
    repository as unknown as ReportsRepository,
  );
  const user = {
    id: 1,
    email: 'manager@test.local',
    roles: [Role.BRANCH_MANAGER],
  };
  beforeEach(() => {
    vi.resetAllMocks();
    repository.employee.mockResolvedValue({ active: true, branchId: 2 });
    repository.sales.mockResolvedValue({ totals: [] });
    repository.inventory.mockResolvedValue({ items: [] });
  });
  it('scopes a manager to the assigned branch even without a branch filter', async () => {
    await service.sales({}, user);
    expect(repository.sales).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 2 }),
      expect.any(Object),
    );
  });
  it('rejects another branch without consulting business data', async () => {
    await expect(service.sales({ branchId: 3 }, user)).rejects.toThrow(
      'assigned branch',
    );
    expect(repository.sales).not.toHaveBeenCalled();
  });
  it('rejects an inactive employee and a customer', async () => {
    repository.employee.mockResolvedValue({ active: false, branchId: 2 });
    await expect(service.sales({}, user)).rejects.toThrow('active employee');
    await expect(
      service.sales({}, { ...user, roles: [Role.CUSTOMER] }),
    ).rejects.toThrow('administrator');
  });
  it('allows an administrator global inventory and preserves its filters', async () => {
    const query = new InventoryReportQueryDto();
    await service.inventory(query, { ...user, roles: [Role.ADMINISTRATOR] });
    expect(repository.inventory).toHaveBeenCalledWith(query);
    expect(repository.employee).not.toHaveBeenCalled();
  });
});
