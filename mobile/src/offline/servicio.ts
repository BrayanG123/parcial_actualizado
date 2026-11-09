/**
 * Servicio offline de la app: une el nucleo (SQLite) con la API y la sesion.
 *   Pantalla -> hook -> este servicio -> nucleo -> expo-sqlite
 *                                     -> api (/sync/snapshot, /sync/operations)
 */
import { api, BASE_URL } from '../api/http';
import { obtenerEmpresa } from '../api/empresa';
import * as nucleo from './nucleo';
import { abrirBase } from './sqlite';
import type { ItemSeleccion, OperacionEnvio, ResultadoServidor, SnapshotServidor, Transporte } from './tipos';

const oyentes = new Set<() => void>();
export function suscribirOffline(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}
const notificar = () => oyentes.forEach((f) => f());

export const alcanceDe = (usuarioId: number) => nucleo.alcanceDe(BASE_URL, obtenerEmpresa()?.slug, usuarioId);

const transporte: Transporte = {
  enviar: (deviceId: string, operations: OperacionEnvio[]) =>
    api.post<{ results: ResultadoServidor[] }>('/sync/operations', { deviceId, operations }),
};

async function guardar(alcance: string, snapshot: SnapshotServidor) {
  await nucleo.guardarSnapshot(await abrirBase(), alcance, snapshot);
  notificar();
  return snapshot;
}

export const offlineService = {
  async descargar(alcance: string, sucursalId?: number) {
    const db = await abrirBase();
    const deviceId = await nucleo.idDispositivo(db);
    const snapshot = await api.get<SnapshotServidor>('/sync/snapshot', {
      ...(sucursalId ? { branchId: sucursalId } : {}),
      deviceId,
    });
    return guardar(alcance, snapshot);
  },
  /**
   * Cupo offline: el servidor aparta para este telefono hasta `porVariante` unidades de cada
   * talla y color (todo el stock libre si no se indica). Solo esta caja puede venderlas sin
   * conexion, asi otra caja o la tienda en linea no venden la misma ultima prenda.
   */
  async apartarCupo(alcance: string, porVariante?: number) {
    const deviceId = await nucleo.idDispositivo(await abrirBase());
    const snapshot = await api.post<SnapshotServidor>('/sync/quota', {
      deviceId,
      ...(porVariante ? { perVariant: porVariante } : {}),
    });
    return guardar(alcance, snapshot);
  },
  /** Devuelve al stock libre lo apartado y no vendido. */
  async liberarCupo(alcance: string, cupoId: number) {
    const deviceId = await nucleo.idDispositivo(await abrirBase());
    const snapshot = await api.post<SnapshotServidor>(`/sync/quota/${cupoId}/release`, { deviceId });
    return guardar(alcance, snapshot);
  },
  async datos(alcance: string, sucursalId?: number, busqueda = '') {
    const db = await abrirBase();
    const descarga = await nucleo.descarga(db, alcance, sucursalId);
    const [operaciones, sucursales, clientes, catalogo] = await Promise.all([
      nucleo.listarOperaciones(db, alcance),
      nucleo.sucursales(db, alcance),
      nucleo.clientes(db, alcance),
      descarga ? nucleo.catalogo(db, alcance, descarga.sucursal_id, busqueda) : Promise.resolve([]),
    ]);
    return { descarga, operaciones, sucursales, clientes, catalogo };
  },
  async vender(
    alcance: string,
    datos: { sucursalId: number; items: ItemSeleccion[]; recibido: number; clienteId?: number; usuarioId?: number },
  ) {
    const r = await nucleo.registrar(await abrirBase(), alcance, { tipo: 'SALE_CASH', ...datos });
    notificar();
    return r;
  },
  async reservar(
    alcance: string,
    datos: { sucursalId: number; items: ItemSeleccion[]; horario: string; observacion?: string; usuarioId?: number },
  ) {
    const r = await nucleo.registrar(await abrirBase(), alcance, { tipo: 'RESERVATION', ...datos });
    notificar();
    return r;
  },
  async sincronizar(alcance: string, incluir: string[] = []) {
    try {
      return await nucleo.sincronizar(await abrirBase(), alcance, transporte, incluir);
    } finally {
      notificar();
    }
  },
  async descartar(alcance: string, operationId: string) {
    const db = await abrirBase();
    const op = (await nucleo.listarOperaciones(db, alcance)).find((o) => o.operation_id === operationId);
    if (op) await nucleo.descartar(db, op);
    notificar();
  },
};
