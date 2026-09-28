/**
 * Modelo de dominio FashionStore (MVP - 23 clases).
 * Modelo de las pantallas. Los contratos de NestJS se adaptan en src/api.
 */

/* ============================================================
 * Enums del dominio (valores sugeridos en el diagrama)
 * ========================================================== */

export const EstadoReserva = {
  PENDIENTE: 'PENDIENTE',
  PREPARANDO: 'PREPARANDO',
  LISTA: 'LISTA',
  CLIENTE_PRESENTE: 'CLIENTE_PRESENTE',
  ATENDIDA: 'ATENDIDA',
  CANCELADA: 'CANCELADA',
  VENCIDA: 'VENCIDA',
} as const;
export type EstadoReserva = (typeof EstadoReserva)[keyof typeof EstadoReserva];

export const CanalVenta = {
  PRESENCIAL: 'PRESENCIAL',
  WEB: 'WEB',
  MOVIL: 'MOVIL',
} as const;
export type CanalVenta = (typeof CanalVenta)[keyof typeof CanalVenta];

export const EstadoVenta = {
  BORRADOR: 'BORRADOR',
  REEMBOLSADA: 'REEMBOLSADA',
  PENDIENTE: 'PENDIENTE',
  PAGADA: 'PAGADA',
  ENTREGADA: 'ENTREGADA',
  ANULADA: 'ANULADA',
} as const;
export type EstadoVenta = (typeof EstadoVenta)[keyof typeof EstadoVenta];

export const MetodoPago = {
  EFECTIVO: 'EFECTIVO',
  TARJETA: 'TARJETA',
  QR: 'QR',
  TRANSFERENCIA: 'TRANSFERENCIA',
  PASARELA: 'PASARELA',
} as const;
export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

export const TipoPago = {
  PRESENCIAL: 'PRESENCIAL',
  ELECTRONICO: 'ELECTRONICO',
} as const;
export type TipoPago = (typeof TipoPago)[keyof typeof TipoPago];

export const EstadoPago = {
  REEMBOLSADO: 'REEMBOLSADO',
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  ANULADO: 'ANULADO',
} as const;
export type EstadoPago = (typeof EstadoPago)[keyof typeof EstadoPago];

export const TipoMovimiento = {
  ENTRADA: 'ENTRADA',
  VENTA: 'VENTA',
  RESERVA: 'RESERVA',
  LIBERACION_RESERVA: 'LIBERACION_RESERVA',
  DEVOLUCION: 'DEVOLUCION',
  AJUSTE: 'AJUSTE',
  INGRESO_PENDIENTE: 'INGRESO_PENDIENTE',
  RETENCION_COMPRA: 'RETENCION_COMPRA',
  LIBERACION_COMPRA: 'LIBERACION_COMPRA',
} as const;
export type TipoMovimiento = (typeof TipoMovimiento)[keyof typeof TipoMovimiento];

export const EstadoCarrito = {
  ACTIVO: 'ACTIVO',
  CONVERTIDO: 'CONVERTIDO',
  ABANDONADO: 'ABANDONADO',
} as const;
export type EstadoCarrito = (typeof EstadoCarrito)[keyof typeof EstadoCarrito];

/** Roles de negocio. La autorizacion real la resuelve el backend. */
export const RolNombre = {
  CLIENTE: 'CLIENTE',
  ADMINISTRADOR: 'ADMINISTRADOR',
  ENCARGADO_SUCURSAL: 'ENCARGADO_SUCURSAL',
  CAJERO: 'CAJERO',
  PROVEEDOR: 'PROVEEDOR',
} as const;
export type RolNombre = (typeof RolNombre)[keyof typeof RolNombre];

/* ============================================================
 * 1. Usuarios y organizacion
 * ========================================================== */

export interface Rol {
  id_rol: number;
  nombre: RolNombre | string;
  descripcion: string;
}

export interface Usuario {
  proveedor_nombre?: string;
  proveedor_activo?: boolean;
  mayorista?: boolean;
  id_usuario: number;
  nombre: string;
  email: string;
  activo: boolean;
  fecha_registro: string;
  roles: Rol[];
  /** Una cuenta puede tener simultaneamente perfil de cliente y empleado. */
  id_cliente?: number;
  telefono?: string;
  direccion?: string;
  id_empleado?: number;
  cargo?: string;
  id_sucursal?: number | null;
  sucursal?: Sucursal | null;
  /** Presente cuando la cuenta representa a un proveedor del catalogo. */
  id_proveedor?: number | null;
}

export interface Cliente extends Usuario {
  id_cliente: number;
  telefono: string;
  direccion: string;
}

export interface Empleado extends Usuario {
  id_empleado: number;
  cargo: string;
  id_sucursal: number | null;
  sucursal?: Sucursal | null;
}

export interface Sucursal {
  nombre_almacen?: string;
  id_sucursal: number;
  nombre: string;
  ciudad: string;
  direccion: string;
  telefono: string;
  activa: boolean;
}

/* ============================================================
 * 2. Catalogo
 * ========================================================== */

export interface Categoria {
  id_categoria: number;
  nombre: string;
  descripcion: string;
}

export interface Temporada {
  id_temporada: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activa: boolean;
}

export interface Coleccion {
  id_coleccion: number;
  nombre: string;
  descripcion: string;
  activa: boolean;
  id_temporada: number | null;
}

export interface Proveedor {
  id_proveedor: number;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  activo: boolean;
}

export interface Talla {
  id_talla: number;
  nombre: string;
}

export interface Color {
  id_color: number;
  nombre: string;
  codigo_hex: string;
}

