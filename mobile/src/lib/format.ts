/**
 * Formato de moneda y fecha sin depender de Intl.
 * Hermes no siempre incluye la tabla completa de ICU en Android, por lo que se
 * formatea a mano con la convencion es-BO: Bs 1.234,50 / 12 sep 2026.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function separarMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 459 -> "Bs 459,00" */
export function moneda(valor: number | null | undefined): string {
  const n = Number(valor ?? 0);
  const signo = n < 0 ? '-' : '';
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.');
  return `${signo}Bs ${separarMiles(entero)},${decimales}`;
}

/** Sin decimales, para etiquetas compactas: "Bs 459" */
export function monedaCorta(valor: number | null | undefined): string {
  const n = Math.round(Number(valor ?? 0));
  return `Bs ${separarMiles(String(Math.abs(n)))}`;
}

function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fecha(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '-';
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function fechaHora(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '-';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fecha(d)}, ${hh}:${mm}`;
}

export function hora(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '-';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "hoy", "manana" o la fecha corta, para listas de reservas. */
export function fechaRelativa(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '-';
  const hoy = new Date();
  const dias = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) /
      86400000,
  );
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Manana';
  if (dias === -1) return 'Ayer';
  return fecha(d);
}

/** PENDIENTE_DE_PAGO -> Pendiente de pago */
export function etiqueta(valor: string | null | undefined): string {
  if (!valor) return '-';
  const texto = valor.replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}
