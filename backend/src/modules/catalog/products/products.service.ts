import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsRepository, ProductWriteData } from './products.repository.js';
import { productPrice } from '../../../common/utils/product-price.js';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async create(dto: CreateProductDto) {
    this.validateWholesale(dto.price, dto.wholesalePrice);
    this.validatePromotion(dto.promotionStart, dto.promotionEnd);
    await this.validateDependencies(
      dto.categoryId,
      dto.seasonId,
      dto.collectionId,
      dto.supplierId,
      dto.sizeIds,
      dto.colorIds,
    );
    if (
      await this.productsRepository.findBySupplierAndName(
        dto.supplierId,
        dto.name,
      )
    ) {
      throw new ConflictException(
        'This supplier already has a product with the same name',
      );
    }

    const product = await this.productsRepository.create(
      this.toWriteData(dto),
      dto.sizeIds,
      dto.colorIds,
    );
    return this.present(product);
  }

  async findAll(query: ListProductsQueryDto) {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.maxPrice < query.minPrice
    ) {
      throw new BadRequestException('maxPrice cannot be lower than minPrice');
    }
    const result = await this.productsRepository.findAll(query);
    return {
      data: result.data.map((product) => this.present(product)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOne(id: number) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product ${id} was not found`);
    }
    return this.present(product);
  }

  async update(id: number, dto: UpdateProductDto) {
    const current = await this.productsRepository.findById(id);
    if (!current) {
      throw new NotFoundException(`Product ${id} was not found`);
    }

    const promotionStart =
      dto.promotionStart === undefined
        ? current.promotionStart?.toISOString()
        : dto.promotionStart;
    const promotionEnd =
      dto.promotionEnd === undefined
        ? current.promotionEnd?.toISOString()
        : dto.promotionEnd;
    this.validatePromotion(promotionStart, promotionEnd);
    this.validateWholesale(
      dto.price ?? Number(current.price),
      dto.wholesalePrice === undefined
        ? current.wholesalePrice
        : dto.wholesalePrice,
    );

    const categoryId = dto.categoryId ?? current.categoryId;
    const seasonId = dto.seasonId ?? current.seasonId;
    const collectionId = dto.collectionId ?? current.collectionId;
    const supplierId = dto.supplierId ?? current.supplierId;
    const sizeIds = dto.sizeIds ?? current.sizes.map(({ size }) => size.id);
    const colorIds =
      dto.colorIds ?? current.colors.map(({ color }) => color.id);
    await this.validateDependencies(
      categoryId,
      seasonId,
      collectionId,
      supplierId,
      sizeIds,
      colorIds,
    );
    if (
      (dto.sizeIds || dto.colorIds) &&
      (await this.productsRepository.countInventoryOutsideVariants(
        id,
        sizeIds,
        colorIds,
      )) > 0
    ) {
      throw new ConflictException(
        'Sizes or colors with inventory history cannot be removed from a product',
      );
    }

    const name = dto.name ?? current.name;
    const duplicate = await this.productsRepository.findBySupplierAndName(
      supplierId,
      name,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException(
        'This supplier already has a product with the same name',
      );
    }

    const product = await this.productsRepository.update(
      id,
      {
        ...this.toWriteData(dto),
        ...(supplierId !== current.supplierId
          ? { supplierAvailability: null }
          : {}),
      },
      dto.sizeIds,
      dto.colorIds,
    );
    return this.present(product);
  }

  async deactivate(id: number) {
    await this.findOne(id);
    const product = await this.productsRepository.deactivate(id);
    return this.present(product);
  }

  private async validateDependencies(
    categoryId: number,
    seasonId: number,
    collectionId: number,
    supplierId: number,
    sizeIds: number[],
    colorIds: number[],
  ): Promise<void> {
    const [
      categoryCount,
      seasonCount,
      collection,
      supplierCount,
      sizes,
      colors,
    ] = await this.productsRepository.getDependencies(
      categoryId,
      seasonId,
      collectionId,
      supplierId,
      sizeIds,
      colorIds,
    );

    if (!categoryCount)
      throw new BadRequestException('Category does not exist');
    if (!seasonCount)
      throw new BadRequestException('Season does not exist or is inactive');
    if (!collection?.active) {
      throw new BadRequestException('Collection does not exist or is inactive');
    }
    if (collection.seasonId !== seasonId) {
      throw new BadRequestException(
        'Collection does not belong to the selected season',
      );
    }
    if (!supplierCount) {
      throw new BadRequestException('Supplier does not exist or is inactive');
    }
    if (sizes !== sizeIds.length) {
      throw new BadRequestException('One or more sizes do not exist');
    }
    if (colors !== colorIds.length) {
      throw new BadRequestException('One or more colors do not exist');
    }
  }

  private validatePromotion(start?: string | null, end?: string | null): void {
    if ((start && !end) || (!start && end)) {
      throw new BadRequestException(
        'promotionStart and promotionEnd must be provided together',
      );
    }
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException(
        'promotionEnd cannot be earlier than promotionStart',
      );
    }
  }

  private validateWholesale(
    price: number,
    wholesalePrice?: { toString(): string } | number | null,
  ) {
    if (
      wholesalePrice != null &&
      (Number(wholesalePrice) <= 0 || Number(wholesalePrice) > price)
    ) {
      throw new BadRequestException(
        'El precio mayorista debe ser mayor a cero y no superar el precio minorista',
      );
    }
  }

  private toWriteData(
    dto: CreateProductDto,
  ): ProductWriteData &
    Required<
      Pick<
        ProductWriteData,
        | 'name'
        | 'price'
        | 'discountPercent'
        | 'categoryId'
        | 'seasonId'
        | 'collectionId'
        | 'supplierId'
      >
    >;
  private toWriteData(dto: UpdateProductDto): ProductWriteData;
  private toWriteData(
    dto: CreateProductDto | UpdateProductDto,
  ): ProductWriteData {
    return {
      name: dto.name,
      description: dto.description,
      price: dto.price,
      wholesalePrice: dto.wholesalePrice,
      imageUrls: dto.imageUrls ?? (dto.imageUrl ? [dto.imageUrl] : undefined),
      imageUrl:
        dto.imageUrls !== undefined ? (dto.imageUrls[0] ?? null) : dto.imageUrl,
      discountPercent: dto.discountPercent,
      promotionStart:
        dto.promotionStart == null
          ? dto.promotionStart
          : new Date(dto.promotionStart),
      promotionEnd:
        dto.promotionEnd == null
          ? dto.promotionEnd
          : new Date(dto.promotionEnd),
      active: 'active' in dto ? dto.active : undefined,
      categoryId: dto.categoryId,
      seasonId: dto.seasonId,
      collectionId: dto.collectionId,
      supplierId: dto.supplierId,
    };
  }

  private present<
    T extends {
      price: { toString(): string };
      wholesalePrice?: { toString(): string } | null;
      imageUrl?: string | null;
      imageUrls?: string[];
      discountPercent: { toString(): string };
      promotionStart: Date | null;
      promotionEnd: Date | null;
      sizes: Array<{ size: unknown }>;
      colors: Array<{ color: unknown }>;
    },
  >(product: T) {
    const pricing = productPrice(product);

    return {
      ...product,
      imageUrls: product.imageUrls?.length
        ? product.imageUrls
        : product.imageUrl
          ? [product.imageUrl]
          : [],
      price: pricing.price.toNumber(),
      wholesalePrice:
        product.wholesalePrice == null ? null : Number(product.wholesalePrice),
      discountPercent: pricing.discountPercent.toNumber(),
      currentPrice: pricing.currentPrice.toNumber(),
      promotionActive: pricing.promotionActive,
      sizes: product.sizes.map(({ size }) => size),
      colors: product.colors.map(({ color }) => color),
    };
  }
}
