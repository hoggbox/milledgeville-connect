// public/sw.js — fixed deep link + thumbnail support
self.addEventListener('push', event => {
  const payload = event.data?.json() || {};
  const options = {
    body:  payload.body  || '',
    icon:  payload.icon  || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data:  payload.data  || {},
    tag:   payload.tag   || 'default'
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Milledgeville Connect', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data   = event.notification.data || {};
  const page   = data.page || 'home';
  const id     = data.id   || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Case 1: App is already open and visible
      const visibleClient = windowClients.find(c => c.visibilityState === 'visible');
      if (visibleClient) {
        visibleClient.focus();
        visibleClient.postMessage({
          type: 'PUSH_NOTIFICATION_CLICK',
          data: { page, id }
        });
        return;
      }

      // Case 2: App is open but in background
      const backgroundClient = windowClients.find(c => c.url.includes(self.location.origin));
      if (backgroundClient) {
        backgroundClient.focus();
        setTimeout(() => {
          backgroundClient.postMessage({
            type: 'PUSH_NOTIFICATION_CLICK',
            data: { page, id }
          });
        }, 300);
        return;
      }

      // Case 3: App was completely closed → open with query params
      const url = `/?notif_page=${encodeURIComponent(page)}&notif_id=${encodeURIComponent(id)}`;
      return self.clients.openWindow(url);
    })
  );
});