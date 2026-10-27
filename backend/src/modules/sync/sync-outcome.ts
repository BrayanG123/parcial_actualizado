import { HttpException } from '@nestjs/common';

export type FinalStatus = 'CONFIRMED' | 'REJECTED' | 'CONFLICT';

/**
 * Resultado no exitoso de una operacion offline.
 * - CONFLICT: los datos del dispositivo ya no coinciden con el servidor (stock,
 *   precio, turno, suscripcion...). Se puede revisar y reintentar.
 * - REJECTED: la operacion es invalida; reenviarla igual no cambia el resultado.
 */
export class SyncOutcomeError extends Error {
  constructor(
    readonly status: 'CONFLICT' | 'REJECTED',
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'SyncOutcomeError';
  }
}

export const conflict = (code: string, message: string, detail?: unknown) =>
  new SyncOutcomeError('CONFLICT', code, message, detail);
export const rejected = (code: string, message: string, detail?: unknown) =>
  new SyncOutcomeError('REJECTED', code, message, detail);

/** Mensajes de los servicios existentes (ventas, reservas, inventario) -> codigo. */
const RULES: Array<[RegExp, 'CONFLICT' | 'REJECTED', string]> = [
  [
    /^(Insufficient stock|Stock insuficiente|Insufficient or inconsistent inventory)/i,
    'CONFLICT',
    'STOCK_INSUFFICIENT',
  ],
  [/(changed concurrently|Stock changed)/i, 'CONFLICT', 'CONCURRENT_UPDATE'],
  [
    /^Unavailable product\/variant|no longer available/i,
    'CONFLICT',
    'PRODUCT_INACTIVE',
  ],
  [
    /approximateTime must be in the future/,
    'CONFLICT',
    'RESERVATION_TIME_PASSED',
  ],
  [/^Branch does not exist or is inactive/, 'CONFLICT', 'BRANCH_INACTIVE'],
  [
    /(customer role|customer profile) is required/,
    'REJECTED',
    'ROLE_NOT_ALLOWED',
  ],
  [/^Duplicate variants/, 'REJECTED', 'INVALID_DATA'],
  // Mensajes del flujo de lote del parcial 1 (/sales/offline).
  [/excede las existencias descargadas/, 'CONFLICT', 'STOCK_INSUFFICIENT'],
  [
    /total no coincide con los precios descargados/,
    'REJECTED',
    'TOTAL_MISMATCH',
  ],
  [/lote o turno ya esta cerrado/, 'CONFLICT', 'SHIFT_CLOSED'],
  [/ya se registro con otros datos/, 'REJECTED', 'OPERATION_ID_REUSED'],
  [/no corresponde a la preparacion offline/, 'REJECTED', 'INVALID_DATE'],
];

export interface ClassifiedOutcome {
  status: 'CONFLICT' | 'REJECTED' | 'ERROR';
  code: string;
  message: string;
  detail?: unknown;
}

/** Convierte cualquier error de la confirmacion en un resultado de sincronizacion. */
export function classify(error: unknown): ClassifiedOutcome {
  if (error instanceof SyncOutcomeError)
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      detail: error.detail,
    };
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const body = error.getResponse();
    const raw =
      typeof body === 'string'
        ? body
        : (body as { message?: string | string[] }).message;
    const message = Array.isArray(raw)
      ? raw.join('; ')
      : (raw ?? error.message);
    const code =
      typeof body === 'object' ? (body as { code?: string }).code : undefined;
    const detail =
      typeof body === 'object'
        ? (body as { detail?: unknown }).detail
        : undefined;
    if (status >= 500)
      return {
        status: 'ERROR',
        code: 'SERVER_ERROR',
        message: 'Error del servidor; reintentar',
      };
    // Un codigo explicito del servicio (p. ej. cambios de prendas) manda sobre los patrones.
    if (code && code !== 'SUBSCRIPTION_READ_ONLY')
      return {
        status: status === 409 ? 'CONFLICT' : 'REJECTED',
        code,
        message,
        ...(detail !== undefined ? { detail } : {}),
      };
    for (const [pattern, outcome, ruleCode] of RULES)
      if (pattern.test(message))
        return { status: outcome, code: ruleCode, message };
    if (code === 'SUBSCRIPTION_READ_ONLY')
      return { status: 'CONFLICT', code: 'SUBSCRIPTION_INVALID', message };
    return {
      status: status === 409 ? 'CONFLICT' : 'REJECTED',
      code:
        code ??
        (status === 409
          ? 'CONFLICT'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : 'INVALID_DATA'),
      message,
    };
  }
  // Errores no previstos (BD caida, etc.): la operacion queda pendiente y se reintenta.
  return {
    status: 'ERROR',
    code: 'SERVER_ERROR',
    message: 'Error del servidor; reintentar',
  };
}
