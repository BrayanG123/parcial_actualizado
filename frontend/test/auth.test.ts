import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, instancia } from '../src/api/http';
import { guardarToken, obtenerToken } from '../src/api/sesion';
import { BASE_URL, CLAVE_TOKEN, USAR_MOCKS } from '../src/api/config';
import { authService } from '../src/services/auth.service';
import { rechazo, respuesta, sesionBackend, usuarioBackend } from './fixtures';

beforeEach(() => {
  localStorage.clear();
  guardarToken(null);
});

describe('autenticacion sobre HTTP', () => {
  it('usa NestJS por defecto, envia credenciales sin Bearer y guarda accessToken', async () => {
    expect(USAR_MOCKS).toBe(false);
    expect(BASE_URL).toBe('http://localhost:3000/api/v1');
    guardarToken('cuenta-anterior');
    instancia.defaults.adapter = async (config) => {
      expect(config.url).toBe('/auth/login');
      expect(config.headers.Authorization).toBeUndefined();
      expect(JSON.parse(config.data)).toEqual({
        email: 'cliente@example.com',
        password: ' Abcdefg1 ',
      });
      return respuesta(config, sesionBackend);
    };
    const user = await authService.login({
      email: ' CLIENTE@EXAMPLE.COM ',
      password: ' Abcdefg1 ',
    });
    expect(user).toMatchObject({ id_usuario: 12, id_cliente: 31, roles: [{ nombre: 'CLIENTE' }] });
    expect(localStorage.getItem(CLAVE_TOKEN)).toBe(sesionBackend.accessToken);
  });

  it('registra usando exclusivamente los nombres y campos admitidos por RegisterDto', async () => {
    instancia.defaults.adapter = async (config) => {
      expect(config.url).toBe('/auth/register');
      expect(JSON.parse(config.data)).toEqual({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'Abcdefg1',
        phone: '123',
      });
      return respuesta(config, sesionBackend);
    };
    await authService.registrar({
      nombre: ' Ana ',
      email: 'ANA@example.com',
      password: 'Abcdefg1',
      telefono: ' 123 ',
      direccion: ' ',
    });
  });

  it('recupera el perfil de /auth/me con Bearer', async () => {
    guardarToken('jwt-guardado');
    instancia.defaults.adapter = async (config) => {
      expect(config.url).toBe('/auth/me');
      expect(config.headers.Authorization).toBe('Bearer jwt-guardado');
      return respuesta(config, usuarioBackend);
    };
    expect((await authService.perfil()).id_cliente).toBe(31);
  });

  it('un login rechazado no elimina otra sesion vigente', async () => {
    guardarToken('vigente');
    instancia.defaults.adapter = async (config) => {
      throw rechazo(config, 401, 'Invalid email or password');
    };
    await expect(
      authService.login({ email: 'a@example.com', password: 'incorrecta' }),
    ).rejects.toThrow('Correo o contrasena incorrectos');
    expect(obtenerToken()).toBe('vigente');
  });

  it('limpia una sesion expirada, pero conserva todos los mensajes de validacion', async () => {
    guardarToken('expirado');
    instancia.defaults.adapter = async (config) => {
      throw rechazo(config, 401, 'Unauthorized');
    };
    await expect(authService.perfil()).rejects.toMatchObject({ status: 401 });
    expect(obtenerToken()).toBeNull();
    instancia.defaults.adapter = async (config) => {
      throw rechazo(config, 400, ['name too short', 'password too short']);
    };
    await expect(api.post('/auth/register', {})).rejects.toMatchObject({
      mensajes: ['name too short', 'password too short'],
    });
  });

  it('un 403 no cierra la sesion', async () => {
    guardarToken('vigente');
    instancia.defaults.adapter = async (config) => {
      throw rechazo(config, 403, 'Forbidden');
    };
    await expect(api.get('/reports/sales')).rejects.toMatchObject({ status: 403 });
    expect(obtenerToken()).toBe('vigente');
  });

  it('ignora un 401 tardio de una cuenta anterior', async () => {
    guardarToken('anterior');
    let rechazar!: () => void;
    instancia.defaults.adapter = (config) =>
      new Promise((_resolve, reject) => {
        rechazar = () => reject(rechazo(config, 401, 'Unauthorized'));
      });
    const solicitud = authService.perfil().catch((error) => error);
    await vi.waitFor(() => expect(rechazar).toBeDefined());
    guardarToken('nueva');
    rechazar();
    await solicitud;
    expect(obtenerToken()).toBe('nueva');
  });

  it('cerrar sesion es local y un login tardio no vuelve a abrirla', async () => {
    let completar!: () => void;
    const adapter = vi.fn(
      (config) =>
        new Promise<ReturnType<typeof respuesta>>((resolve) => {
          completar = () => resolve(respuesta(config, sesionBackend));
        }),
    );
    instancia.defaults.adapter = adapter;
    const login = authService
      .login({ email: 'a@example.com', password: 'Abcdefg1' })
      .catch((error) => error);
    await vi.waitFor(() => expect(completar).toBeDefined());
    await authService.logout();
    completar();
    expect(await login).toMatchObject({ message: expect.stringContaining('sesion cambio') });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(obtenerToken()).toBeNull();
  });
});
