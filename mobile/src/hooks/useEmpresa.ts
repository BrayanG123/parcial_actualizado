import { useSyncExternalStore } from 'react';
import { obtenerEmpresa, suscribirEmpresa } from '../api/empresa';

/** Tienda activa; se actualiza al elegir otra tienda o al iniciar sesion. */
export function useEmpresaActiva() {
  return useSyncExternalStore(suscribirEmpresa, obtenerEmpresa, obtenerEmpresa);
}
