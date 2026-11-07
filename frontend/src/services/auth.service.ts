/**
 * Autenticacion contra el contrato NestJS. La UI conserva su modelo en español.
 */
import { api, apiCuenta } from '../api/http';
import { guardarToken, revisionSesion } from '../api/sesion';
import { fijarEmpresa } from '../api/empresa';
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
  return adoptarSesion(() => api.post<SesionBackend>(url, datos));
}

/** Valida y adopta una sesion de empresa (login, registro o dueño que entra a su empresa). */
async function adoptarSesion(obtener: () => Promise<SesionBackend>): Promise<Usuario> {
  const revision = revisionSesion();
  const sesion = await obtener();
  if (revision !== revisionSesion()) {
    throw new ErrorApi('La sesion cambio mientras se procesaba la solicitud. Vuelve a intentarlo.');
  }
  if (!sesion.accessToken || sesion.tokenType !== 'Bearer' || !sesion.user?.active) {
    throw new ErrorApi('El servidor no devolvio una sesion valida.', 502);
  }
  const usuario = adaptarUsuario(sesion.user);
  // La tienda activa pasa a ser la empresa real de la cuenta.
  if (sesion.tenant) fijarEmpresa({ slug: sesion.tenant.slug, nombre: sesion.tenant.name });
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

  /** F14: el dueño entra a una de sus empresas con la sesion de su administrador. */
  entrarAEmpresa(idEmpresa: number): Promise<Usuario> {
    return adoptarSesion(() => apiCuenta.post<SesionBackend>(endpoints.cuenta.entrar(idEmpresa)));
  },

  async perfil(): Promise<Usuario> {
    return adaptarUsuario(await api.get<UsuarioBackend>(endpoints.auth.perfil));
  },

  async logout(): Promise<void> {
    // Cierre local de JWT: el backend no expone un endpoint logout.
    guardarToken(null);
  },
};
