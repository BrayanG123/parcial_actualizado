import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import PuntoVentaReal from '../src/features/pos/PuntoVentaReal';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { recuperarCobro, guardarCobro } from '../src/lib/pos';
import type { CobroPOS } from '../src/services/pos.service';
import { respuesta, rechazo, usuarioBackend } from './fixtures';
import { pagina, prenda, stock } from './catalogo-fixtures';
import { cobro, cotizacion, reservaPOS, venta } from './pos-fixtures';
import { turno } from './turnos-fixtures';

let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let enviados: Array<Record<string, unknown>>;
let modo: 'network' | 'conflict' | 'success';
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  guardarToken('admin-pos');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  enviados = [];
  modo = 'success';
  instancia.defaults.adapter = async (c) => {
    if (c.url === '/cash/shifts/current') return respuesta(c, turno);
    if (c.url === '/auth/me')
      return respuesta(c, {
        ...usuarioBackend,
        client: null,
        roles: [{ role: { id: 1, name: 'ADMINISTRATOR', description: null } }],
      });
    if (c.url === '/products' || c.url === '/inventory/availability')
      return respuesta(c, pagina([]));
    if (c.url === '/branches')
      return respuesta(
        c,
        pagina([
          { id: 2, name: 'Centro', city: 'La Paz', address: 'Centro', phone: null, active: true },
          { id: 3, name: 'Norte', city: 'La Paz', address: 'Norte', phone: null, active: true },
        ]),
      );
    if (c.url === '/sales/in-store/reservations/9') return respuesta(c, reservaPOS);
    if (c.url === '/sales/in-store/preview') {
      expect(JSON.parse(c.data)).toEqual({
        branchId: 2,
        clientId: 31,
        reservationId: 9,
        items: cobro.items,
      });
      return respuesta(c, cotizacion);
    }
    if (c.url === '/sales/in-store') {
      enviados.push(JSON.parse(c.data));
      if (modo === 'network') throw new Error('Conexion interrumpida');
      if (modo === 'conflict') throw rechazo(c, 409, 'Prices changed; review the current total');
      return respuesta(c, venta);
    }
    if (c.url === '/payments/pos/card-charges') {
      enviados.push(JSON.parse(c.data));
      return respuesta(c, venta);
    }
    if (c.url === '/sales/71/receipt')
      return respuesta(c, { ...venta, receiptNumber: 'FS-00000071' });
    throw new Error(`Unexpected request: ${c.url}`);
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
  vi.restoreAllMocks();
});
async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}
async function montar(ruta = '/caja?reserva=9&sucursal=2') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter initialEntries={[ruta]}>
              <PuntoVentaReal />
            </MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await esperar();
}
function boton(text: string, ultimo = false) {
  const todos = [...document.querySelectorAll('button')].filter(
    (b) => b.textContent?.trim() === text,
  );
  const b = ultimo ? todos.at(-1) : todos[0];
  expect(b, text).toBeDefined();
  return b!;
}
async function click(text: string, ultimo = false) {
  await act(async () => boton(text, ultimo).click());
  await esperar();
}
async function input(id: string, value: string) {
  await act(async () => {
    const el = document.getElementById(id) as HTMLInputElement;
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function revisarReservaParcial() {
  await montar();
  await click('Cargar');
  await act(async () =>
    (
      document.querySelector('[aria-label="Restar Camisa original M"]') as HTMLButtonElement
    ).click(),
  );
  await click('Cobrar');
}
describe('caja React real', () => {
  it('shows only the branch registers with "Abrir caja" until one is opened, then the sales tabs', async () => {
    const fallback = instancia.defaults.adapter as import('axios').AxiosAdapter;
    let actual: typeof turno | null = null;
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/cash/shifts/current') return respuesta(c, actual);
      if (c.url === '/cash/registers')
        return respuesta(c, [
          { id: 1, branchId: 2, name: 'Caja 1', occupied: false, cashier: null },
          { id: 2, branchId: 2, name: 'Caja 2', occupied: true, cashier: 'Luis' },
        ]);
      if (c.url === '/cash/shifts' && c.method === 'post') {
        expect(JSON.parse(c.data)).toMatchObject({
          registerId: 1,
          openingCash: 100,
          openingKey: expect.any(String),
        });
        actual = turno;
        return respuesta(c, actual);
      }
      return fallback(c);
    };
    await montar();
    await esperar();
    expect(document.body.textContent).toContain('CAJA-001');
    expect(document.body.textContent).toContain('En uso · Luis');
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Cobrar')).toBe(
      false,
    );
    const abrir = [...document.querySelectorAll('button')].filter(
      (b) => b.textContent === 'Abrir caja',
    );
    expect(abrir.map((b) => b.disabled)).toEqual([false, true]);
    await click('Abrir caja');
    await input('saldo-inicial', '100');
    await click('Abrir caja', true);
    expect(document.body.textContent).toContain('Punto de venta');
    expect(boton('Registrar ventas').getAttribute('aria-selected')).toBe('true');
    expect(boton('Historial de ventas')).toBeDefined();
    expect(boton('Cargar').disabled).toBe(false);
  });
  it('requires a reason for a cash shortage and retries the exact closing payload after a lost response', async () => {
    const fallback = instancia.defaults.adapter as import('axios').AxiosAdapter;
    let actual: typeof turno | null = turno;
    const requests: unknown[] = [];
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/cash/shifts/current') return respuesta(c, actual);
      if (c.url === '/cash/registers')
        return respuesta(c, [
          { id: 1, branchId: 2, name: 'Caja 1', occupied: false, cashier: null },
        ]);
      if (c.url === '/cash/shifts/1/close') {
        requests.push(JSON.parse(c.data));
        if (requests.length === 1) throw new Error('Respuesta perdida');
        actual = null;
        return respuesta(c, {
          ...turno,
          closedAt: '2026-09-12T20:00:00Z',
          countedCash: 250,
          difference: -10,
          closingNote: 'Faltante contado',
        });
      }
      return fallback(c);
    };
    await montar('/caja?sucursal=2');
    await click('Cerrar caja');
    await input('contado-caja', '250');
    await click('Confirmar cierre');
    expect(requests).toHaveLength(0);
    expect(document.body.textContent).toContain('explica el faltante');
    await input('nota-caja', 'Faltante contado');
    await click('Confirmar cierre');
    await click('Reintentar cierre');
    expect(requests).toEqual([
      { countedCash: 250, note: 'Faltante contado' },
      { countedCash: 250, note: 'Faltante contado' },
    ]);
    expect(document.body.textContent).toContain('Caja cerrada');
    expect(document.body.textContent).toContain('Faltante contado');
    expect(boton('Abrir caja')).toBeDefined();
  });
  it('builds a ticket from available variants, keeps it after leaving the caja and sends only identifiers to review', async () => {
    const fallback = instancia.defaults.adapter as import('axios').AxiosAdapter;
    let reviewed = false;
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/products') return respuesta(c, pagina([prenda]));
      if (c.url === '/products/1') return respuesta(c, prenda);
      if (c.url === '/inventory/availability')
        return respuesta(c, pagina([{ ...stock, availableQuantity: 1 }]));
      if (c.url === '/sales/in-store/preview') {
        expect(JSON.parse(c.data)).toEqual({
          branchId: 2,
          items: [{ productId: 1, sizeId: 9, colorId: 10, quantity: 1 }],
        });
        reviewed = true;
        return respuesta(c, {
          ...cotizacion,
          clientId: null,
          reservationId: null,
          total: 80,
          items: [{ ...cotizacion.items[0], quantity: 1, sizeId: 9, colorId: 10, subtotal: 80 }],
        });
      }
      return fallback(c);
    };
    await montar('/caja');
    const productButton = [...document.querySelectorAll('button')].find(
      (b) => b.querySelector('strong')?.textContent === 'Camisa',
    )!;
    await act(async () => productButton.click());
    await esperar();
    expect(boton('Agregar al ticket').disabled).toBe(true);
    await click('M');
    await click('Azul');
    await click('Agregar al ticket');
    expect(
      (document.querySelector('[aria-label="Sumar Camisa M"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    await click('Agregar al ticket');
    expect(document.body.textContent).toContain('No hay mas stock');
    // Salir de la caja y volver: el ticket sigue ahi.
    await act(async () => root.unmount());
    root = createRoot(container);
    await montar('/caja');
    expect(document.querySelector('[aria-label="Sumar Camisa M"]')).not.toBeNull();
    await click('Cobrar');
    expect(reviewed).toBe(true);
    expect(document.querySelector('[aria-label="Cobrar venta"]')).not.toBeNull();
  });
  it('validates cash, retains the exact request on network failure, shows the receipt and empties the ticket', async () => {
    const invalidar = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    await revisarReservaParcial();
    await input('recibido', '100');
    await click('Confirmar pago');
    expect(enviados).toHaveLength(0);
    expect(document.body.textContent).toContain('debe cubrir el total');
    await input('recibido', '200');
    modo = 'network';
    await click('Confirmar pago');
    expect(enviados).toHaveLength(1);
    expect(recuperarCobro(12)).toEqual(enviados[0]);
    expect(document.body.textContent).toContain('Cobro pendiente de confirmacion');
    modo = 'success';
    await click('Reintentar confirmacion');
    expect(enviados[1]).toEqual(enviados[0]);
    expect(recuperarCobro(12)).toBeNull();
    expect(document.body.textContent).toContain('FS-00000071');
    expect(document.body.textContent).toContain('Camisa original');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['reservas'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['disponibilidad'] });
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    await click('Imprimir comprobante');
    expect(imprimir).toHaveBeenCalledOnce();
    await click('Nueva venta');
    expect(document.body.textContent).toContain('Todavia no hay prendas');
    expect(Object.keys(localStorage).some((k) => k.startsWith('fs.pos.ticket'))).toBe(false);
  });
  it('requires the operation number for QR and returns to review when the backend rejects stale prices', async () => {
    await revisarReservaParcial();
    await click('QR');
    await click('Confirmar pago');
    expect(enviados).toHaveLength(0);
    expect(document.body.textContent).toContain('numero de operacion');
    await input('referencia-caja', '  QR-123  ');
    modo = 'conflict';
    await click('Confirmar pago');
    expect(enviados[0]).toMatchObject({
      paymentMethod: 'QR',
      paymentReference: 'QR-123',
      expectedTotal: 160,
    });
    expect(recuperarCobro(12)).toBeNull();
    expect(document.querySelector('[aria-label="Cobrar venta"]')).toBeNull();
    expect(boton('Cobrar').disabled).toBe(false);
  });
  it('restores a pending confirmation after remount and prevents a new ticket until resolved', async () => {
    guardarCobro(12, cobro);
    await montar();
    expect(document.body.textContent).toContain('Cobro pendiente de confirmacion');
    expect(document.querySelector('fieldset')!.disabled).toBe(true);
    await click('Reintentar confirmacion');
    expect(enviados).toEqual([cobro]);
    expect(recuperarCobro(12)).toBeNull();
  });
  it('retries an authorized card charge with its payment intent instead of a typed reference', async () => {
    const tarjeta: CobroPOS = { ...cobro, paymentMethod: 'CARD', paymentReference: 'pi_123' };
    guardarCobro(12, tarjeta);
    await montar();
    await click('Reintentar confirmacion');
    expect(enviados).toEqual([
      {
        branchId: cobro.branchId,
        clientId: cobro.clientId,
        reservationId: cobro.reservationId,
        items: cobro.items,
        shiftId: cobro.shiftId,
        idempotencyKey: cobro.idempotencyKey,
        expectedTotal: cobro.expectedTotal,
        paymentIntentId: 'pi_123',
      },
    ]);
    expect(recuperarCobro(12)).toBeNull();
  });
  it('keeps the open caja branch and blocks closing while the ticket has garments', async () => {
    await montar();
    await click('Cargar');
    expect(document.body.textContent).toContain('Reserva #9');
    expect(document.getElementById('sucursal-caja')).toBeNull();
    expect(document.body.textContent).toContain('Centro · Caja 1');
    expect(boton('Cerrar caja').disabled).toBe(true);
  });
});
