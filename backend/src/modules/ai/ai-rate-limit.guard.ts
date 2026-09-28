import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import aiConfig from '../../config/ai.config.js';
import type { AiSettings } from './providers/ai-provider.js';

const WINDOW_MS = 60000;

/** Limite simple por IP para no agotar la cuota del proveedor en una demo publica. */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(@Inject(aiConfig.KEY) private readonly settings: AiSettings) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? 'unknown';
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (time) => now - time < WINDOW_MS,
    );
    if (recent.length >= this.settings.requestsPerMinute)
      throw new HttpException(
        'Too many AI requests; wait a minute and retry',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000)
      for (const [ip, times] of this.hits)
        if (!times.some((time) => now - time < WINDOW_MS)) this.hits.delete(ip);
    return true;
  }
}
