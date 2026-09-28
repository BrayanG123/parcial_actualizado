/*
 * Notificaciones push (Firebase Cloud Messaging) en el service worker.
 *
 * En produccion lo importa /sw.js (el de la PWA); en desarrollo se registra
 * solo. No carga el SDK de Firebase: FCM entrega el mensaje como un evento
 * "push" estandar con JSON { notification, data } y aqui se muestra.
 */
self.addEventListener('push', (event) => {
  let mensaje = {};
  try {
    mensaje = event.data ? event.data.json() : {};
  } catch {
    mensaje = { notification: { body: event.data ? event.data.text() : '' } };
  }
  const aviso = mensaje.notification || {};
  const datos = mensaje.data || {};
  const titulo = aviso.title || 'FashionStore';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, {
        body: aviso.body || '',
        icon: aviso.icon || '/pwa-icon.svg',
        badge: '/favicon.svg',
        tag: aviso.tag || datos.saleId || undefined,
        renotify: true,
        data: datos,
      }),
      // Las pestanas abiertas muestran un aviso propio y refrescan sus listas de ventas.
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((ventanas) =>
          ventanas.forEach((v) => v.postMessage({ tipo: 'PUSH', titulo, cuerpo: aviso.body || '', datos })),
        ),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si ya hay una pestana de FashionStore, se enfoca y la app navega (sin recargar).
      const abierta = ventanas.find((v) => new URL(v.url).origin === url.origin);
      if (abierta) {
        abierta.postMessage({ tipo: 'NAVEGAR', url: url.pathname + url.search });
        return abierta.focus();
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
