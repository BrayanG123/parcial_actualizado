/**
 * Tienda (empresa) elegida en el movil. Se envia como X-Tenant en las peticiones sin
 * sesion; con sesion manda la empresa del token (el backend rechaza un header distinto).
 * Sin tienda elegida el backend usa la empresa por defecto (apps del parcial 1).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE = 'fashionstore.empresa';
export interface EmpresaActiva {
  slug: string;
  nombre?: string;
}

let actual: EmpresaActiva | null = null;
const oyentes = new Set<() => void>();

export async function hidratarEmpresa(): Promise<EmpresaActiva | null> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    actual = crudo ? (JSON.parse(crudo) as EmpresaActiva) : null;
  } catch {
    actual = null;
  }
  return actual;
}

export const obtenerEmpresa = () => actual;

export function fijarEmpresa(empresa: EmpresaActiva | null) {
  actual = empresa;
  if (empresa) void AsyncStorage.setItem(CLAVE, JSON.stringify(empresa)).catch(() => undefined);
  else void AsyncStorage.removeItem(CLAVE).catch(() => undefined);
  oyentes.forEach((f) => f());
}

export function suscribirEmpresa(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}
