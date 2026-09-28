import { ErrorApi } from '../../types/api';
import { secuencias, usuarios } from '../db';
import { TOKEN_PREFIJO, aUsuario, invalido, requiereSesion, type RutaMock } from '../core';

export const rutasAuth: RutaMock[] = [
  {
    metodo: 'POST',
    patron: /^\/auth\/login$/,
    handler: ({ body }) => {
      const email = String(body?.email ?? '').trim().toLowerCase();
      const password = String(body?.password ?? '');
      const usuario = usuarios.find((u) => u.email.toLowerCase() === email);
      if (!usuario || usuario.password !== password) {
        throw new ErrorApi('Correo o contrasena incorrectos.', 401);
      }
      if (!usuario.activo) throw new ErrorApi('Tu cuenta esta desactivada.', 403);
      return { access_token: `${TOKEN_PREFIJO}${usuario.id_usuario}`, usuario: aUsuario(usuario) };
    },
  },
  {
    metodo: 'POST',
    patron: /^\/auth\/registro$/,
    handler: ({ body }) => {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!email || !body?.password || !body?.nombre) {
        invalido('Nombre, correo y contrasena son obligatorios.');
      }
      if (usuarios.some((u) => u.email.toLowerCase() === email)) {
        throw new ErrorApi('Ya existe una cuenta registrada con ese correo.', 409);
      }
      secuencias.usuario += 1;
      secuencias.cliente += 1;
      const nuevo = {
        id_usuario: secuencias.usuario,
        nombre: String(body.nombre),
        email,
        password: String(body.password),
        activo: true,
        fecha_registro: new Date().toISOString(),
        id_roles: [4],
        id_cliente: secuencias.cliente,
        telefono: String(body.telefono ?? ''),
        direccion: String(body.direccion ?? ''),
      };
      usuarios.push(nuevo);
      return { access_token: `${TOKEN_PREFIJO}${nuevo.id_usuario}`, usuario: aUsuario(nuevo) };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/auth\/perfil$/,
    handler: (ctx) => aUsuario(requiereSesion(ctx)),
  },
  {
    metodo: 'POST',
    patron: /^\/auth\/logout$/,
    handler: () => ({ ok: true }),
  },
];
