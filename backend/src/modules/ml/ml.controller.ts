import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RequiresFeature } from '../tenancy/plan.decorators.js';
import { MlDashboardQueryDto, TrainMlDto } from './dto/ml.dto.js';
import { MlService } from './ml.service.js';

@Controller('ml')
@RequiresFeature('mlAnalytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MlController {
  constructor(private readonly ml: MlService) {}

  /** Entrena (o reentrena) los modelos de la empresa del usuario. */
  @Post('train')
  @HttpCode(200)
  @Roles(Role.ADMINISTRATOR)
  train(@Body() dto: TrainMlDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ml.train(dto, user);
  }

  /** Predicciones, segmentos, anomalias y metricas de evaluacion. */
  @Get('dashboard')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER)
  dashboard(
    @Query() query: MlDashboardQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ml.dashboard(query, user);
  }
}
