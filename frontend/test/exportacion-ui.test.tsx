import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BotonesExportar } from '../src/features/reports/BotonesExportar';
import { guardarToken } from '../src/api/sesion';
import type { DocumentoReporte } from '../src/features/reports/modelo-exportacion';
const mocks = vi.hoisted(() => ({ prepararArchivo: vi.fn(), descargarArchivo: vi.fn() }));
vi.mock('../src/features/reports/archivo-exportacion', () => mocks);
let root: Root;
let container: HTMLDivElement;
const doc: DocumentoReporte = {
  titulo: 'Reporte',
  contexto: [],
  tablas: [],
  generado: new Date('2026-09-25T12:00:00Z'),
};
beforeEach(() => {
  guardarToken('original');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.prepararArchivo.mockResolvedValue(new Blob(['archivo']));
  mocks.descargarArchivo.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});
const esperar = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
};
it('descarga PDF y Excel con nombre y bloquea un doble clic durante la carga', async () => {
  let resolver!: (d: DocumentoReporte) => void;
  const cargar = vi.fn(
    () =>
      new Promise<DocumentoReporte>((resolve) => {
        resolver = resolve;
      }),
  );
  await act(async () => root.render(<BotonesExportar cargar={cargar} />));
  const [pdf, excel] = [...container.querySelectorAll('button')];
  await act(async () => {
    pdf.click();
    pdf.click();
  });
  expect(cargar).toHaveBeenCalledTimes(1);
  expect(pdf.disabled).toBe(true);
  expect(excel.disabled).toBe(true);
  await act(async () => resolver(doc));
  await esperar();
  expect(mocks.prepararArchivo).toHaveBeenCalledWith(doc, 'pdf');
  expect(mocks.descargarArchivo).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.pdf$/));
  await act(async () => excel.click());
  await act(async () => resolver(doc));
  await esperar();
  expect(mocks.prepararArchivo).toHaveBeenLastCalledWith(doc, 'xlsx');
  expect(mocks.descargarArchivo).toHaveBeenLastCalledWith(expect.any(Blob), expect.stringMatching(/\.xlsx$/));
});
it('muestra errores sin descargar y permite reintentar', async () => {
  const cargar = vi.fn().mockRejectedValueOnce(new Error('Falló una página')).mockResolvedValue(doc);
  await act(async () => root.render(<BotonesExportar cargar={cargar} />));
  await act(async () => container.querySelector('button')!.click());
  await esperar();
  expect(container.textContent).toContain('Falló una página');
  expect(mocks.descargarArchivo).not.toHaveBeenCalled();
  await act(async () => container.querySelector('button')!.click());
  await esperar();
  expect(mocks.descargarArchivo).toHaveBeenCalledTimes(1);
});
it('no descarga si cambia la sesión durante la generación', async () => {
  mocks.prepararArchivo.mockImplementationOnce(async () => {
    guardarToken('otra');
    return new Blob();
  });
  await act(async () => root.render(<BotonesExportar cargar={async () => doc} />));
  await act(async () => container.querySelector('button')!.click());
  await esperar();
  expect(mocks.descargarArchivo).not.toHaveBeenCalled();
  expect(container.textContent).toContain('sesión cambió');
});
