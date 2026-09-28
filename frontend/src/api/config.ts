/** El backend real es el modo predeterminado; la demo requiere optar por mocks. */
export const USAR_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
export const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);
// No compartir credenciales entre la demo y APIs de distintos entornos.
export const CLAVE_TOKEN = `fashionstore.token:${USAR_MOCKS ? 'mock' : BASE_URL}`;
