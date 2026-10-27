/**
 * Modelo local de la operacion offline (PWA). Contrato comun con el movil:
 * POST /sync/operations (backend/docs/ventas-offline.md).
 */

/** LOCAL, SENDING y RETRY solo existen en el cliente; DESCARTADA es una decision del usuario. */
export type EstadoOperacion =
  | 'LOCAL'
  | 'SENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CONFLICT'
  | 'RETRY'
  | 'DESCARTADA';

export type TipoOperacion = 'SALE_CASH' | 'RESERVATION' | 'EXCHANGE';

export interface ResultadoOperacion {
  codigo?: string | null;
  mensaje?: string | null;
  detalle?: unknown;
  recurso?: { tipo: string; id: number } | null;
  procesadaEn?: string | null;
}

export interface LineaResumen {
  nombre: string;
  cantidad: number;
  precio?: number;
}

export interface OperacionLocal {
  operationId: string;
  /** API + empresa + usuario: aisla los datos de cada cuenta en el navegador. */
  alcance: string;
  tipo: TipoOperacion;
  /** Empresa y usuario responsables (registro completo de la venta, enunciado 7.2). */
  tenantId?: number;
  userId?: number;
  branchId: number;
  createdAtLocal: string;
  /** Orden de registro en el dispositivo (desempata operaciones del mismo milisegundo). */
  orden?: number;
  payload: Record<string, unknown>;
  payloadHash: string;
  estado: EstadoOperacion;
  intentos: number;
  /** Momento (ms) desde el que se puede reintentar tras un fallo de red. */
  siguienteIntento?: number;
  resultado?: ResultadoOperacion;
  /** Para mostrar la operacion sin conexion. */
  resumen: { titulo: string; total?: number; moneda?: string; lineas: LineaResumen[] };
  actualizadaEn: string;
  /** Tickets migrados del lote offline del parcial 1 (localStorage). */
  legado?: { loteId: string; deviceId: string };
  nota?: string;
}

export interface VarianteSnapshot {
  productId: number;
  productName: string;
  description?: string | null;
  categoryId: number;
  categoryName: string;
  imageUrl?: string | null;
  sizeId: number;
  sizeName: string;
  colorId: number;
  colorName: string;
  hexCode: string;
  unitPrice: number;
  discount: number;
  netUnitPrice: number;
  available: number;
}

export interface SucursalSnapshot {
  id: number;
  name: string;
  city: string;
  address: string;
  phone?: string | null;
}

/** GET /sync/snapshot guardado localmente. */
export interface SnapshotOffline {
  clave: string;
  alcance: string;
  branchId: number;
  version: string;
  generatedAt: string;
  descargadoEn: string;
  tenant: { id: number; slug: string; name: string } | null;
  branch: SucursalSnapshot;
  branches: SucursalSnapshot[];
  currency: string;
  openShift: { id: number; currency: string; openedAt: string; register: { id: number; name: string } } | null;
  variants: VarianteSnapshot[];
  clients: Array<{ id: number; name: string; wholesale: boolean }>;
  truncated?: boolean;
}

export const PENDIENTES: EstadoOperacion[] = ['LOCAL', 'SENDING', 'RETRY', 'CONFLICT'];

export const ETIQUETA_OPERACION: Record<EstadoOperacion, string> = {
  LOCAL: 'Guardada localmente',
  SENDING: 'Enviando',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
  CONFLICT: 'En conflicto',
  RETRY: 'Reintento pendiente',
  DESCARTADA: 'Descartada',
};

export const claveVariante = (v: { productId: number; sizeId: number; colorId: number }) =>
  `${v.productId}:${v.sizeId}:${v.colorId}`;

/** Explicacion para el usuario de cada codigo de resultado de /sync/operations. */
export const EXPLICACION_CODIGO: Record<string, string> = {
  STOCK_INSUFFICIENT: 'El servidor no tiene existencias suficientes (otra caja o la tienda online las vendio).',
  PRICE_CHANGED: 'El precio cambio respecto al usado en este dispositivo.',
  PRODUCT_INACTIVE: 'La prenda o variante ya no esta disponible.',
  BRANCH_NOT_AUTHORIZED: 'La operacion no corresponde a tu sucursal.',
  BRANCH_INACTIVE: 'La sucursal esta inactiva.',
  SHIFT_CLOSED: 'El turno se cerro antes de sincronizar. Abre otro turno para continuar.',
  SUBSCRIPTION_INVALID: 'La suscripcion de la empresa no esta vigente; se reintentara cuando se renueve.',
  RESERVATION_TIME_PASSED: 'El horario de la reserva ya paso.',
  CONCURRENT_UPDATE: 'Otra operacion modifico el inventario al mismo tiempo; reintenta.',
  TOTAL_MISMATCH: 'El total no coincide con las lineas.',
  INVALID_DATA: 'Los datos de la operacion no son validos.',
  ROLE_NOT_ALLOWED: 'Tu cuenta no puede registrar este tipo de operacion.',
  OPERATION_ID_REUSED: 'El identificador ya se uso con otros datos.',
  NETWORK_ERROR: 'Sin conexion con el servidor; se reintentara automaticamente.',
  SERVER_ERROR: 'El servidor tuvo un error temporal; se reintentara automaticamente.',
};
