/** Claves de cache de TanStack Query, centralizadas para invalidar sin adivinar. */
import type { FiltrosProducto } from '../services/catalogo.service';
import type { FiltrosReserva, FiltrosVenta } from '../services/comercio.service';

export const claves = {
  perfil: ['perfil'] as const,

  productos: (filtros: FiltrosProducto) => ['productos', filtros] as const,
  producto: (id: number) => ['producto', id] as const,
  recursosRA: (id: number) => ['recursos-ra', id] as const,
  disponibilidad: (id: number) => ['disponibilidad', id] as const,

  categorias: ['categorias'] as const,
  tallas: ['tallas'] as const,
  colores: ['colores'] as const,
  colecciones: ['colecciones'] as const,
  sucursales: ['sucursales'] as const,

  carrito: ['carrito'] as const,
  reservas: (filtros: FiltrosReserva) => ['reservas', filtros] as const,
  ventas: (filtros: FiltrosVenta) => ['ventas', filtros] as const,
  venta: (id: number) => ['venta', id] as const,

  recomendaciones: (contexto?: string) => ['recomendaciones', contexto ?? ''] as const,
};
