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

  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'Milledgeville Connect', body: event.data.text() }; }

  const title   = data.title || 'Milledgeville Connect';
  const options = {
    body:   data.body  || 'You have a new notification',
    icon:   '/icon-192.png',
    badge:  '/icon-192.png',
    data:   { url: data.url || '/' },
    vibrate: [100, 50, 100],
    tag:    data.tag || 'mc-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});