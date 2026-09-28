/** Carrito, reservas y ventas de NestJS adaptados al dominio de la app. */
import {
  CanalVenta,
  EstadoCarrito,
  EstadoPago,
  EstadoReserva,
  EstadoVenta,
  MetodoPago,
  TipoPago,
  type Carrito,
  type Reserva,
  type Venta,
} from '../types/domain';
import { adaptarColor, adaptarTalla, type ColorBackend, type NombreBackend } from './catalogo.contratos';

/* ---------------- carrito ---------------- */

interface SucursalCarritoBackend extends NombreBackend {
  city: string;
}
export interface CarritoBackend {
  id: number;
  status: 'ACTIVE' | 'CONVERTED' | 'ABANDONED';
  createdAt: string;
  items: Array<{
    id: number;
    productId: number;
    sizeId: number;
    colorId: number;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    available: boolean;
    product: NombreBackend & { imageUrl: string | null; active: boolean };
    size: NombreBackend;
    color: ColorBackend;
    issue: 'PRODUCT_INACTIVE' | 'VARIANT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' | null;
  }>;
  totalQuantity: number;
  total: number;
  availableBranches: SucursalCarritoBackend[];
  hasAvailability: boolean;
}

export function adaptarCarrito(v: CarritoBackend): Carrito {
  return {
    id_carrito: v.id,
    fecha_creacion: v.createdAt,
    estado: { ACTIVE: EstadoCarrito.ACTIVO, CONVERTED: EstadoCarrito.CONVERTIDO, ABANDONED: EstadoCarrito.ABANDONADO }[
      v.status
    ],
    total: v.total,
    cantidad_total: v.totalQuantity,
    tiene_disponibilidad: v.hasAvailability,
    sucursales_disponibles: v.availableBranches.map((b) => ({ id_sucursal: b.id, nombre: b.name, ciudad: b.city })),
    detalles: v.items.map((i) => ({
      id_detalle_carrito: i.id,
      id_carrito: v.id,
      id_producto: i.productId,
      id_talla: i.sizeId,
      id_color: i.colorId,
      cantidad: i.quantity,
      precio_unitario: i.unitPrice,
      subtotal: i.subtotal,
      disponible: i.available,
      problema: i.issue,
      producto: { id_producto: i.product.id, nombre: i.product.name, imagen_url: i.product.imageUrl ?? '' },
      talla: adaptarTalla(i.size),
      color: adaptarColor(i.color),
    })),
  };
}

/* ---------------- reservas ---------------- */

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
  branch: NombreBackend & { city: string; address: string; phone?: string | null };
  client: { id: number; phone: string | null; user: { name: string; email: string } };
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

export function estadoReservaApi(estado: EstadoReserva): EstadoReservaBackend | undefined {
  return (Object.keys(ESTADOS_RESERVA) as EstadoReservaBackend[]).find((k) => ESTADOS_RESERVA[k] === estado);
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
      telefono: v.branch.phone ?? '',
      activa: true,
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
      estado: { PENDING: 'Pendiente', PREPARED: 'Preparada', PURCHASED: 'Comprada', RETURNED: 'Devuelta', UNAVAILABLE: 'No disponible' }[
        i.status
      ],
      producto: { id_producto: i.product.id, nombre: i.product.name, imagen_url: i.product.imageUrl ?? '' },
      talla: adaptarTalla(i.size),
      color: adaptarColor(i.color),
    })),
  };
}

/* ---------------- ventas ---------------- */

