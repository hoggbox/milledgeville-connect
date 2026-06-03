// public/sw.js
self.addEventListener('push', event => {
  const payload = event.data?.json() || {};

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data: payload.data || {},
    tag: payload.tag || 'default',
    requireInteraction: true
  };

  // FIXED IMAGE HANDLING - accepts image OR imageUrl, handles relative URLs
  let imageUrl = payload.image || payload.imageUrl || null;

  if (imageUrl) {
    try {
      // Convert relative URL (/api/...) to full https:// URL
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        imageUrl = new URL(imageUrl, self.location.origin).href;
      }
      options.image = imageUrl;
      console.log('[SW] Notification image set:', imageUrl);
    } catch (e) {
      console.error('[SW] Failed to parse image URL:', e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Milledgeville Connect', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const page = data.page || 'home';
  const id   = data.id   || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const visibleClient = windowClients.find(c => c.visibilityState === 'visible');
      if (visibleClient) {
        visibleClient.focus();
        visibleClient.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: { page, id } });
        return;
      }

      const backgroundClient = windowClients.find(c => c.url.includes(self.location.origin));
      if (backgroundClient) {
        backgroundClient.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: { page, id } });
        return backgroundClient.focus();
      }

      const url = `/?notif_page=${encodeURIComponent(page)}&notif_id=${encodeURIComponent(id)}`;
      return self.clients.openWindow(url);
    })
  );
});