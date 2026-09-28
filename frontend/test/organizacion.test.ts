import { beforeEach, describe, expect, it } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import {
  proveedoresService,
  rolesService,
  sucursalesService,
  usuariosService,
  type DatosUsuario,
} from '../src/services/organizacion.service';
import { respuesta, usuarioBackend } from './fixtures';
import { pagina } from './catalogo-fixtures';

const sucursal = {
  id: 20,
  name: 'Centro',
  city: 'La Paz',
  address: 'Avenida Central 123',
  phone: null,
  active: true,
};
const roles = [
  { id: 40, name: 'CUSTOMER', description: null },
  { id: 90, name: 'CASHIER', description: 'Caja' },
];
const datos: DatosUsuario = {
  nombre: 'Ana',
  email: 'ana@example.com',
  password: 'Abcdefg1',
  activo: true,
  id_roles: [40, 90],
  telefono: '123',
  direccion: 'Centro',
  id_sucursal: 20,
  cargo: 'Cajera',
};
beforeEach(() => guardarToken('admin-test'));

describe('administracion sobre HTTP', () => {
  it('obtiene todas las paginas de sucursales y separa selector publico de administracion', async () => {
    const estados: boolean[] = [];
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/branches');
      estados.push(c.params.active);
      const data =
        c.params.page === 1 && c.params.active
          ? Array.from({ length: 100 }, (_, i) => ({ ...sucursal, id: i + 1 }))
          : [{ ...sucursal, id: c.params.active ? 101 : 102, active: c.params.active }];
      return respuesta(c, pagina(data, c.params.page, 100, c.params.active ? 101 : 1));
    };
    expect(await sucursalesService.listar()).toHaveLength(101);
    expect(estados).toEqual([true, true]);
    estados.length = 0;
    const todas = await sucursalesService.listarTodas();
    expect(todas).toHaveLength(102);
    expect(todas.find((s) => !s.activa)?.id_sucursal).toBe(102);
    expect(estados).toContain(false);
  });
  it('crea sucursales sin active ni ids y permite reactivarlas con PATCH', async () => {
    instancia.defaults.adapter = async (c) => {
      const d = JSON.parse(c.data);
      expect(d).toMatchObject({ name: 'Centro', city: 'La Paz', address: 'Avenida Central 123' });
      expect(d.id_sucursal).toBeUndefined();
      if (c.method === 'post') expect(d.active).toBeUndefined();
      else {
        expect(c.method).toBe('patch');
        expect(d.active).toBe(true);
      }
      return respuesta(c, sucursal);
    };
    const creada = await sucursalesService.crear({
      nombre: 'Centro',
      ciudad: 'La Paz',
      direccion: 'Avenida Central 123',
      telefono: '',
      activa: true,
    });
    await sucursalesService.actualizar(20, creada);
  });
  it('adapta proveedores y permite dejar el correo opcional vacio', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/catalog/suppliers');
      const proveedor = {
        id: 8,
        name: 'Textiles',
        contact: null,
        phone: null,
        email: null,
        active: true,
      };
      if (c.method === 'get') return respuesta(c, [proveedor]);
      expect(JSON.parse(c.data)).toEqual({ name: 'Textiles', contact: '', phone: '', email: null });
      return respuesta(c, proveedor);
    };
    const [proveedor] = await proveedoresService.listar();
    expect(proveedor.email).toBe('');
    await proveedoresService.crear(proveedor);
  });
  it('traduce los ids reales de roles al enum sin asumir ids del seed', async () => {
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/roles') return respuesta(c, roles);
      expect(c.url).toBe('/users');
      expect(c.params).toMatchObject({ role: 'CASHIER', search: 'Ana', page: 2, limit: 10 });
      expect(c.params.id_rol).toBeUndefined();
      return respuesta(c, pagina([usuarioBackend], 2, 10, 11));
    };
    expect(
      await usuariosService.listar({ id_rol: 90, q: 'Ana', page: 2, page_size: 10 }),
    ).toMatchObject({ total: 11, items: [{ id_usuario: 12 }] });
  });
  it('crea ambos perfiles cuando la cuenta es cliente y cajero', async () => {
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/roles') return respuesta(c, roles);
      expect(c.method).toBe('post');
      expect(c.url).toBe('/users');
      expect(JSON.parse(c.data)).toEqual({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'Abcdefg1',
        active: true,
        roles: ['CUSTOMER', 'CASHIER'],
        phone: '123',
        address: 'Centro',
        branchId: 20,
        jobTitle: 'Cajera',
      });
      return respuesta(c, usuarioBackend);
    };
    await usuariosService.crear(datos);
  });
  it('editar no envia roles, password vacio ni campos de perfiles inexistentes', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/users/12');
      if (c.method === 'patch')
        expect(JSON.parse(c.data)).toEqual({
          name: 'Ana',
          email: 'ana@example.com',
          active: true,
          phone: '123',
          address: 'Centro',
        });
      else expect(c.method).toBe('get');
      return respuesta(c, usuarioBackend);
    };
    await usuariosService.actualizar(12, { ...datos, password: '' });
  });
  it('edita perfiles que aun existen aunque sus roles hayan sido revocados', async () => {
    const usuario = {
      ...usuarioBackend,
      roles: [{ role: { id: 1, name: 'ADMINISTRATOR', description: null } }],
      employee: { id: 21, jobTitle: 'Cajera', active: true, branchId: 20, branch: sucursal },
    };
    instancia.defaults.adapter = async (c) => {
      if (c.method === 'patch')
        expect(JSON.parse(c.data)).toMatchObject({
          branchId: 20,
          jobTitle: 'Cajera',
          phone: '123',
          address: 'Centro',
        });
      return respuesta(c, usuario);
    };
    const actualizado = await usuariosService.actualizar(12, { ...datos, password: '' });
    expect(actualizado).toMatchObject({ id_cliente: 31, id_empleado: 21 });
  });
  it('asigna y revoca un rol usando operaciones independientes', async () => {
    const metodos: string[] = [];
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/roles') return respuesta(c, roles);
      expect(c.url).toBe('/roles/users/12/CASHIER');
      metodos.push(c.method!);
      if (c.method === 'post')
        expect(JSON.parse(c.data)).toEqual({ branchId: 20, jobTitle: 'Cajera' });
      return respuesta(c, usuarioBackend);
    };
    const rol = (await rolesService.listar()).find((r) => r.id_rol === 90)!;
    await rolesService.asignar(12, rol, datos);
    await rolesService.revocar(12, rol);
    expect(metodos).toEqual(['post', 'delete']);
  });
});
