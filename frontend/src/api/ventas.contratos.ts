import {
  CanalVenta,
  EstadoPago,
  EstadoVenta,
  MetodoPago,
  TipoPago,
  type Venta,
} from '../types/domain';

export const CANALES_API = { PRESENCIAL: 'IN_STORE', WEB: 'WEB', MOVIL: 'MOBILE' } as const;
export const METODOS_API = {
  EFECTIVO: 'CASH',
  TARJETA: 'CARD',
  QR: 'QR',
  TRANSFERENCIA: 'BANK_TRANSFER',
  PASARELA: 'GATEWAY',
} as const;
export interface VentaBackend {
  cashOnDelivery?: boolean;
  deliveryName?: string | null;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  deliveredAt?: string | null;
  expiresAt?: string | null;
  shiftId?: number | null;
  id: number;
  clientId: number | null;
  employeeId: number | null;
  branchId: number | null;
  reservationId: number | null;
  soldAt: string;
  channel: 'IN_STORE' | 'WEB' | 'MOBILE';
  status: 'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  total: number;
  currency: string;
  receiptNumber?: string;
  client: { id: number; user: { name: string; email: string } } | null;
  branch: { id: number; name: string; city: string; address: string } | null;
  employee: { id: number; user: { name: string } } | null;
  items: Array<{
    id: number;
    productId: number;
    sizeId: number;
    colorId: number;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
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
    contra_entrega: v.cashOnDelivery,
    id_turno: v.shiftId,
    id_cliente: v.clientId,
    id_empleado: v.employeeId,
    id_sucursal: v.branchId,
    id_reserva: v.reservationId,
    comprobante_disponible: v.status === 'COMPLETED',
    fecha: v.soldAt,
    moneda: v.currency,
    numero_comprobante: v.receiptNumber,
    cajero: v.employee?.user.name,
    canal: { IN_STORE: CanalVenta.PRESENCIAL, WEB: CanalVenta.WEB, MOBILE: CanalVenta.MOVIL }[
      v.channel
    ],
    estado: {
      DRAFT: EstadoVenta.BORRADOR,
      PAID: EstadoVenta.PAGADA,
      REFUNDED: EstadoVenta.REEMBOLSADA,
      PENDING_PAYMENT: EstadoVenta.PENDIENTE,
      COMPLETED: EstadoVenta.PAGADA,
      CANCELLED: EstadoVenta.ANULADA,
    }[v.status],
    total: v.total,
    cliente: v.client
      ? { id_cliente: v.client.id, nombre: v.client.user.name, email: v.client.user.email }
      : null,
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
      id_turno: v.shiftId,
      id_producto: i.productId,
      id_talla: i.sizeId,
      id_color: i.colorId,
      cantidad: i.quantity,
      precio_unitario: i.unitPrice,
      // Nest stores discount per unit; the existing UI uses the discount for the whole line.
      descuento: Math.round(i.discount * i.quantity * 100) / 100,
      producto: { id_producto: i.productId, nombre: i.productName },
      talla: { id_talla: i.sizeId, nombre: i.sizeName },
      color: { id_color: i.colorId, nombre: i.colorName, codigo_hex: i.color?.hexCode ?? '' },
    })),
    pagos: v.payments.map((p) => ({
      id_pago: p.id,
      id_venta: v.id,
      id_turno: v.shiftId,
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
        REFUNDED: EstadoPago.REEMBOLSADO,
        PENDING: EstadoPago.PENDIENTE,
        APPROVED: EstadoPago.APROBADO,
        REJECTED: EstadoPago.RECHAZADO,
        VOIDED: EstadoPago.ANULADO,
      }[p.status],
      referencia_externa: p.externalReference ?? '',
      fecha: p.paidAt ?? v.soldAt,
    })),
  };
}
