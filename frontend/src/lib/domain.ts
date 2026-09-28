/**
 * Reglas de negocio del dominio que el frontend necesita calcular.
 * Son las mismas formulas que documenta el diagrama de clases.
 */
import type { Inventario, Producto } from '../types/domain';

/** Inventario.stockDisponible() */
export function stockDisponible(
  inv: Pick<Inventario, 'cantidad_fisica' | 'cantidad_reservada'> | { cantidad_disponible: number },
): number {
  if ('cantidad_disponible' in inv) return Math.max(0, inv.cantidad_disponible);
  return Math.max(0, inv.cantidad_fisica - inv.cantidad_reservada);
}

/** Inventario.hayDisponibilidad() */
export function hayDisponibilidad(
  inv: Pick<Inventario, 'cantidad_fisica' | 'cantidad_reservada'>,
  cantidad = 1,
): boolean {
  return stockDisponible(inv) >= cantidad;
}

/** La promocion solo aplica dentro de la ventana promo_inicio..promo_fin. */
export function promocionVigente(producto: Producto, referencia: Date = new Date()): boolean {
  if (producto.promocion_activa !== undefined) return producto.promocion_activa;
  if (!producto.descuento_pct || producto.descuento_pct <= 0) return false;
  const hoy = referencia.getTime();
  const inicio = producto.promo_inicio ? new Date(producto.promo_inicio).getTime() : -Infinity;
  const fin = producto.promo_fin ? new Date(`${producto.promo_fin}T23:59:59`).getTime() : Infinity;
  return hoy >= inicio && hoy <= fin;
}

/** Producto.obtenerPrecioActual() */
export function precioActual(producto: Producto, referencia: Date = new Date()): number {
  if (producto.precio_actual !== undefined) return producto.precio_actual;
  if (!promocionVigente(producto, referencia)) return producto.precio;
  return redondear(producto.precio * (1 - producto.descuento_pct / 100));
}

export function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** DetalleCarrito.subtotal() / DetalleVenta.subtotal() */
export function subtotal(cantidad: number, precioUnitario: number, descuento = 0): number {
  return redondear(cantidad * precioUnitario - descuento);
}

export function totalLineas(
  lineas: Array<{ cantidad: number; precio_unitario: number; descuento?: number }>,
): number {
  return redondear(
    lineas.reduce((acc, l) => acc + subtotal(l.cantidad, l.precio_unitario, l.descuento ?? 0), 0),
  );
}

/** Clave unica de inventario: (sucursal, producto, talla, color). */
export function claveInventario(
  id_sucursal: number,
  id_producto: number,
  id_talla: number,
  id_color: number,
): string {
  return `${id_sucursal}:${id_producto}:${id_talla}:${id_color}`;
}
