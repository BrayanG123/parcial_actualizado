/**
 * Datos temporales en memoria mientras el backend NestJS no esta disponible.
 * Deliberadamente pequenos: solo lo necesario para demostrar cada flujo.
 * Se elimina esta carpeta cuando el backend real este listo.
 */
import {
  CanalVenta,
  EstadoCarrito,
  EstadoPago,
  EstadoReserva,
  EstadoVenta,
  MetodoPago,
  RolNombre,
  TipoMovimiento,
  TipoPago,
  type Carrito,
  type Categoria,
  type Coleccion,
  type Color,
  type Inventario,
  type MovimientoInventario,
  type Producto,
  type Proveedor,
  type RecursoRA,
  type Reserva,
  type Rol,
  type Sucursal,
  type Talla,
  type Temporada,
  type Venta,
} from '../types/domain';

export interface UsuarioMock {
  id_usuario: number;
  nombre: string;
  email: string;
  password: string;
  activo: boolean;
  fecha_registro: string;
  id_roles: number[];
  // perfil cliente
  id_cliente?: number;
  telefono?: string;
  direccion?: string;
  // perfil empleado
  id_empleado?: number;
  cargo?: string;
  id_sucursal?: number | null;
  id_proveedor?: number | null;
}

const hoy = new Date();
const iso = (d: Date) => d.toISOString();
const diasAtras = (n: number) => {
  const d = new Date(hoy);
  d.setDate(d.getDate() - n);
  return d;
};
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);

/* ---------------- Organizacion ---------------- */

export const roles: Rol[] = [
  { id_rol: 1, nombre: RolNombre.ADMINISTRADOR, descripcion: 'Acceso total al sistema' },
  { id_rol: 2, nombre: RolNombre.ENCARGADO_SUCURSAL, descripcion: 'Gestiona una sucursal' },
  { id_rol: 3, nombre: RolNombre.CAJERO, descripcion: 'Registra ventas presenciales' },
  { id_rol: 4, nombre: RolNombre.CLIENTE, descripcion: 'Compra y reserva prendas' },
  { id_rol: 5, nombre: RolNombre.PROVEEDOR, descripcion: 'Suministra prendas al catalogo' },
];

export const sucursales: Sucursal[] = [
  { id_sucursal: 1, nombre: 'FashionStore Centro', ciudad: 'Santa Cruz', direccion: 'Av. Monsenor Rivero 120', telefono: '3-3445566', activa: true },
  { id_sucursal: 2, nombre: 'FashionStore Equipetrol', ciudad: 'Santa Cruz', direccion: 'Calle 5 Oeste 88', telefono: '3-3778899', activa: true },
  { id_sucursal: 3, nombre: 'FashionStore Sopocachi', ciudad: 'La Paz', direccion: 'Av. 6 de Agosto 2450', telefono: '2-2119988', activa: true },
];

export const usuarios: UsuarioMock[] = [
  {
    id_usuario: 1, nombre: 'Ana Vargas', email: 'admin@fashionstore.bo', password: 'admin123',
    activo: true, fecha_registro: iso(diasAtras(420)), id_roles: [1],
    id_empleado: 1, cargo: 'Administradora general', id_sucursal: null,
  },
  {
    id_usuario: 2, nombre: 'Marcos Pena', email: 'encargado@fashionstore.bo', password: 'encargado123',
    activo: true, fecha_registro: iso(diasAtras(300)), id_roles: [2],
    id_empleado: 2, cargo: 'Encargado de sucursal', id_sucursal: 1,
  },
  {
    id_usuario: 3, nombre: 'Lucia Rojas', email: 'cajero@fashionstore.bo', password: 'cajero123',
    activo: true, fecha_registro: iso(diasAtras(210)), id_roles: [3],
    id_empleado: 3, cargo: 'Cajera', id_sucursal: 1,
  },
  {
    id_usuario: 4, nombre: 'Camila Ortiz', email: 'cliente@fashionstore.bo', password: 'cliente123',
    activo: true, fecha_registro: iso(diasAtras(90)), id_roles: [4],
    id_cliente: 1, telefono: '70012345', direccion: 'Barrio Urbari, calle 9 #34',
  },
  {
    id_usuario: 5, nombre: 'Textiles Andina SRL', email: 'proveedor@fashionstore.bo', password: 'proveedor123',
    activo: true, fecha_registro: iso(diasAtras(360)), id_roles: [5],
    id_proveedor: 1,
  },
  {
    id_usuario: 6, nombre: 'Daniela Suarez', email: 'daniela@correo.bo', password: 'cliente123',
    activo: true, fecha_registro: iso(diasAtras(40)), id_roles: [4],
    id_cliente: 2, telefono: '71198877', direccion: 'Av. Banzer km 4',
  },
];

