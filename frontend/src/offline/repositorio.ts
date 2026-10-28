/** Repositorio local: snapshots por sucursal y operaciones, aislados por alcance. */
import { BASE_URL } from '../api/config';
import { ALMACENES, escribir, leer, porAlcance } from './db';
import { claveVariante, type OperacionLocal, type SnapshotOffline } from './tipos';

export const EVENTO_OFFLINE = 'fs-offline-change';

export function notificarCambio() {
  window.dispatchEvent(new Event(EVENTO_OFFLINE));
}

export function alcanceDe(usuarioId: number, empresa: string | null | undefined) {
  return `${BASE_URL}|${empresa ?? 'default'}|${usuarioId}`;
}

/** Identificador estable de este navegador (clientId del contrato de sync). */
export async function idDispositivo(): Promise<string> {
  const clave = `dispositivo:${BASE_URL}`;
  const guardado = await leer<{ clave: string; valor: string }>(ALMACENES.meta, clave);
  if (guardado) return guardado.valor;
  const valor = crypto.randomUUID();
  await escribir(ALMACENES.meta, { clave, valor });
  return valor;
}

export async function leerMeta<T>(clave: string): Promise<T | undefined> {
  return (await leer<{ clave: string; valor: T }>(ALMACENES.meta, clave))?.valor;
}

export async function guardarMeta<T>(clave: string, valor: T) {
  await escribir(ALMACENES.meta, { clave, valor });
}

export async function guardarSnapshot(snapshot: SnapshotOffline) {
  await escribir(ALMACENES.snapshots, snapshot);
  await guardarMeta(`ultimo-snapshot:${snapshot.alcance}`, snapshot.clave);
  notificarCambio();
}

export const claveSnapshot = (alcance: string, branchId: number) => `${alcance}#${branchId}`;

export async function leerSnapshot(alcance: string, branchId?: number): Promise<SnapshotOffline | undefined> {
  const clave = branchId ? claveSnapshot(alcance, branchId) : await leerMeta<string>(`ultimo-snapshot:${alcance}`);
  return clave ? leer<SnapshotOffline>(ALMACENES.snapshots, clave) : undefined;
}

export async function listarOperaciones(alcance: string): Promise<OperacionLocal[]> {
  const ops = await porAlcance<OperacionLocal>(ALMACENES.operaciones, alcance);
  return ops.sort((a, b) => b.createdAtLocal.localeCompare(a.createdAtLocal) || (b.orden ?? 0) - (a.orden ?? 0));
}

export async function obtenerOperacion(operationId: string) {
  return leer<OperacionLocal>(ALMACENES.operaciones, operationId);
}

/** Las operaciones nunca se borran: solo cambian de estado. */
export async function guardarOperaciones(...ops: OperacionLocal[]) {
  const ahora = new Date().toISOString();
  await escribir(ALMACENES.operaciones, ...ops.map((op) => ({ ...op, actualizadaEn: ahora })));
  notificarCambio();
}

/** Estados que siguen consumiendo stock local (aun no reflejados en el snapshot). */
const CONSUMEN = new Set(['LOCAL', 'SENDING', 'RETRY', 'CONFLICT', 'CONFIRMED']);

/**
 * Stock conocido de una variante: lo descargado menos lo que este dispositivo
 * registro despues de la descarga (las confirmadas antes de la descarga ya estan
 * descontadas en el servidor).
 */
export function stockLocal(
  snapshot: SnapshotOffline,
  operaciones: OperacionLocal[],
  variante: { productId: number; sizeId: number; colorId: number },
) {
  const clave = claveVariante(variante);
  const base = snapshot.variants.find((v) => claveVariante(v) === clave)?.available ?? 0;
  const consumido = operaciones
    .filter((op) => op.branchId === snapshot.branchId && CONSUMEN.has(op.estado))
    .filter((op) => op.estado !== 'CONFIRMED' || (op.resultado?.procesadaEn ?? '') > snapshot.generatedAt)
    .reduce((suma, op) => {
      const items = (op.payload.items as Array<{ productId: number; sizeId: number; colorId: number; quantity: number }>) ?? [];
      return suma + (items.find((i) => claveVariante(i) === clave)?.quantity ?? 0);
    }, 0);
  return Math.max(0, base - consumido);
}

/** Antiguedad legible de los datos descargados. */
export function antiguedad(fecha: string, ahora = Date.now()) {
  const minutos = Math.max(0, Math.round((ahora - Date.parse(fecha)) / 60000));
  if (minutos < 1) return 'hace menos de un minuto';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} dias`;
}

/** Datos con mas de 12 horas se marcan como posiblemente desactualizados. */
export const DESACTUALIZADO_MS = 12 * 3600 * 1000;
