import { identidadOffline, borrarIdentidadOffline } from '../lib/offline-identidad';
/**
 * Sesion del usuario. Es el unico estado verdaderamente global de la app.
 * El backend sigue siendo la autoridad de autorizacion: aqui solo resolvemos UX.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { desactivarPush } from '../lib/push';
import { useQueryClient } from '@tanstack/react-query';
import { obtenerToken, revisionSesion, suscribirSesion } from '../api/sesion';
import { authService, type CredencialesLogin, type DatosRegistro } from '../services/auth.service';
import { RolNombre, type Usuario } from '../types/domain';

interface ContextoAuth {
  usuario: Usuario | null;
  sesionOffline: boolean;
  cargando: boolean;
  errorSesion: Error | null;
  reintentarSesion: () => void;
  autenticado: boolean;
  roles: string[];
  esCliente: boolean;
  idCliente: number | null;
  idSucursal: number | null;
  tieneRol: (...roles: string[]) => boolean;
  iniciarSesion: (credenciales: CredencialesLogin) => Promise<Usuario>;
  registrarse: (datos: DatosRegistro) => Promise<Usuario>;
  cerrarSesion: () => Promise<void>;
  /** Reemplaza los datos de la sesion despues de editar el perfil. */
  actualizarUsuario: (usuario: Usuario) => void;
}

const Contexto = createContext<ContextoAuth | null>(null);

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [sesionOffline, setSesionOffline] = useState(false);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(() => Boolean(obtenerToken()));
  const [errorSesion, setErrorSesion] = useState<Error | null>(null);
  const [intento, setIntento] = useState(0);
  const queryClient = useQueryClient();

  useEffect(
    () =>
      suscribirSesion((externa) => {
        void queryClient.cancelQueries();
        queryClient.clear();
        setUsuario(null);
        setSesionOffline(false);
        setErrorSesion(null);
        setCargando(externa && Boolean(obtenerToken()));
        if (externa && obtenerToken()) setIntento((actual) => actual + 1);
      }),
    [queryClient],
  );

  // Rehidrata la sesion si hay token guardado.
  useEffect(() => {
    let activo = true;
    if (!obtenerToken()) return;
    const revision = revisionSesion();
    const vigente = () => activo && revision === revisionSesion();
    const cached = identidadOffline();
    const desdeCache = !navigator.onLine && Boolean(cached);
    const perfil = desdeCache ? Promise.resolve(cached!) : authService.perfil();
    perfil
      .then((u) => {
        if (vigente()) {
          setUsuario(u);
          setSesionOffline(desdeCache);
        }
      })
      .catch((error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (vigente() && cached && (status === 0 || (status != null && status >= 500))) {
          setUsuario(cached);
          setSesionOffline(true);
          return;
        }
        if (vigente())
          setErrorSesion(
            error instanceof Error ? error : new Error('No pudimos recuperar la sesion.'),
          );
      })
      .finally(() => vigente() && setCargando(false));
    return () => {
      activo = false;
    };
  }, [intento]);

  useEffect(() => {
    const conectar = () => {
      if (sesionOffline && obtenerToken()) setIntento((n) => n + 1);
    };
    window.addEventListener('online', conectar);
    return () => window.removeEventListener('online', conectar);
  }, [sesionOffline]);

  const reintentarSesion = useCallback(() => {
    setErrorSesion(null);
    setCargando(Boolean(obtenerToken()));
    setIntento((actual) => actual + 1);
  }, []);

  const iniciarSesion = useCallback(async (credenciales: CredencialesLogin) => {
    const u = await authService.login(credenciales);
    setUsuario(u);
    setSesionOffline(false);
    setErrorSesion(null);
    setCargando(false);
    return u;
  }, []);

  const registrarse = useCallback(async (datos: DatosRegistro) => {
    const u = await authService.registrar(datos);
    setUsuario(u);
    setSesionOffline(false);
    setErrorSesion(null);
    setCargando(false);
    return u;
  }, []);

  const cerrarSesion = useCallback(async () => {
    borrarIdentidadOffline();
    setSesionOffline(false);
    // Antes de perder la sesion: este navegador deja de recibir avisos de la cuenta.
    await desactivarPush().catch(() => undefined);
    await authService.logout();
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  const valor = useMemo<ContextoAuth>(() => {
    const roles = usuario?.roles.map((r) => String(r.nombre)) ?? [];
    return {
      usuario,
      sesionOffline,
      cargando,
      errorSesion,
      reintentarSesion,
      autenticado: Boolean(usuario),
      roles,
      esCliente: roles.includes(RolNombre.CLIENTE),
      idCliente: usuario?.id_cliente ?? null,
      idSucursal: usuario?.id_sucursal ?? null,
      tieneRol: (...requeridos: string[]) => requeridos.some((r) => roles.includes(r)),
      iniciarSesion,
      registrarse,
      cerrarSesion,
      actualizarUsuario: setUsuario,
    };
  }, [
    usuario,
    sesionOffline,
    cargando,
    errorSesion,
    reintentarSesion,
    iniciarSesion,
    registrarse,
    cerrarSesion,
  ]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth debe usarse dentro de ProveedorAuth');
  return ctx;
}
