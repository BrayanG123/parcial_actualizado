import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '../enums/role.enum.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { Roles } from './roles.decorator.js';

export const AdminOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.ADMINISTRATOR),
  );
