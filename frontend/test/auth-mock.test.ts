import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/api/config', () => ({
  USAR_MOCKS: true,
  BASE_URL: 'http://localhost:3000/api/v1',
  CLAVE_TOKEN: 'fashionstore.token:mock',
}));
import { authService } from '../src/services/auth.service';
import { obtenerToken } from '../src/api/sesion';
import { instancia } from '../src/api/http';

describe('demo explicita', () => {
  it('registra, recupera el perfil y cierra sesion con el mismo contrato sin enviar HTTP', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    const user = await authService.registrar({
      nombre: 'Prueba Demo',
      email: 'prueba-contrato@example.com',
      password: 'Abcdefg1',
    });
    expect(user.roles[0].nombre).toBe('CLIENTE');
    expect(obtenerToken()).toMatch(/^mock-token-/);
    expect((await authService.perfil()).id_usuario).toBe(user.id_usuario);
    await authService.logout();
    expect(obtenerToken()).toBeNull();
    expect(adapter).not.toHaveBeenCalled();
  });
});
