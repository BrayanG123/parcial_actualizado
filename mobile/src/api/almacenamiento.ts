/**
 * Persistencia local (AsyncStorage) con una copia en memoria.
 *
 * AsyncStorage es asincrono, pero el interceptor de axios y el mock necesitan
 * el token de forma sincrona en cada peticion: por eso se mantiene una copia
 * en memoria que se hidrata una sola vez al arrancar la aplicacion.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE_TOKEN = 'fashionstore.token';

let tokenEnMemoria: string | null = null;

export async function hidratarToken(): Promise<string | null> {
  try {
    tokenEnMemoria = await AsyncStorage.getItem(CLAVE_TOKEN);
  } catch {
    tokenEnMemoria = null;
  }
  return tokenEnMemoria;
}

export function obtenerToken(): string | null {
  return tokenEnMemoria;
}

export function guardarToken(token: string | null): void {
  tokenEnMemoria = token;
  // No se espera la escritura: la copia en memoria ya es la fuente de verdad.
  if (token) void AsyncStorage.setItem(CLAVE_TOKEN, token).catch(() => undefined);
  else void AsyncStorage.removeItem(CLAVE_TOKEN).catch(() => undefined);
}

export async function leerJSON<T>(clave: string): Promise<T | null> {
  try {
    const crudo = await AsyncStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

export async function guardarJSON(clave: string, valor: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // El almacenamiento puede no estar disponible; la app sigue en memoria.
  }
}

export async function borrarClave(clave: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(clave);
  } catch {
    // sin efecto
  }
}
