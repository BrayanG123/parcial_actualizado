import { Alert } from 'react-native';
import { pushService } from '../services/push.service';
/**
 * Sesion del cliente: token, usuario actual y acciones de acceso.
 * Es el unico estado verdaderamente global de la aplicacion; el resto de los
 * datos remotos vive en la cache de TanStack Query.
 *
 * La proteccion de pantallas es experiencia de usuario, no seguridad:
 * el backend es la autoridad final de autorizacion.
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
import { useQueryClient } from '@tanstack/react-query';
import { borrarClave, guardarJSON, guardarToken, hidratarToken, leerJSON } from '../api/almacenamiento';
import { hidratarEmpresa } from '../api/empresa';
import {
  authService,
  type CredencialesLogin,
  type DatosPerfil,
  type DatosRegistro,
} from '../services/auth.service';
import type { Cliente, Usuario } from '../types/domain';

/** Copia del usuario para abrir la app sin red (operaciones offline pendientes). */
const CLAVE_USUARIO = 'fashionstore.usuario';

interface ValorSesion {
  usuario: Usuario | null;
  /** Sesion restaurada sin conexion: solo funcionan las pantallas offline. */
  sesionOffline: boolean;
  /** True mientras se restaura la sesion guardada al abrir la app. */
  restaurando: boolean;
  autenticado: boolean;
  cliente: Cliente | null;
  iniciarSesion: (credenciales: CredencialesLogin) => Promise<Usuario>;
  registrar: (datos: DatosRegistro) => Promise<Usuario>;
  cerrarSesion: () => Promise<void>;
  actualizarPerfil: (datos: DatosPerfil) => Promise<Usuario>;
}

const Contexto = createContext<ValorSesion | null>(null);

function comoCliente(usuario: Usuario | null): Cliente | null {
  return usuario && 'id_cliente' in usuario ? (usuario as Cliente) : null;
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [sesionOffline, setSesionOffline] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let vigente = true;
    (async () => {
      await hidratarEmpresa();
      const token = await hidratarToken();
      if (token) {
        try {
          const perfil = await authService.perfil();
          if (vigente) setUsuario(perfil);
          void guardarJSON(CLAVE_USUARIO, perfil);
        } catch (error) {
          const guardado = await leerJSON<Usuario>(CLAVE_USUARIO);
          if ((error as { status?: number }).status === 0 && guardado) {
            // Sin red: se conserva la sesion para consultar y registrar operaciones offline.
            if (vigente) {
              setUsuario(guardado);
              setSesionOffline(true);
            }
          } else {
            // Token invalido o vencido: se descarta y se sigue como anonimo.
            guardarToken(null);
          }
        }
      }
      if (vigente) setRestaurando(false);
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const iniciarSesion = useCallback(
    async (credenciales: CredencialesLogin) => {
      const perfil = await authService.login(credenciales);
      setUsuario(perfil);
      setSesionOffline(false);
      void guardarJSON(CLAVE_USUARIO, perfil);
      await queryClient.invalidateQueries();
      return perfil;
    },
    [queryClient],
  );

  const registrar = useCallback(
    async (datos: DatosRegistro) => {
      const perfil = await authService.registrar(datos);
      setUsuario(perfil);
      setSesionOffline(false);
      void guardarJSON(CLAVE_USUARIO, perfil);
      await queryClient.invalidateQueries();
      return perfil;
    },
    [queryClient],
  );

  const cerrarSesion = useCallback(async () => {
    let bajaPendiente = false;
    try { await pushService.retirar(); } catch { bajaPendiente = true; }
    await authService.logout();
    await borrarClave(CLAVE_USUARIO);
    setSesionOffline(false);
    if (bajaPendiente) Alert.alert('Sesion cerrada', 'No pudimos desactivar los avisos de este dispositivo. Puedes desactivarlos en los ajustes de Android hasta volver a iniciar sesion con conexion.');
    setUsuario(null);
    // Los datos en cache son del cliente anterior: se descartan por completo.
    queryClient.clear();
  }, [queryClient]);

  const actualizarPerfil = useCallback(
    async (datos: DatosPerfil) => {
      const perfil = await authService.actualizarPerfil(datos, comoCliente(usuario) !== null);
      setUsuario(perfil);
      return perfil;
    },
    [usuario],
  );

  const valor = useMemo<ValorSesion>(
    () => ({
      usuario,
      sesionOffline,
      restaurando,
      autenticado: usuario !== null,
      cliente: comoCliente(usuario),
      iniciarSesion,
      registrar,
      cerrarSesion,
      actualizarPerfil,
    }),
    [usuario, sesionOffline, restaurando, iniciarSesion, registrar, cerrarSesion, actualizarPerfil],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de ProveedorSesion.');
  return valor;
}
