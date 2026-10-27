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
