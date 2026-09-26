import { etiqueta } from '../../lib/format';
import type {
  ReporteVentas,
  ReporteCaja,
  ReporteInventario,
  TopProducto,
  ConteoPorEstado,
} from '../../types/reportes';

export type CeldaReporte = string | number | Date | null;
export interface ColumnaReporte {
  titulo: string;
  tipo?: 'numero' | 'dinero' | 'fecha' | 'fechaHora';
}
export interface TablaReporte {
  nombre: string;
  nota?: string;
  columnas: ColumnaReporte[];
  filas: CeldaReporte[][];
}
export interface DocumentoReporte {
  titulo: string;
  generado: Date;
  contexto: Array<[string, string]>;
  tablas: TablaReporte[];
}
const c = (titulo: string, tipo?: ColumnaReporte['tipo']): ColumnaReporte => ({ titulo, tipo });
const tabla = (
  nombre: string,
  columnas: ColumnaReporte[],
  filas: CeldaReporte[][],
  nota?: string,
): TablaReporte => ({ nombre, columnas, filas, nota });
const n = (titulo: string) => c(titulo, 'numero');
const dinero = (titulo: string) => c(titulo, 'dinero');
// Excel representa una fecha sin zona: se guarda la hora comercial de Bolivia.
const horaBolivia = (valor: string | null) =>
  valor ? new Date(new Date(valor).getTime() - 4 * 3600000) : null;