/* ---------------- Catalogo ---------------- */

export const categorias: Categoria[] = [
  { id_categoria: 1, nombre: 'Vestidos', descripcion: 'Vestidos casuales y de fiesta' },
  { id_categoria: 2, nombre: 'Blusas', descripcion: 'Blusas y camisas femeninas' },
  { id_categoria: 3, nombre: 'Pantalones', descripcion: 'Jeans, palazzos y sastreria' },
  { id_categoria: 4, nombre: 'Abrigos', descripcion: 'Casacas, blazers y chaquetas' },
  { id_categoria: 5, nombre: 'Faldas', descripcion: 'Faldas cortas, midi y largas' },
];

export const temporadas: Temporada[] = [
  { id_temporada: 1, nombre: 'Primavera-Verano 2026', fecha_inicio: '2025-09-01', fecha_fin: '2026-03-31', activa: true },
  { id_temporada: 2, nombre: 'Otono-Invierno 2026', fecha_inicio: '2026-04-01', fecha_fin: '2026-08-31', activa: false },
];

export const colecciones: Coleccion[] = [
  { id_coleccion: 1, nombre: 'Urban Chic', descripcion: 'Prendas urbanas de uso diario', activa: true, id_temporada: 1 },
  { id_coleccion: 2, nombre: 'Noche Bohemia', descripcion: 'Vestidos y faldas de fiesta', activa: true, id_temporada: 1 },
  { id_coleccion: 3, nombre: 'Oficina Moderna', descripcion: 'Sastreria femenina', activa: true, id_temporada: 2 },
];

export const proveedores: Proveedor[] = [
  { id_proveedor: 1, nombre: 'Textiles Andina SRL', contacto: 'Jorge Mamani', telefono: '3-3556677', email: 'ventas@andina.bo', activo: true },
  { id_proveedor: 2, nombre: 'Moda Import Ltda', contacto: 'Silvia Quiroga', telefono: '2-2445566', email: 'contacto@modaimport.bo', activo: true },
  { id_proveedor: 3, nombre: 'Confecciones Sur', contacto: 'Raul Vaca', telefono: '4-4332211', email: 'info@confeccionessur.bo', activo: false },
];

export const tallas: Talla[] = [
  { id_talla: 1, nombre: 'XS' },
  { id_talla: 2, nombre: 'S' },
  { id_talla: 3, nombre: 'M' },
  { id_talla: 4, nombre: 'L' },
  { id_talla: 5, nombre: 'XL' },
];

export const colores: Color[] = [
  { id_color: 1, nombre: 'Negro', codigo_hex: '#1b1b1f' },
  { id_color: 2, nombre: 'Blanco', codigo_hex: '#f5f3ef' },
  { id_color: 3, nombre: 'Rosa palo', codigo_hex: '#e3b7b0' },
  { id_color: 4, nombre: 'Azul noche', codigo_hex: '#2b3a67' },
  { id_color: 5, nombre: 'Verde oliva', codigo_hex: '#6b705c' },
  { id_color: 6, nombre: 'Terracota', codigo_hex: '#b5651d' },
];

