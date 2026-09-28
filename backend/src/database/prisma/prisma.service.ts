import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('database.url');
    const adapter = new PrismaPg({
      connectionString,
      // adapter-pg serializes Date parameters as UTC wall time; pin every pool
      // connection to UTC so timestamptz reads/writes preserve the same instant.
      options: '-c timezone=UTC',
      max: configService.get<number>('database.poolMax') ?? 10,
      idleTimeoutMillis:
        configService.get<number>('database.idleTimeoutMs') ?? 30_000,
      connectionTimeoutMillis:
        configService.get<number>('database.connectionTimeoutMs') ?? 5_000,
    });
    const isDevelopment =
      configService.get<string>('app.environment') === 'development';

    super({
      adapter,
      log: isDevelopment ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
