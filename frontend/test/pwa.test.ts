import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
it('precaches lazy assets and serves offline navigation while leaving API calls and mutations untouched', async () => {
  const handlers: Record<string, (e: unknown) => void> = {};
  const addAll = vi.fn().mockResolvedValue(undefined);
  const match = vi.fn(async (url: string) =>
    url === '/index.html' ? 'CACHED_APP' : 'CACHED_CHUNK',
  );
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  const source = readFileSync('scripts/sw-template.js', 'utf8')
    .replace('__CACHE__', 'test-cache')
    .replace('__ASSETS__', JSON.stringify(['/index.html', '/assets/offline.js']));
  runInNewContext(source, {
    URL,
    fetch,
    caches: { open: async () => ({ addAll, match }) },
    self: {
      location: { origin: 'https://store.test' },
      clients: { claim: vi.fn() },
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        handlers[name] = fn;
      },
    },
  });
  let install: Promise<unknown> | undefined;
  handlers.install({
    waitUntil: (p: Promise<unknown>) => {
      install = p;
    },
  });
  await install;
  expect(addAll).toHaveBeenCalledWith(['/index.html', '/assets/offline.js']);
  const respondWith = vi.fn();
  handlers.fetch({
    request: { url: 'https://store.test/caja/offline', method: 'GET', mode: 'navigate' },
    respondWith,
  });
  expect(await respondWith.mock.calls[0][0]).toBe('CACHED_APP');
  respondWith.mockClear();
  handlers.fetch({
    request: { url: 'https://store.test/assets/offline.js', method: 'GET', mode: 'cors' },
    respondWith,
  });
  expect(await respondWith.mock.calls[0][0]).toBe('CACHED_CHUNK');
  respondWith.mockClear();
  for (const [url, method] of [
    ['https://store.test/api/v1/sales', 'GET'],
    ['https://store.test/api/v1/sales', 'POST'],
    ['https://api.test/sales', 'GET'],
  ])
    handlers.fetch({ request: { url, method }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});
