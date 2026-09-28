import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AxiosError } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProveedorAuth, useAuth } from '../src/context/AuthContext';
import { RutaProtegida } from '../src/routes/RutaProtegida';
import { api, instancia } from '../src/api/http';
import { guardarToken, obtenerToken } from '../src/api/sesion';
import { CLAVE_TOKEN } from '../src/api/config';
import { rechazo, respuesta, usuarioBackend } from './fixtures';

let root: Root;
let container: HTMLDivElement;
let auth: ReturnType<typeof useAuth>;
let queryClient: QueryClient;

function Estado() {
  const estado = useAuth();
  useEffect(() => {
    auth = estado;
  }, [estado]);
  return <span>{estado.usuario?.nombre ?? 'anonimo'}</span>;
}

async function montar() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ProveedorAuth>
          <Estado />
          <MemoryRouter initialEntries={['/privado']}>
            <Routes>
              <Route
                path="/privado"
                element={
                  <RutaProtegida roles={['CLIENTE']}>
                    <p>Contenido privado</p>
                  </RutaProtegida>
                }
              />
              <Route path="/login" element={<p>Formulario de login</p>} />
            </Routes>
          </MemoryRouter>
        </ProveedorAuth>
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  guardarToken(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  container.remove();
});

describe('sesion y rutas protegidas', () => {
  it('espera el perfil antes de entrar y ante 401 borra datos privados y redirige al login', async () => {
    guardarToken('guardado');
    let completar!: () => void;
    instancia.defaults.adapter = (config) =>
      new Promise((resolve) => {
        completar = () => resolve(respuesta(config, usuarioBackend));
      });
    await montar();
    expect(container.textContent).toContain('Verificando tu sesion');
    await act(async () => completar());
    expect(container.textContent).toContain('Contenido privado');
    expect(auth.idCliente).toBe(31);
    queryClient.setQueryData(['carrito'], { secreto: true });
    instancia.defaults.adapter = async (config) => {
      throw rechazo(config, 401, 'Unauthorized');
    };
    await act(async () => {
      await api.get('/cart').catch(() => undefined);
    });
    expect(container.textContent).toContain('Formulario de login');
    expect(auth.usuario).toBeNull();
    expect(queryClient.getQueryData(['carrito'])).toBeUndefined();
  });

  it('un fallo de red permite reintentar sin perder el token ni aparentar una sesion expirada', async () => {
    guardarToken('guardado');
    instancia.defaults.adapter = async () => {
      throw new AxiosError('Network Error');
    };
    await montar();
    expect(container.textContent).toContain('No pudimos conectar');
    expect(container.textContent).not.toContain('Formulario de login');
    expect(obtenerToken()).toBe('guardado');
    instancia.defaults.adapter = async (config) => respuesta(config, usuarioBackend);
    await act(async () => auth.reintentarSesion());
    expect(container.textContent).toContain('Contenido privado');
  });

  it('una respuesta tardia de /me no restaura una sesion cerrada', async () => {
    guardarToken('guardado');
    let completar!: () => void;
    instancia.defaults.adapter = (config) =>
      new Promise((resolve) => {
        completar = () => resolve(respuesta(config, usuarioBackend));
      });
    await montar();
    await act(async () => auth.cerrarSesion());
    await act(async () => completar());
    expect(auth.usuario).toBeNull();
    expect(container.textContent).toContain('Formulario de login');
  });

  it('sincroniza el cierre de sesion desde otra pestaña', async () => {
    guardarToken('guardado');
    instancia.defaults.adapter = async (config) => respuesta(config, usuarioBackend);
    await montar();
    await act(async () => {
      localStorage.removeItem(CLAVE_TOKEN);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CLAVE_TOKEN,
          storageArea: localStorage,
          newValue: null,
        }),
      );
    });
    expect(auth.usuario).toBeNull();
    expect(container.textContent).toContain('Formulario de login');
  });
});
