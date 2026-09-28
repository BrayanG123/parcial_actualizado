/**
 * Autenticacion, catalogo, organizacion y disponibilidad usan el contrato real.
 * Las operaciones comerciales restantes se migraran en la siguiente etapa.
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    registro: '/auth/register',
    perfil: '/auth/me',
  },
  catalogo: {
    productos: '/products',
    producto: (id: number | string) => `/products/${id}`,
    categorias: '/catalog/categories',
    categoria: (id: number | string) => `/catalog/categories/${id}`,
    tallas: '/catalog/sizes',
    talla: (id: number | string) => `/catalog/sizes/${id}`,
    colores: '/catalog/colors',
    color: (id: number | string) => `/catalog/colors/${id}`,
    temporadas: '/catalog/seasons',
    temporada: (id: number | string) => `/catalog/seasons/${id}`,
    colecciones: '/catalog/collections',
    coleccion: (id: number | string) => `/catalog/collections/${id}`,
    recursosRA: (idProducto: number | string) => `/products/${idProducto}/ar-resources`,
    recursoRA: (idProducto: number | string, id: number | string) =>
      `/products/${idProducto}/ar-resources/${id}`,
  },
  sucursales: {
    lista: '/branches',
    detalle: (id: number | string) => `/branches/${id}`,
  },
  proveedores: {
    lista: '/catalog/suppliers',
    detalle: (id: number | string) => `/catalog/suppliers/${id}`,
    productos: (id: number | string) => `/catalog/suppliers/${id}/products`,
  },
  inventario: {
    lista: '/inventory',
    detalle: (id: number | string) => `/inventory/${id}`,
    disponibilidad: '/inventory/availability',
    movimientos: (id: number) => `/inventory/${id}/movements`,
    entradas: '/inventory/entries',
    ajustes: (id: number) => `/inventory/${id}/adjustments`,
    devoluciones: (id: number) => `/inventory/${id}/returns`,
    completar: (id: number) => `/inventory/movements/${id}/complete`,
  },
  carrito: {
    actual: '/cart',
    items: '/cart/items',
    item: (id: number | string) => `/cart/items/${id}`,
    vaciar: '/cart/items',
  },
  reservas: {
    lista: '/reservations',
    propias: '/reservations/mine',
    detalle: (id: number | string) => `/reservations/${id}`,
    crear: '/reservations',
    estado: (id: number | string) => `/reservations/${id}/status`,
    cancelar: (id: number | string) => `/reservations/${id}/cancel`,
  },
  ventas: {
    lista: '/sales',
    propias: '/sales/mine',
    detalle: (id: number | string) => `/sales/${id}`,
    comprobante: (id: number | string) => `/sales/${id}/receipt`,
    crear: '/sales/in-store',
    previsualizar: '/sales/in-store/preview',
    clientes: '/sales/in-store/customers',
    reserva: (id: number) => `/sales/in-store/reservations/${id}`,
  },
  usuarios: {
    lista: '/users',
    detalle: (id: number | string) => `/users/${id}`,
    roles: '/roles',
    asignacion: (id: number, rol: string) => `/roles/users/${id}/${rol}`,
    empleados: '/empleados',
    empleado: (id: number | string) => `/empleados/${id}`,
  },
  reportes: {
    ventas: '/reports/sales',
    topProductos: '/reports/top-products',
    inventario: '/reports/inventory',
    reservas: '/reports/reservations',
    caja: '/reports/cash-shifts',
  },
  push: {
    estado: '/push/status',
    tokens: '/push/tokens',
  },
  notificaciones: {
    lista: '/notifications',
    noLeidas: '/notifications/unread-count',
    leer: (id: number) => `/notifications/${id}/read`,
  },
  ia: {
    estado: '/ai/status',
    recomendaciones: '/ai/recommendations',
    asistente: '/ai/assistant',
    reportes: '/ai/reports',
  },
} as const;
