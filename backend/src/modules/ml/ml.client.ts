import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import mlConfig from '../../config/ml.config.js';

export const ML_CLIENT = Symbol('ML_CLIENT');

export interface MlClient {
  request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T>;
}

/**
 * Cliente HTTP del servicio de ML. Traduce sus errores a codigos estables del backend y
 * nunca reenvia al cliente el cuerpo crudo del servicio.
 */
@Injectable()
export class HttpMlClient implements MlClient {
  private readonly logger = new Logger(HttpMlClient.name);

  constructor(
    @Inject(mlConfig.KEY)
    private readonly config: ConfigType<typeof mlConfig>,
  ) {}

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    const { url, token, timeoutMs } = this.config;
    if (!url || !token)
      throw new ServiceUnavailableException({
        code: 'ML_NOT_CONFIGURED',
        message: 'El servicio de analitica no esta configurado.',
      });
    let response: Response;
    try {
      response = await fetch(`${url.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-internal-token': token,
        },
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.logger.warn(
        `ml-service ${method} ${path}: ${(error as Error).name}`,
      );
      throw new ServiceUnavailableException({
        code: 'ML_UNAVAILABLE',
        message: 'El servicio de analitica no responde. Intenta mas tarde.',
      });
    }
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    if (response.ok) return payload as T;
    throw mapError(response.status, payload, this.logger, `${method} ${path}`);
  }
}

function mapError(
  status: number,
  payload: { code?: string; message?: string },
  logger: Logger,
  what: string,
): HttpException {
  const message = typeof payload.message === 'string' ? payload.message : '';
  switch (payload.code) {
    case 'MODEL_NOT_TRAINED':
      return new ConflictException({
        code: 'ML_MODEL_NOT_TRAINED',
        message: 'La empresa aun no entreno sus modelos.',
      });
    case 'PART_NOT_TRAINED':
      return new ConflictException({ code: 'ML_PART_NOT_TRAINED', message });
    case 'INSUFFICIENT_DATA':
      return new UnprocessableEntityException({
        code: 'ML_INSUFFICIENT_DATA',
        message,
      });
    default:
      // Token invalido, validacion u otro fallo interno: se registra y se oculta el detalle.
      logger.error(`ml-service ${what} -> ${status} ${payload.code ?? ''}`);
      return new BadGatewayException({
        code: 'ML_ERROR',
        message: 'El servicio de analitica fallo al procesar la solicitud.',
      });
  }
}
