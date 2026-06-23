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

    // ── Firefox fallback: Firefox's Notifications API has never implemented
    // the `image` option (Chrome/Android-only feature) — see Mozilla bug 1580008.
    // So on Firefox the big preview photo silently doesn't render at all, with
    // no error. To make sure Firefox users still see *something* photo-related,
    // use the post's photo as the small `icon` too, instead of the static app
    // icon — but only when the payload didn't already explicitly request a
    // specific icon. This does NOT touch the `image` field or its behavior on
    // Chrome/Android, which keep showing the full-size preview as before.
    if (!payload.icon) {
      options.icon = payload.image;
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

      // Case 1: App is already open and visible
      const visibleClient = windowClients.find(c => c.visibilityState === 'visible');
      if (visibleClient) {
        visibleClient.focus();
        visibleClient.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: { page, id } });
        return;
      }

      // Case 2: App is open but backgrounded
      // ── FIX 2: no setTimeout in service workers — post the message immediately,
      //    then focus. The app's 'message' listener handles sequencing via its own
      //    setTimeout internally (already in data.js). ─────────────────────────
      const backgroundClient = windowClients.find(c => c.url.includes(self.location.origin));
      if (backgroundClient) {
        backgroundClient.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: { page, id } });
        return backgroundClient.focus();
      }

      // Case 3: App was completely closed → open with query params
      const url = `/?notif_page=${encodeURIComponent(page)}&notif_id=${encodeURIComponent(id)}`;
      return self.clients.openWindow(url);
    })
  );
});