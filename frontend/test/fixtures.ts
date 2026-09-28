import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { UsuarioBackend } from '../src/api/auth.contratos';

export const usuarioBackend: UsuarioBackend = {
  id: 12,
  name: 'Cliente de prueba',
  email: 'cliente@example.com',
  active: true,
  registeredAt: '2026-09-12T12:00:00.000Z',
  roles: [{ role: { id: 4, name: 'CUSTOMER', description: null } }],
  client: { id: 31, phone: null, address: 'La Paz' },
  employee: null,
};

export function respuesta(config: InternalAxiosRequestConfig, data: unknown) {
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: true, data, timestamp: '2026-09-12T12:00:00.000Z' },
  };
}

export function rechazo(
  config: InternalAxiosRequestConfig,
  status: number,
  message: string | string[],
) {
  return new AxiosError('HTTP error', undefined, config, undefined, {
    config,
    status,
    statusText: 'Error',
    headers: {},
    data: { success: false, statusCode: status, message },
  });
}

export const sesionBackend = {
  accessToken: 'jwt-de-prueba',
  tokenType: 'Bearer',
  user: usuarioBackend,
};
