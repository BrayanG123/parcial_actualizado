import { ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { MissingTenantContextError } from '../tenant/tenant-context.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(error: unknown) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        originalUrl: '/api/v1/users',
        method: 'POST',
        route: { path: '/api/v1/users' },
      }),
    }),
  };
  new HttpExceptionFilter().catch(error, host as never);
  return sent;
}
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on (`email`) value cliente@empresa-b.test in tabla usuarios',
    { code, clientVersion: 'test', meta: { modelName: 'User' } },
  );

describe('HttpExceptionFilter', () => {
  let logged: string[];
  beforeEach(() => {
    logged = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation(
      (...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('traduce errores conocidos de Prisma sin exponer valores ni tablas', () => {
    const duplicate = run(prismaError('P2002'));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: 'UNIQUE_CONSTRAINT',
      message: 'Ya existe un registro con esos datos',
    });
    expect(JSON.stringify(duplicate.body)).not.toMatch(
      /empresa-b|usuarios|email/,
    );
    expect(run(prismaError('P2025')).status).toBe(404);
    expect(run(prismaError('P2003')).body?.code).toBe('RELATED_RECORD');
    expect(logged).toEqual([]);
  });

  it('un error de Prisma no previsto es 500 y el log no guarda los valores de la consulta', () => {
    const result = run(prismaError('P2010'));
    expect(result).toMatchObject({
      status: 500,
      body: { message: 'Internal server error' },
    });
    expect(logged).toEqual(['Prisma P2010 en User (POST /api/v1/users)']);
  });

  it('oculta el detalle de errores internos y conserva los codigos de negocio', () => {
    const internal = run(new Error('conexion a 10.0.0.5 con clave xyz'));
    expect(internal.body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(internal.body)).not.toContain('10.0.0.5');
    expect(
      run(
        new ConflictException({
          code: 'STOCK_INSUFFICIENT',
          message: 'Sin stock',
        }),
      ).body,
    ).toMatchObject({
      code: 'STOCK_INSUFFICIENT',
      statusCode: 409,
    });
    expect(run(new MissingTenantContextError()).body).toMatchObject({
      statusCode: 403,
      code: 'TENANT_REQUIRED',
    });
  });
});
