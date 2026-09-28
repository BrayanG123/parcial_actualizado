import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Notification, NotificationResponse } from 'expo-notifications';
import { obtenerToken } from '../api/almacenamiento';
import { destinoPush, type DestinoPush } from '../lib/push-datos';
import { notificacionesAndroid, PUSH_ANDROID, pushService, registroPush } from '../services/push.service';
import { useSesion } from './SesionContext';

type Estado = 'inactivo' | 'activando' | 'activo' | 'bloqueado' | 'error';
interface ValorPush {
  disponible: boolean;
  estado: Estado;
  mensaje: string;
  activar: () => Promise<void>;
  pendiente: DestinoPush | null;
  consumir: () => void;
}
const Contexto = createContext<ValorPush | null>(null);

export function ProveedorPush({ children }: { children: ReactNode }) {
  const { usuario, cliente, restaurando } = useSesion();
  const userId = cliente ? usuario?.id_usuario : undefined;
  const actual = useRef(userId);
  useLayoutEffect(() => { actual.current = userId; }, [userId]);
  const query = useQueryClient();
  const [estado, setEstado] = useState<Estado>('inactivo');
  const [mensaje, setMensaje] = useState('Recibe avisos sobre tus reservas y compras.');
  const [pendiente, setPendiente] = useState<DestinoPush | null>(null);
  const enCurso = useRef(false);

  const activar = useCallback(async (solicitar = true) => {
    const jwt = obtenerToken();
    if (!PUSH_ANDROID || !userId || !jwt || enCurso.current) return;
    enCurso.current = true;
    const vigente = () => actual.current === userId && obtenerToken() === jwt;
    try {
      const n = (await notificacionesAndroid())!;
      if (!vigente()) return;
      setEstado('activando');
      await n.setNotificationChannelAsync('customer-updates', {
        name: 'Reservas y compras', importance: n.AndroidImportance.HIGH, sound: 'default',
      });
      let permiso = await n.getPermissionsAsync();
      if (!permiso.granted && solicitar && permiso.canAskAgain) permiso = await n.requestPermissionsAsync();
      if (!vigente()) return;
      if (!permiso.granted) {
        setEstado(permiso.canAskAgain ? 'inactivo' : 'bloqueado');
        setMensaje(permiso.canAskAgain ? 'Activa los avisos de tus reservas y compras.' : 'Permite las notificaciones de FashionStore en los ajustes de Android.');
        return;
      }
      if (!(await pushService.estado()).enabled) throw new Error('Los avisos no estan disponibles por el momento. Intenta mas tarde.');
      const token = await n.getDevicePushTokenAsync();
      if (!vigente()) return;
      if (token.type !== 'android' || typeof token.data !== 'string') throw new Error('No pudimos activar los avisos en este dispositivo.');
      const registrado = await registroPush.registrar(token.data, jwt);
      if (vigente() && registrado) {
        setEstado('activo');
        setMensaje('Recibiras avisos de tus reservas y compras.');
      }
    } catch (error) {
      if (vigente()) {
        setEstado('error');
        setMensaje(error instanceof Error && error.message.startsWith('Los avisos')
          ? error.message : 'No pudimos activar los avisos. Revisa tu conexion e intenta de nuevo.');
      }
    } finally { enCurso.current = false; }
  }, [userId]);

  useEffect(() => {
    if (!PUSH_ANDROID || restaurando) return;
    const jwt = obtenerToken();
    registroPush.iniciar(userId && jwt ? { userId, jwt } : null);
    // Sincroniza permiso/token nativo; el estado cambia despues de esperar la API nativa.
    // oxlint-disable-next-line react/set-state-in-effect
    if (userId) void activar(false);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void activar(false);
    });
    return () => sub.remove();
  }, [userId, restaurando, activar]);

  useEffect(() => {
    if (!PUSH_ANDROID) return;
    let cancelado = false;
    const limpiar: Array<() => void> = [];
    const respuestas = new Set<string>();
    function invalidar(notification: Notification) {
      const destino = destinoPush(notification.request.content.data);
      if (!destino || destino.userId !== actual.current) return;
      const claves = destino.pantalla === 'DetalleCompra' ? ['venta', 'ventas'] : ['reserva', 'reservas'];
      for (const clave of claves) void query.invalidateQueries({ queryKey: [clave] });
    }
    function responder(response: NotificationResponse) {
      const destino = destinoPush(response.notification.request.content.data);
      if (destino && !respuestas.has(response.notification.request.identifier)) {
        respuestas.add(response.notification.request.identifier);
        if (respuestas.size > 100) respuestas.delete(respuestas.values().next().value!);
        invalidar(response.notification); setPendiente(destino);
      }
    }
    void notificacionesAndroid().then(async (n) => {
      if (!n || cancelado) return;
      n.setNotificationHandler({
        handleNotification: async (notification) => {
          const destino = destinoPush(notification.request.content.data);
          const propia = !!destino && destino.userId === actual.current;
          return { shouldShowBanner: propia, shouldShowList: propia, shouldPlaySound: propia, shouldSetBadge: false };
        },
      });
      const recibida = n.addNotificationReceivedListener(invalidar);
      const respuesta = n.addNotificationResponseReceivedListener(responder);
      const token = n.addPushTokenListener((t) => {
        const jwt = obtenerToken();
        if (actual.current && jwt && t.type === 'android' && typeof t.data === 'string') {
          void registroPush.registrar(t.data, jwt).catch(() => {
            if (!cancelado) { setEstado('error'); setMensaje('No pudimos actualizar los avisos. Intenta activarlos de nuevo.'); }
          });
        }
      });
      limpiar.push(() => recibida.remove(), () => respuesta.remove(), () => token.remove(),
        () => n.setNotificationHandler(null));
      const ultima = await n.getLastNotificationResponseAsync();
      if (!cancelado && ultima) responder(ultima);
    }).catch(() => { if (!cancelado) setEstado('error'); });
    return () => { cancelado = true; limpiar.forEach((fn) => fn()); };
  }, [query]);

  const consumir = useCallback(() => {
    setPendiente(null);
    void notificacionesAndroid().then((n) => n?.clearLastNotificationResponseAsync()).catch(() => undefined);
  }, []);

  return <Contexto.Provider value={{
    disponible: PUSH_ANDROID && !!cliente, estado, mensaje, activar: () => activar(true), pendiente, consumir,
  }}>{children}</Contexto.Provider>;
}
// El contexto exporta su hook de consumo junto al proveedor, como SesionContext.
// oxlint-disable-next-line react/only-export-components
export function usePush() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('usePush requiere ProveedorPush');
  return valor;
}
