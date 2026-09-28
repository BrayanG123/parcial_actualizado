import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { subirImagen } from '../src/services/imagenes.service';
import { adaptarProducto, adaptarSucursal } from '../src/api/catalogo.contratos';
import { adaptarUsuario } from '../src/api/auth.contratos';
import { catalogoService, productoParaApi } from '../src/services/catalogo.service';
import { usuarioParaApi } from '../src/services/organizacion.service';
import { pagina, prenda } from './catalogo-fixtures';
import { respuesta, rechazo, usuarioBackend } from './fixtures';

beforeEach(() => guardarToken('admin-test'));

describe('catalogo ampliado', () => {
  it('uploads multipart with auth, without JSON conversion, and returns the remote URL', async () => {
    instancia.defaults.adapter = async (config) => {
      expect(config.url).toBe('/products/images/upload');
      expect(config.headers.Authorization).toBe('Bearer admin-test');
      expect(config.data).toBeInstanceOf(FormData);
      expect(config.headers['Content-Type']).not.toBe('application/json');
      expect(config.data.get('file').name).toBe('camisa.png');
      return respuesta(config, {
        url: 'https://res.cloudinary.com/demo/camisa.png',
        publicId: 'camisa',
      });
    };
    expect(await subirImagen(new File(['photo'], 'camisa.png', { type: 'image/png' }))).toBe(
      'https://res.cloudinary.com/demo/camisa.png',
    );
  });
  it('rejects unsupported and oversized files before making a request', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    await expect(
      subirImagen(new File(['svg'], 'a.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('JPG');
    await expect(
      subirImagen(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })),
    ).rejects.toThrow('5 MB');
    expect(adapter).not.toHaveBeenCalled();
  });
  it('shows missing Cloudinary configuration without pretending the upload succeeded', async () => {
    instancia.defaults.adapter = async (c) => {
      throw rechazo(c, 503, 'Configura Cloudinary en el servidor');
    };
    await expect(subirImagen(new File(['photo'], 'a.png', { type: 'image/png' }))).rejects.toThrow(
      'Configura Cloudinary',
    );
  });
  it('preserves ordered images, sends explicit clearing, and supports legacy images', () => {
    const imageUrls = ['https://example.test/b.png', 'https://example.test/a.png'];
    expect(adaptarProducto({ ...prenda, imageUrls, wholesalePrice: 60 })).toMatchObject({
      imagenes: imageUrls,
      precio_mayorista: 60,
    });
    expect(adaptarProducto({ ...prenda, imageUrls: [], imageUrl: imageUrls[0] }).imagenes).toEqual([
      imageUrls[0],
    ]);
    expect(productoParaApi({ imagenes: [], precio_mayorista: null })).toMatchObject({
      imageUrls: [],
      wholesalePrice: null,
    });
  });
  it('orders and filters by the displayed wholesale price before paginating', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.params.minPrice).toBeUndefined();
      return respuesta(
        c,
        pagina([
          { ...prenda, id: 1, currentPrice: 80, wholesalePrice: 60 },
          { ...prenda, id: 2, currentPrice: 70, wholesalePrice: 65 },
        ]),
      );
    };
    const sorted = await catalogoService.listarProductos({
      mayorista: true,
      orden: 'precio_asc',
      page_size: 1,
    });
    expect(sorted.items[0].id_producto).toBe(1);
    expect(sorted.total).toBe(2);
    expect(
      (await catalogoService.listarProductos({ mayorista: true, precio_min: 62 })).items.map(
        (p) => p.id_producto,
      ),
    ).toEqual([2]);
    expect(
      (await catalogoService.listarProductos({ mayorista: true, solo_promocion: true })).total,
    ).toBe(0);
  });
  it('maps customer classification and warehouse names without sending wholesale for employee-only profiles', () => {
    expect(
      adaptarUsuario({ ...usuarioBackend, client: { ...usuarioBackend.client!, wholesale: true } })
        .mayorista,
    ).toBe(true);
    expect(usuarioParaApi({ mayorista: false }, { cliente: true, empleado: false })).toMatchObject({
      wholesale: false,
    });
    expect(
      usuarioParaApi({ mayorista: true }, { cliente: false, empleado: true }),
    ).not.toHaveProperty('wholesale');
    expect(
      adaptarSucursal({
        id: 1,
        name: 'Centro',
        city: 'La Paz',
        address: 'Central',
        phone: null,
        active: true,
        warehouseName: 'Deposito central',
      }).nombre_almacen,
    ).toBe('Deposito central');
  });
});
