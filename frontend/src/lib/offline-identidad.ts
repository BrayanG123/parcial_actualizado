import { BASE_URL } from '../api/config';
import { obtenerToken } from '../api/sesion';
import type { Usuario } from '../types/domain';
const key = `fs.offline.identidad:${BASE_URL}`;
export function guardarIdentidadOffline(usuario: Usuario, expiresAt: string) {
  const token = obtenerToken();
  if (!token) throw new Error('Inicia sesion para preparar la caja offline.');
  localStorage.setItem(key, JSON.stringify({ token, usuario, expiresAt }));
}
export function identidadOffline(): Usuario | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved &&
      saved.token === obtenerToken() &&
      new Date(saved.expiresAt).getTime() > Date.now()
      ? saved.usuario
      : null;
  } catch {
    return null;
  }
}
export function borrarIdentidadOffline() {
  try {
    localStorage.removeItem(key);
  } catch {
    /* The token is still removed on logout. */
  }
}
