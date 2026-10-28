import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSesion } from '../context/SesionContext';
import { suscribirEmpresa } from '../api/empresa';
import { alcanceDe, offlineService, suscribirOffline } from '../offline/servicio';
import { PENDIENTES } from '../offline/nucleo';
import { offlineDisponible } from '../offline/sqlite';
import type { ResumenSincronizacion } from '../offline/tipos';

type Datos = Awaited<ReturnType<typeof offlineService.datos>>;
const VACIO: Datos = { descarga: null, operaciones: [], sucursales: [], clientes: [], catalogo: [] };
const INTERVALO_MS = 30 * 1000;

/** Alcance offline (API + tienda + usuario); null sin sesion. */
export function useAlcanceOffline() {
  const { usuario } = useSesion();
  const [, setRevision] = useState(0);
  useEffect(() => suscribirEmpresa(() => setRevision((n) => n + 1)), []);
  return usuario && offlineDisponible ? alcanceDe(usuario.id_usuario) : null;
}

/** Datos locales (SQLite); se recargan ante cualquier cambio offline. */
export function useDatosOffline(alcance: string | null, sucursalId?: number, busqueda = '') {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(async () => {
    if (!alcance) {
      setCargando(false);
      return;
    }
    try {
      setDatos(await offlineService.datos(alcance, sucursalId, busqueda));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la base local.');
    } finally {
      setCargando(false);
    }
  }, [alcance, sucursalId, busqueda]);
  useEffect(() => {
    void recargar();
    return suscribirOffline(() => void recargar());
  }, [recargar]);
  const pendientes = datos.operaciones.filter((op) => PENDIENTES.includes(op.estado));
  return { ...datos, pendientes, error, cargando, recargar };
}

/**
 * Sincroniza al volver la app al primer plano y cada 30 s mientras haya pendientes.
 * Sin un modulo de red nativo, "sin conexion" se deduce del ultimo intento.
 */
export function useSincronizacion(alcance: string | null, hayPendientes: boolean) {
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimo, setUltimo] = useState<ResumenSincronizacion | null>(null);
  const activo = useRef(false);
  const sincronizar = useCallback(
    async (incluir: string[] = []) => {
      if (!alcance || activo.current) return null;
      activo.current = true;
      setSincronizando(true);
      try {
        const r = await offlineService.sincronizar(alcance, incluir);
        setUltimo(r);
        return r;
      } finally {
        activo.current = false;
        setSincronizando(false);
      }
    },
    [alcance],
  );
  useEffect(() => {
    if (!alcance || !hayPendientes) return;
    void sincronizar().catch(() => undefined);
    const timer = setInterval(() => void sincronizar().catch(() => undefined), INTERVALO_MS);
    const app = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizar().catch(() => undefined);
    });
    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, [alcance, hayPendientes, sincronizar]);
  return { sincronizando, ultimo, sinConexion: ultimo?.sinConexion === true, sincronizar };
}

/** Antiguedad legible de los datos descargados. */
export function antiguedad(fecha: string, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - Date.parse(fecha)) / 60000));
  if (min < 1) return 'hace menos de un minuto';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} dias`;
}
export const DESACTUALIZADO_MS = 12 * 3600 * 1000;