interface SemillaProducto {
  nombre: string;
  descripcion: string;
  precio: number;
  id_categoria: number;
  id_coleccion: number;
  id_proveedor: number;
  id_temporada: number;
  tallas: number[];
  colores: number[];
  descuento_pct?: number;
  ra?: boolean;
}

const semillas: SemillaProducto[] = [
  { nombre: 'Vestido midi plisado', descripcion: 'Vestido midi de gasa con cintura entallada y falda plisada.', precio: 459, id_categoria: 1, id_coleccion: 2, id_proveedor: 1, id_temporada: 1, tallas: [2, 3, 4], colores: [1, 3, 4], descuento_pct: 20, ra: true },
  { nombre: 'Vestido lino cruzado', descripcion: 'Vestido de lino con escote cruzado, ideal para clima calido.', precio: 389, id_categoria: 1, id_coleccion: 1, id_proveedor: 2, id_temporada: 1, tallas: [1, 2, 3, 4], colores: [2, 5] },
  { nombre: 'Blusa satinada manga globo', descripcion: 'Blusa de satin con manga abullonada y punos ajustados.', precio: 249, id_categoria: 2, id_coleccion: 1, id_proveedor: 1, id_temporada: 1, tallas: [2, 3, 4], colores: [2, 3, 6], ra: true },
  { nombre: 'Camisa oxford clasica', descripcion: 'Camisa de algodon oxford, corte recto y cuello italiano.', precio: 279, id_categoria: 2, id_coleccion: 3, id_proveedor: 2, id_temporada: 2, tallas: [2, 3, 4, 5], colores: [2, 4], descuento_pct: 10 },
  { nombre: 'Jean wide leg tiro alto', descripcion: 'Jean de pierna ancha, tiro alto y denim rigido.', precio: 349, id_categoria: 3, id_coleccion: 1, id_proveedor: 1, id_temporada: 1, tallas: [2, 3, 4, 5], colores: [1, 4] },
  { nombre: 'Pantalon palazzo fluido', descripcion: 'Palazzo de caida suave con pretina elastica.', precio: 299, id_categoria: 3, id_coleccion: 3, id_proveedor: 3, id_temporada: 2, tallas: [1, 2, 3], colores: [1, 5, 6] },
  { nombre: 'Blazer estructurado', descripcion: 'Blazer de sastreria con hombros marcados y forro interior.', precio: 629, id_categoria: 4, id_coleccion: 3, id_proveedor: 2, id_temporada: 2, tallas: [2, 3, 4], colores: [1, 4], descuento_pct: 15 },
  { nombre: 'Casaca denim oversize', descripcion: 'Casaca de denim lavado con corte oversize.', precio: 499, id_categoria: 4, id_coleccion: 1, id_proveedor: 1, id_temporada: 1, tallas: [2, 3, 4, 5], colores: [4, 2] },
  { nombre: 'Falda midi satinada', descripcion: 'Falda midi de satin con caida fluida y cintura alta.', precio: 289, id_categoria: 5, id_coleccion: 2, id_proveedor: 2, id_temporada: 1, tallas: [1, 2, 3, 4], colores: [3, 5, 1], ra: true },
  { nombre: 'Falda lapiz oficina', descripcion: 'Falda lapiz con abertura trasera y tela elastizada.', precio: 259, id_categoria: 5, id_coleccion: 3, id_proveedor: 3, id_temporada: 2, tallas: [2, 3, 4], colores: [1, 4] },
  { nombre: 'Vestido largo bohemio', descripcion: 'Vestido largo estampado con mangas amplias.', precio: 529, id_categoria: 1, id_coleccion: 2, id_proveedor: 2, id_temporada: 1, tallas: [2, 3, 4], colores: [6, 3], descuento_pct: 25 },
  { nombre: 'Blusa crop algodon', descripcion: 'Blusa corta de algodon organico con tirantes regulables.', precio: 189, id_categoria: 2, id_coleccion: 1, id_proveedor: 1, id_temporada: 1, tallas: [1, 2, 3], colores: [2, 3, 5] },
];

