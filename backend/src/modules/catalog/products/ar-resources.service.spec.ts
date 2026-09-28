import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../../../database/prisma/prisma.service.js';
import { ArResourcesService } from './ar-resources.service.js';
import { CreateArResourceDto } from './dto/ar-resource.dto.js';

describe('ArResourcesService', () => {
  const prisma = {
    product: { findUnique: vi.fn() },
    arResource: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const service = new ArResourcesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.product.findUnique.mockResolvedValue({ id: 7 });
  });

  it('validates the URL and normalizes the 3D format', async () => {
    const dto = plainToInstance(CreateArResourceDto, {
      url: ' https://cdn.example.com/vestido.glb ',
      format: 'glb',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      url: 'https://cdn.example.com/vestido.glb',
      format: 'GLB',
      type: 'MODEL_3D',
    });
    const invalid = plainToInstance(CreateArResourceDto, {
      url: 'javascript:alert(1)',
      format: 'OBJ',
    });
    const errors = (await validate(invalid)).map((e) => e.property);
    expect(errors).toEqual(expect.arrayContaining(['url', 'format']));
  });

  it('creates resources only for existing products and within the limit', async () => {
    prisma.arResource.count.mockResolvedValue(0);
    prisma.arResource.create.mockResolvedValue({ id: 1 });
    await service.create(7, {
      url: 'https://x.test/a.glb',
      format: 'GLB',
      type: 'MODEL_3D',
    });
    expect(prisma.arResource.create).toHaveBeenCalledWith({
      data: {
        productId: 7,
        url: 'https://x.test/a.glb',
        format: 'GLB',
        type: 'MODEL_3D',
      },
    });

    prisma.arResource.count.mockResolvedValue(5);
    await expect(
      service.create(7, {
        url: 'https://x.test/b.glb',
        format: 'GLB',
        type: 'MODEL_3D',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.list(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivates only a resource that belongs to the product', async () => {
    prisma.arResource.findFirst.mockResolvedValue(null);
    await expect(service.deactivate(7, 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.arResource.findFirst.mockResolvedValue({ id: 3 });
    await service.deactivate(7, 3);
    expect(prisma.arResource.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { active: false },
    });
  });
});
