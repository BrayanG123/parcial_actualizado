import { describe, expect, it } from 'vitest';
import { adaptarPagina, desenvolverRespuesta, parametrosPagina } from '../src/api/contratos';
import { adaptarUsuario, ROLES_BACKEND, type RolBackend } from '../src/api/auth.contratos';
import { puedeAcceder, rutaInicialPorRol } from '../src/routes/permisos';
import { passwordRegistro } from '../src/lib/validacion';
import { usuarioBackend } from './fixtures';

describe('contratos NestJS y permisos de la UI', () => {
  it('desenvuelve una pagina una sola vez y conserva su total, no solo su longitud', () => {
    const page = { data: [{ id: 12 }], meta: { page: 2, limit: 20, total: 21, totalPages: 2 } };
    const data = desenvolverRespuesta({ success: true, data: page, timestamp: '' });
    expect(adaptarPagina(data, (item) => item.id)).toEqual({
      items: [12],
      page: 2,
      page_size: 20,
      total: 21,
    });
    expect(parametrosPagina({ page: 2, page_size: 20 })).toEqual({ page: 2, limit: 20 });
  });

  it('rechaza una respuesta sin el contrato en lugar de aparentar datos vacios', () => {
    expect(() => desenvolverRespuesta({ items: [] } as never)).toThrow('incompatible');
  });

  it.each([
    ['ADMINISTRATOR', '/admin'],
    ['BRANCH_MANAGER', '/sucursal/reservas'],
    ['CASHIER', '/caja'],
    ['CUSTOMER', '/'],
    ['SUPPLIER', '/proveedor/productos'],
  ] as Array<[RolBackend, string]>)('adapta %s y lo dirige a su area', (name, ruta) => {
    const u = adaptarUsuario({
      ...usuarioBackend,
      roles: [{ role: { id: 1, name, description: null } }],
    });
    expect(u.roles[0].nombre).toBe(ROLES_BACKEND[name]);
    expect(rutaInicialPorRol(u.roles.map((r) => r.nombre))).toBe(ruta);
    expect(
      puedeAcceder(
        ruta,
        u.roles.map((r) => r.nombre),
      ),
    ).toBe(true);
  });

  it('conserva ambos perfiles y no inventa una asociacion con proveedor', () => {
    const u = adaptarUsuario({
      ...usuarioBackend,
      employee: {
        id: 7,
        branchId: 9,
        jobTitle: 'Cajero',
        active: true,
        branch: {
          id: 9,
          name: 'Centro',
          city: 'La Paz',
          address: 'Calle 1',
          phone: null,
          active: true,
        },
      },
    });
    expect(u).toMatchObject({
      id_cliente: 31,
      id_empleado: 7,
      id_sucursal: 9,
      telefono: '',
      sucursal: { nombre: 'Centro' },
    });
    expect(u.id_proveedor).toBeUndefined();
  });

  it('rechaza destinos externos y no permite entrar a administracion con rol de cliente', () => {
    for (const ruta of [
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/admin#usuarios',
      '/caja?venta=1',
    ]) {
      expect(puedeAcceder(ruta, ['CLIENTE'])).toBe(false);
    }
    expect(puedeAcceder('/reservas/nueva', ['CAJERO'])).toBe(false);
    expect(puedeAcceder('/mis-compras?pagina=2', ['CLIENTE'])).toBe(true);
  });

  it.each(['abc123', 'abcdefgh', 'ABCDEFG1', 'abcdefg1', 'Ab1' + 'x'.repeat(70)])(
    'rechaza la contraseña incompatible: %s',
    (password) => {
      expect(passwordRegistro(password)).toBeDefined();
    },
  );
  it('acepta una contraseña que cumple el DTO', () =>
    expect(passwordRegistro('Abcdefg1')).toBeUndefined());
});
