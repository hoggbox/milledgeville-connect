// public/sw.js
self.addEventListener('push', event => {
  const payload = event.data?.json() || {};

  const options = {
    body:  payload.body  || '',
    icon:  payload.icon  || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    // ── Keep the full data object so notificationclick can read page + id ──
    data:  payload.data  || {},
    tag:   payload.tag   || 'default',
    // Stay visible until the user taps (improves visibility on mobile)
    requireInteraction: true
  };

  // ✅ FIX: only set image when it's a real https:// URL.
  // Passing a data: base64 string or undefined here causes Chrome Android to
  // silently drop the notification entirely on some devices.
  if (payload.image && payload.image.startsWith('https://')) {
    options.image = payload.image;
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

  const deepLinkUrl = `/?notif_page=${encodeURIComponent(page)}&notif_id=${encodeURIComponent(id)}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {

      // Case 1: App is already open AND visible (foreground tab/window)
      // postMessage is safe here — JS context is live and DOM is ready.
      const visibleClient = windowClients.find(c => c.visibilityState === 'visible');
      if (visibleClient) {
        visibleClient.focus();
        visibleClient.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: { page, id } });
        return;
      }

      // Case 2: App is backgrounded/suspended OR completely closed.
      // On Android, focus() triggers a full app resume (300-800ms) but postMessage
      // already fired — the JS context isn't ready yet so the message is lost.
      // Solution: navigate to the deep-link URL instead. The cold-launch handler
      // in data.js reads notif_page + notif_id after the app fully initializes.
      const anyClient = windowClients.find(c => c.url.includes(self.location.origin));
      if (anyClient) {
        return anyClient.navigate(deepLinkUrl).then(client => client && client.focus());
      }

      // Case 3: App was completely closed → open fresh with query params
      return self.clients.openWindow(deepLinkUrl);
    })
  );
});