import { ErrorApi } from '../../types/api';
import { roles, secuencias, siguienteId, usuarios } from '../db';
import { aUsuario, invalido, noEncontrado, paginar, texto, type RutaMock } from '../core';
import { rutasCrud } from './crud';

function buscarUsuario(id: number) {
  return usuarios.find((u) => u.id_usuario === id);
}

export const rutasAdmin: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/usuarios$/,
    handler: ({ params }) => {
      const q = texto(params.q);
      const idRol = params.id_rol ? Number(params.id_rol) : undefined;
      let lista = usuarios.slice();
      if (q) {
        lista = lista.filter(
          (u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        );
      }
      if (idRol) lista = lista.filter((u) => u.id_roles.includes(idRol));
      return paginar(lista.map(aUsuario), { page_size: 20, ...params });
    },
  },
  {
    metodo: 'GET',
    patron: /^\/usuarios\/(\d+)$/,
    handler: ({ partes }) => {
      const u = buscarUsuario(Number(partes[0]));
      return u ? aUsuario(u) : noEncontrado('usuario');
    },
  },
  {
    metodo: 'POST',
    patron: /^\/usuarios$/,
    handler: ({ body }) => {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!email || !body?.nombre) invalido('Nombre y correo son obligatorios.');
      if (usuarios.some((u) => u.email.toLowerCase() === email)) {
        throw new ErrorApi('Ya existe un usuario con ese correo.', 409);
      }
      const idRoles: number[] = body?.id_roles ?? [];
      const esCliente = idRoles.includes(4);
      const nuevo = {
        id_usuario: siguienteId('usuario'),
        nombre: String(body.nombre),
        email,
        password: String(body?.password ?? 'temporal123'),
        activo: body?.activo ?? true,
        fecha_registro: new Date().toISOString(),
        id_roles: idRoles.length ? idRoles : [4],
        ...(esCliente
          ? {
              id_cliente: (secuencias.cliente += 1),
              telefono: String(body?.telefono ?? ''),
              direccion: String(body?.direccion ?? ''),
            }
          : {
              id_empleado: (secuencias.empleado += 1),
              cargo: String(body?.cargo ?? ''),
              id_sucursal: body?.id_sucursal ?? null,
            }),
      };
      usuarios.push(nuevo);
      return aUsuario(nuevo);
    },
  },
  {
    metodo: 'PUT',
    patron: /^\/usuarios\/(\d+)$/,
    handler: ({ partes, body }) => {
      const u = buscarUsuario(Number(partes[0]));
      if (!u) noEncontrado('usuario');
      const { password, ...resto } = body ?? {};
      Object.assign(u, resto, { id_usuario: u.id_usuario });
      if (password) u.password = String(password);
      return aUsuario(u);
    },
  },
  {
    metodo: 'DELETE',
    patron: /^\/usuarios\/(\d+)$/,
    handler: ({ partes }) => {
      const u = buscarUsuario(Number(partes[0]));
      if (!u) noEncontrado('usuario');
      u.activo = false; // baja logica: conserva historial de ventas y reservas
      return { ok: true };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/empleados$/,
    handler: ({ params }) => {
      const idSucursal = params.id_sucursal ? Number(params.id_sucursal) : undefined;
      let lista = usuarios.filter((u) => u.id_empleado);
      if (idSucursal) lista = lista.filter((u) => u.id_sucursal === idSucursal);
      return lista.map(aUsuario);
    },
  },

  ...rutasCrud({
    ruta: 'roles',
    coleccion: roles,
    campoId: 'id_rol',
    secuencia: 'rol',
    camposBusqueda: ['nombre', 'descripcion'],
  }),
];
