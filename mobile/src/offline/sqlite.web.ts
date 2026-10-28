/**
 * Vista previa web (`npm run web`): el modo offline con SQLite es de la app
 * Android/iOS. Este archivo evita empaquetar expo-sqlite (requiere WASM en web).
 */
import type { BaseDatos } from './tipos';

export const offlineDisponible = false;

export function abrirBase(): Promise<BaseDatos> {
  return Promise.reject(new Error('La operacion offline esta disponible en la app Android/iOS.'));
}