export const productos: Producto[] = semillas.map((s, i) => {
  const id = i + 1;
  const conPromo = Boolean(s.descuento_pct);
  return {
    id_producto: id,
    nombre: s.nombre,
    descripcion: s.descripcion,
    precio: s.precio,
    imagen_url: `https://picsum.photos/seed/fashionstore-${id}/600/800`,
    descuento_pct: s.descuento_pct ?? 0,
    promo_inicio: conPromo ? soloFecha(diasAtras(10)) : null,
    promo_fin: conPromo ? soloFecha(new Date(hoy.getFullYear(), hoy.getMonth() + 2, 28)) : null,
    activo: true,
    id_categoria: s.id_categoria,
    id_temporada: s.id_temporada,
    id_coleccion: s.id_coleccion,
    id_proveedor: s.id_proveedor,
    tallas: s.tallas.map((t) => tallas[t - 1]),
    colores: s.colores.map((c) => colores[c - 1]),
    tiene_recurso_ra: Boolean(s.ra),
  };
});

/**
 * Recursos del vestidor virtual.
 * Mientras no exista el backend se apunta a un modelo publico de demostracion
 * (igual que las imagenes usan un servicio de placeholders): asi el visor 3D y
 * la vista en el espacio se pueden probar de verdad. Al conectar NestJS,
 * url_recurso llega con el GLB/USDZ real de cada prenda.
 */
const MODELO_DEMO = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

export const recursosRA: RecursoRA[] = productos
  .filter((p) => p.tiene_recurso_ra)
  .map((p, i) => ({
    id_recurso_ra: i + 1,
    id_producto: p.id_producto,
    tipo: 'MODELO_3D',
    url_recurso: MODELO_DEMO,
    formato: 'GLB',
    activo: true,
  }));

/* ---------------- Inventario ---------------- */

/** Pseudo-aleatorio determinista para que la demo no cambie en cada recarga. */
function pseudo(n: number, max: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return Math.floor((x - Math.floor(x)) * (max + 1));
}

export const inventario: Inventario[] = [];
let idInv = 1;
for (const p of productos) {
  for (const t of p.tallas) {
    for (const c of p.colores) {
      for (const s of sucursales) {
        const semilla = p.id_producto * 1000 + t.id_talla * 100 + c.id_color * 10 + s.id_sucursal;
        // La mayoria de combinaciones tiene stock; algunas quedan agotadas
        // para poder demostrar los estados de disponibilidad.
        const fisica = semilla % 11 === 0 ? 0 : 2 + pseudo(semilla, 12);
        inventario.push({
          id_inventario: idInv++,
          id_sucursal: s.id_sucursal,
          id_producto: p.id_producto,
          id_talla: t.id_talla,
          id_color: c.id_color,
          cantidad_fisica: fisica,
          cantidad_reservada: fisica > 3 ? pseudo(semilla + 7, 2) : 0,
        });
      }
    }
  }
}

