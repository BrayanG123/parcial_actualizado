/** Descarga los datos de una sucursal para operar sin conexion (GET /sync/snapshot). */
import { guardarIdentidadOffline } from '../lib/offline-identidad';
import type { Usuario } from '../types/domain';
import { syncApi } from './api';
import { claveSnapshot, guardarSnapshot } from './repositorio';
import type { SnapshotOffline } from './tipos';

/** La sesion verificada al descargar permite abrir la app sin red durante 3 dias. */
const VIGENCIA_IDENTIDAD_MS = 3 * 24 * 3600 * 1000;

export async function descargarSnapshot(alcance: string, usuario: Usuario, branchId?: number) {
  const datos = await syncApi.snapshot(branchId);
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
