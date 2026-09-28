import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AssignRoleDto } from './dto/assign-role.dto.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Post('users/:userId/:role')
  assign(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('role', new ParseEnumPipe(Role)) role: Role,
    @Body() dto: AssignRoleDto,
  ) {
    return this.rolesService.assign(userId, role, dto);
  }

  @Delete('users/:userId/:role')
  remove(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('role', new ParseEnumPipe(Role)) role: Role,
  ) {
    return this.rolesService.remove(userId, role);
  }
}
