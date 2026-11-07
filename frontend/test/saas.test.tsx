import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, CLAVE_TOKEN_PLATAFORMA, instancia, tokenPlataforma } from '../src/api/http';
import { fijarEmpresa, obtenerEmpresa } from '../src/api/empresa';
import { guardarToken, obtenerToken } from '../src/api/sesion';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import { LayoutPanel } from '../src/layouts/LayoutPanel';
import { LayoutTienda } from '../src/layouts/LayoutTienda';
import PaginaLogin from '../src/features/auth/PaginaLogin';
import PaginaLanding from '../src/features/saas/PaginaLanding';
import PaginaRegistroEmpresa from '../src/features/saas/PaginaRegistroEmpresa';
import PaginaMisEmpresas from '../src/features/saas/PaginaMisEmpresas';
import { tokenCuenta } from '../src/api/http';
import { navegacionPorRol } from '../src/routes/navegacion';
import { authService } from '../src/services/auth.service';
import { plataformaService } from '../src/services/plataforma.service';
import { ErrorApi } from '../src/types/api';
import { RolNombre } from '../src/types/domain';
import { rechazo, respuesta, sesionBackend, usuarioBackend } from './fixtures';

const planBasico = {
  id: 1,
  code: 'BASIC',
  name: 'Basico',
  maxActiveBranches: 2,
  features: { aiReports: false, conventionalReports: true, offline: true },
};
const suscripcion = (readOnly: boolean) => ({
  tenant: { id: 2, slug: 'empresa-b', name: 'Moda Andina' },
  plan: planBasico,
  subscription: {
    id: 2,
    status: readOnly ? 'EXPIRED' : 'ACTIVE',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: readOnly ? '2026-10-01T00:00:00.000Z' : '2027-10-01T00:00:00.000Z',
    daysRemaining: readOnly ? 0 : 300,
  },
  readOnly,
  usage: { activeBranches: 2, branches: 2, users: 6, remainingBranches: 0 },
});

beforeEach(() => {
  localStorage.clear();
  guardarToken(null);
  fijarEmpresa(null);
});

