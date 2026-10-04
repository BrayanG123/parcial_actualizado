import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import PaginaNuevaReserva from '../src/features/reservations/PaginaNuevaReserva';
import PaginaMisReservas from '../src/features/reservations/PaginaMisReservas';
import PaginaReservasOperacion from '../src/features/reservations/PaginaReservasOperacion';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { adaptarProducto } from '../src/api/catalogo.contratos';
import { prenda, pagina, stock } from './catalogo-fixtures';
import { reserva } from './reservas-fixtures';
import { respuesta, rechazo, usuarioBackend } from './fixtures';
let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
beforeEach(() => {
  guardarToken('cliente');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
});
async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function montar(e: ReactNode, ruta: string | { pathname: string; state: unknown } = '/') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter initialEntries={[ruta]}>{e}</MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await esperar();
}
function botones(texto: string) {
  return [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === texto);
}
async function click(texto: string) {
  await act(async () => botones(texto)[0].click());
  await esperar();
}
async function select(id: string, valor: string) {
  await act(async () => {
    const e = document.getElementById(id) as HTMLSelectElement;
    e.value = valor;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function input(id: string, valor: string) {
  await act(async () => {
    const e = document.getElementById(id)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, valor);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function catalogo() {
  qc.setQueryData(
    ['sucursales'],
    [{ id_sucursal: 2, nombre: 'Centro', ciudad: 'La Paz', activa: true }],
  );
  qc.setQueryData(['productos', { page: 1, page_size: 6, id_sucursal: 2 }], {
    items: [adaptarProducto(prenda), adaptarProducto({ ...prenda, id: 2, name: 'Blusa' })],
    total: 2,
    page: 1,
    page_size: 6,
  });
  for (const id of [1, 2]) {
    qc.setQueryData(
      ['producto', id],
      adaptarProducto({ ...prenda, id, name: id === 1 ? 'Camisa' : 'Blusa' }),
    );
    qc.setQueryData(
      ['disponibilidad', { id_producto: id, id_sucursal: 2 }],
      [{ id_producto: id, id_sucursal: 2, id_talla: 9, id_color: 10, cantidad_disponible: 3 }],
    );
  }
}
async function agregar(nombre: string) {
  await click(nombre === 'Camisa' ? 'CamisaCamisas' : 'BlusaCamisas');
  await click('M');
  await click('Azul');
  await click('Agregar a la reserva');
}
describe('reservas en React', () => {
  it('conserva la preseleccion del catalogo en la primera sucursal y la valida alli', async () => {
    catalogo();
    instancia.defaults.adapter = async (c) => respuesta(c, usuarioBackend);
    await montar(<PaginaNuevaReserva />, { pathname: '/reservar',
      state: { id_producto: 1, id_talla: 9, id_color: 10, cantidad: 2 } });
    expect(botones('Agregar a la reserva')).toHaveLength(0);
    await select('sucursal-reserva', '2'); await esperar();
    expect(botones('Agregar a la reserva')[0].disabled).toBe(false);
    expect(botones('M')[0].className).toContain('fs-chip--activo');
    expect(botones('Azul')[0].className).toContain('fs-chip--activo');
  });
  it('una respuesta tardia de otra sucursal no vuelve a mostrar sus prendas', async () => {
    qc.setQueryData(['sucursales'], [2, 3].map((id) => ({
      id_sucursal: id, nombre: 'Sucursal ' + id, ciudad: 'La Paz', activa: true,
    })));
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => { liberar = resolve; });
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me') return respuesta(c, usuarioBackend);
      // La API filtra por stock de la sucursal (branchId + inStock).
      if (c.url === '/products') {
        expect(c.params).toMatchObject({ inStock: true });
        if (c.params.branchId === 2) await espera;
        return respuesta(c, pagina(c.params.branchId === 2 ? [prenda] : [{ ...prenda, id: 2, name: 'Blusa' }]));
      }
      expect(c.url).toBe('/inventory/availability');
      const id = c.params.branchId === 2 ? 1 : 2;
      return respuesta(c, pagina([{ ...stock, product: { id, name: id === 1 ? 'Camisa' : 'Blusa' } }]));
    };
    await montar(<PaginaNuevaReserva />);
    await select('sucursal-reserva', '2'); await esperar();
    expect(document.querySelectorAll('.fs-pos__item')).toHaveLength(0);
    await select('sucursal-reserva', '3'); await esperar();
    expect(document.querySelector('.fs-pos__resultados')?.textContent).toContain('Blusa');
    liberar(); await esperar();
    expect(document.querySelector('.fs-pos__resultados')?.textContent).not.toContain('CamisaCamisas');
    expect(document.querySelector('.fs-pos__resultados')?.textContent).toContain('Blusa');
  });

  it('filtra por sucursal antes de paginar y reinicia seleccion/pagina al cambiarla', async () => {
    qc.setQueryData(['sucursales'], [2, 3, 4].map((id) => ({
      id_sucursal: id, nombre: 'Sucursal ' + id, ciudad: 'La Paz', activa: true,
    })));
    const prendas = Array.from({ length: 8 }, (_, i) => ({ ...prenda, id: i + 1, name: 'Prenda ' + (i + 1) }));
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me') return respuesta(c, usuarioBackend);
      const conStock = (b: number) => (b === 2 ? [1, 2, 3, 4, 5, 6, 7] : b === 3 ? [8] : []);
      if (c.url === '/products') {
        // La API filtra por stock de la sucursal y pagina sobre el resultado.
        const lista = prendas.filter((p) => conStock(c.params.branchId).includes(p.id));
        const page = c.params.page ?? 1, limit = c.params.limit ?? 20;
        return respuesta(c, pagina(lista.slice((page - 1) * limit, page * limit), page, limit, lista.length));
      }
      if (c.url?.startsWith('/products/')) return respuesta(c, prendas[Number(c.url.split('/').pop()) - 1]);
      expect(c.url).toBe('/inventory/availability');
      const ids = conStock(c.params.branchId);
      return respuesta(c, pagina(ids.filter((id) => !c.params.productId || c.params.productId === id)
        .map((id) => ({ ...stock, product: { id, name: 'Prenda ' + id },
          branch: { ...stock.branch, id: c.params.branchId } }))));
    };
    await montar(<PaginaNuevaReserva />);
    expect(document.querySelectorAll('.fs-pos__item')).toHaveLength(0);
    await select('sucursal-reserva', '2'); await esperar();
    expect(document.querySelectorAll('.fs-pos__item')).toHaveLength(6);
    expect(document.querySelector('.fs-pos__resultados')?.textContent).not.toContain('Prenda 8');
    const siguiente = document.querySelector('button[aria-label="Pagina siguiente"]') as HTMLButtonElement
      || [...document.querySelectorAll('button')].find((b) => /siguiente/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!;
    await act(async () => siguiente.click()); await esperar();
    expect(document.querySelectorAll('.fs-pos__item')).toHaveLength(1);
    await act(async () => (document.querySelector('.fs-pos__item') as HTMLButtonElement).click()); await esperar();
    await select('sucursal-reserva', '3'); await esperar();
    expect(document.querySelector('.fs-pos__resultados')?.textContent).toContain('Prenda 8');
    expect(botones('Agregar a la reserva')).toHaveLength(0);
    await select('sucursal-reserva', '4'); await esperar();
    expect(document.querySelectorAll('.fs-pos__item')).toHaveLength(0);
    expect(document.body.textContent).toContain('No hay prendas disponibles en esta sucursal');
  });
  it('deshabilita variantes agotadas y limita la cantidad a la combinacion elegida', async () => {
    catalogo();
    qc.setQueryData(['producto', 1], adaptarProducto({ ...prenda,
      sizes: [...prenda.sizes, { id: 11, name: 'L' }],
      colors: [...prenda.colors, { id: 12, name: 'Rojo', hexCode: '#ff0000' }],
    }));
    qc.setQueryData(['disponibilidad', { id_producto: 1, id_sucursal: 2 }], [
      { id_producto: 1, id_sucursal: 2, id_talla: 9, id_color: 10, cantidad_disponible: 1 },
      { id_producto: 1, id_sucursal: 2, id_talla: 9, id_color: 12, cantidad_disponible: 0 },
      { id_producto: 1, id_sucursal: 3, id_talla: 11, id_color: 12, cantidad_disponible: 8 },
    ]);
    instancia.defaults.adapter = async (c) => respuesta(c, usuarioBackend);
    await montar(<PaginaNuevaReserva />);
    await select('sucursal-reserva', '2');
    await click('CamisaCamisas');
    expect(botones('L')[0].disabled).toBe(true);
    expect(botones('Azul')[0].disabled).toBe(true);
    await click('M');
    expect(botones('Rojo')[0].disabled).toBe(true);
    await click('Azul');
    expect(botones('+')[0].disabled).toBe(true);
    expect(botones('Agregar a la reserva')[0].disabled).toBe(false);
  });

  it('crea varias prendas, valida horario y fija la sucursal mientras hay seleccion', async () => {
    catalogo();
    vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    let envio: Record<string, unknown> | undefined;
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me') return respuesta(c, usuarioBackend);
      envio = JSON.parse(c.data);
      return respuesta(c, reserva);
    };
    await montar(<PaginaNuevaReserva />);
    await select('sucursal-reserva', '2');
    await agregar('Camisa');
    expect((document.getElementById('sucursal-reserva') as HTMLSelectElement).disabled).toBe(true);
    await agregar('Blusa');
    await input('horario', '2000-01-01T12:00');
    await click('Confirmar reserva');
    expect(document.body.textContent).toContain('fecha y hora futura');
    expect(envio).toBeUndefined();
    await input('horario', '2100-09-12T14:00');
    await click('Confirmar reserva');
    expect(envio).toMatchObject({
      branchId: 2,
      approximateTime: new Date('2100-09-12T14:00').toISOString(),
      items: [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 1 },
      ],
    });
  });
  it('no representa un fallo de disponibilidad como stock cero ni permite agregar', async () => {
    catalogo();
    qc.removeQueries({ queryKey: ['disponibilidad'] });
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me') return respuesta(c, usuarioBackend);
      throw rechazo(c, 503, 'Stock temporalmente no disponible');
    };
    await montar(<PaginaNuevaReserva />);
    await select('sucursal-reserva', '2');
    await click('CamisaCamisas');
    await click('M');
    await click('Azul');
    await esperar();
    expect(document.body.textContent).toContain('Stock temporalmente no disponible');
    expect(botones('Agregar a la reserva')[0].disabled).toBe(true);
  });
  it('mis reservas usa mine incluso con cuenta cliente/administrador, pagina y no cancela cliente presente', async () => {
    const paginas: number[] = [];
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me')
        return respuesta(c, {
          ...usuarioBackend,
          roles: [
            ...usuarioBackend.roles,
            { role: { id: 1, name: 'ADMINISTRATOR', description: null } },
          ],
        });
      expect(c.url).toBe('/reservations/mine');
      paginas.push(c.params.page);
      return respuesta(
        c,
        pagina(
          [reserva, { ...reserva, id: 60, status: 'CUSTOMER_PRESENT' }],
          c.params.page,
          10,
          12,
        ),
      );
    };
    await montar(<PaginaMisReservas />);
    expect(botones('Cancelar reserva')).toHaveLength(1);
    const siguiente = [...document.querySelectorAll('button')].find(
      (b) =>
        b.getAttribute('aria-label')?.includes('iguiente') || b.textContent?.includes('Siguiente'),
    )!;
    await act(async () => siguiente.click());
    await esperar();
    expect(paginas).toContain(2);
  });
  it('un 409 por vencimiento refresca reservas, stock y carrito', async () => {
    let vencida = false;
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me') return respuesta(c, usuarioBackend);
      if (c.method === 'patch') {
        vencida = true;
        throw rechazo(c, 409, 'The reservation expired and its stock was released');
      }
      return respuesta(c, pagina([{ ...reserva, status: vencida ? 'EXPIRED' : 'PENDING' }], 1, 10));
    };
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    await montar(<PaginaMisReservas />);
    await click('Cancelar reserva');
    await click('Si, cancelar');
    expect(document.body.textContent).toContain('Vencida');
    expect(botones('Cancelar reserva')).toHaveLength(0);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['carrito'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['disponibilidad'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['reserva'] });
  });
  it('la sucursal sigue las transiciones y distingue cerrar atencion de registrar una compra', async () => {
    let estado = 'READY';
    qc.setQueryData(['sucursales'], []);
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me')
        return respuesta(c, {
          ...usuarioBackend,
          roles: [{ role: { id: 1, name: 'ADMINISTRATOR', description: null } }],
        });
      if (c.method === 'patch') {
        estado = JSON.parse(c.data).status;
        expect(c.url).toBe('/reservations/50/status');
        return respuesta(c, { ...reserva, status: estado });
      }
      return respuesta(c, pagina([{ ...reserva, status: estado }], 1, 30));
    };
    await montar(<PaginaReservasOperacion />);
    expect(botones('Marcar vencida')).toHaveLength(0);
    expect(botones('Cancelar')).toHaveLength(1);
    await click('Cliente en tienda');
    await click('Actualizar');
    expect(estado).toBe('CUSTOMER_PRESENT');
    await click('Cerrar atencion');
    expect(document.body.textContent).toContain('no registra una venta ni un pago');
    await click('Actualizar');
    expect(estado).toBe('COMPLETED');
    expect(botones('Cerrar atencion')).toHaveLength(0);
  });
  it('no mezcla una reserva ajena destacada con el listado propio de una cuenta con varios roles', async () => {
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me') return respuesta(c, { ...usuarioBackend, roles: [...usuarioBackend.roles, { role: { id: 1, name: 'ADMINISTRATOR', description: null } }] });
      if (c.url === '/reservations/mine') return respuesta(c, pagina([], 1, 10));
      expect(c.url).toBe('/reservations/50'); return respuesta(c, { ...reserva, clientId: 99, client: { ...reserva.client, id: 99 } });
    };
    await montar(<PaginaMisReservas />, '/mis-reservas?destacada=50');
    expect(document.body.textContent).not.toContain('Reserva #50');
    expect(botones('Cancelar reserva')).toHaveLength(0);
  });

});
