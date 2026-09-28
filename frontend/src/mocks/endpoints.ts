/**
 * Autenticacion usa el contrato real. Los demas grupos conservan por ahora
 * el contrato de la demo y se migraran junto con sus servicios y pantallas.
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    registro: '/auth/register',
    perfil: '/auth/me',
  },
  catalogo: {
    productos: '/productos',
    producto: (id: number | string) => `/productos/${id}`,
    categorias: '/categorias',
    categoria: (id: number | string) => `/categorias/${id}`,
    tallas: '/tallas',
    talla: (id: number | string) => `/tallas/${id}`,
    colores: '/colores',
    color: (id: number | string) => `/colores/${id}`,
    temporadas: '/temporadas',
    temporada: (id: number | string) => `/temporadas/${id}`,
    colecciones: '/colecciones',
    coleccion: (id: number | string) => `/colecciones/${id}`,
    recursosRA: (idProducto: number | string) => `/productos/${idProducto}/recursos-ra`,
  },
  sucursales: {
    lista: '/sucursales',
    detalle: (id: number | string) => `/sucursales/${id}`,
  },
  proveedores: {
    lista: '/proveedores',
    detalle: (id: number | string) => `/proveedores/${id}`,
    productos: (id: number | string) => `/proveedores/${id}/productos`,
  },
  inventario: {
    lista: '/inventario',
    detalle: (id: number | string) => `/inventario/${id}`,
    disponibilidad: '/inventario/disponibilidad',
    movimientos: '/inventario/movimientos',
    crearMovimiento: '/inventario/movimientos',
    entradas: '/inventario/entradas',
    completar: (id: number) => `/inventario/movimientos/${id}/completar`,
  },
  carrito: {
    actual: '/carrito',
    items: '/carrito/items',
    item: (id: number | string) => `/carrito/items/${id}`,
    vaciar: '/carrito',
  },
  reservas: {
    lista: '/reservas',
    detalle: (id: number | string) => `/reservas/${id}`,
    crear: '/reservas',
    estado: (id: number | string) => `/reservas/${id}/estado`,
    cancelar: (id: number | string) => `/reservas/${id}/cancelar`,
  },
  ventas: {
    lista: '/ventas',
    detalle: (id: number | string) => `/ventas/${id}`,
    crear: '/ventas',
    pagos: (id: number | string) => `/ventas/${id}/pagos`,
  },
  usuarios: {
    lista: '/usuarios',
    detalle: (id: number | string) => `/usuarios/${id}`,
    roles: '/roles',
    rol: (id: number | string) => `/roles/${id}`,
    empleados: '/empleados',
    empleado: (id: number | string) => `/empleados/${id}`,
  },
  reportes: {
    resumen: '/reportes/resumen',
    ventasPorPeriodo: '/reportes/ventas-por-periodo',
    ventasPorSucursal: '/reportes/ventas-por-sucursal',
    topProductos: '/reportes/top-productos',
    inventarioCritico: '/reportes/inventario-critico',
    reservasPorEstado: '/reportes/reservas-por-estado',
  },
  ia: {
    recomendaciones: '/ia/recomendaciones',
    asistente: '/ia/asistente',
  },
} as const;
