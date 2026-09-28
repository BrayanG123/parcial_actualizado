/**
 * Datos propios de la cuenta.
 *   PATCH /auth/me -> { name?, phone?, address? }
 * Correo, contrasena, roles y clasificacion mayorista los cambia el administrador.
 */
import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { adaptarUsuario, type UsuarioBackend } from '../api/auth.contratos';
import { ErrorApi } from '../types/api';
import type { Usuario } from '../types/domain';

export interface DatosPerfil {
  nombre: string;
  telefono?: string;
  direccion?: string;
}

export function validarPerfil(d: DatosPerfil, esCliente: boolean) {
  if (d.nombre.trim().length < 2) throw new ErrorApi('El nombre debe tener al menos 2 caracteres.', 400);
  if (esCliente && d.telefono?.trim() && !/^[+\d][\d ()-]{5,29}$/.test(d.telefono.trim()))
    throw new ErrorApi('El telefono no tiene un formato valido.', 400);
  if ((d.direccion?.trim().length ?? 0) > 250) throw new ErrorApi('La direccion admite hasta 250 caracteres.', 400);
}

export const perfilService = {
  async actualizar(d: DatosPerfil, esCliente: boolean): Promise<Usuario> {
    if (USAR_MOCKS) throw new ErrorApi('Editar el perfil requiere la API real.', 400);
    validarPerfil(d, esCliente);
    return adaptarUsuario(
      await api.patch<UsuarioBackend>(endpoints.auth.perfil, {
        name: d.nombre.trim(),
        ...(esCliente ? { phone: d.telefono?.trim() ?? '', address: d.direccion?.trim() ?? '' } : {}),
      }),
    );
  },
};
