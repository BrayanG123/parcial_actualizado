/**
 * Proteccion de navegacion por rol.
 * Es UX, no seguridad: el backend valida cada peticion igualmente.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROLES_AREA } from './permisos';
import { useAuth } from '../context/AuthContext';
import { Cargando, ErrorEstado } from '../components/ui/Estados';

interface Props {
  roles?: string[];
  children: ReactNode;
}

/** Pantallas disponibles con una sesion offline (datos en IndexedDB). */
const RUTAS_OFFLINE = new Set(['/caja/offline', '/caja/pendientes', '/caja/cambios', '/pendientes', '/offline']);

export function RutaProtegida({ roles, children }: Props) {
  const { autenticado, cargando, errorSesion, reintentarSesion, tieneRol, sesionOffline } =
    useAuth();
  const ubicacion = useLocation();

  if (cargando) return <Cargando texto="Verificando tu sesion..." />;
  if (errorSesion) return <ErrorEstado error={errorSesion} onReintentar={reintentarSesion} />;

  if (!autenticado) {
    return (
      <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
    );
  }

  // Sin red solo funcionan las pantallas que usan los datos descargados.
  if (sesionOffline && !RUTAS_OFFLINE.has(ubicacion.pathname))
    return <Navigate to={tieneRol(...ROLES_AREA.caja) ? '/caja/offline' : '/offline'} replace />;

  if (roles && roles.length > 0 && !tieneRol(...roles)) {
    return <Navigate to="/sin-permisos" replace />;
  }

  return <>{children}</>;
}
