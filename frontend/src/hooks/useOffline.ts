import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEmpresaActiva } from './useEmpresaActiva';
import { migrarLegado } from '../offline/migracion';
import { alcanceDe, EVENTO_OFFLINE, leerSnapshot, listarOperaciones } from '../offline/repositorio';
import { sincronizar, ultimaSincronizacion, type ResumenSincronizacion } from '../offline/sincronizador';
import { PENDIENTES, type OperacionLocal, type SnapshotOffline } from '../offline/tipos';

const INTERVALO_MS = 30 * 1000;

export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);
  return enLinea;
}

/** Alcance de los datos offline: API + empresa + usuario (null sin sesion). */
export function useAlcanceOffline() {
  const { usuario } = useAuth();
  const empresa = useEmpresaActiva();
  return usuario ? alcanceDe(usuario.id_usuario, empresa?.slug) : null;
}

/** Operaciones y ultimo snapshot del alcance; se refrescan ante cualquier cambio local. */
export function useDatosOffline(alcance: string | null, branchId?: number) {
  const [operaciones, setOperaciones] = useState<OperacionLocal[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotOffline | undefined>();
  const [ultimaSync, setUltimaSync] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [cargado, setCargado] = useState(false);
  const recargar = useCallback(async () => {
    if (!alcance) return;
    try {
      const [ops, snap, ultima] = await Promise.all([
        listarOperaciones(alcance),
        leerSnapshot(alcance, branchId),
        ultimaSincronizacion(alcance),
      ]);
      setOperaciones(ops);
      setSnapshot(snap);
      setUltimaSync(ultima);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el almacenamiento offline.');
    } finally {
      setCargado(true);
    }
  }, [alcance, branchId]);
  useEffect(() => {
    void recargar();
    window.addEventListener(EVENTO_OFFLINE, recargar);
    return () => window.removeEventListener(EVENTO_OFFLINE, recargar);
  }, [recargar]);
  const pendientes = operaciones.filter((op) => PENDIENTES.includes(op.estado));
  return { operaciones, pendientes, snapshot, ultimaSync, error, cargado, recargar };
}

/**
 * Sincronizacion automatica al recuperar conexion y cada 30 s mientras haya
 * pendientes; migra una sola vez la caja offline del parcial 1.
 */
export function useSincronizacionAutomatica(alcance: string | null, hayPendientes: boolean) {
  const enLinea = useEnLinea();
  const { usuario, sesionOffline } = useAuth();
  const [ultimo, setUltimo] = useState<ResumenSincronizacion | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const ejecutar = useCallback(
    async (incluir: string[] = []) => {
      if (!alcance || !navigator.onLine) return null;
      setSincronizando(true);
      try {
        const resumen = await sincronizar(alcance, incluir);
        setUltimo(resumen);
        return resumen;
      } finally {
        setSincronizando(false);
      }
    },
    [alcance],
  );
  useEffect(() => {
    if (!alcance || !usuario) return;
    void migrarLegado(usuario.id_usuario, alcance).catch(() => undefined);
  }, [alcance, usuario]);
  useEffect(() => {
    if (!alcance || !enLinea || sesionOffline || !hayPendientes) return;
    void ejecutar().catch(() => undefined);
    const timer = window.setInterval(() => void ejecutar().catch(() => undefined), INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [alcance, enLinea, sesionOffline, hayPendientes, ejecutar]);
  return { enLinea, sincronizando, ultimo, sincronizarAhora: ejecutar };
}