describe('empresa activa y X-Tenant', () => {
  it('envia X-Tenant sin sesion y deja que el token decida con sesion', async () => {
    const llamadas: InternalAxiosRequestConfig[] = [];
    instancia.defaults.adapter = async (config) => {
      llamadas.push(config);
      return respuesta(config, { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    };
    fijarEmpresa({ slug: 'empresa-b', nombre: 'Moda Andina' });
    await api.get('/products');
    expect(llamadas[0]!.headers['X-Tenant']).toBe('empresa-b');
    guardarToken('jwt-empresa-b');
    await api.get('/products');
    expect(llamadas[1]!.headers['X-Tenant']).toBeUndefined();
    expect(llamadas[1]!.headers.Authorization).toBe('Bearer jwt-empresa-b');
  });

  it('el login se hace en la tienda activa y adopta la empresa real de la cuenta', async () => {
    fijarEmpresa({ slug: 'empresa-b' });
    instancia.defaults.adapter = async (config) => {
      expect(config.headers['X-Tenant']).toBe('empresa-b');
      return respuesta(config, {
        ...sesionBackend,
        tenant: { id: 2, slug: 'empresa-b', name: 'Moda Andina' },
      });
    };
    await authService.login({ email: 'cliente@example.com', password: 'Abcdefg1' });
    expect(obtenerEmpresa()).toEqual({ slug: 'empresa-b', nombre: 'Moda Andina' });
  });

  it('rechaza codigos de empresa invalidos y conserva la empresa entre recargas', () => {
    expect(() => fijarEmpresa({ slug: 'Empresa B!' })).toThrow();
    fijarEmpresa({ slug: 'empresa-b', nombre: 'B' });
    expect(JSON.parse(localStorage.getItem([...Object.keys(localStorage)].find((k) => k.startsWith('fashionstore.empresa'))!)!)).toEqual({
      slug: 'empresa-b',
      nombre: 'B',
    });
  });
});

describe('mensajes de reglas SaaS', () => {
  it('traduce los codigos de plan y suscripcion a mensajes claros', async () => {
    guardarToken('jwt');
    instancia.defaults.adapter = async (config) => {
      const error = rechazo(config, 403, 'raw');
      (error.response!.data as Record<string, unknown>).code = 'SUBSCRIPTION_READ_ONLY';
      throw error;
    };
    const error = await api.post('/branches', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).codigo).toBe('SUBSCRIPTION_READ_ONLY');
    expect((error as ErrorApi).message).toContain('solo lectura');
    // Un 403 por plan no cierra la sesion.
    expect(obtenerToken()).toBe('jwt');
  });

  it('oculta del menu las funciones que el plan no incluye', () => {
    const conPlan = navegacionPorRol([RolNombre.ADMINISTRADOR], (f) => f !== 'aiReports');
    const enlaces = conPlan.flatMap((g) => g.enlaces.map((e) => e.a));
    expect(enlaces).toContain('/admin/reportes');
    expect(enlaces).toContain('/admin/plan');
    expect(enlaces).not.toContain('/admin/reportes-ia');
    const sinPlan = navegacionPorRol([RolNombre.ADMINISTRADOR]).flatMap((g) => g.enlaces.map((e) => e.a));
    expect(sinPlan).toContain('/admin/reportes-ia');
    // Un plan configurado sin reservas ni gestion de productos oculta esas secciones.
    const sinReservas = navegacionPorRol([RolNombre.ADMINISTRADOR], (f) => f !== 'reservations' && f !== 'products').flatMap(
      (g) => g.enlaces.map((e) => e.a),
    );
    expect(sinReservas).not.toContain('/admin/reservas');
    expect(sinReservas).not.toContain('/admin/productos');
    expect(sinReservas).toContain('/admin/ventas');
  });
});

describe('sesion de plataforma', () => {
  it('guarda su token aparte y un 401 no cierra la sesion de la tienda', async () => {
    guardarToken('jwt-tienda');
    instancia.defaults.adapter = async (config) => {
      if (config.url === '/platform/auth/login')
        return respuesta(config, {
          accessToken: 'jwt-plataforma',
          tokenType: 'Bearer',
          user: { ...usuarioBackend, roles: [{ role: { id: 6, name: 'PLATFORM_ADMIN', description: null } }] },
          tenant: null,
        });
      expect(config.headers.Authorization).toBe('Bearer jwt-plataforma');
      throw rechazo(config, 401, 'Unauthorized');
    };
    await plataformaService.login('plataforma@example.com', 'Abcdefg1');
    expect(localStorage.getItem(CLAVE_TOKEN_PLATAFORMA)).toBe('jwt-plataforma');
    await expect(plataformaService.empresas()).rejects.toBeInstanceOf(ErrorApi);
    expect(tokenPlataforma()).toBeNull();
    expect(obtenerToken()).toBe('jwt-tienda');
  });

  it('no acepta cuentas sin rol de plataforma', async () => {
    instancia.defaults.adapter = async (config) => respuesta(config, sesionBackend);
    await expect(plataformaService.login('cliente@example.com', 'Abcdefg1')).rejects.toThrow('plataforma');
    expect(tokenPlataforma()).toBeNull();
  });
});

describe('panel de la empresa', () => {
  let root: Root;
  let container: HTMLDivElement;
  let qc: QueryClient;
  beforeEach(() => {
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

  async function montarPanel(readOnly: boolean) {
    guardarToken('jwt-admin-b');
    instancia.defaults.adapter = async (config) => {
      if (config.url === '/auth/me')
        return respuesta(config, {
          ...usuarioBackend,
          client: null,
          roles: [{ role: { id: 1, name: 'ADMINISTRATOR', description: null } }],
        });
      if (config.url === '/tenant/subscription') return respuesta(config, suscripcion(readOnly));
      throw new Error(`URL no simulada: ${config.url}`);
    };
    await act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <ProveedorAuth>
            <ProveedorToast>
              <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                  <Route path="/admin" element={<LayoutPanel />}>
                    <Route index element={<p>Contenido</p>} />
                  </Route>
                </Routes>
              </MemoryRouter>
            </ProveedorToast>
          </ProveedorAuth>
        </QueryClientProvider>,
      ),
    );
    for (let i = 0; i < 60 && !(container.textContent ?? '').includes('Moda Andina'); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
  }

  it('muestra empresa y plan, y oculta los reportes con IA del plan Basico', async () => {
    await montarPanel(false);
    const texto = container.textContent ?? '';
    expect(texto).toContain('Moda Andina · Basico');
    expect(texto).toContain('Plan y suscripcion');
    expect(texto).not.toContain('Reportes con IA');
    expect(texto).not.toContain('Modo solo lectura');
  });

  it('avisa del modo solo lectura cuando la suscripcion vencio', async () => {
    await montarPanel(true);
    expect(container.textContent).toContain('Modo solo lectura');
    expect(container.textContent).toContain('esta vencida desde el');
  });
});

describe('landing SaaS, alta de empresa y acceso por codigo', () => {
  let root: Root;
  let container: HTMLDivElement;
  let qc: QueryClient;
  const planes = [
    { code: 'FREE', name: 'Gratuito', description: '1 sucursal', maxActiveBranches: 1, monthlyPrice: '0', features: { aiReports: false, offline: true } },
    { code: 'BASIC', name: 'Basico', description: '2 sucursales', maxActiveBranches: 2, monthlyPrice: '99.00', features: { aiReports: false, offline: true } },
    { code: 'PROFESSIONAL', name: 'Profesional', description: '10 sucursales', maxActiveBranches: 10, monthlyPrice: '199.00', features: { aiReports: true, offline: true } },
  ];
  const cuentaDueno = {
    accessToken: 'jwt-dueno',
    tokenType: 'Bearer',
    account: { id: 3, name: 'Ana Duena', email: 'ana@modadelsol.test' },
  };
  const empresaDueno = {
    id: 7,
    slug: 'moda-del-sol',
    name: 'Moda del Sol',
    status: 'ACTIVE',
    subscription: {
      status: 'ACTIVE',
      endsAt: '2026-12-31T00:00:00.000Z',
      readOnly: false,
      plan: { code: 'BASIC', name: 'Basico', monthlyPrice: 99, maxActiveBranches: 2 },
    },
    stats: {
      branches: 1,
      activeBranches: 1,
      staff: 1,
      customers: 0,
      products: 0,
      openReservations: 0,
      salesThisMonth: { count: 0, total: 0, currency: 'BOB' },
    },
  };
  const sesionAdmin = (slug: string, name: string) => ({
    ...sesionBackend,
    user: { ...usuarioBackend, client: null, roles: [{ role: { id: 1, name: 'ADMINISTRATOR', description: null } }] },
    tenant: { id: 7, slug, name },
  });
  beforeEach(() => {
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

  async function esperarTexto(texto: string) {
    for (let i = 0; i < 80 && !(container.textContent ?? '').includes(texto); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
  }
  async function montar(ruta: string) {
    await act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <ProveedorAuth>
            <ProveedorToast>
              <MemoryRouter initialEntries={[ruta]}>
                <Routes>
                  <Route path="/" element={<PaginaLanding />} />
                  <Route path="/login" element={<PaginaLogin />} />
                  <Route path="/registro-empresa" element={<PaginaRegistroEmpresa />} />
                  <Route path="/admin" element={<p>Panel de la empresa</p>} />
                  <Route path="/cuenta" element={<PaginaMisEmpresas />} />
                  <Route element={<LayoutTienda />}>
                    <Route path="/catalogo" element={<p>Catalogo de la tienda</p>} />
                  </Route>
                </Routes>
              </MemoryRouter>
            </ProveedorToast>
          </ProveedorAuth>
        </QueryClientProvider>,
      ),
    );
  }
  async function escribir(id: string, valor: string) {
    await act(async () => {
      const input = document.getElementById(id) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  async function enviar() {
    await act(async () => {
      (container.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
  }

  it('la landing muestra la plataforma y sus planes, sin el catalogo de ninguna tienda', async () => {
    const urls: string[] = [];
    instancia.defaults.adapter = async (config) => {
      urls.push(config.url!);
      if (config.url === '/saas/plans') return respuesta(config, planes);
      throw new Error(`URL no simulada: ${config.url}`);
    };
    await montar('/');
    await esperarTexto('Profesional');
    const texto = container.textContent ?? '';
    expect(texto).toContain('Iniciar sesion');
    expect(texto).toContain('Registrar empresa');
    expect(texto).toContain('Gratis');
    expect(texto).toContain('$99');
    expect(texto).toContain('$199');
    expect(urls).toEqual(['/saas/plans']);
    const elegir = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Elegir Basico');
    expect(elegir?.getAttribute('href')).toBe('/registro-empresa?plan=BASIC');
  });

  it('sin empresa elegida, la tienda vuelve a la landing', async () => {
    instancia.defaults.adapter = async (config) => {
      if (config.url === '/saas/plans') return respuesta(config, planes);
      throw new Error(`URL no simulada: ${config.url}`);
    };
    await montar('/catalogo');
    await esperarTexto('Registrar empresa');
    expect(container.textContent).not.toContain('Catalogo de la tienda');
  });

  it('registra la empresa con el plan elegido y entra con la cuenta de dueño a Mis empresas', async () => {
    let alta: Record<string, unknown> | undefined;
    let loginDueno: Record<string, unknown> | undefined;
    instancia.defaults.adapter = async (config) => {
      if (config.url === '/saas/plans') return respuesta(config, planes);
      if (config.url === '/saas/signup') {
        alta = JSON.parse(config.data as string);
        return respuesta(config, { slug: 'moda-del-sol', name: 'Moda del Sol' });
      }
      if (config.url === '/owner/auth/login') {
        loginDueno = JSON.parse(config.data as string);
        return respuesta(config, cuentaDueno);
      }
      if (config.url === '/owner/me') return respuesta(config, cuentaDueno.account);
      if (config.url === '/owner/tenants') return respuesta(config, [empresaDueno]);
      throw new Error(`URL no simulada: ${config.url}`);
    };
    await montar('/registro-empresa?plan=BASIC');
    await esperarTexto('Profesional');
    await escribir('empresa', 'Moda del Sol');
    expect((document.getElementById('codigo') as HTMLInputElement).value).toBe('moda-del-sol');
    await escribir('nombre', 'Ana Duena');
    await escribir('email', 'ana@modadelsol.test');
    await escribir('password', 'Clave1234');
    await escribir('confirmacion', 'Clave1234');
    await enviar();
    await esperarTexto('Entrar a la empresa');
    expect(alta).toEqual({
      name: 'Moda del Sol',
      slug: 'moda-del-sol',
      planCode: 'BASIC',
      admin: { name: 'Ana Duena', email: 'ana@modadelsol.test', password: 'Clave1234' },
    });
    expect(loginDueno).toEqual({ email: 'ana@modadelsol.test', password: 'Clave1234' });
    expect(tokenCuenta()).toBe('jwt-dueno');
    expect(container.textContent).toContain('Moda del Sol');
    expect(container.textContent).toContain('1 de 2');
  });

  it('Mis empresas: entra a una empresa con la sesion de su administrador', async () => {
    let entrada: string | undefined;
    instancia.defaults.adapter = async (config) => {
      if (config.url === '/owner/auth/login') return respuesta(config, cuentaDueno);
      if (config.url === '/owner/me') return respuesta(config, cuentaDueno.account);
      if (config.url === '/owner/tenants') return respuesta(config, [empresaDueno]);
      if (config.url === '/owner/tenants/7/session') {
        entrada = config.headers.Authorization as string;
        return respuesta(config, sesionAdmin('moda-del-sol', 'Moda del Sol'));
      }
      throw new Error(`URL no simulada: ${config.url}`);
    };
    await montar('/login?modo=dueno');
    expect(document.getElementById('codigo')).toBeNull();
    await escribir('email', 'ana@modadelsol.test');
    await escribir('password', 'Clave1234');
    await enviar();
    await esperarTexto('Entrar a la empresa');
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Entrar a la empresa')!.click();
    });
    await esperarTexto('Panel de la empresa');
    expect(entrada).toBe('Bearer jwt-dueno');
    expect(obtenerEmpresa()?.slug).toBe('moda-del-sol');
    expect(tokenCuenta()).toBe('jwt-dueno');
  });

  it('inicia sesion con el codigo de empresa y rechaza un codigo inexistente', async () => {
    let tenantDelLogin: unknown;
    instancia.defaults.adapter = async (config) => {
      if (config.url === '/tenant/public') {
        if (config.headers['X-Tenant'] !== 'empresa-b') throw rechazo(config, 404, 'Empresa no encontrada');
        return respuesta(config, { id: 2, slug: 'empresa-b', name: 'Moda Andina' });
      }
      if (config.url === '/auth/login') {
        tenantDelLogin = config.headers['X-Tenant'];
        return respuesta(config, sesionAdmin('empresa-b', 'Moda Andina'));
      }
      throw new Error(`URL no simulada: ${config.url}`);
    };
    await montar('/login?modo=tienda');
    await escribir('codigo', 'no-existe');
    await escribir('email', 'admin@empresa-b.test');
    await escribir('password', 'Clave1234');
    await enviar();
    await esperarTexto('No encontramos una empresa');
    expect(tenantDelLogin).toBeUndefined();

    await escribir('codigo', 'empresa-b');
    await enviar();
    await esperarTexto('Panel de la empresa');
    expect(tenantDelLogin).toBe('empresa-b');
    expect(obtenerEmpresa()).toEqual({ slug: 'empresa-b', nombre: 'Moda Andina' });
  });
});