export const movimientos: MovimientoInventario[] = [
  { id_movimiento: 1, id_inventario: 1, tipo: TipoMovimiento.ENTRADA, cantidad: 12, estado: 'CONFIRMADO', referencia: 'OC-2026-014', fecha: iso(diasAtras(12)), fecha_programada: null, observacion: 'Recepcion de mercaderia', id_empleado: 2 },
  { id_movimiento: 2, id_inventario: 5, tipo: TipoMovimiento.VENTA, cantidad: -2, estado: 'CONFIRMADO', referencia: 'V-1002', fecha: iso(diasAtras(6)), fecha_programada: null, observacion: 'Venta presencial', id_empleado: 3 },
  { id_movimiento: 3, id_inventario: 9, tipo: TipoMovimiento.RESERVA, cantidad: -1, estado: 'CONFIRMADO', referencia: 'R-3001', fecha: iso(diasAtras(2)), fecha_programada: null, observacion: 'Reserva para prueba en tienda', id_empleado: 2 },
  { id_movimiento: 4, id_inventario: 14, tipo: TipoMovimiento.INGRESO_PENDIENTE, cantidad: 20, estado: 'PENDIENTE', referencia: 'OC-2026-021', fecha: iso(diasAtras(1)), fecha_programada: iso(new Date(hoy.getTime() + 6 * 86400000)), observacion: 'Proxima entrada de proveedor', id_empleado: 2 },
  { id_movimiento: 5, id_inventario: 3, tipo: TipoMovimiento.DEVOLUCION, cantidad: 1, estado: 'CONFIRMADO', referencia: 'V-1001', fecha: iso(diasAtras(3)), fecha_programada: null, observacion: 'Cambio de talla', id_empleado: 3 },
];

/* ---------------- Reservas ---------------- */

export const reservas: Reserva[] = [
  {
    id_reserva: 3001, id_cliente: 1, id_sucursal: 1,
    fecha_reserva: iso(diasAtras(2)),
    horario_aproximado: iso(new Date(hoy.getTime() + 86400000)),
    estado: EstadoReserva.PREPARANDO,
    observacion: 'Quiero probar dos tallas del vestido.',
    detalles: [
      { id_detalle_reserva: 1, id_reserva: 3001, id_producto: 1, id_talla: 2, id_color: 3, cantidad: 1, estado: 'PENDIENTE' },
      { id_detalle_reserva: 2, id_reserva: 3001, id_producto: 1, id_talla: 3, id_color: 3, cantidad: 1, estado: 'PENDIENTE' },
    ],
  },
  {
    id_reserva: 3002, id_cliente: 2, id_sucursal: 1,
    fecha_reserva: iso(diasAtras(1)),
    horario_aproximado: iso(new Date(hoy.getTime() + 2 * 86400000)),
    estado: EstadoReserva.PENDIENTE,
    observacion: '',
    detalles: [
      { id_detalle_reserva: 3, id_reserva: 3002, id_producto: 7, id_talla: 3, id_color: 1, cantidad: 1, estado: 'PENDIENTE' },
    ],
  },
  {
    id_reserva: 3003, id_cliente: 1, id_sucursal: 2,
    fecha_reserva: iso(diasAtras(14)),
    horario_aproximado: iso(diasAtras(13)),
    estado: EstadoReserva.ATENDIDA,
    observacion: '',
    detalles: [
      { id_detalle_reserva: 4, id_reserva: 3003, id_producto: 9, id_talla: 2, id_color: 3, cantidad: 1, estado: 'ATENDIDA' },
    ],
  },
];

/* ---------------- Carrito ---------------- */

export const carritos: Carrito[] = [
  { id_carrito: 1, id_cliente: 1, fecha_creacion: iso(hoy), estado: EstadoCarrito.ACTIVO, detalles: [] },
  { id_carrito: 2, id_cliente: 2, fecha_creacion: iso(hoy), estado: EstadoCarrito.ACTIVO, detalles: [] },
];

/* ---------------- Ventas ---------------- */

interface SemillaVenta {
  id: number; dias: number; canal: CanalVenta; sucursal: number | null;
  cliente: number | null; empleado: number | null;
  lineas: Array<[producto: number, talla: number, color: number, cantidad: number]>;
  metodo: MetodoPago;
}

