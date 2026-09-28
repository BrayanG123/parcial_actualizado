import { EstadoReserva } from '../types/domain';
/** Guia de interfaz alineada con reservation-policy.ts. NestJS valida cada transicion. */
export const SIGUIENTES_RESERVA: Record<EstadoReserva, EstadoReserva[]> = {
  PENDIENTE: [EstadoReserva.PREPARANDO, EstadoReserva.CANCELADA],
  PREPARANDO: [EstadoReserva.LISTA, EstadoReserva.CANCELADA],
  LISTA: [EstadoReserva.CLIENTE_PRESENTE, EstadoReserva.CANCELADA],
  CLIENTE_PRESENTE: [EstadoReserva.ATENDIDA, EstadoReserva.CANCELADA],
  ATENDIDA: [],
  CANCELADA: [],
  VENCIDA: [],
};
export const CANCELABLES_CLIENTE: EstadoReserva[] = [
  EstadoReserva.PENDIENTE,
  EstadoReserva.PREPARANDO,
  EstadoReserva.LISTA,
];
