import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SupplierPortalService } from './supplier-portal.service.js';
import { SupplierPageDto, SupplierProductDto } from './supplier-portal.dto.js';

@Controller('supplier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPPLIER)
export class SupplierPortalController {
  constructor(private readonly portal: SupplierPortalService) {}
  @Get('products/:id/supply')
  @Roles(Role.ADMINISTRATOR)
  supply(@Param('id', ParseIntPipe) id: number) {
    return this.portal.supply(id);
  }
  @Get('products')
  products(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierPageDto,
  ) {
    return this.portal.products(user.id, query);
  }
  @Patch('products/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SupplierProductDto,
  ) {
    return this.portal.update(user.id, id, dto);
  }
  @Get('deliveries')
  deliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierPageDto,
  ) {
    return this.portal.deliveries(user.id, query);
  }
}
