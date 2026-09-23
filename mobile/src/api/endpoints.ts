/**
 * Rutas reales de la API NestJS (prefijo /api/v1 incluido en EXPO_PUBLIC_API_URL).
 * Ningun componente ni servicio debe escribir rutas a mano.
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
    recursosRA: (idProducto: number | string) => `/products/${idProducto}/ar-resources`,
    categorias: '/catalog/categories',
    tallas: '/catalog/sizes',
    colores: '/catalog/colors',
    temporadas: '/catalog/seasons',
    colecciones: '/catalog/collections',
  },
  sucursales: {
    lista: '/branches',
  },
  inventario: {
    disponibilidad: '/inventory/availability',
  },
  carrito: {
    actual: '/cart',
    items: '/cart/items',
    item: (id: number | string) => `/cart/items/${id}`,
    vaciar: '/cart/items',
  },
  reservas: {
    propias: '/reservations/mine',
    detalle: (id: number | string) => `/reservations/${id}`,
    crear: '/reservations',
    cancelar: (id: number | string) => `/reservations/${id}/cancel`,
  },
  ventas: {
    propias: '/sales/mine',
    detalle: (id: number | string) => `/sales/${id}`,
    cancelar: (id: number | string) => `/sales/${id}/cancel`,
    cotizar: '/sales/checkout/preview',
    checkout: '/sales/checkout',
  },
  pagos: {
    intento: '/payments/stripe/intents',
  },
  ia: {
    asistente: '/ai/assistant',
    recomendaciones: '/ai/recommendations',
  },
  probador: {
    estado: '/virtual-fitting/status',
    probarConIA: '/virtual-fitting/try-on',
  },
} as const;
