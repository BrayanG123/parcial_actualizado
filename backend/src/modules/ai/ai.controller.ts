import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AiRateLimitGuard } from './ai-rate-limit.guard.js';
import { AiReportsService } from './ai-reports.service.js';
import { AiService } from './ai.service.js';
import {
  AiReportQueryDto,
  AssistantDto,
  RecommendationsQueryDto,
} from './dto/ai.dto.js';
import { RecommendationService } from './recommendation.service.js';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly recommendations: RecommendationService,
    private readonly reports: AiReportsService,
  ) {}

  /** Proveedor activo, sin exponer claves. */
  @Get('status')
  status() {
    return this.aiService.status();
  }

  @Post('assistant')
  @HttpCode(200)
  @UseGuards(AiRateLimitGuard)
  assistant(@Body() dto: AssistantDto) {
    return this.aiService.assistant(dto);
  }

  /** Personaliza para clientes autenticados; visitantes reciben sugerencias generales. */
  @Get('recommendations')
  @UseGuards(AiRateLimitGuard, OptionalJwtAuthGuard)
  recommend(
    @Query() query: RecommendationsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.recommendations.recommend(query, user);
  }

  @Post('reports')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, AiRateLimitGuard)
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER)
  report(
    @Body() dto: AiReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.query(dto, user);
  }
}