export interface Producto {
  imagenes?: string[];
  precio_mayorista?: number | null;
  id_producto: number;
  nombre: string;
  descripcion: string;
  precio: number;
  precio_actual?: number;
  promocion_activa?: boolean;
  recursos_ra?: RecursoRA[];
  imagen_url: string;
  descuento_pct: number;
  promo_inicio: string | null;
  promo_fin: string | null;
  activo: boolean;
  id_categoria: number;
  id_temporada: number | null;
  id_coleccion: number | null;
  id_proveedor: number | null;
  /** Combinaciones ofrecidas por el producto (distinto de inventario). */
  tallas: Talla[];
  colores: Color[];
  /** Relaciones expandidas que el backend puede incluir. */
  categoria?: Categoria;
  temporada?: Temporada | null;
  coleccion?: Coleccion | null;
  proveedor?: Proveedor | null;
  tiene_recurso_ra?: boolean;
}

/* ============================================================
 * 3. Inventario
 * ========================================================== */

export interface Inventario {
  id_inventario: number;
  id_sucursal: number;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad_fisica: number;
  cantidad_reservada: number;
  sucursal?: Pick<Sucursal, 'id_sucursal' | 'nombre' | 'ciudad' | 'activa'>;
  producto?: Pick<Producto, 'id_producto' | 'nombre' | 'imagen_url' | 'activo'>;
  talla?: Talla;
  color?: Color;
}

/** La consulta publica expone disponibilidad, no cantidades fisicas/reservadas. */
export interface Disponibilidad {
  id_inventario: number;
  id_sucursal: number;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad_disponible: number;
  sucursal?: Pick<Sucursal, 'id_sucursal' | 'nombre' | 'ciudad' | 'activa'>;
  talla?: Talla;
  color?: Color;
}

export interface MovimientoInventario {
  id_movimiento: number;
  id_inventario: number;
  tipo: TipoMovimiento;
  cantidad: number;
  estado: string;
  referencia: string;
  fecha: string;
  fecha_programada: string | null;
  observacion: string;
  id_empleado: number | null;
  inventario?: Inventario;
  empleado?: { id_empleado: number; nombre: string } | null;
}

/* ============================================================
 * 4. Reservas
 * ========================================================== */

export interface DetalleReserva {
  id_detalle_reserva: number;
  id_reserva: number;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
  estado: string;
  producto?: Pick<Producto, 'id_producto' | 'nombre' | 'imagen_url'>;
  talla?: Talla;
  color?: Color;
}

export interface Reserva {
  id_reserva: number;
  id_cliente: number;
  id_sucursal: number;
  fecha_reserva: string;
  horario_aproximado: string;
  estado: EstadoReserva;
  vence_en?: string;
  observacion: string;
  detalles: DetalleReserva[];
  cliente?: { id_cliente: number; nombre: string; telefono: string; email: string };
  sucursal?: Pick<Sucursal, 'id_sucursal' | 'nombre' | 'ciudad' | 'direccion'>;
}

/* ============================================================
 * 5. Carrito
 * ========================================================== */

export interface DetalleCarrito {
  id_detalle_carrito: number;
  id_carrito: number;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
  precio_unitario: number;
  producto?: Pick<Producto, 'id_producto' | 'nombre' | 'imagen_url' | 'activo'>;
  subtotal?: number;
  precio_guardado?: number;
  precio_cambio?: boolean;
  disponible?: boolean;
  problema?: 'PRODUCT_INACTIVE' | 'VARIANT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' | null;
  disponibilidad?: Array<{
    sucursal: Pick<Sucursal, 'id_sucursal' | 'nombre' | 'ciudad'>;
    cantidad_disponible: number;
  }>;
  talla?: Talla;
  color?: Color;
}

export interface Carrito {
  id_carrito: number;
  id_cliente?: number;
  fecha_creacion: string;
  estado: EstadoCarrito;
  detalles: DetalleCarrito[];
  total?: number;
  cantidad_total?: number;
  sucursales_disponibles?: Array<Pick<Sucursal, 'id_sucursal' | 'nombre' | 'ciudad'>>;
  tiene_disponibilidad?: boolean;
}

/* ============================================================
 * 6. Ventas y pagos
 * ========================================================== */

export interface DetalleVenta {
  id_detalle_venta: number;
  id_venta: number;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  producto?: Pick<Producto, 'id_producto' | 'nombre'>;
  talla?: Talla;
  color?: Color;
}

export interface Pago {
  id_pago: number;
  id_venta: number;
  metodo: MetodoPago;
  tipo: TipoPago;
  monto: number;
  estado: EstadoPago;
  referencia_externa: string;
  fecha: string;
}

export interface Venta {
  contra_entrega?: boolean;
  id_turno?: number | null;
  moneda?: string;
  numero_comprobante?: string;
  comprobante_disponible?: boolean;
  cajero?: string;
  id_venta: number;
  id_cliente: number | null;
  id_empleado: number | null;
  id_sucursal: number | null;
  id_reserva: number | null;
  fecha: string;
  canal: CanalVenta;
  estado: EstadoVenta;
  total: number;
  detalles: DetalleVenta[];
  pagos: Pago[];
  cliente?: { id_cliente: number; nombre: string; email: string } | null;
  sucursal?: Sucursal | null;
}

/* ============================================================
 * 7. RA e IA
 * ========================================================== */

export interface RecursoRA {
  id_recurso_ra: number;
  id_producto: number;
  tipo: string;
  url_recurso: string;
  formato: string;
  activo: boolean;
}

export interface RecomendacionIA {
  id_recomendacion: number;
  id_cliente: number;
  id_producto: number;
  fecha: string;
  motivo: string;
  puntuacion: number;
  origen: string;
  producto?: Producto;
}
