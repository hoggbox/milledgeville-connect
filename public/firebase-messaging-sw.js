// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId: "msconnect-49983",
});

const messaging = firebase.messaging();

// Background messages (app closed)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Milledgeville Connect";
  const options = {
    body: payload.notification?.body || "",
    icon: "/icon-192.png",
    data: payload.data || payload
  };
  self.registration.showNotification(title, options);
});

// CRITICAL: Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data || {};

  console.log('🔔 Notification clicked with data:', data);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        clientList[0].focus();
        clientList[0].postMessage({
          type: 'NOTIFICATION_CLICK',
          data: data
        });
      } else {
        clients.openWindow('/');
      }
    })
  );
});