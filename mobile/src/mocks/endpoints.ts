/** Rutas del backend simulado (modo demo sin NestJS). No usar con la API real. */
export const rutasMock = {
  auth: { login: '/auth/login', registro: '/auth/registro', perfil: '/auth/perfil', logout: '/auth/logout' },
  productos: '/productos',
  producto: (id: number) => `/productos/${id}`,
  recursosRA: (id: number) => `/productos/${id}/recursos-ra`,
  categorias: '/categorias',
  tallas: '/tallas',
  colores: '/colores',
  temporadas: '/temporadas',
  colecciones: '/colecciones',
  sucursales: '/sucursales',
  disponibilidad: '/inventario/disponibilidad',
  carrito: { actual: '/carrito', items: '/carrito/items', item: (id: number) => `/carrito/items/${id}`, vaciar: '/carrito' },
  reservas: {
    lista: '/reservas',
    detalle: (id: number) => `/reservas/${id}`,
    cancelar: (id: number) => `/reservas/${id}/cancelar`,
  },
  ventas: { lista: '/ventas', detalle: (id: number) => `/ventas/${id}`, crear: '/ventas' },
  ia: { asistente: '/ia/asistente', recomendaciones: '/ia/recomendaciones' },
} as const;
