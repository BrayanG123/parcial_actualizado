/** Descarga los datos de una sucursal para operar sin conexion (GET /sync/snapshot). */
import { guardarIdentidadOffline } from '../lib/offline-identidad';
import type { Usuario } from '../types/domain';
import { syncApi } from './api';
import { claveSnapshot, guardarSnapshot, idDispositivo } from './repositorio';
import type { SnapshotOffline } from './tipos';

/** La sesion verificada al descargar permite abrir la app sin red durante 3 dias. */
const VIGENCIA_IDENTIDAD_MS = 3 * 24 * 3600 * 1000;

export async function descargarSnapshot(alcance: string, usuario: Usuario, branchId?: number) {
  return guardar(alcance, usuario, await syncApi.snapshot(branchId, await idDispositivo()));
}

/**
 * Cupo offline: el servidor aparta para esta caja hasta `porVariante` unidades de cada
 * talla y color (todo el stock libre si no se indica). Solo esta caja puede venderlas sin
 * conexion, asi otra caja o la tienda en linea no venden la misma ultima prenda.
 */
export async function apartarCupo(alcance: string, usuario: Usuario, porVariante?: number) {
  return guardar(alcance, usuario, await syncApi.apartarCupo(await idDispositivo(), porVariante));
}

/** Devuelve al stock libre lo apartado y no vendido. */
export async function liberarCupo(alcance: string, usuario: Usuario, snapshot: SnapshotOffline) {
  if (!snapshot.quota) return snapshot;
  return guardar(alcance, usuario, await syncApi.liberarCupo(snapshot.quota.id, await idDispositivo()));
}

async function guardar(
  alcance: string,
  usuario: Usuario,
  datos: Awaited<ReturnType<typeof syncApi.snapshot>>,
) {
  const snapshot: SnapshotOffline = {
    ...datos,
    clave: claveSnapshot(alcance, datos.branch.id),
    alcance,
    branchId: datos.branch.id,
    descargadoEn: new Date().toISOString(),
  };
  await guardarSnapshot(snapshot);
  guardarIdentidadOffline(usuario, new Date(Date.now() + VIGENCIA_IDENTIDAD_MS).toISOString());
  return snapshot;
}
