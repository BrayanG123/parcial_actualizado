import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardarToken } from '../src/api/sesion';
import { reportesService } from '../src/services/reportes.service';
import {
  cargarReporteGeneral,
  cargarReporteIA,
  inventarioCompleto,
} from '../src/features/reports/datos-exportacion';
import { tablasCaja, tablasTop } from '../src/features/reports/modelo-exportacion';
import type { ReporteInventario, ReporteCaja } from '../src/types/reportes';
const fila = (id: number): ReporteInventario['items'][number] => ({
  id_inventario: id,
  id_producto: id,
  id_sucursal: 2,
  sucursal: 'Centro',
  sucursal_activa: true,
  producto: 'Camisa',
  producto_activo: true,
  talla: 'M',
  color: 'Azul',
  fisico: 5,
  reservado: 1,
  disponible: 4,
  entrante: 0,
  stock_bajo: true,
});
const pagina = (page: number): ReporteInventario => ({
  resumen: {
    variantes: 101,
    fisico: 505,
    reservado: 101,
    disponible: 404,
    entrante: 0,
    stock_bajo: 101,
    agotados: 0,
  },
  por_sucursal: [],
  page,
  page_size: 100,
  total: 101,
  paginas: 2,
  items: page === 1 ? Array.from({ length: 100 }, (_, i) => fila(i + 1)) : [fila(101)],
});
afterEach(() => {
  vi.restoreAllMocks();
  guardarToken(null);
});
describe('carga de reportes para exportar', () => {
  it('exporta el conjunto con los filtros capturados y ranking limitado a ocho', async () => {
    const filtros = { desde: '2026-09-01', hasta: '2026-09-25', id_sucursal: 2, canal: 'WEB' as const };
    const ventas = vi.spyOn(reportesService, 'ventas').mockResolvedValue({
      desde: filtros.desde,
      hasta: filtros.hasta,
      moneda: 'BOB',
      otras_monedas: [],
      resumen: { cantidad_ventas: 0, unidades_vendidas: 0, monto_total: 0, ticket_promedio: 0 },
      diario: [],
      por_hora: [],
      por_canal: [],
      por_sucursal: [],
    });
    const top = vi.spyOn(reportesService, 'topProductos').mockResolvedValue([]);
    vi.spyOn(reportesService, 'reservasPorEstado').mockResolvedValue([]);
    vi.spyOn(reportesService, 'caja').mockResolvedValue({
      desde: filtros.desde,
      hasta: filtros.hasta,
      moneda: 'BOB',
      por_caja: [],
      turnos: [],
      resumen: {
        turnos: 0,
        turnos_abiertos: 0,
        ventas: 0,
        efectivo: 0,
        tarjeta: 0,
        qr: 0,
        transferencia: 0,
        total: 0,
        diferencia: 0,
        turnos_con_diferencia: 0,
      },
    });
    vi.spyOn(reportesService, 'inventario').mockResolvedValue({
      ...pagina(1),
      items: [],
      total: 0,
      paginas: 0,
    });
    const doc = await cargarReporteGeneral(
      filtros,
      { id_sucursal: 2, umbral: 3, solo_stock_bajo: true },
      'Centro',
    );
    expect(ventas).toHaveBeenCalledWith(filtros);
    expect(top).toHaveBeenCalledWith({ ...filtros, limite: 8 });
    expect(doc.contexto).toContainEqual(['Sucursal', 'Centro']);
    expect(doc.contexto).toContainEqual(['Umbral de stock bajo', '3']);
    expect(doc.tablas).toHaveLength(14);
  });

  it('recorre todas las páginas conservando filtros', async () => {
    const mock = vi.spyOn(reportesService, 'inventario').mockImplementation(async (f) => pagina(f!.page!));
    const reporte = await inventarioCompleto({ id_sucursal: 2, umbral: 3, solo_stock_bajo: true, page: 5 });
    expect(reporte.items).toHaveLength(101);
    expect(mock).toHaveBeenNthCalledWith(2, {
      id_sucursal: 2,
      umbral: 3,
      solo_stock_bajo: true,
      page: 2,
      page_size: 100,
    });
  });
  it('propaga fallos de una página y rechaza cambios de total o duplicados', async () => {
    const mock = vi
      .spyOn(reportesService, 'inventario')
      .mockResolvedValueOnce(pagina(1))
      .mockRejectedValueOnce(new Error('Sin conexión'));
    await expect(inventarioCompleto({})).rejects.toThrow('Sin conexión');
    mock.mockResolvedValueOnce(pagina(1)).mockResolvedValueOnce({ ...pagina(2), total: 102 });
    await expect(inventarioCompleto({})).rejects.toThrow('cambió');
    mock.mockResolvedValueOnce(pagina(1)).mockResolvedValueOnce({ ...pagina(2), items: [fila(1)] });
    await expect(inventarioCompleto({})).rejects.toThrow('cambió');
  });
  it('detiene paginación al cambiar la sesión', async () => {
    const mock = vi.spyOn(reportesService, 'inventario').mockImplementation(async () => {
      guardarToken('otra-cuenta');
      return pagina(1);
    });
    await expect(inventarioCompleto({})).rejects.toThrow('sesión cambió');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('IA conserva el umbral interpretado y exporta todo el inventario', async () => {
    const mock = vi.spyOn(reportesService, 'inventario').mockImplementation(async (f) => pagina(f!.page!));
    const doc = await cargarReporteIA({
      tipo: 'inventario',
      pregunta: 'stock bajo hasta tres',
      origen: 'rules',
      modelo: null,
      resumen: 'Resumen original',
      interpretacion: {
        desde: null,
        hasta: null,
        id_sucursal: 2,
        sucursal: 'Centro',
        canal: null,
        limite: 20,
        solo_stock_bajo: true,
        umbral_stock_bajo: 3,
        explicacion: 'Stock',
      },
      inventario: pagina(1),
    });
    expect(mock).toHaveBeenCalledWith({
      id_sucursal: 2,
      solo_stock_bajo: true,
      umbral: 3,
      page: 1,
      page_size: 100,
    });
    expect(doc.tablas.find((t) => t.nombre === 'Detalle inventario')!.filas).toHaveLength(101);
  });
  it('ranking conserva moneda y arqueo conserva nulos y todos los turnos', () => {
    expect(
      tablasTop([
        { id_producto: 1, nombre: 'Camisa', moneda: 'USD', total: 50, ventas: 1, unidades: 1, posicion: 1 },
      ])[0].filas[0],
    ).toContain('USD');
    const reporte: ReporteCaja = {
      desde: '2026-09-01',
      hasta: '2026-09-25',
      moneda: 'BOB',
      resumen: {
        turnos: 25,
        turnos_abiertos: 25,
        ventas: 0,
        total: 0,
        efectivo: 0,
        tarjeta: 0,
        qr: 0,
        transferencia: 0,
        diferencia: 0,
        turnos_con_diferencia: 0,
      },
      por_caja: [],
      turnos: Array.from({ length: 25 }, (_, i) => ({
        id_turno: i + 1,
        caja: 'Caja',
        sucursal: 'Centro',
        cajero: 'Cajero',
        apertura: '2026-09-25T12:00:00Z',
        cierre: null,
        moneda: 'BOB',
        saldo_inicial: 100,
        efectivo: 0,
        tarjeta: 0,
        qr: 0,
        transferencia: 0,
        total: 0,
        ventas: 0,
        efectivo_esperado: 100,
        efectivo_contado: null,
        diferencia: null,
      })),
    };
    const tablas = tablasCaja(reporte);
    expect(tablas[2].filas).toHaveLength(25);
    expect(tablas[2].filas[0][4]).toEqual(new Date('2026-09-25T08:00:00Z'));
    expect(tablas[3].filas[0].slice(-2)).toEqual([null, null]);
  });
});
