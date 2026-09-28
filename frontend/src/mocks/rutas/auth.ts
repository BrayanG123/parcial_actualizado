import { ErrorApi } from '../../types/api';
import { roles, secuencias, sucursales, usuarios, type UsuarioMock } from '../db';
import { TOKEN_PREFIJO, invalido, requiereSesion, type RutaMock } from '../core';
import { ROLES_BACKEND, type RolBackend, type UsuarioBackend } from '../../api/auth.contratos';
import { passwordRegistro } from '../../lib/validacion';

/** La demo de autenticacion respeta el mismo DTO que la API real. */
function usuarioBackend(u: UsuarioMock): UsuarioBackend {
  const sucursal = sucursales.find((s) => s.id_sucursal === u.id_sucursal);
  return {
    id: u.id_usuario,
    name: u.nombre,
    email: u.email,
    active: u.activo,
    registeredAt: u.fecha_registro,
    roles: u.id_roles.map((id) => {
      const rol = roles.find((r) => r.id_rol === id)!;
      const name = (Object.keys(ROLES_BACKEND) as RolBackend[]).find(
        (key) => ROLES_BACKEND[key] === rol.nombre,
      )!;
      return { role: { id, name, description: rol.descripcion } };
    }),
    client: u.id_cliente
      ? { id: u.id_cliente, phone: u.telefono ?? null, address: u.direccion ?? null }
      : null,
    employee:
      u.id_empleado && sucursal
        ? {
            id: u.id_empleado,
            jobTitle: u.cargo ?? '',
            branchId: sucursal.id_sucursal,
            active: true,
            branch: {
              id: sucursal.id_sucursal,
              name: sucursal.nombre,
              city: sucursal.ciudad,
              address: sucursal.direccion,
              phone: sucursal.telefono,
              active: sucursal.activa,
            },
          }
        : null,
  };
}

function sesion(u: UsuarioMock) {
  return {
    accessToken: `${TOKEN_PREFIJO}${u.id_usuario}`,
    tokenType: 'Bearer',
    user: usuarioBackend(u),
  };
}

export const rutasAuth: RutaMock[] = [
  {
    metodo: 'POST',
    patron: /^\/auth\/login$/,
    handler: ({ body }) => {
      const email = String(body?.email ?? '')
        .trim()
        .toLowerCase();
      const password = String(body?.password ?? '');
      const usuario = usuarios.find((u) => u.email.toLowerCase() === email);
      if (!usuario || usuario.password !== password) {
        throw new ErrorApi('Correo o contrasena incorrectos.', 401);
      }
      if (!usuario.activo) throw new ErrorApi('Tu cuenta esta desactivada.', 403);
      return sesion(usuario);
    },
  },
  {
    metodo: 'POST',
    patron: /^\/auth\/register$/,
    handler: ({ body }) => {
      const email = String(body?.email ?? '')
        .trim()
        .toLowerCase();
      if (!email || !body?.password || !body?.name) {
        invalido('Nombre, correo y contrasena son obligatorios.');
      }
      const errorPassword = passwordRegistro(String(body.password));
      if (errorPassword) invalido(errorPassword);
      if (usuarios.some((u) => u.email.toLowerCase() === email)) {
        throw new ErrorApi('Ya existe una cuenta registrada con ese correo.', 409);
      }
      secuencias.usuario += 1;
      secuencias.cliente += 1;
      const nuevo = {
        id_usuario: secuencias.usuario,
        nombre: String(body.name),
        email,
        password: String(body.password),
        activo: true,
        fecha_registro: new Date().toISOString(),
        id_roles: [4],
        id_cliente: secuencias.cliente,
        telefono: String(body.phone ?? ''),
        direccion: String(body.address ?? ''),
      };
      usuarios.push(nuevo);
      return sesion(nuevo);
    },
  },
  {
    metodo: 'GET',
    patron: /^\/auth\/me$/,
    handler: (ctx) => {
      const usuario = requiereSesion(ctx);
      if (!usuario.activo) throw new ErrorApi('Tu cuenta esta desactivada.', 401);
      return usuarioBackend(usuario);
    },
  },
];
