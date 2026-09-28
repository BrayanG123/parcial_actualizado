import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../common/enums/role.enum.js';
import { CartRepository, CartRecord, CartProduct } from './cart.repository.js';
import { CartService } from './cart.service.js';

describe('CartService', () => {
  const customer = {
    id: 10,
    email: 'customer@example.test',
    roles: [Role.CUSTOMER],
  };
  const variant = { productId: 1, sizeId: 1, colorId: 1 };
  const repository = {
    transaction: vi.fn(),
    findClient: vi.fn(),
    findActive: vi.fn(),
    createActive: vi.fn(),
    findById: vi.fn(),
    findProduct: vi.fn(),
    findInventory: vi.fn(),
    saveItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  const service = new CartService(repository as unknown as CartRepository);
  let cart: CartRecord;
  let product: CartProduct;

  beforeEach(() => {
    vi.resetAllMocks();
    product = {
      id: 1,
      name: 'Camisa',
      imageUrl: null,
      active: true,
      price: new Prisma.Decimal('0.10'),
      wholesalePrice: null,
      discountPercent: new Prisma.Decimal(0),
      promotionStart: null,
      promotionEnd: null,
      sizes: [{ sizeId: 1 }],
      colors: [{ colorId: 1 }],
    };
    cart = {
      id: 1,
      clientId: 2,
      client: { wholesale: false },
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    repository.transaction.mockImplementation((callback) => callback({}));
    repository.findClient.mockResolvedValue({ id: 2 });
    repository.findActive.mockImplementation(async () => cart);
    repository.createActive.mockImplementation(async () => cart);
    repository.findById.mockImplementation(async () => cart);
    repository.findProduct.mockImplementation(async () => product);
    repository.findInventory.mockResolvedValue([
      {
        ...variant,
        physicalQuantity: 10,
        reservedQuantity: 2,
        branch: { id: 1, name: 'Central', city: 'La Paz' },
      },
    ]);
  });

  const addFixture = (quantity = 3) => {
    cart.items.push({
      id: 1,
      cartId: 1,
      ...variant,
      quantity,
      unitPrice: new Prisma.Decimal('0.10'),
      product,
      size: { id: 1, name: 'M' },
      color: { id: 1, name: 'Azul', hexCode: '#0000FF' },
    });
  };

  it('creates an empty active cart lazily for the authenticated client', async () => {
    repository.findActive.mockResolvedValue(null);
    expect(await service.getActive(customer)).toMatchObject({
      items: [],
      total: 0,
      hasAvailability: false,
    });
    expect(repository.createActive).toHaveBeenCalledWith(2, expect.anything());
  });

  it('uses the customer tier both when saving and when revaluing an existing cart', async () => {
    addFixture(2);
    product.wholesalePrice = new Prisma.Decimal('0.08');
    cart.client.wholesale = true;
    await service.addItem({ ...variant, quantity: 1 }, customer);
    expect(repository.saveItem).toHaveBeenCalledWith(
      1,
      variant,
      3,
      new Prisma.Decimal('0.08'),
      expect.anything(),
    );
    expect(await service.getActive(customer)).toMatchObject({
      total: 0.16,
      items: [{ unitPrice: 0.08, priceChanged: true }],
    });
    cart.client.wholesale = false;
    expect(await service.getActive(customer)).toMatchObject({
      total: 0.2,
      items: [{ unitPrice: 0.1 }],
    });
  });

  it('rejects non-customers and missing active profiles', async () => {
    await expect(
      service.getActive({ ...customer, roles: [Role.ADMINISTRATOR] }),
    ).rejects.toThrow(ForbiddenException);
    repository.findClient.mockResolvedValue(null);
    await expect(service.getActive(customer)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('merges repeated additions into the existing variant quantity', async () => {
    addFixture(2);
    await service.addItem({ ...variant, quantity: 3 }, customer);
    expect(repository.saveItem).toHaveBeenCalledWith(
      1,
      variant,
      5,
      new Prisma.Decimal('0.10'),
      expect.anything(),
    );
  });

  it('replaces quantity on PATCH instead of incrementing it', async () => {
    addFixture(4);
    await service.updateItem(1, { quantity: 2 }, customer);
    expect(repository.saveItem).toHaveBeenCalledWith(
      1,
      variant,
      2,
      expect.anything(),
      expect.anything(),
    );
  });

  it('enforces the limit on accumulated quantity', async () => {
    addFixture(100);
    await expect(
      service.addItem({ ...variant, quantity: 1 }, customer),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces the maximum number of distinct variants', async () => {
    addFixture();
    cart.items = Array.from({ length: 50 }, (_, id) => ({
      ...cart.items[0],
      id,
      productId: id + 1,
    }));
    await expect(
      service.addItem({ ...variant, productId: 51, quantity: 1 }, customer),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not add an invalid or inactive variant', async () => {
    product.active = false;
    await expect(
      service.addItem({ ...variant, quantity: 1 }, customer),
    ).rejects.toThrow(ConflictException);
    product.active = true;
    await expect(
      service.addItem({ ...variant, sizeId: 99, quantity: 1 }, customer),
    ).rejects.toThrow(ConflictException);
  });

  it('requires enough stock in one branch, without adding fragmented stocks', async () => {
    repository.findInventory.mockResolvedValue(
      [1, 2].map((id) => ({
        ...variant,
        physicalQuantity: 2,
        reservedQuantity: 0,
        branch: { id },
      })),
    );
    await expect(
      service.addItem({ ...variant, quantity: 3 }, customer),
    ).rejects.toThrow(ConflictException);
    expect(repository.saveItem).not.toHaveBeenCalled();
  });

  it('uses exact decimal totals and returns current prices after catalog changes', async () => {
    addFixture(3);
    let result = await service.getActive(customer);
    expect(result.total).toBe(0.3);
    product.price = new Prisma.Decimal('0.20');
    result = await service.getActive(customer);
    expect(result.total).toBe(0.6);
    expect(result.items[0]).toMatchObject({
      unitPrice: 0.2,
      storedUnitPrice: 0.1,
      priceChanged: true,
    });
    expect(repository.saveItem).not.toHaveBeenCalled();
  });

  it('retains unavailable products for display and deletion', async () => {
    addFixture();
    product.active = false;
    expect((await service.getActive(customer)).items[0]).toMatchObject({
      available: false,
      issue: 'PRODUCT_INACTIVE',
    });
    await service.removeItem(1, customer);
    expect(repository.removeItem).toHaveBeenCalledWith(1, 1, expect.anything());
  });

  it('does not edit or delete IDs absent from the customers active cart', async () => {
    await expect(
      service.updateItem(999, { quantity: 1 }, customer),
    ).rejects.toThrow(NotFoundException);
    await expect(service.removeItem(999, customer)).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.removeItem).not.toHaveBeenCalled();
  });

  it('reports when individually available items lack a common branch', async () => {
    addFixture(1);
    cart.items.push({
      ...cart.items[0],
      id: 2,
      productId: 2,
      product: { ...product, id: 2 },
    });
    repository.findInventory.mockResolvedValue(
      [1, 2].map((id) => ({
        ...variant,
        productId: id,
        physicalQuantity: 5,
        reservedQuantity: 0,
        branch: { id, name: 'Branch', city: 'La Paz' },
      })),
    );
    const result = await service.getActive(customer);
    expect(result.items.every((item) => item.available)).toBe(true);
    expect(result.availableBranches).toEqual([]);
    expect(result.hasAvailability).toBe(false);
  });
});
