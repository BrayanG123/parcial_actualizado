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
import { Prisma } from '../../generated/prisma/client.js';
import { MissingTenantContextError } from '../tenant/tenant-context.js';

/**
 * Errores conocidos de Prisma que no son fallas internas. La respuesta no incluye el
 * mensaje de Prisma: trae los valores de la consulta (correos, ids) y nombres de tablas.
 */
const PRISMA_ERRORS: Record<
  string,
  { status: number; code: string; message: string }
> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    code: 'UNIQUE_CONSTRAINT',
    message: 'Ya existe un registro con esos datos',
  },
  P2003: {
    status: HttpStatus.CONFLICT,
    code: 'RELATED_RECORD',
    message: 'El registro esta relacionado con otros datos',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    code: 'NOT_FOUND',
    message: 'Registro no encontrado',
  },
};

function fromPrisma(error: unknown): HttpException | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const known = PRISMA_ERRORS[error.code];
  return known
    ? new HttpException(
        { code: known.code, message: known.message },
        known.status,
      )
    : null;
}

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
        : (fromPrisma(rawException) ?? rawException);
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
      // Los errores de Prisma traen valores de la consulta: solo se registra codigo y modelo.
      if (
        exception instanceof Prisma.PrismaClientKnownRequestError ||
        exception instanceof Prisma.PrismaClientValidationError
      ) {
        const code = 'code' in exception ? exception.code : 'VALIDATION';
        const model =
          'meta' in exception
            ? (exception.meta?.modelName as string | undefined)
            : undefined;
        this.logger.error(
          `Prisma ${code}${model ? ` en ${model}` : ''} (${request.method} ${request.route?.path ?? ''})`,
        );
      } else {
        const stack = exception instanceof Error ? exception.stack : undefined;
        this.logger.error('Unhandled HTTP exception', stack);
      }
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