export const CANALES_API = { PRESENCIAL: 'IN_STORE', WEB: 'WEB', MOVIL: 'MOBILE' } as const;
export type EstadoVentaBackend = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export interface VentaBackend {
  id: number;
  clientId: number | null;
  employeeId: number | null;
  branchId: number | null;
  reservationId: number | null;
  soldAt: string;
  channel: 'IN_STORE' | 'WEB' | 'MOBILE';
  status: EstadoVentaBackend;
  total: number;
  currency: string;
  cashOnDelivery?: boolean;
  expiresAt?: string | null;
  branch: { id: number; name: string; city: string; address: string } | null;
  client: { id: number; user: { name: string; email: string } } | null;
  items: Array<{
    id: number;
    productId: number;
    sizeId: number;
    colorId: number;
    quantity: number;
    unitPrice: number;
    discount: number;
    productName: string;
    sizeName: string;
    colorName: string;
    color?: { hexCode: string };
  }>;
  payments: Array<{
    id: number;
    method: 'CASH' | 'CARD' | 'QR' | 'BANK_TRANSFER' | 'GATEWAY';
    type: 'IN_STORE' | 'ELECTRONIC';
    amount: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'VOIDED' | 'REFUNDED';
    externalReference: string | null;
    paidAt: string | null;
  }>;
}

export function adaptarVenta(v: VentaBackend): Venta {
  return {
    id_venta: v.id,
    id_cliente: v.clientId,
    id_empleado: v.employeeId,
    id_sucursal: v.branchId,
    id_reserva: v.reservationId,
    fecha: v.soldAt,
    moneda: v.currency,
    contra_entrega: v.cashOnDelivery,
    vence_en: v.expiresAt ?? null,
    canal: { IN_STORE: CanalVenta.PRESENCIAL, WEB: CanalVenta.WEB, MOBILE: CanalVenta.MOVIL }[v.channel],
    estado: {
      DRAFT: EstadoVenta.BORRADOR,
      PENDING_PAYMENT: EstadoVenta.PENDIENTE,
      PAID: EstadoVenta.PAGADA,
      COMPLETED: EstadoVenta.PAGADA,
      CANCELLED: EstadoVenta.ANULADA,
      REFUNDED: EstadoVenta.REEMBOLSADA,
    }[v.status],
    total: v.total,
    cliente: v.client ? { id_cliente: v.client.id, nombre: v.client.user.name, email: v.client.user.email } : null,
    sucursal: v.branch
      ? {
          id_sucursal: v.branch.id,
          nombre: v.branch.name,
          ciudad: v.branch.city,
          direccion: v.branch.address,
          telefono: '',
          activa: true,
        }
      : null,
    detalles: v.items.map((i) => ({
      id_detalle_venta: i.id,
      id_venta: v.id,
      id_producto: i.productId,
      id_talla: i.sizeId,
      id_color: i.colorId,
      cantidad: i.quantity,
      precio_unitario: i.unitPrice,
      // NestJS guarda el descuento por unidad; la pantalla usa el de la linea.
      descuento: Math.round(i.discount * i.quantity * 100) / 100,
      producto: { id_producto: i.productId, nombre: i.productName },
      talla: { id_talla: i.sizeId, nombre: i.sizeName },
      color: { id_color: i.colorId, nombre: i.colorName, codigo_hex: i.color?.hexCode ?? '' },
    })),
    pagos: v.payments.map((p) => ({
      id_pago: p.id,
      id_venta: v.id,
      monto: p.amount,
      metodo: {
        CASH: MetodoPago.EFECTIVO,
        CARD: MetodoPago.TARJETA,
        QR: MetodoPago.QR,
        BANK_TRANSFER: MetodoPago.TRANSFERENCIA,
        GATEWAY: MetodoPago.PASARELA,
      }[p.method],
      tipo: p.type === 'IN_STORE' ? TipoPago.PRESENCIAL : TipoPago.ELECTRONICO,
      estado: {
        PENDING: EstadoPago.PENDIENTE,
        APPROVED: EstadoPago.APROBADO,
        REJECTED: EstadoPago.RECHAZADO,
        VOIDED: EstadoPago.ANULADO,
        REFUNDED: EstadoPago.REEMBOLSADO,
      }[p.status],
      referencia_externa: p.externalReference ?? '',
      fecha: p.paidAt ?? v.soldAt,
    })),
  };
}
