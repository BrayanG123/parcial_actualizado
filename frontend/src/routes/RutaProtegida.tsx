/**
 * Proteccion de navegacion por rol.
 * Es UX, no seguridad: el backend valida cada peticion igualmente.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cargando, ErrorEstado } from '../components/ui/Estados';

interface Props {
  roles?: string[];
  children: ReactNode;
}

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

  if (sesionOffline && ubicacion.pathname !== '/caja/offline')
    return <Navigate to="/caja/offline" replace />;

  if (roles && roles.length > 0 && !tieneRol(...roles)) {
    return <Navigate to="/sin-permisos" replace />;
  }

  return <>{children}</>;
}
