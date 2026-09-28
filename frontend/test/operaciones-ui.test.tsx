import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import { ModalMovimiento } from '../src/features/inventory/ModalMovimiento';
import { ModalEntrada } from '../src/features/inventory/ModalEntrada';
import PaginaMovimientos from '../src/features/inventory/PaginaMovimientos';
import PaginaCarrito from '../src/features/cart/PaginaCarrito';
import PaginaProducto from '../src/features/catalog/PaginaProducto';
import PaginaCheckout from '../src/features/checkout/PaginaCheckout';
import { adaptarInventario } from '../src/api/inventario.contratos';
import { adaptarCarrito } from '../src/api/carrito.contratos';
import { adaptarProducto } from '../src/api/catalogo.contratos';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { inventario, movimiento, carrito } from './operaciones-fixtures';
import { prenda, pagina } from './catalogo-fixtures';
import { respuesta, usuarioBackend } from './fixtures';

let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
beforeEach(() => {
  guardarToken(null);
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
async function montar(elemento: ReactNode, ruta = '/') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter initialEntries={[ruta]}>{elemento}</MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await esperar();
}
async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
function boton(texto: string) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
}
async function click(texto: string) {
  await act(async () => boton(texto).click());
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
    const proto =
      e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, valor);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('pantallas de inventario y carrito', () => {
  it('permite ajuste a cero con motivo y elimina liberaciones manuales de reservas', async () => {
    let fisico: number | undefined;
    const invalidar = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    instancia.defaults.adapter = async (c) => {
      fisico = JSON.parse(c.data).physicalQuantity;
      return respuesta(c, { inventory: inventario, movement: movimiento });
    };
    await montar(
      <ModalMovimiento
        inventario={adaptarInventario({ ...inventario, reservedQuantity: 0 })}
        onCerrar={() => {}}
      />,
    );
    expect(document.body.textContent).not.toContain('Liberar reserva');
    await select('tipo-movimiento', 'AJUSTE');
    await input('cantidad-movimiento', '0');
    await click('Registrar');
    expect(document.body.textContent).toContain('Explica el motivo');
    expect(fisico).toBeUndefined();
    await input('observacion-movimiento', 'Conteo fisico');
    await click('Registrar');
    expect(fisico).toBe(0);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['carrito'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['disponibilidad'] });
  });
  it('no permite reducir el stock por debajo de lo reservado', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    await montar(
      <ModalMovimiento inventario={adaptarInventario(inventario)} onCerrar={() => {}} />,
    );
    await select('tipo-movimiento', 'AJUSTE');
    await input('cantidad-movimiento', '0');
    await click('Registrar');
    expect(document.body.textContent).toContain('no puede ser menor');
    expect(adapter).not.toHaveBeenCalled();
  });
  it('permite crear inventario mediante recepcion de una variante y reinicia talla/color al cambiar producto', async () => {
    qc.setQueryData(['sucursales'], [{ id_sucursal: 2, nombre: 'Centro', activa: true }]);
    qc.setQueryData(['productos', { page: 1, page_size: 20 }], {
      items: [adaptarProducto(prenda), adaptarProducto({ ...prenda, id: 2, name: 'Otra' })],
      total: 2,
      page: 1,
      page_size: 20,
    });
    qc.setQueryData(['producto', 1], adaptarProducto(prenda));
    qc.setQueryData(['producto', 2], adaptarProducto({ ...prenda, id: 2 }));
    // El formulario respeta el rol: la sucursal del encargado viene de su perfil.
    guardarToken('admin-test');
    let dto: Record<string, unknown> | undefined;
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/auth/me')
        return respuesta(c, {
          ...usuarioBackend,
          roles: [{ role: { id: 1, name: 'ADMINISTRATOR', description: null } }],
        });
      dto = JSON.parse(c.data);
      return respuesta(c, { inventory: inventario, movement: movimiento });
    };
    vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    await montar(<ModalEntrada onCerrar={() => {}} />);
    expect((document.getElementById('entrada-sucursal') as HTMLSelectElement).disabled).toBe(false);
    await select('entrada-sucursal', '2');
    await select('entrada-producto', '1');
    await select('entrada-talla', '9');
    await select('entrada-color', '10');
    await select('entrada-producto', '2');
    expect((document.getElementById('entrada-talla') as HTMLSelectElement).value).toBe('');
    await select('entrada-talla', '9');
    await select('entrada-color', '10');
    await click('Registrar entrada');
    expect(dto).toMatchObject({
      productId: 2,
      branchId: 2,
      sizeId: 9,
      colorId: 10,
      status: 'COMPLETED',
      quantity: 1,
    });
  });
  it('confirma una entrada pendiente desde el historial y actualiza sus existencias', async () => {
    let recibida = false;
    instancia.defaults.adapter = async (c) => {
      if (c.method === 'post') {
        recibida = true;
        return respuesta(c, {
          inventory: { ...inventario, physicalQuantity: 9 },
          movement: { ...movimiento, status: 'COMPLETED' },
        });
      }
      if (c.url === '/inventory/20')
        return respuesta(c, { ...inventario, physicalQuantity: recibida ? 9 : 5 });
      return respuesta(c, pagina([{ ...movimiento, status: recibida ? 'COMPLETED' : 'PENDING' }]));
    };
    await montar(<PaginaMovimientos />, '/admin/movimientos?id_inventario=20');
    await click('Confirmar recepcion');
    expect(recibida).toBe(false);
    await click('Mercaderia recibida');
    expect(recibida).toBe(true);
    expect(document.body.textContent).toContain('Fisico: 9');
    expect(boton('Confirmar recepcion')).toBeUndefined();
  });
  it('muestra precios actualizados, faltantes y ausencia de una sucursal comun', async () => {
    qc.setQueryData(
      ['carrito'],
      adaptarCarrito({
        ...carrito,
        hasAvailability: false,
        availableBranches: [],
        items: [{ ...carrito.items[0], available: false, issue: 'INSUFFICIENT_STOCK' }],
      }),
    );
    await montar(<PaginaCarrito />);
    expect(document.body.textContent).toContain('El precio cambio');
    expect(document.body.textContent).toContain(
      'No hay una sucursal que pueda atender todo el carrito',
    );
    expect(document.body.textContent).toContain('Reduce la cantidad');
    expect(boton('Continuar con la compra').disabled).toBe(true);
  });
  it('limita cantidades por tienda sin sumar stock repartido entre sucursales', async () => {
    qc.setQueryData(['producto', 1], adaptarProducto(prenda));
    qc.setQueryData(
      ['disponibilidad', { id_producto: 1, id_talla: 9, id_color: 10 }],
      [{ cantidad_disponible: 1 }, { cantidad_disponible: 1 }],
    );
    await montar(
      <Routes>
        <Route path="/producto/:id" element={<PaginaProducto />} />
      </Routes>,
      '/producto/1',
    );
    await click('M');
    await click('Azul');
    expect(boton('+').disabled).toBe(true);
    expect(boton('Agregar al carrito').disabled).toBe(false);
  });
  it('el checkout requiere una sesion antes de consultar o crear pedidos', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    await montar(<PaginaCheckout />);
    expect(document.body.textContent).not.toContain('Confirmar compra');
    expect(adapter).not.toHaveBeenCalled();
  });
});