const semillasVenta: SemillaVenta[] = [
  { id: 1001, dias: 25, canal: CanalVenta.WEB, sucursal: 1, cliente: 1, empleado: null, lineas: [[3, 3, 2, 1], [12, 2, 3, 2]], metodo: MetodoPago.PASARELA },
  { id: 1002, dias: 18, canal: CanalVenta.PRESENCIAL, sucursal: 1, cliente: 2, empleado: 3, lineas: [[5, 3, 1, 1]], metodo: MetodoPago.EFECTIVO },
  { id: 1003, dias: 12, canal: CanalVenta.WEB, sucursal: 2, cliente: 1, empleado: null, lineas: [[1, 3, 3, 1]], metodo: MetodoPago.TARJETA },
  { id: 1004, dias: 9, canal: CanalVenta.MOVIL, sucursal: 3, cliente: 2, empleado: null, lineas: [[9, 2, 3, 1], [4, 3, 4, 1]], metodo: MetodoPago.QR },
  { id: 1005, dias: 6, canal: CanalVenta.PRESENCIAL, sucursal: 2, cliente: null, empleado: 3, lineas: [[7, 3, 1, 1]], metodo: MetodoPago.TARJETA },
  { id: 1006, dias: 4, canal: CanalVenta.WEB, sucursal: 1, cliente: 1, empleado: null, lineas: [[11, 3, 6, 1]], metodo: MetodoPago.PASARELA },
  { id: 1007, dias: 2, canal: CanalVenta.PRESENCIAL, sucursal: 1, cliente: 2, empleado: 3, lineas: [[6, 2, 5, 1], [10, 3, 1, 1]], metodo: MetodoPago.EFECTIVO },
  { id: 1008, dias: 1, canal: CanalVenta.WEB, sucursal: 3, cliente: 1, empleado: null, lineas: [[8, 4, 4, 1]], metodo: MetodoPago.TARJETA },
];

let idDetalleVenta = 1;
export const ventas: Venta[] = semillasVenta.map((s) => {
  const detalles = s.lineas.map(([idProducto, idTalla, idColor, cantidad]) => {
    const producto = productos[idProducto - 1];
    const descuentoUnit = (producto.precio * producto.descuento_pct) / 100;
    return {
      id_detalle_venta: idDetalleVenta++,
      id_venta: s.id,
      id_producto: idProducto,
      id_talla: idTalla,
      id_color: idColor,
      cantidad,
      precio_unitario: producto.precio,
      descuento: Math.round(descuentoUnit * cantidad * 100) / 100,
    };
  });
  const total = Math.round(
    detalles.reduce((acc, d) => acc + d.cantidad * d.precio_unitario - d.descuento, 0) * 100,
  ) / 100;
  return {
    id_venta: s.id,
    id_cliente: s.cliente,
    id_empleado: s.empleado,
    id_sucursal: s.sucursal,
    id_reserva: null,
    fecha: iso(diasAtras(s.dias)),
    canal: s.canal,
    estado: EstadoVenta.PAGADA,
    total,
    detalles,
    pagos: [
      {
        id_pago: s.id,
        id_venta: s.id,
        metodo: s.metodo,
        tipo: s.metodo === MetodoPago.EFECTIVO || s.metodo === MetodoPago.TARJETA
          ? TipoPago.PRESENCIAL
          : TipoPago.ELECTRONICO,
        monto: total,
        estado: EstadoPago.APROBADO,
        referencia_externa: `PAY-${s.id}`,
        fecha: iso(diasAtras(s.dias)),
      },
    ],
  };
});

/* ---------------- Secuencias ---------------- */

export const secuencias = {
  usuario: usuarios.length,
  cliente: 2,
  empleado: 3,
  producto: productos.length,
  categoria: categorias.length,
  talla: tallas.length,
  color: colores.length,
  temporada: temporadas.length,
  coleccion: colecciones.length,
  proveedor: proveedores.length,
  sucursal: sucursales.length,
  rol: roles.length,
  inventario: idInv,
  movimiento: movimientos.length,
  reserva: 3003,
  detalleReserva: 4,
  detalleCarrito: 0,
  venta: 1008,
  detalleVenta: idDetalleVenta,
  pago: 1008,
  recomendacion: 0,
};

export function siguienteId(clave: keyof typeof secuencias): number {
  secuencias[clave] += 1;
  return secuencias[clave];
}
