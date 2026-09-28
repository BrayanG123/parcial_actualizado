import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorFotos } from '../src/features/admin/EditorFotos';
import { GaleriaProducto } from '../src/features/catalog/GaleriaProducto';
import { subirImagen } from '../src/services/imagenes.service';

vi.mock('../src/services/imagenes.service', () => ({ subirImagen: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
const a = 'https://example.test/a.png';
const b = 'https://example.test/b.png';
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('fotos del producto', () => {
  it('changes the main image when selecting another photo', async () => {
    await act(async () => root.render(<GaleriaProducto fotos={[a, b]} nombre="Camisa" />));
    expect(container.querySelector('img')!.src).toBe(a);
    await act(async () =>
      (container.querySelector('[aria-label="Ver foto 2"]') as HTMLButtonElement).click(),
    );
    expect(container.querySelector('img')!.src).toBe(b);
  });
  function Editor() {
    const [fotos, setFotos] = useState([a, b]);
    const [busy, setBusy] = useState(false);
    return (
      <>
        <EditorFotos fotos={fotos} disabled={false} onChange={setFotos} onBusy={setBusy} />
        <output>{JSON.stringify({ fotos, busy })}</output>
      </>
    );
  }
  it('reorders the main photo and removes references without deleting remote assets', async () => {
    await act(async () => root.render(<Editor />));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((el) => el.textContent === 'Hacer principal')!
        .click(),
    );
    expect(JSON.parse(container.querySelector('output')!.textContent!).fotos).toEqual([b, a]);
    await act(async () =>
      (container.querySelector('[aria-label="Quitar foto 1"]') as HTMLButtonElement).click(),
    );
    expect(JSON.parse(container.querySelector('output')!.textContent!).fotos).toEqual([a]);
  });
  it('keeps successful uploads if a later file fails and releases the form lock', async () => {
    const c = 'https://example.test/c.png';
    vi.mocked(subirImagen)
      .mockResolvedValueOnce(c)
      .mockRejectedValueOnce(new Error('Error de conexion'));
    await act(async () => root.render(<Editor />));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [
        new File(['c'], 'c.png', { type: 'image/png' }),
        new File(['d'], 'd.png', { type: 'image/png' }),
      ],
    });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(JSON.parse(container.querySelector('output')!.textContent!)).toEqual({
      fotos: [a, b, c],
      busy: false,
    });
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Error de conexion');
  });
});
