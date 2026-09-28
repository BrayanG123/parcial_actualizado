import { recuperarCobro } from './pos';
import { BASE_URL } from '../api/config';
import { revisionSesion } from '../api/sesion';
import type { ItemPOS } from '../services/pos.service';
import {
  offlineService,
  type DatosTicketOffline,
  type LoteOffline,
} from '../services/offline.service';
import type { Usuario, Venta } from '../types/domain';
import { guardarIdentidadOffline } from './offline-identidad';

export interface TicketOffline {
  datos: DatosTicketOffline;
  recibido: number;
  venta?: Venta;
  error?: string;
  conflicto?: boolean;
}
export interface CajaOffline {
  version: 1;
  lote: LoteOffline;
  tickets: TicketOffline[];
  finalizando: boolean;
}
const key = (userId: number) => `fs.offline.v1:${BASE_URL}:${userId}`;
const intentKey = (userId: number) => `${key(userId)}:preparacion`;
const event = 'fs-offline-change';
export const claveVariante = (i: Pick<ItemPOS, 'productId' | 'sizeId' | 'colorId'>) =>
  `${i.productId}:${i.sizeId}:${i.colorId}`;
export function leerOffline(userId: number): CajaOffline | null {
  const raw = localStorage.getItem(key(userId));
  if (!raw) return null;
  const data = JSON.parse(raw) as CajaOffline;
  if (data.version !== 1 || data.lote.snapshot.userId !== userId || !Array.isArray(data.tickets))
    throw new Error(
      'Los datos offline no se pudieron leer. No borres el almacenamiento del navegador.',
    );
  return data;
}
function guardar(userId: number, data: CajaOffline) {
  localStorage.setItem(key(userId), JSON.stringify(data));
  window.dispatchEvent(new Event(event));
}
export function observarOffline(fn: () => void) {
  window.addEventListener(event, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(event, fn);
    window.removeEventListener('storage', fn);
  };
}
export function bloqueoOffline<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        'La caja offline requiere HTTPS o localhost y un navegador con Web Locks (Chrome o Edge).',
      ),
    );
  return navigator.locks.request(key(userId), fn);
}
export async function prepararOffline(usuario: Usuario, shiftId: number) {
  return bloqueoOffline(usuario.id_usuario, async () => {
    if (recuperarCobro(usuario.id_usuario)) throw new Error('Resuelve el cobro pendiente en la caja normal antes de preparar el modo offline.');
    const existing = leerOffline(usuario.id_usuario);
    if (existing) return existing;
    const stored = localStorage.getItem(intentKey(usuario.id_usuario));
    const intent = stored
      ? (JSON.parse(stored) as { id: string; deviceId: string; shiftId: number })
      : { id: crypto.randomUUID(), deviceId: crypto.randomUUID(), shiftId };
    if (intent.shiftId !== shiftId)
      throw new Error(
        'Hay una preparacion pendiente de otro turno. Recupera ese turno antes de continuar.',
      );
    localStorage.setItem(intentKey(usuario.id_usuario), JSON.stringify(intent));
    const lote = await offlineService.preparar(intent);
    const state: CajaOffline = { version: 1, lote, tickets: [], finalizando: false };
    guardar(usuario.id_usuario, state);
    guardarIdentidadOffline(usuario, lote.snapshot.expiresAt);
    return state;
  });
}
export function disponibles(state: CajaOffline, item: ItemPOS) {
  const variant = state.lote.snapshot.variants.find(
    (v) => claveVariante(v) === claveVariante(item),
  );
  return (
    (variant?.available ?? 0) -
    state.tickets.reduce(
      (sum, t) =>
        sum + (t.datos.items.find((i) => claveVariante(i) === claveVariante(item))?.quantity ?? 0),
      0,
    )
  );
}
export function totalOffline(state: CajaOffline, items: ItemPOS[]) {
  if (!items.length || items.length > 50 || new Set(items.map(claveVariante)).size !== items.length)
    throw new Error('Selecciona entre 1 y 50 variantes distintas.');
  const cents = items.reduce((sum, i) => {
    const v = state.lote.snapshot.variants.find((v) => claveVariante(v) === claveVariante(i));
    if (
      !v ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > 100 ||
      i.quantity > disponibles(state, i)
    )
      throw new Error('La cantidad supera el stock local disponible.');
    return sum + Math.round(v.netUnitPrice * 100) * i.quantity;
  }, 0);
  if (cents <= 0 || cents > 999999999999) throw new Error('El total del ticket no es valido.');
  return cents / 100;
}
export async function guardarTicketOffline(userId: number, items: ItemPOS[], recibido: number) {
  return bloqueoOffline(userId, async () => {
    const state = leerOffline(userId);
    if (!state || state.finalizando) throw new Error('Prepara el modo offline antes de vender.');
    if (Date.now() > new Date(state.lote.snapshot.expiresAt).getTime())
      throw new Error('La descarga vencio. Sincroniza y prepara nuevamente con internet.');
    if (state.tickets.length >= 500)
      throw new Error('Sincroniza y finaliza la preparacion antes de registrar mas tickets.');
    const expectedTotal = totalOffline(state, items);
    if (
      !Number.isFinite(recibido) ||
      recibido < expectedTotal ||
      Math.abs(recibido * 100 - Math.round(recibido * 100)) > 0.001
    )
      throw new Error('El efectivo recibido debe cubrir el total con hasta dos decimales.');
    const ticket: TicketOffline = {
      recibido,
      datos: {
        deviceId: state.lote.deviceId,
        idempotencyKey: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        expectedTotal,
        items: items.map((i) => ({ ...i })),
      },
    };
    state.tickets.push(ticket);
    // Persist before presenting success; no payment is acknowledged if the write fails.
    guardar(userId, state);
    return ticket;
  });
}
export async function sincronizarOffline(userId: number, forzar = false) {
  const revision = revisionSesion();
  return bloqueoOffline(userId, async () => {
    const state = leerOffline(userId);
    if (!state || state.finalizando) return;
    for (const t of state.tickets) {
      if (revision !== revisionSesion()) return;
      if (t.venta) continue;
      if (t.conflicto && !forzar) return;
      try {
        t.venta = await offlineService.sincronizar(state.lote.id, t.datos);
        t.error = undefined;
        t.conflicto = false;
      } catch (e) {
        t.error = e instanceof Error ? e.message : 'No se pudo sincronizar.';
        const status = (e as { status?: number }).status ?? 0;
        t.conflicto = status >= 400 && status < 500;
        guardar(userId, state);
        return;
      }
      guardar(userId, state);
    }
  });
}
export async function finalizarOffline(userId: number) {
  return bloqueoOffline(userId, async () => {
    const state = leerOffline(userId);
    if (!state) return;
    if (state.tickets.some((t) => !t.venta))
      throw new Error('Sincroniza todos los tickets antes de finalizar.');
    state.finalizando = true;
    guardar(userId, state);
    // Keep finalizando on uncertain responses so no new ticket can be appended to a finished batch.
    await offlineService.finalizar(state.lote.id, {
      deviceId: state.lote.deviceId,
      keys: state.tickets.map((t) => t.datos.idempotencyKey),
    });
    localStorage.removeItem(key(userId));
    localStorage.removeItem(intentKey(userId));
    window.dispatchEvent(new Event(event));
  });
}
export function exportarOffline(userId: number) {
  const state = leerOffline(userId);
  if (!state) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `caja-offline-turno-${state.lote.shiftId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
