/**
 * F17: sucursal donde compra el cliente. Se elige al entrar a la tienda y se recuerda por
 * empresa; el catalogo, la prenda, el carrito, la compra y la reserva usan esta sucursal.
 */
import { useSyncExternalStore } from 'react';
import { obtenerEmpresa, suscribirEmpresa } from '../api/empresa';

export interface SucursalTienda {
  id_sucursal: number;
  nombre: string;
  ciudad?: string;
}

const PREFIJO = 'fashionstore.sucursal:';
const oyentes = new Set<() => void>();
let cache: { slug: string | null; valor: SucursalTienda | null } = { slug: null, valor: null };

function clave(): string | null {
  const slug = obtenerEmpresa()?.slug;
  return slug ? PREFIJO + slug : null;
}

function leer(): SucursalTienda | null {
  const k = clave();
  if (!k) return null;
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as SucursalTienda | null;
    return v && Number.isInteger(v.id_sucursal) && v.id_sucursal > 0 && typeof v.nombre === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Sucursal elegida en la tienda activa (null si aun no se eligio). */
export function obtenerSucursalTienda(): SucursalTienda | null {
  const slug = obtenerEmpresa()?.slug ?? null;
  if (cache.slug !== slug) cache = { slug, valor: leer() };
  return cache.valor;
}

export function fijarSucursalTienda(sucursal: SucursalTienda | null): void {
  const k = clave();
  const valor = sucursal
    ? { id_sucursal: sucursal.id_sucursal, nombre: sucursal.nombre, ciudad: sucursal.ciudad }
    : null;
  cache = { slug: obtenerEmpresa()?.slug ?? null, valor };
  try {
    if (k && valor) localStorage.setItem(k, JSON.stringify(valor));
    else if (k) localStorage.removeItem(k);
  } catch {
    /* Sin almacenamiento la sucursal queda en memoria. */
  }
  oyentes.forEach((n) => n());
}

function suscribir(notificar: () => void): () => void {
  oyentes.add(notificar);
  const quitarEmpresa = suscribirEmpresa(notificar);
  return () => {
    oyentes.delete(notificar);
    quitarEmpresa();
  };
}

export function useSucursalTienda(): SucursalTienda | null {
  return useSyncExternalStore(suscribir, obtenerSucursalTienda, obtenerSucursalTienda);
}
