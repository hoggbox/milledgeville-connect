// public/sw.js
self.addEventListener('push', event => {
  const payload = event.data?.json() || {};

  const options = {
    body:  payload.body  || '',
    icon:  payload.icon  || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    // ── Keep the full data object so notificationclick can read page + id ──
    data:  payload.data  || {},
    // ⚠️ WARNING: do NOT use a static tag like 'default' here.
    // A shared tag causes every new notification to silently replace the previous
    // one in the browser's notification slot, which can drop images and collapse
    // unrelated alerts into a single entry. Use a unique tag per notification so
    // each one shows independently. Fallback to timestamp if no id is available.
    tag:   payload.data?.id || payload.data?.page && `${payload.data.page}-${Date.now()}` || `notif-${Date.now()}`,
    // Stay visible until the user taps (improves visibility on mobile)
    requireInteraction: true
  };

  // ✅ Only set image when it's a real https:// URL.
  // Passing a data: base64 string or undefined here causes Chrome Android to
  // silently drop the notification entirely on some devices.
  if (payload.image && payload.image.startsWith('https://')) {
    options.image = payload.image;

    // ── Firefox fallback: Firefox's Notifications API has never implemented
    // the `image` option (Chrome/Android-only feature) — see Mozilla bug 1580008.
    // So on Firefox the big preview photo silently doesn't render at all, with
    // no error. To make sure Firefox users still see *something* photo-related,
    // use the post's photo as the small `icon` instead of the static app icon.
    // The photo is strictly more useful than the generic app logo whenever one
    // exists, so we override unconditionally. This does NOT touch the `image`
    // field or its behavior on Chrome/Android, which keep showing both the
    // small icon area and the full-size preview exactly as before.
    options.icon = payload.image;
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