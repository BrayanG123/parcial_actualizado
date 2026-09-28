import { beforeEach, describe, expect, it } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { catalogoService } from '../src/services/catalogo.service';
import { disponibilidadService } from '../src/services/disponibilidad.service';
import { adaptarProducto } from '../src/api/catalogo.contratos';
import { precioActual, promocionVigente, stockDisponible } from '../src/lib/domain';
import { prenda, stock, pagina } from './catalogo-fixtures';
import { respuesta, rechazo } from './fixtures';

beforeEach(() => guardarToken(null));

describe('catalogo HTTP real', () => {
  it('adapta relaciones, fechas y precios calculados por el servidor', () => {
    const producto = adaptarProducto(prenda);
    expect(producto).toMatchObject({
      id_producto: 1,
      promo_inicio: '2026-09-01',
      promo_fin: '2026-09-30',
      tallas: [{ id_talla: 9 }],
      colores: [{ id_color: 10 }],
      tiene_recurso_ra: true,
    });
    expect(precioActual(producto)).toBe(80);
    expect(promocionVigente(producto)).toBe(true);
    const vencida = adaptarProducto({ ...prenda, promotionActive: false, currentPrice: 100 });
    expect(precioActual(vencida)).toBe(100);
    expect(promocionVigente(vencida)).toBe(false);
  });
  it('envia filtros soportados y adapta la pagina sin perder el total', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/products');
      expect(c.params).toMatchObject({
        search: 'Camisa',
        categoryId: 5,
        sizeId: 9,
        colorId: 10,
        page: 2,
        limit: 12,
        active: true,
      });
      expect(c.params.q).toBeUndefined();
      return respuesta(c, pagina([prenda], 2, 12, 13));
    };
    expect(
      await catalogoService.listarProductos({
        q: 'Camisa',
        id_categoria: 5,
        id_talla: 9,
        id_color: 10,
        page: 2,
        page_size: 12,
      }),
    ).toMatchObject({ page: 2, page_size: 12, total: 13, items: [{ id_producto: 1 }] });
  });
  it('filtra promociones y ordena todas las paginas antes de paginar', async () => {
    const vistas: number[] = [];
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/products');
      expect(c.params.limit).toBe(100);
      expect(c.params.solo_promocion).toBeUndefined();
      expect(c.params.orden).toBeUndefined();
      vistas.push(c.params.page);
      const data =
        c.params.page === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              ...prenda,
              id: i + 1,
              currentPrice: 100 + i,
              promotionActive: i === 99,
            }))
          : [{ ...prenda, id: 101, currentPrice: 10 }];
      return respuesta(c, pagina(data, c.params.page, 100, 101));
    };
    expect(
      await catalogoService.listarProductos({
        solo_promocion: true,
        orden: 'precio_asc',
        page_size: 1,
      }),
    ).toMatchObject({ total: 2, items: [{ id_producto: 101 }] });
    expect(vistas).toEqual([1, 2]);
  });
  it('combina disponibilidad por sucursal/talla/color incluso en paginas posteriores', async () => {
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/products') return respuesta(c, pagina([prenda, { ...prenda, id: 2 }]));
      expect(c.url).toBe('/inventory/availability');
      expect(c.params).toMatchObject({ branchId: 2, sizeId: 9, colorId: 10 });
      const data =
        c.params.page === 1
          ? Array.from({ length: 100 }, (_, i) => ({ ...stock, id: i, availableQuantity: 0 }))
          : [{ ...stock, product: { id: 2, name: 'Otra' } }];
      return respuesta(c, pagina(data, c.params.page, 100, 101));
    };
    expect(
      await catalogoService.listarProductos({
        id_sucursal: 2,
        id_talla: 9,
        id_color: 10,
        page_size: 1,
      }),
    ).toMatchObject({ total: 1, items: [{ id_producto: 2 }] });
  });
  it('incluye productos inactivos solo en la consulta administrativa', async () => {
    const activos: boolean[] = [];
    instancia.defaults.adapter = async (c) => {
      activos.push(c.params.active);
      return respuesta(
        c,
        pagina([{ ...prenda, id: c.params.active ? 1 : 2, active: c.params.active }]),
      );
    };
    expect((await catalogoService.listarProductos({ incluir_inactivos: true })).total).toBe(2);
    expect(activos.sort()).toEqual([false, true]);
  });
  it('crea y actualiza sin relaciones expandidas ni propiedades desconocidas', async () => {
    const dto = {
      nombre: ' Camisa ',
      descripcion: '',
      precio: 100,
      imagen_url: '',
      descuento_pct: 0,
      promo_inicio: null,
      promo_fin: null,
      activo: true,
      id_categoria: 5,
      id_temporada: 6,
      id_coleccion: 7,
      id_proveedor: 8,
      id_tallas: [9],
      id_colores: [10],
    };
    instancia.defaults.adapter = async (c) => {
      const d = JSON.parse(c.data);
      expect(c.url).toBe(c.method === 'post' ? '/products' : '/products/1');
      expect(d).toMatchObject({
        name: 'Camisa',
        categoryId: 5,
        seasonId: 6,
        collectionId: 7,
        supplierId: 8,
        sizeIds: [9],
        colorIds: [10],
      });
      expect(d.id_producto).toBeUndefined();
      expect(d.categoria).toBeUndefined();
      expect(d.imageUrl).toBeUndefined();
      if (c.method === 'post') {
        expect(d.active).toBeUndefined();
        expect(d.promotionStart).toBeUndefined();
      } else {
        expect(c.method).toBe('patch');
        expect(d.promotionStart).toBeNull();
        expect(d.promotionEnd).toBeNull();
        expect(d.active).toBe(true);
      }
      return respuesta(c, prenda);
    };
    await catalogoService.crearProducto(dto);
    await catalogoService.actualizarProducto(1, { ...adaptarProducto(prenda), ...dto });
  });
  it('lee metadata como arrays y usa PATCH; no envia active en creacion', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toMatch(/^\/catalog\/seasons/);
      if (c.method === 'get') return respuesta(c, [prenda.season]);
      const d = JSON.parse(c.data);
      expect(d).toMatchObject({
        name: 'Primavera',
        startDate: '2026-09-01',
        endDate: '2026-12-01',
      });
      if (c.method === 'post') expect(d.active).toBeUndefined();
      else {
        expect(c.method).toBe('patch');
        expect(d.active).toBe(false);
      }
      return respuesta(c, prenda.season);
    };
    const [temporada] = await catalogoService.listarTemporadas();
    expect(temporada.fecha_inicio).toBe('2026-09-01');
    await catalogoService.crearTemporada(temporada);
    await catalogoService.actualizarTemporada(6, { ...temporada, activa: false });
  });
  it('usa solo cantidad disponible; propaga fallos de stock sin inventar cero', async () => {
    instancia.defaults.adapter = async (c) => respuesta(c, pagina([stock]));
    const [resultado] = await disponibilidadService.listar({ id_producto: 1 });
    expect(stockDisponible(resultado)).toBe(3);
    expect(resultado).not.toHaveProperty('cantidad_fisica');
    expect(resultado).not.toHaveProperty('cantidad_reservada');
    instancia.defaults.adapter = async (c) => {
      throw rechazo(c, 503, 'Servicio temporalmente no disponible');
    };
    await expect(disponibilidadService.listar({ id_producto: 1 })).rejects.toMatchObject({
      status: 503,
    });
  });
});
