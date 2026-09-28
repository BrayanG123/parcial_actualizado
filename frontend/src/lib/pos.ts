import { BASE_URL } from '../api/config';
import type { CobroPOS } from '../services/pos.service';

const clave = (userId: number) => `fs.pos.pendiente.v1:${BASE_URL}:${userId}`;
export function recuperarCobro(userId: number): CobroPOS | null {
  const raw = sessionStorage.getItem(clave(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as CobroPOS;
  if (!value?.idempotencyKey || !Array.isArray(value.items) || !Number.isInteger(value.branchId))
    throw new Error(
      'El cobro pendiente guardado no es valido. Revisa el historial de ventas antes de continuar.',
    );
  return value;
}
export function guardarCobro(userId: number, cobro: CobroPOS) {
  // Persist before transmitting: a refresh must reuse the same request and key.
  sessionStorage.setItem(clave(userId), JSON.stringify(cobro));
}
export function borrarCobro(userId: number) {
  sessionStorage.removeItem(clave(userId));
}
export function resultadoIncierto(error: unknown) {
  const status = (error as { status?: number })?.status;
  return status == null || status === 0 || status >= 500 || status === 401 || status === 403;
}