export function tablasVentas(v: ReporteVentas): TablaReporte[] {
  const importe = dinero('Importe (' + v.moneda + ')');
  const nota =
    'Solo ventas completadas. ' +
    (v.otras_monedas.length
      ? 'Otras monedas excluidas de estos importes: ' + v.otras_monedas.join(', ') + '.'
      : '');
  return [
    tabla(
      'Resumen ventas',
      [n('Ventas'), n('Unidades'), importe, dinero('Ticket promedio (' + v.moneda + ')')],
      [
        [
          v.resumen.cantidad_ventas,
          v.resumen.unidades_vendidas,
          v.resumen.monto_total,
          v.resumen.ticket_promedio,
        ],
      ],
      nota,
    ),
    tabla(
      'Ventas diarias',
      [c('Fecha', 'fecha'), n('Ventas'), importe],
      v.diario.map((r) => [new Date(r.periodo + 'T00:00:00Z'), r.cantidad, r.total]),
    ),
    tabla(
      'Ventas por hora',
      [n('Hora (Bolivia)'), n('Ventas'), importe],
      v.por_hora.map((r) => [r.hora, r.cantidad, r.total]),
    ),
    tabla(
      'Ventas por sucursal',
      [c('Sucursal'), n('Ventas'), n('Unidades'), importe],
      v.por_sucursal.map((r) => [r.sucursal, r.cantidad, r.unidades, r.total]),
    ),
    tabla(
      'Ventas por canal',
      [c('Canal'), n('Ventas'), importe],
      v.por_canal.map((r) => [etiqueta(r.canal), r.cantidad, r.total]),
    ),
  ];
}
export function tablasTop(top: TopProducto[]): TablaReporte[] {
  return [
    tabla(
      'Ranking de prendas',
      [
        n('Posición'),
        n('ID producto'),
        c('Producto'),
        n('Unidades'),
        n('Ventas'),
        c('Moneda'),
        dinero('Importe'),
      ],
      top.map((r) => [r.posicion, r.id_producto, r.nombre, r.unidades, r.ventas, r.moneda ?? 'BOB', r.total]),
      'Se conserva el límite del ranking solicitado; importes de la moneda principal del reporte.',
    ),
  ];
}
export function tablasReservas(reservas: ConteoPorEstado[]): TablaReporte[] {
  return [
    tabla(
      'Reservas por estado',
      [c('Estado'), n('Cantidad')],
      reservas.map((r) => [etiqueta(r.estado), r.cantidad]),
      'Por fecha de la cita. No depende del filtro de canal.',
    ),
  ];
}
export function tablasInventario(inv: ReporteInventario): TablaReporte[] {
  const columnas = [
    n('Variantes'),
    n('Físico'),
    n('Reservado'),
    n('Disponible'),
    n('Entrante'),
    n('Stock bajo'),
    n('Agotados'),
  ];
  const valores = (r: ReporteInventario['resumen']) => [
    r.variantes,
    r.fisico,
    r.reservado,
    r.disponible,
    r.entrante,
    r.stock_bajo,
    r.agotados,
  ];
  return [
    tabla(
      'Resumen inventario',
      columnas,
      [valores(inv.resumen)],
      'Stock actual. No depende del período ni del canal.',
    ),
    tabla(
      'Inventario por sucursal',
      [c('Sucursal'), ...columnas],
      inv.por_sucursal.map((r) => [r.sucursal, ...valores(r)]),
    ),
    tabla(
      'Detalle inventario',
      [
        n('ID'),
        c('Sucursal'),
        c('Producto'),
        c('Talla'),
        c('Color'),
        n('Físico'),
        n('Reservado'),
        n('Disponible'),
        n('Entrante'),
        c('Stock bajo'),
      ],
      inv.items.map((r) => [
        r.id_inventario,
        r.sucursal,
        r.producto,
        r.talla,
        r.color,
        r.fisico,
        r.reservado,
        r.disponible,
        r.entrante,
        r.stock_bajo ? 'Sí' : 'No',
      ]),
      'Incluye todas las páginas del filtro.',
    ),
  ];
}
export function tablasCaja(caja: ReporteCaja): TablaReporte[] {
  const m = caja.moneda;
  return [
    tabla(
      'Resumen caja',
      [
        n('Turnos'),
        n('Abiertos'),
        n('Ventas'),
        dinero('Total (' + m + ')'),
        dinero('Efectivo'),
        dinero('Tarjeta'),
        dinero('QR'),
        dinero('Transferencia'),
        dinero('Diferencia'),
        n('Con diferencia'),
      ],
      [
        [
          caja.resumen.turnos,
          caja.resumen.turnos_abiertos,
          caja.resumen.ventas,
          caja.resumen.total,
          caja.resumen.efectivo,
          caja.resumen.tarjeta,
          caja.resumen.qr,
          caja.resumen.transferencia,
          caja.resumen.diferencia,
          caja.resumen.turnos_con_diferencia,
        ],
      ],
      'Turnos abiertos en el período. Sin filtro de canal. Importes en ' + m + '.',
    ),
    tabla(
      'Cajas',
      [
        c('Caja'),
        c('Sucursal'),
        n('Turnos'),
        n('Ventas'),
        dinero('Efectivo'),
        dinero('Tarjeta'),
        dinero('QR'),
        dinero('Transferencia'),
        dinero('Total'),
        dinero('Diferencia'),
      ],
      caja.por_caja.map((r) => [
        r.caja,
        r.sucursal,
        r.turnos,
        r.ventas,
        r.efectivo,
        r.tarjeta,
        r.qr,
        r.transferencia,
        r.total,
        r.diferencia,
      ]),
      'Importes en ' + m + '.',
    ),
    tabla(
      'Turnos',
      [
        n('Turno'),
        c('Caja'),
        c('Sucursal'),
        c('Cajero'),
        c('Apertura (Bolivia)', 'fechaHora'),
        c('Cierre (Bolivia)', 'fechaHora'),
        c('Moneda'),
        n('Ventas'),
        dinero('Total'),
      ],
      caja.turnos.map((r) => [
        r.id_turno,
        r.caja,
        r.sucursal,
        r.cajero,
        horaBolivia(r.apertura),
        horaBolivia(r.cierre),
        r.moneda,
        r.ventas,
        r.total,
      ]),
      'Todos los turnos recibidos, incluidos los que no caben en la tabla de pantalla. Cierre vacío: turno abierto.',
    ),
    tabla(
      'Arqueo de turnos',
      [
        n('Turno'),
        c('Moneda'),
        dinero('Saldo inicial'),
        dinero('Efectivo'),
        dinero('Tarjeta'),
        dinero('QR'),
        dinero('Transferencia'),
        dinero('Esperado'),
        dinero('Contado'),
        dinero('Diferencia'),
      ],
      caja.turnos.map((r) => [
        r.id_turno,
        r.moneda,
        r.saldo_inicial,
        r.efectivo,
        r.tarjeta,
        r.qr,
        r.transferencia,
        r.efectivo_esperado,
        r.efectivo_contado,
        r.diferencia,
      ]),
      'Celdas vacías indican valores todavía no registrados; no equivalen a cero.',
    ),
  ];
}
