import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MissingTenantContextError } from '../tenant/tenant-context.js';

interface ExceptionBody {
  message?: string | string[];
  error?: string;
  /** Codigo estable para la UI (p. ej. SUBSCRIPTION_READ_ONLY, PLAN_FEATURE_REQUIRED). */
  code?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(rawException: unknown, host: ArgumentsHost): void {
    // Una consulta de negocio sin empresa (p. ej. PLATFORM_ADMIN) no es un error interno.
    const exception =
      rawException instanceof MissingTenantContextError
        ? new ForbiddenException({
            code: 'TENANT_REQUIRED',
            message: 'La operacion requiere una empresa',
          })
        : rawException;
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ExceptionBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse
        : {};
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (body.message ?? 'Internal server error');

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error('Unhandled HTTP exception', stack);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error: body.error ?? HttpStatus[status] ?? 'Error',
      message,
      ...(body.code ? { code: body.code } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
