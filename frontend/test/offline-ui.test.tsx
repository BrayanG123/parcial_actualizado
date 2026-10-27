// Reescrita en F5: la caja offline usa IndexedDB y el contrato /sync/operations
// (el flujo por lote en localStorage quedo como legado y se migra al abrir la app).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import PaginaOffline from '../src/features/pos/PaginaOffline';
import { adaptarUsuario } from '../src/api/auth.contratos';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { guardarIdentidadOffline } from '../src/lib/offline-identidad';
import { guardarSnapshot, listarOperaciones } from '../src/offline/repositorio';
import { instalarLocks } from './offline-fixtures';
import { ALCANCE, limpiarDb, snapshot } from './offline-sync-fixtures';
import { respuesta, usuarioBackend } from './fixtures';

const cajero = {
  ...usuarioBackend,
  client: null,
  roles: [{ role: { id: 3, name: 'CASHIER' as const, description: null } }],
};
let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;

beforeEach(async () => {
  localStorage.clear();
  await limpiarDb();
  guardarToken('offline-ui');
  instalarLocks();
  // Sesion verificada al descargar: permite abrir la caja sin red.
  guardarIdentidadOffline(adaptarUsuario(cajero), new Date(Date.now() + 86_400_000).toISOString());
  await guardarSnapshot(snapshot({ alcance: ALCANCE.replace('fashionstore', 'default') , clave: `${ALCANCE.replace('fashionstore', 'default')}#2` }));
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

async function esperar(ms = 40) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
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
  await esperar();
}
const boton = (texto: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;

it('reabre sin red, guarda la venta una sola vez y la confirma al reconectar sin perderla', async () => {
  let peticiones = 0;
  instancia.defaults.adapter = async (c) => {
    peticiones++;
    if (c.url === '/sync/operations') {
      const body = JSON.parse(c.data);
      return respuesta(c, {
        results: body.operations.map((o: { operationId: string }) => ({
          operationId: o.operationId,
          status: 'CONFIRMED',
          resourceType: 'SALE',
          resourceId: 71,
          attempts: 1,
        })),
      });
    }
    return respuesta(c, cajero);
  };
  await render();
  expect(document.body.textContent).toContain('Sin internet');
  expect(document.body.textContent).toContain('Datos de Centro descargados');
  expect(peticiones).toBe(0);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Agregar Camisa M Azul"]')!.click());
  await act(async () => {
    const input = document.getElementById('efectivo-offline') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '100');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    boton('Cobrar y guardar venta local').click();
    boton('Cobrar y guardar venta local').click();
  });
  await esperar();
  const alcance = ALCANCE.replace('fashionstore', 'default');
  expect(await listarOperaciones(alcance)).toHaveLength(1);
  expect(document.body.textContent).toContain('Pendiente de confirmacion del servidor');
  expect(document.body.textContent).toContain('Cambio: Bs');

  // "Cerrar y abrir" la pagina: la venta sigue guardada.
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(document.body.textContent).toContain('Guardada localmente');
  expect(peticiones).toBe(0);

  await act(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await esperar(120);
  const [op] = await listarOperaciones(alcance);
  expect(op).toMatchObject({ estado: 'CONFIRMED', resultado: { recurso: { tipo: 'SALE', id: 71 } } });
  expect(document.body.textContent).toContain('Venta #71');
});
