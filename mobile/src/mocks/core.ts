/** Infraestructura del mock: tipos de ruta, sesion simulada y expansion de relaciones. */
import { obtenerToken } from '../api/almacenamiento';
import { ErrorApi } from '../types/api';
import type {
  Carrito,
  Cliente,
  Empleado,
  Inventario,
  MovimientoInventario,
  Producto,
  Reserva,
  Usuario,
  Venta,
} from '../types/domain';
import {
  carritos,
  categorias,
  colecciones,
  colores,
  inventario,
  productos,
  proveedores,
  roles,
  sucursales,
  tallas,
  temporadas,
  usuarios,
  type UsuarioMock,
} from './db';

export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CtxMock {
  /** Segmentos capturados por el patron de la ruta. */
  partes: string[];
  params: Record<string, unknown>;
  body: any;
  /** Usuario autenticado segun el token simulado (null si es anonimo). */
  usuario: UsuarioMock | null;
}

export interface RutaMock {
  metodo: MetodoHttp;
  patron: RegExp;
  handler: (ctx: CtxMock) => unknown;
}

export const TOKEN_PREFIJO = 'mock-token-';

export function usuarioDesdeToken(): UsuarioMock | null {
  const token = obtenerToken();
  if (!token || !token.startsWith(TOKEN_PREFIJO)) return null;
  const id = Number(token.slice(TOKEN_PREFIJO.length));
  return usuarios.find((u) => u.id_usuario === id) ?? null;
}

export function requiereSesion(ctx: CtxMock): UsuarioMock {
  if (!ctx.usuario) throw new ErrorApi('Tu sesion expiro. Vuelve a iniciar sesion.', 401);
  return ctx.usuario;
}

export function noEncontrado(recurso = 'recurso'): never {
  throw new ErrorApi(`No encontramos el ${recurso} solicitado.`, 404);
}

export function invalido(mensaje: string): never {
  throw new ErrorApi(mensaje, 400);
}

/* ---------------- Utilidades de consulta ---------------- */

export function num(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const n = Number(valor);
  return Number.isNaN(n) ? undefined : n;
}

export function texto(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || valor.trim() === '') return undefined;
  return valor.trim().toLowerCase();
}

export function paginar<T>(items: T[], params: Record<string, unknown>) {
  const page = num(params.page) ?? 1;
  const page_size = num(params.page_size) ?? 12;
  const inicio = (page - 1) * page_size;
  return {
    items: items.slice(inicio, inicio + page_size),
    total: items.length,
    page,
    page_size,
  };
}

/* ---------------- Expansion de relaciones ---------------- */

export function expandirProducto(p: Producto): Producto {
  return {
    ...p,
    categoria: categorias.find((c) => c.id_categoria === p.id_categoria),
    temporada: temporadas.find((t) => t.id_temporada === p.id_temporada) ?? null,
    coleccion: colecciones.find((c) => c.id_coleccion === p.id_coleccion) ?? null,
    proveedor: proveedores.find((pr) => pr.id_proveedor === p.id_proveedor) ?? null,
  };
}

export function expandirInventario(inv: Inventario): Inventario {
  return {
    ...inv,
    sucursal: sucursales.find((s) => s.id_sucursal === inv.id_sucursal),
    producto: productos.find((p) => p.id_producto === inv.id_producto),
    talla: tallas.find((t) => t.id_talla === inv.id_talla),
    color: colores.find((c) => c.id_color === inv.id_color),
  };
}

export function expandirMovimiento(m: MovimientoInventario): MovimientoInventario {
  const inv = inventario.find((i) => i.id_inventario === m.id_inventario);
  const emp = usuarios.find((u) => u.id_empleado === m.id_empleado);
  return {
    ...m,
    inventario: inv ? expandirInventario(inv) : undefined,
    empleado: emp?.id_empleado ? { id_empleado: emp.id_empleado, nombre: emp.nombre } : null,
  };
}

function lineaExpandida<T extends { id_producto: number; id_talla: number; id_color: number }>(l: T): T {
  return {
    ...l,
    producto: productos.find((p) => p.id_producto === l.id_producto),
    talla: tallas.find((t) => t.id_talla === l.id_talla),
    color: colores.find((c) => c.id_color === l.id_color),
  };
}

export function expandirReserva(r: Reserva): Reserva {
  const cli = usuarios.find((u) => u.id_cliente === r.id_cliente);
  return {
    ...r,
    detalles: r.detalles.map(lineaExpandida),
    sucursal: sucursales.find((s) => s.id_sucursal === r.id_sucursal),
    cliente: cli
      ? { id_cliente: cli.id_cliente!, nombre: cli.nombre, telefono: cli.telefono ?? '', email: cli.email }
      : undefined,
  };
}

export function expandirVenta(v: Venta): Venta {
  const cli = usuarios.find((u) => u.id_cliente === v.id_cliente);
  return {
    ...v,
    detalles: v.detalles.map(lineaExpandida),
    sucursal: sucursales.find((s) => s.id_sucursal === v.id_sucursal) ?? null,
    cliente: cli ? { id_cliente: cli.id_cliente!, nombre: cli.nombre, email: cli.email } : null,
  };
}

export function expandirCarrito(c: Carrito): Carrito {
  return { ...c, detalles: c.detalles.map(lineaExpandida) };
}

export function carritoDe(id_cliente: number): Carrito {
  let carrito = carritos.find((c) => c.id_cliente === id_cliente && c.estado === 'ACTIVO');
  if (!carrito) {
    carrito = {
      id_carrito: carritos.length + 1,
      id_cliente,
      fecha_creacion: new Date().toISOString(),
      estado: 'ACTIVO',
      detalles: [],
    };
    carritos.push(carrito);
  }
  return carrito;
}

/* ---------------- Perfil publico del usuario ---------------- */

export function aUsuario(u: UsuarioMock): Usuario | Cliente | Empleado {
  const base: Usuario = {
    id_usuario: u.id_usuario,
    nombre: u.nombre,
    email: u.email,
    activo: u.activo,
    fecha_registro: u.fecha_registro,
    roles: u.id_roles.map((id) => rolPorId(id)),
    id_proveedor: u.id_proveedor ?? null,
  };
  if (u.id_cliente) {
    return { ...base, id_cliente: u.id_cliente, telefono: u.telefono ?? '', direccion: u.direccion ?? '' };
  }
  if (u.id_empleado) {
    return {
      ...base,
      id_empleado: u.id_empleado,
      cargo: u.cargo ?? '',
      id_sucursal: u.id_sucursal ?? null,
      sucursal: sucursales.find((s) => s.id_sucursal === u.id_sucursal) ?? null,
    };
  }
  return base;
}

function rolPorId(id: number) {
  return roles.find((r) => r.id_rol === id)!;
}
