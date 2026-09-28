/** Traduce estados del dominio a color y texto legible. */
import { EstadoPago, EstadoReserva, EstadoVenta } from '../../types/domain';
import { etiqueta } from '../../lib/format';

type Tono = '' | 'exito' | 'alerta' | 'error' | 'info' | 'acento';

function Badge({ tono, children }: { tono: Tono; children: string }) {
  return <span className={`fs-badge${tono ? ` fs-badge--${tono}` : ''}`}>{children}</span>;
}

const TONO_RESERVA: Record<string, Tono> = {
  [EstadoReserva.PENDIENTE]: 'alerta',
  [EstadoReserva.PREPARANDO]: 'info',
  [EstadoReserva.LISTA]: 'acento',
  [EstadoReserva.CLIENTE_PRESENTE]: 'info',
  [EstadoReserva.ATENDIDA]: 'exito',
  [EstadoReserva.CANCELADA]: 'error',
  [EstadoReserva.VENCIDA]: 'error',
};

const TONO_VENTA: Record<string, Tono> = {
  [EstadoVenta.PENDIENTE]: 'alerta',
  [EstadoVenta.PAGADA]: 'exito',
  [EstadoVenta.ENTREGADA]: 'info',
  [EstadoVenta.ANULADA]: 'error',
};

const TONO_PAGO: Record<string, Tono> = {
  [EstadoPago.PENDIENTE]: 'alerta',
  [EstadoPago.APROBADO]: 'exito',
  [EstadoPago.RECHAZADO]: 'error',
  [EstadoPago.ANULADO]: 'error',
};

export function BadgeReserva({ estado }: { estado: string }) {
  return <Badge tono={TONO_RESERVA[estado] ?? ''}>{etiqueta(estado)}</Badge>;
}

export function BadgeVenta({ estado }: { estado: string }) {
  return <Badge tono={TONO_VENTA[estado] ?? ''}>{etiqueta(estado)}</Badge>;
}

export function BadgePago({ estado }: { estado: string }) {
  return <Badge tono={TONO_PAGO[estado] ?? ''}>{etiqueta(estado)}</Badge>;
}

export function BadgeCanal({ canal }: { canal: string }) {
  return <Badge tono={canal === 'PRESENCIAL' ? '' : 'info'}>{etiqueta(canal)}</Badge>;
}

export function BadgeActivo({ activo }: { activo: boolean }) {
  return <Badge tono={activo ? 'exito' : ''}>{activo ? 'Activo' : 'Inactivo'}</Badge>;
}

/** Semaforo de stock disponible. */
export function BadgeStock({ disponible }: { disponible: number }) {
  if (disponible <= 0) return <Badge tono="error">Agotado</Badge>;
  if (disponible <= 3) return <Badge tono="alerta">{`Quedan ${disponible}`}</Badge>;
  return <Badge tono="exito">{`${disponible} disponibles`}</Badge>;
}
