// public/sw.js
self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge.png',
    data: data.data || {},
    tag: data.tag || 'default'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Milledgeville Connect', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  if (data.page) {
    // Send to main app
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length) {
        clients[0].focus();
        clients[0].postMessage({
          type: 'PUSH_NOTIFICATION_CLICK',
          data: data
        });
      } else {
        self.clients.openWindow('/app.html');
      }
    });
  }
});