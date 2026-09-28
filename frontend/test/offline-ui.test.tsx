import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import PaginaOffline from '../src/features/pos/PaginaOffline';
import { prepararOffline, leerOffline } from '../src/lib/offline';
import { adaptarUsuario } from '../src/api/auth.contratos';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { lote, instalarLocks } from './offline-fixtures';
import { respuesta, usuarioBackend } from './fixtures';
import { venta } from './pos-fixtures';
let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
beforeEach(async () => {
  localStorage.clear();
  guardarToken('offline-ui');
  instalarLocks();
  instancia.defaults.adapter = async (c) => respuesta(c, lote());
  await prepararOffline(adaptarUsuario(usuarioBackend), 1);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter>
              <PaginaOffline />
            </MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
function button(text: string) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
}
it('reloads a prepared session offline, records cash once and synchronizes on reconnect without losing its ticket', async () => {
  let requests = 0;
  instancia.defaults.adapter = async (c) => {
    requests++;
    if (c.url === '/auth/me') return respuesta(c, usuarioBackend);
    return respuesta(c, { ...venta, total: 80 });
  };
  await render();
  expect(document.body.textContent).toContain('Sin internet');
  expect(requests).toBe(0);
  await act(async () => document.querySelector<HTMLButtonElement>('.fs-pos__item')!.click());
  await act(async () => {
    const input = document.getElementById('efectivo-offline') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '100');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    button('Cobrar y guardar ticket local').click();
    button('Cobrar y guardar ticket local').click();
  });
  expect(leerOffline(12)!.tickets).toHaveLength(1);
  expect(document.body.textContent).toContain('Ticket local:');
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(document.body.textContent).toContain('1 tickets pendientes');
  expect(requests).toBe(0);
  await act(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(leerOffline(12)!.tickets[0].venta?.id_venta).toBe(71);
  expect(document.body.textContent).toContain('0 tickets pendientes');
});
