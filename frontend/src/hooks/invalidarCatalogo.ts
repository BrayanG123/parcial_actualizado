import type { QueryClient } from '@tanstack/react-query';

/** Las relaciones expandidas y la disponibilidad tambien cambian al editar los maestros. */
export function invalidarCatalogo(qc: QueryClient) {
  return Promise.all(
    [
      'productos',
      'producto',
      'carrito',
      'recursos-ra',
      'disponibilidad',
      'inventario',
      'categorias',
      'tallas',
      'colores',
      'temporadas',
      'colecciones',
      'sucursales',
      'proveedores',
      'proveedor-productos',
      'proveedor-disponibilidad',
      'usuarios',
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  );
}
