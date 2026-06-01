// public/sw.js
self.addEventListener('push', event => {
  const payload = event.data?.json() || {};

  const options = {
    body:  payload.body  || '',
    icon:  payload.icon  || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data:  payload.data  || {},           // ← important: carries page, id, bizId
    tag:   payload.tag   || 'default',
  };

  // ONLY set `image` when the server explicitly sends one.
  // Never fall back to the icon — that would show the app logo as a giant
  // banner on every notification, AND block real photo images from appearing.
  if (payload.image) {
    options.image = payload.image;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Milledgeville Connect', options)
  );

});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data  = event.notification.data || {};
  const page  = data.page  || 'home';
  const id    = data.id    || '';
  const bizId = data.bizId || '';   // ← business directory card ID

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const client = clients.find(c => c.url.includes(self.location.origin));

      if (client) {
        client.focus();
        client.postMessage({
          type: 'PUSH_NOTIFICATION_CLICK',
          data: { page, id, bizId }  // ← bizId forwarded to app
        });
        return;
      }

      // App was closed → open with query params (bizId included for cold-start routing)
      const url = `/?notif_page=${encodeURIComponent(page)}&notif_id=${encodeURIComponent(id)}&notif_bizId=${encodeURIComponent(bizId)}`;
      return self.clients.openWindow(url);
    })
  );
});