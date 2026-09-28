import type { CeldaReporte, ColumnaReporte, DocumentoReporte } from './modelo-exportacion';

const generado = (d: Date) =>
  new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
const texto = (valor: CeldaReporte, columna: ColumnaReporte): string => {
  if (valor == null) return '-';
  if (valor instanceof Date)
    return valor
      .toISOString()
      .slice(0, columna.tipo === 'fechaHora' ? 16 : 10)
      .replace('T', ' ');
  if (typeof valor === 'number')
    return new Intl.NumberFormat('es-BO', {
      minimumFractionDigits: columna.tipo === 'dinero' ? 2 : 0,
      maximumFractionDigits: columna.tipo === 'dinero' ? 2 : 2,
    }).format(valor);
  return valor;
};
export async function generarPdf(reporte: DocumentoReporte): Promise<Uint8Array> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', compress: true });
  doc.setProperties({ title: reporte.titulo, author: 'FashionStore' });
  doc.setFontSize(20);
  doc.setTextColor('#8c2f39');
  doc.text(reporte.titulo, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor('#4a4644');
  doc.text('Generado: ' + generado(reporte.generado) + ' (Bolivia)', 14, 28);
  autoTable(doc, {
    startY: 35,
    head: [['Filtro / contexto', 'Valor']],
    body: reporte.contexto,
    margin: { top: 18, bottom: 18, left: 14, right: 14 },
    styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: '#8c2f39' },
    columnStyles: { 0: { cellWidth: 55 } },
  });
  const finalTabla = () => (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = finalTabla() + 14;
  for (const tabla of reporte.tablas) {
    if (y + 32 + Math.min(3, Math.max(1, tabla.filas.length)) * 9 > 190) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(14);
    doc.setTextColor('#8c2f39');
    doc.text(tabla.nombre, 14, y);
    const nota = tabla.nota ? (doc.splitTextToSize(tabla.nota, 265) as string[]) : [];
    doc.setFontSize(9);
    doc.setTextColor('#4a4644');
    if (nota.length) doc.text(nota, 14, y + 7);
    autoTable(doc, {
      startY: y + 11 + nota.length * 4,
      head: [tabla.columnas.map((c) => c.titulo)],
      body: tabla.filas.length
        ? tabla.filas.map((fila) => fila.map((v, i) => texto(v, tabla.columnas[i])))
        : [[{ content: 'Sin datos para los filtros seleccionados.', colSpan: tabla.columnas.length }]],
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: '#8c2f39' },
      alternateRowStyles: { fillColor: '#faf7f3' },
      margin: { top: 20, bottom: 18, left: 14, right: 14 },
      rowPageBreak: 'avoid',
      columnStyles: Object.fromEntries(
        tabla.columnas.map((c, i) => [
          i,
          c.tipo === 'numero' || c.tipo === 'dinero' ? { halign: 'right' } : {},
        ]),
      ),
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setFontSize(11);
          doc.setTextColor('#8c2f39');
          doc.text(tabla.nombre + ' (continuación)', 14, 12);
        }
      },
    });
    y = finalTabla() + 14;
  }
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor('#7d7671');
    doc.text('FashionStore | ' + generado(reporte.generado), 14, 202);
    doc.text('Página ' + i + ' de ' + paginas, 283, 202, { align: 'right' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
export async function generarExcel(reporte: DocumentoReporte): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  libro.creator = 'FashionStore';
  libro.created = reporte.generado;
  const contexto = libro.addWorksheet('Contexto');
  contexto.columns = [{ width: 34 }, { width: 100 }];
  contexto.addRow([reporte.titulo]);
  contexto.mergeCells('A1:B1');
  contexto.addRow(['Generado (Bolivia)', generado(reporte.generado)]);
  contexto.addRows(reporte.contexto);
  contexto.eachRow((fila, index) => {
    fila.alignment = { vertical: 'top', wrapText: true };
    fila.height = Math.max(24, Math.ceil(String(fila.getCell(2).value ?? '').length / 95) * 16);
    if (index === 1) fila.font = { bold: true, size: 16, color: { argb: 'FF8C2F39' } };
    else fila.getCell(1).font = { bold: true };
  });
  for (const tabla of reporte.tablas) {
    const hoja = libro.addWorksheet(tabla.nombre.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 4 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    hoja.columns = tabla.columnas.map((col, i) => ({
      width: Math.min(
        48,
        Math.max(
          14,
          col.titulo.length + 2,
          ...tabla.filas
            .slice(0, 100)
            .map((r) => (r[i] instanceof Date ? 22 : String(r[i] ?? '').length + 2)),
        ),
      ),
      style: {
        numFmt:
          col.tipo === 'dinero'
            ? '#,##0.00'
            : col.tipo === 'numero'
              ? '#,##0'
              : col.tipo === 'fecha'
                ? 'yyyy-mm-dd'
                : col.tipo === 'fechaHora'
                  ? 'yyyy-mm-dd hh:mm'
                  : undefined,
      },
    }));
    hoja.addRow([tabla.nombre]);
    hoja.mergeCells(1, 1, 1, tabla.columnas.length);
    hoja.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF8C2F39' } };
    hoja.getRow(1).height = 28;
    hoja.addRow([tabla.nota ?? '']);
    hoja.mergeCells(2, 1, 2, tabla.columnas.length);
    hoja.getRow(2).alignment = { wrapText: true, vertical: 'top' };
    hoja.getRow(2).height = 34;
    hoja.addRow([]);
    const cabecera = hoja.addRow(tabla.columnas.map((c) => c.titulo));
    cabecera.height = 32;
    cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C2F39' } };
    cabecera.alignment = { wrapText: true, vertical: 'middle' };
    // Strings son celdas de texto, nunca objetos formula ni hipervinculos.
    for (const valores of tabla.filas) {
      const fila = hoja.addRow(valores);
      fila.alignment = { vertical: 'top', wrapText: true };
      fila.height = Math.max(
        22,
        ...valores.map(
          (v, i) =>
            Math.ceil(
              String(v instanceof Date ? '' : (v ?? '')).length / ((hoja.getColumn(i + 1).width ?? 14) - 2),
            ) *
              15 +
            6,
        ),
      );
      if (fila.number % 2) fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF7F3' } };
    }
    if (!tabla.filas.length) hoja.addRow(['Sin datos para los filtros seleccionados.']);
    else
      hoja.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: hoja.rowCount, column: tabla.columnas.length },
      };
    hoja.pageSetup.printTitlesRow = '1:4';
  }
  return new Uint8Array(await libro.xlsx.writeBuffer());
}
export async function prepararArchivo(reporte: DocumentoReporte, formato: 'pdf' | 'xlsx') {
  const bytes = formato === 'pdf' ? await generarPdf(reporte) : await generarExcel(reporte);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type:
      formato === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
export function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
