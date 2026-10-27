import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantAccessInterceptor } from './tenant-access.interceptor.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { TenantsService } from './tenants.service.js';
import { TenantController } from './tenant.controller.js';

@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [TenantController],
  providers: [
    TenantsService,
    SubscriptionAccessService,
    { provide: APP_INTERCEPTOR, useClass: TenantAccessInterceptor },
  ],
  exports: [TenantsService, SubscriptionAccessService],
})
export class TenancyModule {}
