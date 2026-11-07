import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LoginDto } from '../auth/dto/login.dto.js';
import { AllowWhenReadOnly } from '../tenancy/plan.decorators.js';
import { OwnerCreateTenantDto } from './dto/owner.dto.js';
import { OwnerJwtGuard, type OwnerRequest } from './owner-jwt.guard.js';
import { OwnerService } from './owner.service.js';

/** Login de la cuenta de dueño (sin codigo de empresa). */
@Controller('owner/auth')
@AllowWhenReadOnly()
export class OwnerAuthController {
  constructor(private readonly owners: OwnerService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.owners.login(dto);
  }
}

/** "Mis empresas": listar, crear otra y entrar a una (F14). */
@Controller('owner')
@UseGuards(OwnerJwtGuard)
@AllowWhenReadOnly()
export class OwnerController {
  constructor(private readonly owners: OwnerService) {}

  @Get('me')
  me(@Req() request: OwnerRequest) {
    return request.owner!;
  }

  @Get('tenants')
  tenants(@Req() request: OwnerRequest) {
    return this.owners.tenants(request.owner!.id);
  }

  @Post('tenants')
  createTenant(
    @Req() request: OwnerRequest,
    @Body() dto: OwnerCreateTenantDto,
  ) {
    return this.owners.createTenant(request.owner!.id, dto);
  }

  @Post('tenants/:id/session')
  @HttpCode(200)
  enter(@Req() request: OwnerRequest, @Param('id', ParseIntPipe) id: number) {
    return this.owners.enter(request.owner!.id, id);
  }
}
