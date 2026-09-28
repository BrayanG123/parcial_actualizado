import { EstadoReserva, type Reserva } from '../types/domain';
import {
  adaptarColor,
  adaptarTalla,
  type ColorBackend,
  type NombreBackend,
} from './catalogo.contratos';
export const ESTADOS_RESERVA = {
  PENDING: EstadoReserva.PENDIENTE,
  PREPARING: EstadoReserva.PREPARANDO,
  READY: EstadoReserva.LISTA,
  CUSTOMER_PRESENT: EstadoReserva.CLIENTE_PRESENTE,
  COMPLETED: EstadoReserva.ATENDIDA,
  CANCELLED: EstadoReserva.CANCELADA,
  EXPIRED: EstadoReserva.VENCIDA,
} as const;
export type EstadoReservaBackend = keyof typeof ESTADOS_RESERVA;
export interface ReservaBackend {
  id: number;
  clientId: number;
  branchId: number;
  reservedAt: string;
  approximateTime: string;
  expiresAt: string;
  status: EstadoReservaBackend;
  observation: string | null;
  branch: NombreBackend & { city: string; address: string };
  client: {
    id: number;
    userId: number;
    phone: string | null;
    user: { name: string; email: string };
  };
  items: Array<{
    id: number;
    reservationId: number;
    productId: number;
    sizeId: number;
    colorId: number;
    quantity: number;
    status: 'PENDING' | 'PREPARED' | 'PURCHASED' | 'RETURNED' | 'UNAVAILABLE';
    product: NombreBackend & { imageUrl: string | null };
    size: NombreBackend;
    color: ColorBackend;
  }>;
}
export function adaptarReserva(v: ReservaBackend): Reserva {
  return {
    id_reserva: v.id,
    id_cliente: v.clientId,
    id_sucursal: v.branchId,
    fecha_reserva: v.reservedAt,
    horario_aproximado: v.approximateTime,
    vence_en: v.expiresAt,
    estado: ESTADOS_RESERVA[v.status],
    observacion: v.observation ?? '',
    sucursal: {
      id_sucursal: v.branch.id,
      nombre: v.branch.name,
      ciudad: v.branch.city,
      direccion: v.branch.address,
    },
    cliente: {
      id_cliente: v.client.id,
      nombre: v.client.user.name,
      email: v.client.user.email,
      telefono: v.client.phone ?? '',
    },
    detalles: v.items.map((i) => ({
      id_detalle_reserva: i.id,
      id_reserva: i.reservationId,
      id_producto: i.productId,
      id_talla: i.sizeId,
      id_color: i.colorId,
      cantidad: i.quantity,
      estado: {
        PENDING: 'Pendiente',
        PREPARED: 'Preparada',
        PURCHASED: 'Comprada',
        RETURNED: 'Devuelta',
        UNAVAILABLE: 'No disponible',
      }[i.status],
      producto: {
        id_producto: i.product.id,
        nombre: i.product.name,
        imagen_url: i.product.imageUrl ?? '',
      },
      talla: adaptarTalla(i.size),
      color: adaptarColor(i.color),
    })),
  };
}
