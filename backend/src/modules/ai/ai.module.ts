import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import aiConfig from '../../config/ai.config.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { AiRateLimitGuard } from './ai-rate-limit.guard.js';
import { AiReportsService } from './ai-reports.service.js';
import { AiController } from './ai.controller.js';
import { AiRepository } from './ai.repository.js';
import { AiService } from './ai.service.js';
import { AI_PROVIDER, type AiSettings } from './providers/ai-provider.js';
import { createAiProvider } from './providers/create-ai-provider.js';
import { RecommendationService } from './recommendation.service.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    CatalogModule,
    ReportsModule,
  ],
  controllers: [AiController],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [aiConfig.KEY],
      useFactory: (settings: AiSettings) => createAiProvider(settings),
    },
    AiRepository,
    AiService,
    RecommendationService,
    AiReportsService,
    AiRateLimitGuard,
  ],
  exports: [AiService, RecommendationService],
})
export class AiModule {}
