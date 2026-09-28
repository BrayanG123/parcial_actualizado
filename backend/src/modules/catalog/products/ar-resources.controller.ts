import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Role } from '../../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { ArResourcesService } from './ar-resources.service.js';
import { CreateArResourceDto } from './dto/ar-resource.dto.js';

@Controller('products/:productId/ar-resources')
export class ArResourcesController {
  constructor(private readonly resources: ArResourcesService) {}

  @Get()
  list(@Param('productId', ParseIntPipe) productId: number) {
    return this.resources.list(productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  create(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateArResourceDto,
  ) {
    return this.resources.create(productId, dto);
  }

  @Delete(':resourceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  deactivate(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ) {
    return this.resources.deactivate(productId, resourceId);
  }
}
