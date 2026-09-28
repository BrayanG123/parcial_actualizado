import {
  adaptarColor,
  adaptarTalla,
  type ColorBackend,
  type NombreBackend,
} from './catalogo.contratos';
import { TipoMovimiento, type Inventario, type MovimientoInventario } from '../types/domain';

export const TIPOS_MOVIMIENTO = {
  ENTRY: TipoMovimiento.ENTRADA,
  SALE: TipoMovimiento.VENTA,
  RESERVATION: TipoMovimiento.RESERVA,
  RESERVATION_RELEASE: TipoMovimiento.LIBERACION_RESERVA,
  RETURN: TipoMovimiento.DEVOLUCION,
  ADJUSTMENT: TipoMovimiento.AJUSTE,
  PENDING_ENTRY: TipoMovimiento.INGRESO_PENDIENTE,
  CHECKOUT_HOLD: TipoMovimiento.RETENCION_COMPRA,
  CHECKOUT_RELEASE: TipoMovimiento.LIBERACION_COMPRA,
} as const;
export type TipoMovimientoBackend = keyof typeof TIPOS_MOVIMIENTO;
export const ESTADOS_MOVIMIENTO = {
  PENDING: 'PENDIENTE',
  COMPLETED: 'COMPLETADO',
  CANCELLED: 'CANCELADO',
} as const;
export interface InventarioBackend {
  id: number;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity?: number;
  updatedAt: string;
  branch: NombreBackend & { city: string; active: boolean };
  product: NombreBackend & { imageUrl: string | null; active: boolean };
  size: NombreBackend;
  color: ColorBackend;
}
export interface MovimientoBackend {
  id: number;
  inventoryId: number;
  employeeId: number | null;
  type: TipoMovimientoBackend;
  quantity: number;
  status: keyof typeof ESTADOS_MOVIMIENTO;
  occurredAt: string;
  scheduledAt: string | null;
  reference: string | null;
  observation: string | null;
  employee?: { id: number; jobTitle: string; user: { name: string } } | null;
}
export interface ResultadoMovimientoBackend {
  inventory: InventarioBackend;
  movement: MovimientoBackend;
}
export function adaptarInventario(v: InventarioBackend): Inventario {
  return {
    id_inventario: v.id,
    id_producto: v.product.id,
    id_sucursal: v.branch.id,
    id_talla: v.size.id,
    id_color: v.color.id,
    cantidad_fisica: v.physicalQuantity,
    cantidad_reservada: v.reservedQuantity,
    sucursal: {
      id_sucursal: v.branch.id,
      nombre: v.branch.name,
      ciudad: v.branch.city,
      activa: v.branch.active,
    },
    producto: {
      id_producto: v.product.id,
      nombre: v.product.name,
      imagen_url: v.product.imageUrl ?? '',
      activo: v.product.active,
    },
    talla: adaptarTalla(v.size),
    color: adaptarColor(v.color),
  };
}
export function adaptarMovimiento(v: MovimientoBackend): MovimientoInventario {
  return {
    id_movimiento: v.id,
    id_inventario: v.inventoryId,
    id_empleado: v.employeeId,
    tipo: TIPOS_MOVIMIENTO[v.type],
    cantidad: v.quantity,
    estado: ESTADOS_MOVIMIENTO[v.status],
    fecha: v.occurredAt,
    fecha_programada: v.scheduledAt,
    referencia: v.reference ?? '',
    observacion: v.observation ?? '',
    empleado: v.employee ? { id_empleado: v.employee.id, nombre: v.employee.user.name } : null,
  };
}
