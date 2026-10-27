/**
 * Empresa (tenant) activa de la tienda publica. Se envia como header X-Tenant en las
 * peticiones sin sesion; con sesion manda la empresa del token (el backend rechaza
 * un header distinto con TENANT_MISMATCH).
 */
import { BASE_URL, USAR_MOCKS } from './config';

export interface EmpresaActiva {
  slug: string;
  nombre?: string;
}

/** Empresa de las apps del parcial 1 (DEFAULT_TENANT_SLUG del backend). */
export const EMPRESA_POR_DEFECTO = 'fashionstore';
const CLAVE = `fashionstore.empresa:${USAR_MOCKS ? 'mock' : BASE_URL}`;
const SLUG_VALIDO = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

const oyentes = new Set<() => void>();
let actual: EmpresaActiva | null = leer();

function leer(): EmpresaActiva | null {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as EmpresaActiva | null;
    return valor && typeof valor.slug === 'string' && SLUG_VALIDO.test(valor.slug) ? valor : null;
  } catch {
    return null;
  }
}

export function esSlugValido(slug: string): boolean {
  return SLUG_VALIDO.test(slug);
}

export function obtenerEmpresa(): EmpresaActiva | null {
  return actual;
}

/** Slug que se envia en X-Tenant (o null para usar la empresa por defecto del backend). */
export function slugEmpresa(): string | null {
  return actual?.slug ?? null;
}

export function fijarEmpresa(empresa: EmpresaActiva | null): void {
  const slug = empresa?.slug.trim().toLowerCase();
  if (empresa && (!slug || !SLUG_VALIDO.test(slug))) throw new Error('Codigo de empresa invalido');
  const siguiente = empresa && slug ? { slug, nombre: empresa.nombre } : null;
  if (actual?.slug === siguiente?.slug && actual?.nombre === siguiente?.nombre) return;
  actual = siguiente;
  try {
    if (actual) localStorage.setItem(CLAVE, JSON.stringify(actual));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* Sin almacenamiento la empresa se conserva en memoria. */
  }
  oyentes.forEach((notificar) => notificar());
}

export function suscribirEmpresa(notificar: () => void): () => void {
  oyentes.add(notificar);
  return () => {
    oyentes.delete(notificar);
  };
}
