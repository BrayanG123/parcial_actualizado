import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CatalogService } from './catalog.service.js';
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
import { RequiresFeature } from '../tenancy/plan.decorators.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  findCategories() {
    return this.catalogService.findCategories();
  }

  @Get('categories/:id')
  findCategory(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findCategory(id);
  }

  @Post('categories')
  @AdminOnly()
  @RequiresFeature('products')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Patch('categories/:id')
  @AdminOnly()
  @RequiresFeature('products')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @AdminOnly()
  @RequiresFeature('products')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deleteCategory(id);
  }

  @Get('sizes')
  findSizes() {
    return this.catalogService.findSizes();
  }

  @Get('sizes/:id')
  findSize(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findSize(id);
  }

  @Post('sizes')
  @AdminOnly()
  @RequiresFeature('products')
  createSize(@Body() dto: CreateSizeDto) {
    return this.catalogService.createSize(dto);
  }

  @Patch('sizes/:id')
  @AdminOnly()
  @RequiresFeature('products')
  updateSize(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSizeDto,
  ) {
    return this.catalogService.updateSize(id, dto);
  }

  @Delete('sizes/:id')
  @AdminOnly()
  @RequiresFeature('products')
  deleteSize(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deleteSize(id);
  }

  @Get('colors')
  findColors() {
    return this.catalogService.findColors();
  }

  @Get('colors/:id')
  findColor(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findColor(id);
  }

  @Post('colors')
  @AdminOnly()
  @RequiresFeature('products')
  createColor(@Body() dto: CreateColorDto) {
    return this.catalogService.createColor(dto);
  }

  @Patch('colors/:id')
  @AdminOnly()
  @RequiresFeature('products')
  updateColor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateColorDto,
  ) {
    return this.catalogService.updateColor(id, dto);
  }

  @Delete('colors/:id')
  @AdminOnly()
  @RequiresFeature('products')
  deleteColor(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deleteColor(id);
  }

  @Get('seasons')
  findSeasons() {
    return this.catalogService.findSeasons();
  }

  @Get('seasons/:id')
  findSeason(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findSeason(id);
  }

  @Post('seasons')
  @AdminOnly()
  @RequiresFeature('products')
  createSeason(@Body() dto: CreateSeasonDto) {
    return this.catalogService.createSeason(dto);
  }

  @Patch('seasons/:id')
  @AdminOnly()
  @RequiresFeature('products')
  updateSeason(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSeasonDto,
  ) {
    return this.catalogService.updateSeason(id, dto);
  }

  @Delete('seasons/:id')
  @AdminOnly()
  @RequiresFeature('products')
  deactivateSeason(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deactivateSeason(id);
  }

  @Get('collections')
  findCollections() {
    return this.catalogService.findCollections();
  }

  @Get('collections/:id')
  findCollection(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findCollection(id);
  }

  @Post('collections')
  @AdminOnly()
  @RequiresFeature('products')
  createCollection(@Body() dto: CreateCollectionDto) {
    return this.catalogService.createCollection(dto);
  }

  @Patch('collections/:id')
  @AdminOnly()
  @RequiresFeature('products')
  updateCollection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.catalogService.updateCollection(id, dto);
  }

  @Delete('collections/:id')
  @AdminOnly()
  @RequiresFeature('products')
  deactivateCollection(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deactivateCollection(id);
  }

  @Get('suppliers')
  @AdminOnly()
  @RequiresFeature('products')
  findSuppliers() {
    return this.catalogService.findSuppliers();
  }

  @Get('suppliers/:id')
  @AdminOnly()
  @RequiresFeature('products')
  findSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findSupplier(id);
  }

  @Post('suppliers')
  @AdminOnly()
  @RequiresFeature('products')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.catalogService.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  @AdminOnly()
  @RequiresFeature('products')
  updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.catalogService.updateSupplier(id, dto);
  }

  @Delete('suppliers/:id')
  @AdminOnly()
  @RequiresFeature('products')
  deactivateSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deactivateSupplier(id);
  }
}
