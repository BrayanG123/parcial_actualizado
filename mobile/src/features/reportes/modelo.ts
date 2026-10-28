/**
 * Reportes generativos en el movil (F8.6). Logica pura, sin React Native: se prueba con
 * node:test (test/reportes-ia.test.mjs).
 *
 * POST /ai/reports devuelve, ademas de los datos crudos, una tabla tipada (`table`) y la
 * especificacion de grafico que eligio el backend (`chart`). La app no reinterpreta la
 * pregunta: solo presenta lo que el servidor calculo con los permisos del usuario.
 */

export type FormatoColumna = 'text' | 'number' | 'money' | 'percent';
export type Celda = string | number | null;

export interface ReporteIABackend {
  status?: 'OK' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED';
  question: string;
  source: string;
  summary: string;
  suggestions?: string[];
  interpretation: null | {
    report: string;
    from?: string;
    to?: string;
    explanation: string;
    branchName?: string | null;
    branchNames?: string[];
    categoryNames?: string[];
    productNames?: string[];
    channel?: string;
    months?: number;
  };
  table?: null | {
    columns: Array<{ key: string; label: string; format: FormatoColumna }>;
    rows: Array<Record<string, Celda>>;
  };
  chart?: null | {
    type: 'bar' | 'line' | 'pie' | 'table';
    title: string;
    x?: string;
    y: Array<{ key: string; label: string }>;
    reason: string;
  };
}

export interface Columna {
  clave: string;
  titulo: string;
  formato: FormatoColumna;
}

export type ReporteMovil =
  | {
      estado: 'OK';
      pregunta: string;
      origen: string;
      resumen: string;
      explicacion: string;
      filtros: string[];
      columnas: Columna[];
      filas: Array<Record<string, Celda>>;
      grafico: {
        tipo: 'barras' | 'columnas' | 'proporcion' | 'tabla';
        titulo: string;
        x: string | null;
        series: Array<{ clave: string; titulo: string }>;
        motivo: string;
      };
    }
  | {
      estado: 'ACLARACION' | 'NO_SOPORTADO';
      pregunta: string;
      origen: string;
      resumen: string;
      sugerencias: string[];
    };

const CANALES: Record<string, string> = { IN_STORE: 'En tienda', WEB: 'Web', MOBILE: 'Movil' };
/**
 * En pantalla de telefono: barras horizontales para comparar grupos, columnas para series en
 * el tiempo y una barra al 100 % para participaciones (reemplaza a la torta).
 */
const TIPO_GRAFICO = { bar: 'barras', line: 'columnas', pie: 'proporcion', table: 'tabla' } as const;

export function adaptarReporte(v: ReporteIABackend): ReporteMovil {
  const base = { pregunta: v.question, origen: v.source, resumen: v.summary };
  const i = v.interpretation;
  if (!i || (v.status && v.status !== 'OK') || !v.table || !v.chart)
    return {
      ...base,
      estado: v.status === 'UNSUPPORTED' ? 'NO_SOPORTADO' : 'ACLARACION',
      sugerencias: v.suggestions ?? [],
    };
  const sucursales = i.branchNames?.length ? i.branchNames : i.branchName ? [i.branchName] : [];
  const filtros = [
    i.from || i.to ? `Periodo: ${i.from ?? 'inicio'} a ${i.to ?? 'hoy'}` : null,
    `Sucursal: ${sucursales.length ? sucursales.join(', ') : 'todas las autorizadas'}`,
    i.categoryNames?.length ? `Categorias: ${i.categoryNames.join(', ')}` : null,
    i.productNames?.length ? `Productos: ${i.productNames.join(', ')}` : null,
    i.channel ? `Canal: ${CANALES[i.channel] ?? i.channel}` : null,
    i.months ? `Meses: ${i.months}` : null,
  ].filter((f): f is string => Boolean(f));
  return {
    ...base,
    estado: 'OK',
    explicacion: i.explanation,
    filtros,
    columnas: v.table.columns.map((c) => ({ clave: c.key, titulo: c.label, formato: c.format })),
    filas: v.table.rows,
    grafico: {
      tipo: TIPO_GRAFICO[v.chart.type] ?? 'tabla',
      titulo: v.chart.title,
      x: v.chart.x ?? null,
      series: v.chart.y.map((s) => ({ clave: s.key, titulo: s.label })),
      motivo: v.chart.reason,
    },
  };
}

