import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { inventarioService } from '../src/services/inventario.service';
import { carritoService } from '../src/services/carrito.service';
import { TipoMovimiento } from '../src/types/domain';
import { inventario, movimiento, carrito } from './operaciones-fixtures';
import { pagina } from './catalogo-fixtures';
import { respuesta, rechazo } from './fixtures';
beforeEach(() => guardarToken('sesion-test'));

describe('inventario real', () => {
  it('adapta existencias y filtra busqueda/criticos despues de todas las paginas autorizadas', async () => {
    const paginas: number[] = [];
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/inventory');
      expect(c.params.branchId).toBe(2);
      expect(c.params.q).toBeUndefined();
      expect(c.params.solo_criticos).toBeUndefined();
      paginas.push(c.params.page);
      const data =
        c.params.page === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              ...inventario,
              id: i + 1,
              physicalQuantity: 10,
            }))
          : [{ ...inventario, id: 101 }];
      return respuesta(c, pagina(data, c.params.page, 100, 101));
    };
    const resultado = await inventarioService.listar({
      q: 'camisa',
      id_sucursal: 2,
      solo_criticos: true,
      page_size: 1,
    });
    expect(resultado).toMatchObject({
      total: 1,
      items: [
        {
          id_inventario: 101,
          cantidad_fisica: 5,
          cantidad_reservada: 2,
          id_talla: 9,
          id_color: 10,
        },
      ],
    });
    expect(paginas).toEqual([1, 2]);
  });
  it('mantiene paginacion del servidor sin filtros locales y propaga 403', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.params).toMatchObject({ page: 2, limit: 15, productId: 1 });
      return respuesta(c, pagina([inventario], 2, 15, 16));
    };
    expect(
      await inventarioService.listar({ id_producto: 1, page: 2, page_size: 15 }),
    ).toMatchObject({ total: 16, page: 2 });
    instancia.defaults.adapter = async (c) => {
      throw rechazo(c, 403, 'You can only access your assigned branch');
    };
    await expect(inventarioService.listar({ id_sucursal: 3 })).rejects.toMatchObject({
      status: 403,
    });
  });
  it('registra una entrada programada por variante sin aumentar stock local ficticio', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/inventory/entries');
      expect(c.method).toBe('post');
      expect(JSON.parse(c.data)).toEqual({
        branchId: 2,
        productId: 1,
        sizeId: 9,
        colorId: 10,
        quantity: 4,
        status: 'PENDING',
        scheduledAt: '2100-09-12T12:00:00Z',
        reference: 'OC-50',
      });
      return respuesta(c, { inventory: inventario, movement: movimiento });
    };
    expect(
      await inventarioService.registrarEntrada({
        id_sucursal: 2,
        id_producto: 1,
        id_talla: 9,
        id_color: 10,
        cantidad: 4,
        pendiente: true,
        fecha_programada: '2100-09-12T12:00:00Z',
        referencia: 'OC-50',
      }),
    ).toMatchObject({ estado: 'PENDIENTE', inventario: { cantidad_fisica: 5 } });
  });
  it('rechaza ingresos pendientes sin fecha futura y cantidades fraccionarias antes de enviar', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    const datos = {
      id_sucursal: 2,
      id_producto: 1,
      id_talla: 9,
      id_color: 10,
      cantidad: 1,
      pendiente: true,
    };
    await expect(inventarioService.registrarEntrada(datos)).rejects.toMatchObject({ status: 400 });
    await expect(
      inventarioService.registrarEntrada({ ...datos, fecha_programada: '2000-01-01' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      inventarioService.registrarEntrada({ ...datos, cantidad: 1.5 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(adapter).not.toHaveBeenCalled();
  });
  it('envia stock final cero al endpoint de ajustes y cantidad al de devoluciones', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.method).toBe('post');
      const d = JSON.parse(c.data);
      if (c.url === '/inventory/20/adjustments')
        expect(d).toEqual({ physicalQuantity: 0, observation: 'Conteo corregido' });
      else {
        expect(c.url).toBe('/inventory/20/returns');
        expect(d).toEqual({ quantity: 2, observation: 'Devolucion recibida' });
      }
      return respuesta(c, {
        inventory: inventario,
        movement: { ...movimiento, type: 'ADJUSTMENT', status: 'COMPLETED' },
      });
    };
    await inventarioService.registrarMovimiento({
      id_inventario: 20,
      tipo: TipoMovimiento.AJUSTE,
      cantidad: 0,
      observacion: 'Conteo corregido',
    });
    await inventarioService.registrarMovimiento({
      id_inventario: 20,
      tipo: TipoMovimiento.DEVOLUCION,
      cantidad: 2,
      observacion: 'Devolucion recibida',
    });
  });
  it('no permite generar ventas o liberar reservas desde el formulario manual', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    await expect(
      inventarioService.registrarMovimiento({
        id_inventario: 20,
        tipo: TipoMovimiento.LIBERACION_RESERVA,
        cantidad: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      inventarioService.registrarMovimiento({
        id_inventario: 20,
        tipo: TipoMovimiento.AJUSTE,
        cantidad: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(adapter).not.toHaveBeenCalled();
  });
  it('consulta movimientos por inventario, traduce enums y confirma recepciones', async () => {
    instancia.defaults.adapter = async (c) => {
      if (c.method === 'get') {
        expect(c.url).toBe('/inventory/20/movements');
        expect(c.params).toMatchObject({
          type: 'PENDING_ENTRY',
          status: 'PENDING',
          page: 1,
          limit: 20,
        });
        return respuesta(c, pagina([movimiento], 1, 20));
      }
      expect(c.url).toBe('/inventory/movements/50/complete');
      return respuesta(c, {
        inventory: { ...inventario, physicalQuantity: 9 },
        movement: { ...movimiento, status: 'COMPLETED' },
      });
    };
    expect(
      await inventarioService.movimientos({
        id_inventario: 20,
        tipo: TipoMovimiento.INGRESO_PENDIENTE,
        estado: 'PENDIENTE',
      }),
    ).toMatchObject({ items: [{ tipo: 'INGRESO_PENDIENTE', estado: 'PENDIENTE' }] });
    expect(await inventarioService.completarEntrada(50)).toMatchObject({
      estado: 'COMPLETADO',
      inventario: { cantidad_fisica: 9 },
    });
  });
});

describe('carrito real', () => {
  it('conserva precio vigente/guardado, alertas, totales y sucursales comunes del servidor', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/cart');
      expect(c.headers.Authorization).toBe('Bearer sesion-test');
      return respuesta(c, carrito);
    };
    expect(await carritoService.obtener()).toMatchObject({
      total: 160,
      cantidad_total: 2,
      tiene_disponibilidad: true,
      sucursales_disponibles: [{ id_sucursal: 2 }],
      detalles: [
        {
          precio_unitario: 80,
          precio_guardado: 100,
          precio_cambio: true,
          subtotal: 160,
          disponible: true,
        },
      ],
    });
  });
  it('envia solo variante y quantity; no envia precios del cliente', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/cart/items');
      expect(c.method).toBe('post');
      expect(JSON.parse(c.data)).toEqual({ productId: 1, sizeId: 9, colorId: 10, quantity: 2 });
      return respuesta(c, carrito);
    };
    await carritoService.agregar({ id_producto: 1, id_talla: 9, id_color: 10, cantidad: 2 });
  });
  it('usa PATCH quantity y DELETE /cart/items para vaciar', async () => {
    const acciones: string[] = [];
    instancia.defaults.adapter = async (c) => {
      acciones.push(`${c.method} ${c.url}`);
      if (c.method === 'patch') expect(JSON.parse(c.data)).toEqual({ quantity: 1 });
      return respuesta(c, {
        ...carrito,
        items: [],
        total: 0,
        totalQuantity: 0,
        hasAvailability: false,
        availableBranches: [],
      });
    };
    await carritoService.cambiarCantidad(31, 1);
    await carritoService.quitar(31);
    expect(await carritoService.vaciar()).toMatchObject({ detalles: [], total: 0 });
    expect(acciones).toEqual([
      'patch /cart/items/31',
      'delete /cart/items/31',
      'delete /cart/items',
    ]);
  });
  it.each([0, -1, 1.5, 101])('rechaza cantidad %s sin llamar al backend', async (cantidad) => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    await expect(carritoService.cambiarCantidad(31, cantidad)).rejects.toMatchObject({
      status: 400,
    });
    expect(adapter).not.toHaveBeenCalled();
  });
  it('no convierte conflictos de stock en exito ni elimina la sesion', async () => {
    instancia.defaults.adapter = async (c) => {
      throw rechazo(c, 409, 'No active branch has enough available stock for this variant');
    };
    await expect(
      carritoService.agregar({ id_producto: 1, id_talla: 9, id_color: 10, cantidad: 4 }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
