import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogRepository } from './catalog.repository.js';
import {
  CreateCategoryDto,
  CreateCollectionDto,
  CreateColorDto,
  CreateSeasonDto,
  CreateSizeDto,
  CreateSupplierDto,
  UpdateCategoryDto,
  UpdateCollectionDto,
  UpdateColorDto,
  UpdateSeasonDto,
  UpdateSizeDto,
  UpdateSupplierDto,
} from './dto/catalog-metadata.dto.js';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  findCategories() {
    return this.repository.findCategories();
  }

  async findCategory(id: number) {
    const value = await this.repository.findCategory(id);
    if (!value) throw new NotFoundException(`Category ${id} was not found`);
    return value;
  }

  async createCategory(dto: CreateCategoryDto) {
    if (await this.repository.findCategoryByName(dto.name)) {
      throw new ConflictException('Category name is already registered');
    }
    return this.repository.createCategory(dto);
  }

  async updateCategory(id: number, dto: UpdateCategoryDto) {
    await this.findCategory(id);
    if (dto.name) {
      const duplicate = await this.repository.findCategoryByName(dto.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Category name is already registered');
      }
    }
    return this.repository.updateCategory(id, dto);
  }

  async deleteCategory(id: number) {
    const value = await this.findCategory(id);
    if (value._count.products > 0) {
      throw new ConflictException('A category in use cannot be deleted');
    }
    return this.repository.deleteCategory(id);
  }

  findSizes() {
    return this.repository.findSizes();
  }

  async findSize(id: number) {
    const value = await this.repository.findSize(id);
    if (!value) throw new NotFoundException(`Size ${id} was not found`);
    return value;
  }

  async createSize(dto: CreateSizeDto) {
    if (await this.repository.findSizeByName(dto.name)) {
      throw new ConflictException('Size name is already registered');
    }
    return this.repository.createSize(dto);
  }

  async updateSize(id: number, dto: UpdateSizeDto) {
    await this.findSize(id);
    if (dto.name) {
      const duplicate = await this.repository.findSizeByName(dto.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Size name is already registered');
      }
    }
    return this.repository.updateSize(id, dto);
  }

  async deleteSize(id: number) {
    const value = await this.findSize(id);
    if (this.hasUsage(value._count)) {
      throw new ConflictException('A size in use cannot be deleted');
    }
    return this.repository.deleteSize(id);
  }

  findColors() {
    return this.repository.findColors();
  }

  async findColor(id: number) {
    const value = await this.repository.findColor(id);
    if (!value) throw new NotFoundException(`Color ${id} was not found`);
    return value;
  }

  async createColor(dto: CreateColorDto) {
    if (await this.repository.findColorByNameOrHex(dto.name, dto.hexCode)) {
      throw new ConflictException(
        'Color name or hexadecimal code already exists',
      );
    }
    return this.repository.createColor(dto);
  }

  async updateColor(id: number, dto: UpdateColorDto) {
    const current = await this.findColor(id);
    const duplicate = await this.repository.findColorByNameOrHex(
      dto.name ?? current.name,
      dto.hexCode ?? current.hexCode,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException(
        'Color name or hexadecimal code already exists',
      );
    }
    return this.repository.updateColor(id, dto);
  }

  async deleteColor(id: number) {
    const value = await this.findColor(id);
    if (this.hasUsage(value._count)) {
      throw new ConflictException('A color in use cannot be deleted');
    }
    return this.repository.deleteColor(id);
  }

  findSeasons() {
    return this.repository.findSeasons();
  }

  async findSeason(id: number) {
    const value = await this.repository.findSeason(id);
    if (!value) throw new NotFoundException(`Season ${id} was not found`);
    return value;
  }

  async createSeason(dto: CreateSeasonDto) {
    this.validateDates(dto.startDate, dto.endDate);
    if (await this.repository.findSeasonByName(dto.name)) {
      throw new ConflictException('Season name is already registered');
    }
    return this.repository.createSeason({
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });
  }

  async updateSeason(id: number, dto: UpdateSeasonDto) {
    const current = await this.findSeason(id);
    this.validateDates(
      dto.startDate ?? current.startDate.toISOString(),
      dto.endDate ?? current.endDate.toISOString(),
    );
    if (dto.name) {
      const duplicate = await this.repository.findSeasonByName(dto.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Season name is already registered');
      }
    }
    return this.repository.updateSeason(id, {
      name: dto.name,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      active: dto.active,
    });
  }

  async deactivateSeason(id: number) {
    await this.findSeason(id);
    return this.repository.updateSeason(id, { active: false });
  }

  findCollections() {
    return this.repository.findCollections();
  }

  async findCollection(id: number) {
    const value = await this.repository.findCollection(id);
    if (!value) throw new NotFoundException(`Collection ${id} was not found`);
    return value;
  }

  async createCollection(dto: CreateCollectionDto) {
    const season = await this.findSeason(dto.seasonId);
    if (!season.active) {
      throw new BadRequestException(
        'Cannot add a collection to an inactive season',
      );
    }
    if (
      await this.repository.findCollectionBySeasonAndName(
        dto.seasonId,
        dto.name,
      )
    ) {
      throw new ConflictException(
        'Collection name already exists in this season',
      );
    }
    return this.repository.createCollection(dto);
  }

  async updateCollection(id: number, dto: UpdateCollectionDto) {
    const current = await this.findCollection(id);
    const seasonId = dto.seasonId ?? current.seasonId;
    const name = dto.name ?? current.name;
    const season = await this.findSeason(seasonId);
    if (!season.active && dto.active !== false) {
      throw new BadRequestException('Cannot use an inactive season');
    }
    const duplicate = await this.repository.findCollectionBySeasonAndName(
      seasonId,
      name,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException(
        'Collection name already exists in this season',
      );
    }
    return this.repository.updateCollection(id, dto);
  }

  async deactivateCollection(id: number) {
    await this.findCollection(id);
    return this.repository.updateCollection(id, { active: false });
  }

  findSuppliers() {
    return this.repository.findSuppliers();
  }

  async findSupplier(id: number) {
    const value = await this.repository.findSupplier(id);
    if (!value) throw new NotFoundException(`Supplier ${id} was not found`);
    return value;
  }

  async createSupplier(dto: CreateSupplierDto) {
    if (await this.repository.findSupplierByName(dto.name)) {
      throw new ConflictException('Supplier name is already registered');
    }
    return this.repository.createSupplier(dto);
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto) {
    await this.findSupplier(id);
    if (dto.name) {
      const duplicate = await this.repository.findSupplierByName(dto.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Supplier name is already registered');
      }
    }
    return this.repository.updateSupplier(id, dto);
  }

  async deactivateSupplier(id: number) {
    await this.findSupplier(id);
    return this.repository.updateSupplier(id, { active: false });
  }

  private validateDates(startDate: string, endDate: string): void {
    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('endDate cannot be earlier than startDate');
    }
  }

  private hasUsage(counts: Record<string, number>): boolean {
    return Object.values(counts).some((count) => count > 0);
  }
}
