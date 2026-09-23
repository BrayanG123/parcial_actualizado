/**
 * Notificaciones push de compras con Firebase Cloud Messaging.
 *
 * El navegador pide permiso, FCM entrega un token para este dispositivo y el
 * token se guarda en NestJS. Cuando un cliente compra, el backend envia el aviso
 * y el service worker lo muestra aunque la pestana este cerrada.
 *
 * La configuracion web de Firebase es publica (identifica el proyecto, no da
 * permisos); la clave privada para enviar vive solo en el backend.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { pushService } from '../services/push.service';

const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
/** Clave publica "Web Push certificates" de Firebase Cloud Messaging. */
const VAPID = env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const CLAVE_TOKEN = 'fashionstore.push-token';

export const PUSH_CONFIGURADO = Boolean(
  CONFIG.apiKey && CONFIG.projectId && CONFIG.messagingSenderId && CONFIG.appId && VAPID,
);

export type EstadoPush = 'no-disponible' | 'pendiente' | 'activo' | 'bloqueado';

let app: FirebaseApp | null = null;
function firebase(): FirebaseApp {
  app ??= getApps()[0] ?? initializeApp(CONFIG);
  return app;
}

function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

function guardarTokenLocal(token: string | null) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* sin almacenamiento: se vuelve a registrar en la proxima visita */
  }
}

export async function pushDisponible(): Promise<boolean> {
  if (!PUSH_CONFIGURADO || typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  return isSupported().catch(() => false);
}

/**
 * Service worker que recibe los push: en produccion el de la PWA (/sw.js, que
 * importa /push-sw.js); en desarrollo no hay PWA y se registra /push-sw.js.
 */
async function registroServiceWorker(): Promise<ServiceWorkerRegistration> {
  const archivo = import.meta.env.PROD ? '/sw.js' : '/push-sw.js';
  const existente = await navigator.serviceWorker.getRegistration('/');
  const activo = existente?.active?.scriptURL ?? existente?.installing?.scriptURL ?? '';
  const registro = activo.endsWith(archivo) ? existente! : await navigator.serviceWorker.register(archivo);
  if (registro.active) return registro;
  // getToken necesita un service worker activo.
  await new Promise<void>((listo) => {
    const sw = registro.installing ?? registro.waiting;
    if (!sw) return listo();
    sw.addEventListener('statechange', () => sw.state === 'activated' && listo());
  });
  return registro;
}

async function obtenerYRegistrar(): Promise<string> {
  const token = await getToken(getMessaging(firebase()), {
    vapidKey: VAPID,
    serviceWorkerRegistration: await registroServiceWorker(),
  });
  if (!token) throw new Error('Firebase no entrego un token para este navegador.');
  // FCM puede rotar el token: se registra siempre, el backend lo actualiza.
  await pushService.registrar(token);
  guardarTokenLocal(token);
  return token;
}

export function estadoActual(): EstadoPush {
  if (!PUSH_CONFIGURADO || typeof Notification === 'undefined') return 'no-disponible';
  if (Notification.permission === 'denied') return 'bloqueado';
  return Notification.permission === 'granted' && leerToken() ? 'activo' : 'pendiente';
}

/** Pide permiso (requiere un clic del usuario) y registra este dispositivo. */
export async function activarPush(): Promise<EstadoPush> {
  if (!(await pushDisponible())) return 'no-disponible';
  const permiso = await Notification.requestPermission();
  if (permiso === 'denied') return 'bloqueado';
  if (permiso !== 'granted') return 'pendiente';
  await obtenerYRegistrar();
  return 'activo';
}

/** Con el permiso ya dado, renueva el registro en silencio al entrar al panel. */
export async function sincronizarPush(): Promise<EstadoPush> {
  if (!(await pushDisponible()) || Notification.permission !== 'granted') return estadoActual();
  await obtenerYRegistrar();
  return 'activo';
}

/** Al cerrar sesion: este navegador deja de recibir avisos de esa cuenta. */
export async function desactivarPush(): Promise<void> {
  const token = leerToken();
  if (!token) return;
  guardarTokenLocal(null);
  await pushService.quitar(token).catch(() => undefined);
  if (await pushDisponible()) await deleteToken(getMessaging(firebase())).catch(() => undefined);
}
