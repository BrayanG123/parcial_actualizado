import { moneda } from '../../lib/format';
import type { TablaIA } from '../../types/ia';

/** Formatea una celda segun el tipo de columna declarado por el backend. */
export function formatoCelda(
  valor: string | number | null | undefined,
  formato: TablaIA['columnas'][number]['formato'],
) {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor !== 'number') return String(valor);
  if (formato === 'money') return moneda(valor);
  if (formato === 'percent') return `${valor}%`;
  return valor.toLocaleString('es-BO');
}
