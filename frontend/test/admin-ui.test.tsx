import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormularioProducto } from '../src/features/admin/FormularioProducto';
import PaginaUsuarios from '../src/features/admin/PaginaUsuarios';
import PaginaSucursales from '../src/features/admin/PaginaSucursales';
import { RolesUsuario } from '../src/features/admin/RolesUsuario';
import { ProveedorToast } from '../src/context/ToastContext';
import { ProveedorAuth } from '../src/context/AuthContext';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { adaptarProducto } from '../src/api/catalogo.contratos';
import { fecha } from '../src/lib/format';
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
async function montar(elemento: ReactNode) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter>{elemento}</MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
function boton(texto: string) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
}
async function click(texto: string) {
  await act(async () => boton(texto).click());
}
async function cambiarSelect(id: string, valor: string) {
  const select = document.getElementById(id) as HTMLSelectElement;
  await act(async () => {
    select.value = valor;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function catalogos() {
  qc.setQueryData(['categorias'], [{ id_categoria: 5, nombre: 'Camisas' }]);
  qc.setQueryData(
    ['temporadas'],
    [
      { id_temporada: 6, nombre: 'Primavera', activa: true },
      { id_temporada: 60, nombre: 'Invierno', activa: true },
    ],
  );
  qc.setQueryData(
    ['colecciones'],
    [
      { id_coleccion: 7, id_temporada: 6, nombre: 'Urbana', activa: true },
      { id_coleccion: 70, id_temporada: 60, nombre: 'Abrigos', activa: true },
    ],
  );
  qc.setQueryData(['proveedores'], [{ id_proveedor: 8, nombre: 'Textiles', activo: true }]);
  qc.setQueryData(['tallas'], [{ id_talla: 9, nombre: 'M' }]);
  qc.setQueryData(['colores'], [{ id_color: 10, nombre: 'Azul', codigo_hex: '#0000ff' }]);
}

describe('formularios de administracion', () => {
  it('exige relaciones y cambia la coleccion al cambiar temporada', async () => {
    catalogos();
    await montar(<FormularioProducto abierto producto={null} onCerrar={() => {}} />);
    expect(document.body.textContent).not.toContain('Producto visible en el catalogo');
    await click('Guardar producto');
    expect(document.body.textContent).toContain('Selecciona una temporada activa');
    expect(document.body.textContent).toContain('Selecciona un proveedor activo');
    await cambiarSelect('temporada', '6');
    const coleccion = document.getElementById('coleccion') as HTMLSelectElement;
    expect([...coleccion.options].map((o) => o.value)).toEqual(['', '7']);
    await cambiarSelect('coleccion', '7');
    await cambiarSelect('temporada', '60');
    expect(coleccion.value).toBe('');
    expect([...coleccion.options].map((o) => o.value)).toEqual(['', '70']);
  });
  it('editar otros datos conserva las fechas de promocion sin reenviarlas', async () => {
    catalogos();
    let guardado = false;
    vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    instancia.defaults.adapter = async (c) => {
      if (c.method === 'patch') {
        const d = JSON.parse(c.data);
        expect(d.promotionStart).toBeUndefined();
        expect(d.promotionEnd).toBeUndefined();
        guardado = true;
      }
      return respuesta(c, prenda);
    };
    await montar(
      <FormularioProducto abierto producto={adaptarProducto(prenda)} onCerrar={() => {}} />,
    );
    await click('Guardar producto');
    expect(guardado).toBe(true);
  });
  it('muestra simultaneamente perfil de cliente y empleado, con sucursal obligatoria', async () => {
    qc.setQueryData(
      ['roles'],
      [
        { id_rol: 40, nombre: 'CLIENTE' },
        { id_rol: 90, nombre: 'CAJERO' },
      ],
    );
    qc.setQueryData(['sucursales'], [{ id_sucursal: 20, nombre: 'Centro', activa: true }]);
    instancia.defaults.adapter = async (c) => respuesta(c, pagina([]));
    await montar(<PaginaUsuarios />);
    await click('Nuevo usuario');
    await click('CLIENTE');
    await click('CAJERO');
    expect(document.getElementById('telefono-usuario')).not.toBeNull();
    expect(document.getElementById('sucursal-usuario')).not.toBeNull();
    await click('Guardar');
    expect(document.body.textContent).toContain('Selecciona una sucursal activa');
    expect(document.body.textContent).toContain('entre 8 y 72');
  });
  it('diferencia baja logica y recuperacion de sucursales', async () => {
    qc.setQueryData(
      ['sucursales', 'admin'],
      [
        {
          id_sucursal: 20,
          nombre: 'Centro',
          ciudad: 'La Paz',
          direccion: 'Avenida Central',
          telefono: '',
          activa: true,
        },
      ],
    );
    await montar(<PaginaSucursales />);
    await click('Desactivar');
    expect(document.body.textContent).toContain('podras reactivarlo');
    expect(document.body.textContent).not.toContain('no se puede deshacer');
    await click('Cancelar');
    await click('Editar');
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull();
    await click('Cancelar');
    await click('Agregar sucursal');
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it('impide quitar el ultimo rol y solicita sucursal antes de asignar cajero', async () => {
    qc.setQueryData(
      ['roles'],
      [
        { id_rol: 4, nombre: 'CLIENTE' },
        { id_rol: 90, nombre: 'CAJERO' },
      ],
    );
    qc.setQueryData(['usuarios', 'detalle', 12], {
      id_usuario: 12,
      nombre: 'Ana',
      roles: [{ id_rol: 4, nombre: 'CLIENTE' }],
    });
    qc.setQueryData(['sucursales'], [{ id_sucursal: 20, nombre: 'Centro', activa: true }]);
    let solicitudes = 0;
    instancia.defaults.adapter = async (c) => {
      solicitudes++;
      return respuesta(c, usuarioBackend);
    };
    await montar(<RolesUsuario id={12} onCerrar={() => {}} />);
    expect(boton('Quitar CLIENTE').disabled).toBe(true);
    await cambiarSelect('asignar-rol', '90');
    await click('Asignar rol');
    expect(document.body.textContent).toContain('Selecciona una sucursal activa');
    expect(solicitudes).toBe(0);
    await cambiarSelect('rol-sucursal', '20');
    await click('Asignar rol');
    expect(solicitudes).toBeGreaterThan(0);
  });
  it('presenta fechas comerciales sin desplazarlas al dia anterior', () => {
    expect(fecha('2026-09-12')).toBe(fecha(new Date(2026, 8, 12)));
  });
});
