/**
 * Autenticacion contra el contrato NestJS. La UI conserva su modelo en español.
 */
import { api } from '../api/http';
import { guardarToken, revisionSesion } from '../api/sesion';
import {
  adaptarUsuario,
  type RegistroBackend,
  type SesionBackend,
  type UsuarioBackend,
} from '../api/auth.contratos';
import { ErrorApi } from '../types/api';
import { endpoints } from '../api/endpoints';
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

async function crearSesion(
  url: string,
  datos: CredencialesLogin | RegistroBackend,
): Promise<Usuario> {
  const revision = revisionSesion();
  const sesion = await api.post<SesionBackend>(url, datos);
  if (revision !== revisionSesion()) {
    throw new ErrorApi('La sesion cambio mientras se procesaba la solicitud. Vuelve a intentarlo.');
  }
  if (!sesion.accessToken || sesion.tokenType !== 'Bearer' || !sesion.user?.active) {
    throw new ErrorApi('El servidor no devolvio una sesion valida.', 502);
  }
  const usuario = adaptarUsuario(sesion.user);
  guardarToken(sesion.accessToken);
  return usuario;
}

export const authService = {
  login({ email, password }: CredencialesLogin): Promise<Usuario> {
    return crearSesion(endpoints.auth.login, { email: email.trim().toLowerCase(), password });
  },

  registrar(datos: DatosRegistro): Promise<Usuario> {
    return crearSesion(endpoints.auth.registro, {
      name: datos.nombre.trim(),
      email: datos.email.trim().toLowerCase(),
      password: datos.password,
      ...(datos.telefono?.trim() ? { phone: datos.telefono.trim() } : {}),
      ...(datos.direccion?.trim() ? { address: datos.direccion.trim() } : {}),
    });
  },

  async perfil(): Promise<Usuario> {
    return adaptarUsuario(await api.get<UsuarioBackend>(endpoints.auth.perfil));
  },

  async logout(): Promise<void> {
    // Cierre local de JWT: el backend no expone un endpoint logout.
    guardarToken(null);
  },
};
