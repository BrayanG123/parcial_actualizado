/**
 * Dispositivos del personal que reciben avisos push de compras.
 *   GET    /push/status   -> { enabled }
 *   POST   /push/tokens   { token, platform }
 *   DELETE /push/tokens   { token }
 */
import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';

export const pushService = {
  async habilitado(): Promise<boolean> {
    if (USAR_MOCKS) return false;
    return (await api.get<{ enabled: boolean }>(endpoints.push.estado)).enabled;
  },
  async registrar(token: string): Promise<void> {
    if (USAR_MOCKS) return;
    await api.post(endpoints.push.tokens, { token, platform: 'WEB' });
  },
  async quitar(token: string): Promise<void> {
    if (USAR_MOCKS) return;
    await api.delete(endpoints.push.tokens, { token });
  },
};
