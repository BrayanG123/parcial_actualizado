/**
 * Autenticacion contra NestJS.
 *   POST /auth/login     -> { accessToken, tokenType, user }
 *   POST /auth/register  -> { accessToken, tokenType, user }
 *   GET  /auth/me        -> user
 * El JWT no tiene cierre en el servidor: cerrar sesion descarta el token local.
 */
import { api, USAR_MOCKS } from '../api/http';
import { guardarToken } from '../api/almacenamiento';
import { endpoints } from '../api/endpoints';
import { adaptarUsuario, type SesionBackend, type UsuarioBackend } from '../api/auth.contratos';
import { rutasMock } from '../mocks/endpoints';
import { ErrorApi } from '../types/api';
import type { Usuario } from '../types/domain';

export interface CredencialesLogin {
  email: string;
  password: string;
}

export interface DatosRegistro {
  nombre: string;
  email: string;
  password: string;
  telefono?: string;
  direccion?: string;
}

export interface DatosPerfil {
  nombre: string;
  telefono: string;
  direccion: string;
}

interface SesionMock {
  access_token: string;
  usuario: Usuario;
}

async function crearSesion(url: string, datos: object): Promise<Usuario> {
  if (USAR_MOCKS) {
    const sesion = await api.post<SesionMock>(url, datos);
    guardarToken(sesion.access_token);
    return sesion.usuario;
  }
  const sesion = await api.post<SesionBackend>(url, datos);
  if (!sesion.accessToken || sesion.tokenType !== 'Bearer' || !sesion.user?.active) {
    throw new ErrorApi('El servidor no devolvio una sesion valida.', 502);
  }
  guardarToken(sesion.accessToken);
  return adaptarUsuario(sesion.user);
}

export const authService = {
  login({ email, password }: CredencialesLogin): Promise<Usuario> {
    const correo = email.trim().toLowerCase();
    return USAR_MOCKS
      ? crearSesion(rutasMock.auth.login, { email: correo, password })
      : crearSesion(endpoints.auth.login, { email: correo, password });
  },

  registrar(datos: DatosRegistro): Promise<Usuario> {
    if (USAR_MOCKS) return crearSesion(rutasMock.auth.registro, datos);
    return crearSesion(endpoints.auth.registro, {
      name: datos.nombre.trim(),
      email: datos.email.trim().toLowerCase(),
      password: datos.password,
      ...(datos.telefono?.trim() ? { phone: datos.telefono.trim() } : {}),
      ...(datos.direccion?.trim() ? { address: datos.direccion.trim() } : {}),
    });
  },

  async perfil(): Promise<Usuario> {
    if (USAR_MOCKS) return api.get<Usuario>(rutasMock.auth.perfil);
    return adaptarUsuario(await api.get<UsuarioBackend>(endpoints.auth.perfil));
  },

  /** PATCH /auth/me: nombre, y telefono/direccion si la cuenta es de cliente. */
  async actualizarPerfil(datos: DatosPerfil, esCliente: boolean): Promise<Usuario> {
    if (USAR_MOCKS) throw new ErrorApi('Editar el perfil requiere conectar la app al backend.', 400);
    return adaptarUsuario(
      await api.patch<UsuarioBackend>(endpoints.auth.perfil, {
        name: datos.nombre.trim(),
        ...(esCliente ? { phone: datos.telefono.trim(), address: datos.direccion.trim() } : {}),
      }),
    );
  },

  async logout(): Promise<void> {
    guardarToken(null);
  },
};
