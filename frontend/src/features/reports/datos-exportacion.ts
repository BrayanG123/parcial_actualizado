import { revisionSesion } from '../../api/sesion';
import { etiqueta } from '../../lib/format';
import { reportesService } from '../../services/reportes.service';
import type { FiltroReporte, FiltroInventarioReporte } from '../../types/reportes';
import type { ReporteIA } from '../../types/ia';
import {
  tablasVentas,
  tablasTop,
  tablasReservas,
  tablasInventario,
  tablasCaja,
  type DocumentoReporte,
} from './modelo-exportacion';

export function verificarSesion(revision: number) {
  if (revision !== revisionSesion()) throw new Error('La sesión cambió. Vuelve a generar el reporte.');
}
export async function inventarioCompleto(filtro: FiltroInventarioReporte, revision = revisionSesion()) {
  verificarSesion(revision);
  const primero = await reportesService.inventario({ ...filtro, page: 1, page_size: 100 });
  verificarSesion(revision);
  const items = [...primero.items];
  const ids = new Set(items.map((i) => i.id_inventario));
  if (primero.page !== 1) throw new Error('No se pudo obtener el inventario completo.');
  for (let page = 2; page <= primero.paginas; page++) {
    verificarSesion(revision);
    const siguiente = await reportesService.inventario({ ...filtro, page, page_size: 100 });
    verificarSesion(revision);
    if (
      siguiente.page !== page ||
      siguiente.total !== primero.total ||
      siguiente.paginas !== primero.paginas ||
      siguiente.items.some((i) => ids.has(i.id_inventario))
    ) {
      throw new Error('El inventario cambió durante la exportación. Intenta nuevamente.');
    }
    siguiente.items.forEach((i) => ids.add(i.id_inventario));
    items.push(...siguiente.items);
  }
  if (items.length !== primero.total || ids.size !== items.length)
    throw new Error('No se pudo obtener el inventario completo. Intenta nuevamente.');
  return { ...primero, items };
}
export async function cargarReporteGeneral(
  filtros: FiltroReporte,
  inventario: FiltroInventarioReporte,
  sucursal: string,
): Promise<DocumentoReporte> {
  const revision = revisionSesion();
  const [ventas, top, reservas, caja, stock] = await Promise.all([
    reportesService.ventas(filtros),
    reportesService.topProductos({ ...filtros, limite: 8 }),
    reportesService.reservasPorEstado(filtros),
    reportesService.caja(filtros),
    inventarioCompleto(inventario, revision),
  ]);
  verificarSesion(revision);
  return {
    titulo: 'Reportes de FashionStore',
    generado: new Date(),
    contexto: [
      ['Período', ventas.desde + ' a ' + ventas.hasta],
      ['Zona horaria', 'America/La_Paz'],
      ['Sucursal', sucursal],
      ['Canal (ventas y ranking)', filtros.canal ? etiqueta(filtros.canal) : 'Todos'],
      ['Ranking', 'Primeras 8 prendas'],
      ['Inventario', inventario.solo_stock_bajo ? 'Solo stock bajo' : 'Todas las variantes'],
      ['Umbral de stock bajo', String(inventario.umbral ?? 5)],
      ['Alcance', 'Datos consultados al exportar. El inventario refleja stock actual.'],
    ],
    tablas: [
      ...tablasVentas(ventas),
      ...tablasTop(top),
      ...tablasReservas(reservas),
      ...tablasCaja(caja),
      ...tablasInventario(stock),
    ],
  };
}
export async function cargarReporteIA(reporte: ReporteIA): Promise<DocumentoReporte> {
  const i = reporte.interpretacion;
  let tablas;
  switch (reporte.tipo) {
    case 'ventas':
      tablas = tablasVentas(reporte.ventas);
      break;
    case 'top':
      tablas = tablasTop(reporte.top);
      break;
    case 'caja':
      tablas = tablasCaja(reporte.caja);
      break;
    case 'reservas':
      tablas = tablasReservas(reporte.reservas);
      break;
    case 'inventario':
      tablas = tablasInventario(
        await inventarioCompleto({
          id_sucursal: i.id_sucursal ?? undefined,
          solo_stock_bajo: i.solo_stock_bajo,
          umbral: i.umbral_stock_bajo ?? 5,
        }),
      );
      break;
  }
  return {
    titulo: 'Reporte de FashionStore - ' + etiqueta(reporte.tipo),
    generado: new Date(),
    contexto: [
      ['Solicitud', reporte.pregunta],
      ['Interpretación', i.explicacion],
      [
        'Período',
        reporte.tipo === 'inventario'
          ? 'Stock actual'
          : reporte.tipo === 'ventas'
            ? reporte.ventas.desde + ' a ' + reporte.ventas.hasta
            : reporte.tipo === 'caja'
              ? reporte.caja.desde + ' a ' + reporte.caja.hasta
              : (i.desde ?? 'Período predeterminado del servidor') + (i.hasta ? ' a ' + i.hasta : ''),
      ],
      ['Zona horaria', 'America/La_Paz'],
      ['Sucursal', i.sucursal ?? 'Todas las autorizadas'],
      ['Canal (ventas y ranking)', i.canal ? etiqueta(i.canal) : 'Todos'],
      ['Límite de ranking', String(i.limite ?? 10)],
      [
        'Inventario',
        (i.solo_stock_bajo ? 'Solo stock bajo' : 'Todas las variantes') +
          '; umbral ' +
          (i.umbral_stock_bajo ?? 5),
      ],
      ['Resumen generado', reporte.resumen],
      [
        'Alcance',
        reporte.tipo === 'inventario'
          ? 'Inventario completo actualizado al exportar; el resumen textual pertenece a la consulta original.'
          : 'Datos del resultado mostrado en pantalla.',
      ],
    ],
    tablas,
  };
}
