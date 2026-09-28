import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { useAgregarAlCarrito } from '../src/hooks/useComercio';
import { carrito } from './operaciones-fixtures';
import { respuesta } from './fixtures';
let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let agregar: ReturnType<typeof useAgregarAlCarrito>;
function Probe() {
  const mutation = useAgregarAlCarrito();
  useEffect(() => {
    agregar = mutation;
  });
  return null;
}
beforeEach(async () => {
  guardarToken('cliente-a');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
});
const linea = { id_producto: 1, id_talla: 9, id_color: 10, cantidad: 1 };
it('una lectura antigua no sobrescribe el carrito actualizado', async () => {
  let completarLectura!: (data: unknown) => void;
  const lectura = qc
    .fetchQuery({
      queryKey: ['carrito'],
      queryFn: () =>
        new Promise((resolve) => {
          completarLectura = resolve;
        }),
    })
    .catch(() => undefined);
  instancia.defaults.adapter = async (c) => respuesta(c, carrito);
  await act(async () => {
    await agregar.mutateAsync(linea);
  });
  completarLectura({ detalles: [], total: 0 });
  await lectura;
  expect(qc.getQueryData(['carrito'])).toMatchObject({ total: 160 });
});
it('serializa cambios y descarta la respuesta y la operacion en cola si cambia la cuenta', async () => {
  let terminar!: () => void;
  let primera!: Promise<unknown>;
  let segunda!: Promise<unknown>;
  const adapter = vi.fn(
    (c) =>
      new Promise<ReturnType<typeof respuesta>>((resolve) => {
        terminar = () => resolve(respuesta(c, carrito));
      }),
  );
  instancia.defaults.adapter = adapter;
  await act(async () => {
    primera = agregar.mutateAsync(linea);
    segunda = agregar.mutateAsync(linea).catch((e: unknown) => e);
    await Promise.resolve();
  });
  expect(adapter).toHaveBeenCalledTimes(1);
  guardarToken('cliente-b');
  qc.removeQueries({ queryKey: ['carrito'] });
  await act(async () => {
    terminar();
    await primera;
  });
  expect(await segunda).toMatchObject({ status: 409 });
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(qc.getQueryData(['carrito'])).toBeUndefined();
});
