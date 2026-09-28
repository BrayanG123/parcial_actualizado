// @vitest-environment node
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generarPdf, generarExcel } from '../src/features/reports/archivo-exportacion';
import {
  tablasInventario,
  tablasVentas,
  type DocumentoReporte,
} from '../src/features/reports/modelo-exportacion';

const doc: DocumentoReporte = {
  titulo: 'Reportes de FashionStore',
  generado: new Date('2026-09-25T12:00:00Z'),
  contexto: [
    ['Sucursal', 'La Paz'],
    ['Período', '2026-09-01 a 2026-09-25'],
    ['Inventario', 'Todas las variantes'],
  ],
  tablas: [
    ...tablasVentas({
      desde: '2026-09-01',
      hasta: '2026-09-25',
      moneda: 'BOB',
      otras_monedas: ['USD'],
      resumen: { cantidad_ventas: 2, unidades_vendidas: 3, monto_total: 1234.5, ticket_promedio: 617.25 },
      diario: [{ periodo: '2026-09-01', cantidad: 2, total: 1234.5 }],
      por_hora: [],
      por_canal: [],
      por_sucursal: [{ id_sucursal: 2, sucursal: 'La Paz', cantidad: 2, unidades: 3, total: 1234.5 }],
    }),
    ...tablasInventario({
      resumen: {
        variantes: 80,
        fisico: 320,
        reservado: 80,
        disponible: 240,
        entrante: 0,
        stock_bajo: 80,
        agotados: 0,
      },
      por_sucursal: [],
      page: 1,
      page_size: 100,
      total: 80,
      paginas: 1,
      items: Array.from({ length: 80 }, (_, i) => ({
        id_inventario: i + 1,
        id_sucursal: 2,
        sucursal: 'Sucursal La Paz Centro',
        sucursal_activa: true,
        id_producto: i + 1,
        producto:
          i === 0
            ? '=HYPERLINK("https://example.invalid")'
            : 'Camisa de algodón - edición especial con nombre largo ' + (i + 1),
        producto_activo: true,
        talla: 'XL',
        color: 'Azul petróleo',
        fisico: 4,
        reservado: 1,
        disponible: 3,
        entrante: 0,
        stock_bajo: true,
      })),
    }),
  ],
};
describe('archivos exportados reales', () => {
  it('genera XLSX con números, fechas, filtros, texto seguro y todas las filas', async () => {
    const bytes = await generarExcel(doc);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as never);
    const resumen = book.getWorksheet('Resumen ventas')!;
    expect(resumen.getCell('C5').value).toBe(1234.5);
    expect(resumen.getCell('C5').numFmt).toBe('#,##0.00');
    expect(book.getWorksheet('Ventas diarias')!.getCell('A5').value).toEqual(
      new Date('2026-09-01T00:00:00Z'),
    );
    const inventario = book.getWorksheet('Detalle inventario')!;
    expect(inventario.rowCount).toBe(84);
    expect(inventario.getCell('C5').type).toBe(ExcelJS.ValueType.String);
    expect(inventario.getCell('C5').value).toBe('=HYPERLINK("https://example.invalid")');
    expect(inventario.getCell('A84').value).toBe(80);
    expect(inventario.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    expect(inventario.autoFilter).toBeTruthy();
    if (process.env.REPORT_EXPORT_QA_DIR) {
      await mkdir(process.env.REPORT_EXPORT_QA_DIR, { recursive: true });
      await writeFile(join(process.env.REPORT_EXPORT_QA_DIR, 'reporte.xlsx'), bytes);
    }
  });
  it('genera PDF multipágina con tablas extensas', async () => {
    const bytes = await generarPdf(doc);
    const contenido = Buffer.from(bytes).toString('latin1');
    expect(contenido.startsWith('%PDF-')).toBe(true);
    expect((contenido.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(3);
    if (process.env.REPORT_EXPORT_QA_DIR) {
      await mkdir(process.env.REPORT_EXPORT_QA_DIR, { recursive: true });
      await writeFile(join(process.env.REPORT_EXPORT_QA_DIR, 'reporte.pdf'), bytes);
    }
  });
});
