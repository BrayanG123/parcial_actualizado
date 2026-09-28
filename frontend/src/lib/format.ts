const monedaFmt = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
});

const fechaFmt = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const fechaHoraFmt = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function moneda(valor: number, codigo = 'BOB'): string {
  return codigo === 'BOB' ? monedaFmt.format(valor ?? 0) : new Intl.NumberFormat('es-BO', { style: 'currency', currency: codigo }).format(valor ?? 0);
}

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return '-';
  // Una fecha comercial sin hora es un dia de calendario, no medianoche UTC.
  const d =
    valor instanceof Date
      ? valor
      : /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? new Date(`${valor}T00:00:00`)
        : new Date(valor);
  return Number.isNaN(d.getTime()) ? '-' : fechaFmt.format(d);
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return '-';
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? '-' : fechaHoraFmt.format(d);
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
