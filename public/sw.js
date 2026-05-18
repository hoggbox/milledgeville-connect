// sw.js — Milledgeville Connect Service Worker
// Handles background push notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try { payload = event.data.json(); } catch (e) { payload = { title: 'Milledgeville Connect', body: event.data.text() }; }

  const title = payload.title || 'Milledgeville Connect';
  const body  = payload.body  || 'You have a new notification';

  // Support both shapes:
  //   Web push:  { title, body, data: { page, id, url } }
  //   FCM data:  { title, body, page, id, url }           (rare on web, but safe to handle)
  const meta = payload.data || payload;
  const deepUrl = meta.url || (meta.page ? `/${meta.page}${meta.id ? '/' + meta.id : ''}` : '/');

  const options = {
    body,
    icon:   '/icon-192.png',
    badge:  '/icon-192.png',
    data:   { url: deepUrl, page: meta.page || '', id: meta.id || '' },
    vibrate: [100, 50, 100],
    tag:    payload.tag || meta.tag || 'mc-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  // Prefer explicit url; fall back to constructing from page/id
  const url = notifData.url
    || (notifData.page ? `/${notifData.page}${notifData.id ? '/' + notifData.id : ''}` : '/');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        // If the app is already open, post a message so it can deep-link in-place
        // without a full page reload (avoids losing app state).
        if ('postMessage' in client) {
          client.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: notifData });
          return client.focus();
        }
        if ('focus' in client) return client.focus();
      }
      // No open tab — open the app at the deep-link URL
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});