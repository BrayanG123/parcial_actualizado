import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

function cargar(ventanas: { url: string; postMessage: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[]) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync('public/push-sw.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://store.test' },
      registration: { showNotification },
      clients: { matchAll: vi.fn().mockResolvedValue(ventanas), openWindow },
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        handlers[name] = fn;
      },
    },
  });
  return { handlers, showNotification, openWindow };
}

it('shows the FCM purchase notification and tells open tabs to refresh', async () => {
  const pestana = { url: 'https://store.test/caja', postMessage: vi.fn(), focus: vi.fn() };
  const { handlers, showNotification } = cargar([pestana]);
  let espera: Promise<unknown> | undefined;
  handlers.push({
    data: {
      json: () => ({
        notification: { title: 'Nueva compra pagada (web)', body: 'Ana compro 2 prendas', tag: 'venta-7' },
        data: { tipo: 'VENTA', saleId: '7', url: '/caja/ventas' },
      }),
    },
    waitUntil: (p: Promise<unknown>) => (espera = p),
  });
  await espera;
  expect(showNotification).toHaveBeenCalledWith(
    'Nueva compra pagada (web)',
    expect.objectContaining({ body: 'Ana compro 2 prendas', tag: 'venta-7', data: expect.objectContaining({ url: '/caja/ventas' }) }),
  );
  expect(pestana.postMessage).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'PUSH', titulo: 'Nueva compra pagada (web)' }));
});

it('opens the sales screen of the notification on click', async () => {
  const pestana = { url: 'https://store.test/admin', postMessage: vi.fn(), focus: vi.fn() };
  const { handlers, openWindow } = cargar([pestana]);
  let espera: Promise<unknown> | undefined;
  const close = vi.fn();
  handlers.notificationclick({
    notification: { close, data: { url: '/admin/ventas' } },
    waitUntil: (p: Promise<unknown>) => (espera = p),
  });
  await espera;
  expect(close).toHaveBeenCalled();
  expect(pestana.postMessage).toHaveBeenCalledWith({ tipo: 'NAVEGAR', url: '/admin/ventas' });
  expect(pestana.focus).toHaveBeenCalled();
  expect(openWindow).not.toHaveBeenCalled();

  const sinPestanas = cargar([]);
  sinPestanas.handlers.notificationclick({
    notification: { close, data: { url: '/caja/ventas' } },
    waitUntil: (p: Promise<unknown>) => (espera = p),
  });
  await espera;
  expect(sinPestanas.openWindow).toHaveBeenCalledWith('https://store.test/caja/ventas');
});
