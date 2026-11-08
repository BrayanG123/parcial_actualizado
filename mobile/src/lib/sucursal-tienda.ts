/**
 * F17: sucursal donde compra el cliente (igual que la web). Se elige al entrar a la tienda y
 * se recuerda por empresa; catalogo, prenda, carrito, compra y reserva usan esta sucursal.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerEmpresa, suscribirEmpresa } from '../api/empresa';

export interface SucursalTienda {
  id_sucursal: number;
  nombre: string;
  ciudad?: string;
}

const CLAVE = 'fashionstore.sucursales';
/** Sucursal elegida por codigo de tienda. */
let porTienda: Record<string, SucursalTienda> = {};
const oyentes = new Set<() => void>();

const tiendaActual = () => obtenerEmpresa()?.slug ?? '_';

export async function hidratarSucursales(): Promise<void> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    const valor = crudo ? (JSON.parse(crudo) as Record<string, SucursalTienda>) : {};
    porTienda = valor && typeof valor === 'object' ? valor : {};
  } catch {
    porTienda = {};
  }
}

export function obtenerSucursalTienda(): SucursalTienda | null {
  return porTienda[tiendaActual()] ?? null;
}

export function fijarSucursalTienda(sucursal: SucursalTienda | null): void {
  const siguiente = { ...porTienda };
  if (sucursal)
    siguiente[tiendaActual()] = { id_sucursal: sucursal.id_sucursal, nombre: sucursal.nombre, ciudad: sucursal.ciudad };
  else delete siguiente[tiendaActual()];
  porTienda = siguiente;
  void AsyncStorage.setItem(CLAVE, JSON.stringify(porTienda)).catch(() => undefined);
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  const quitar = suscribirEmpresa(f);
  return () => {
    oyentes.delete(f);
    quitar();
  };
}

export function useSucursalTienda(): SucursalTienda | null {
  return useSyncExternalStore(suscribir, obtenerSucursalTienda, obtenerSucursalTienda);
}