const numero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
const dinero = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatoCelda(valor: Celda | undefined, formato: FormatoColumna): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  if (typeof valor !== 'number') return String(valor);
  if (formato === 'money') return `Bs ${dinero.format(valor)}`;
  if (formato === 'percent') return `${numero.format(valor)}%`;
  return numero.format(valor);
}

export interface BarraGrafico {
  etiqueta: string;
  valores: Array<{ serie: string; valor: number; proporcion: number }>;
}
export interface DatosGrafico {
  tipo: 'barras' | 'columnas' | 'proporcion' | 'tabla';
  barras: BarraGrafico[];
  /** Participaciones para el tipo `proporcion` (suman 100). */
  partes: Array<{ etiqueta: string; valor: number; porcentaje: number }>;
  series: Array<{ clave: string; titulo: string }>;
  formato: FormatoColumna;
  /** Filas que no entran en el grafico (se ven en la tabla). */
  omitidas: number;
}

const valorNumerico = (v: Celda | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Prepara el grafico para dibujarlo con Views. Las proporciones son relativas al mayor valor
 * de todas las series (barras comparables entre si). Se limitan las filas para que entren en
 * pantalla; las demas siguen en la tabla.
 */
export function datosGrafico(r: Extract<ReporteMovil, { estado: 'OK' }>, maxFilas = 12): DatosGrafico {
  const g = r.grafico;
  const formato = r.columnas.find((c) => c.clave === g.series[0]?.clave)?.formato ?? 'number';
  const vacio = { tipo: 'tabla' as const, barras: [], partes: [], series: g.series, formato, omitidas: 0 };
  if (g.tipo === 'tabla' || !g.x || !g.series.length || !r.filas.length) return vacio;
  const x = g.x;
  // Series temporales: las ultimas semanas o meses son las relevantes.
  const filas = g.tipo === 'columnas' ? r.filas.slice(-maxFilas) : r.filas.slice(0, maxFilas);
  const omitidas = r.filas.length - filas.length;
  const etiqueta = (f: Record<string, Celda>) => {
    const v = f[x];
    return v === null || v === undefined ? '-' : String(v);
  };
  if (g.tipo === 'proporcion') {
    const clave = g.series[0]!.clave;
    const total = r.filas.reduce((s, f) => s + Math.max(0, valorNumerico(f[clave])), 0);
    const partes = r.filas.map((f) => ({
      etiqueta: etiqueta(f),
      valor: valorNumerico(f[clave]),
      porcentaje: total ? Math.round((1000 * Math.max(0, valorNumerico(f[clave]))) / total) / 10 : 0,
    }));
    return { tipo: 'proporcion', barras: [], partes, series: g.series, formato, omitidas: 0 };
  }
  const maximo = Math.max(0, ...filas.flatMap((f) => g.series.map((s) => valorNumerico(f[s.clave]))));
  const barras = filas.map((f) => ({
    etiqueta: etiqueta(f),
    valores: g.series.map((s) => {
      const valor = valorNumerico(f[s.clave]);
      return { serie: s.titulo, valor, proporcion: maximo > 0 ? Math.max(0, valor) / maximo : 0 };
    }),
  }));
  return { tipo: g.tipo, barras, partes: [], series: g.series, formato, omitidas };
}

/** CSV (separador `;`, como Excel en espanol) para compartir desde el telefono. */
export function aCsv(r: Extract<ReporteMovil, { estado: 'OK' }>): string {
  const celda = (v: Celda | undefined) => {
    const texto = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = [
    `# ${r.grafico.titulo}`,
    `# Solicitud: ${r.pregunta}`,
    `# ${r.explicacion}`,
    r.columnas.map((c) => celda(c.titulo)).join(';'),
    ...r.filas.map((f) => r.columnas.map((c) => celda(f[c.clave])).join(';')),
  ];
  return lineas.join('\n');
}

export const EJEMPLOS_REPORTE = [
  'Ventas por sucursal de este mes',
  'Ventas por semana de los ultimos 60 dias',
  'Top 5 prendas mas vendidas este mes',
  'Categorias con mayores ingresos del mes pasado',
  'Compara las sucursales en los ultimos 3 meses',
  'Productos con menor existencia',
];
