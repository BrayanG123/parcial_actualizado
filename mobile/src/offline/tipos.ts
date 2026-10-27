/** Tipos de la operacion offline en el movil (contrato comun con la PWA: /sync/operations). */

export type EstadoOperacion = 'LOCAL' | 'SENDING' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT' | 'RETRY' | 'DESCARTADA';
export type TipoOperacion = 'SALE_CASH' | 'RESERVATION' | 'EXCHANGE';

/** Acceso asincrono a SQLite (expo-sqlite en la app, node:sqlite en las pruebas). */
export interface BaseDatos {
  ejecutar(sql: string): Promise<void>;
  correr(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  todos<T>(sql: string, params?: unknown[]): Promise<T[]>;
  primero<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Transaccion exclusiva: todo o nada. */
  transaccion<T>(fn: (db: BaseDatos) => Promise<T>): Promise<T>;
}

export interface VarianteDescarga {
  productId: number;
  productName: string;
  description?: string | null;
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

/** Respuesta de GET /sync/snapshot. */
export interface SnapshotServidor {
  version: string;
  generatedAt: string;
  tenant: { id: number; slug: string; name: string } | null;
  branch: { id: number; name: string; city: string; address?: string | null };
  branches: Array<{ id: number; name: string; city: string; address?: string | null }>;
  currency: string;
  openShift: { id: number; register: { id: number; name: string } } | null;
  variants: VarianteDescarga[];
  clients: Array<{ id: number; name: string }>;
}

export interface Descarga {
  sucursal_id: number;
  sucursal: string;
  version: string;
  generado_en: string;
  descargado_en: string;
  moneda: string;
  turno_id: number | null;
  caja: string | null;
}

export interface VarianteLocal {
  producto_id: number;
  producto: string;
  categoria: string;
  imagen: string | null;
  talla_id: number;
  talla: string;
  color_id: number;
  color: string;
  hex: string;
  precio: number;
  descuento: number;
  precio_neto: number;
  /** Lo descargado menos lo registrado en el dispositivo despues de la descarga. */
  stock_local: number;
}

export interface ItemSeleccion {
  productId: number;
  sizeId: number;
  colorId: number;
  quantity: number;
}

export interface LineaOperacion {
  n: number;
  producto_id: number;
  talla_id: number;
  color_id: number;
  nombre: string;
  cantidad: number;
  precio: number | null;
}

export interface OperacionLocal {
  operation_id: string;
  alcance: string;
  tipo: TipoOperacion;
  sucursal_id: number;
  cliente_id: number | null;
  turno_id: number | null;
  creada_local: string;
  orden: number;
  estado: EstadoOperacion;
  intentos: number;
  siguiente_intento: number | null;
  codigo: string | null;
  mensaje: string | null;
  detalle: string | null;
  recurso_tipo: string | null;
  recurso_id: number | null;
  procesada_en: string | null;
  titulo: string;
  total: number | null;
  moneda: string | null;
  recibido: number | null;
  horario: string | null;
  observacion: string | null;
  nota: string | null;
  lineas: LineaOperacion[];
}

export interface ResultadoServidor {
  operationId: string;
  status: 'CONFIRMED' | 'REJECTED' | 'CONFLICT' | 'PROCESSING' | 'ERROR';
  code?: string | null;
  message?: string | null;
  detail?: unknown;
  resourceType?: string | null;
  resourceId?: number | null;
  processedAt?: string | null;
}

export interface OperacionEnvio {
  operationId: string;
  type: TipoOperacion;
  branchId: number;
  createdAtLocal: string;
  payload: Record<string, unknown>;
}

export interface Transporte {
  enviar(deviceId: string, operaciones: OperacionEnvio[]): Promise<{ results: ResultadoServidor[] }>;
}

export interface ResumenSincronizacion {
  enviadas: number;
  confirmadas: number;
  conflictos: number;
  rechazadas: number;
  reintentos: number;
  sinConexion?: boolean;
}
