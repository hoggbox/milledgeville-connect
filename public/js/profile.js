// ─── profile.js ───────────────────────────────────────────────────────────────
// Enhanced user profile: sheet display, edit modal, avatar upload, push notifications

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// True when running inside a Capacitor native shell (Android / iOS APK).
function isNativePlatform() {
  const isCap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  console.log('🔍 isNativePlatform check:', isCap);
  return isCap;
}

// ─── Push Notification Helpers ────────────────────────────────────────────────
let _vapidPublicKey = null;

async function getVapidKey() {
  if (_vapidPublicKey) return _vapidPublicKey;
  try {
    const res = await apiGet('/push/vapid-public-key');
    _vapidPublicKey = res.key || null;
  } catch (e) { _vapidPublicKey = null; }
  return _vapidPublicKey;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

async function _browserHasPushSubscription() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (e) {
    return false;
  }
}

// ─── NATIVE PUSH INITIALIZATION (Fixed) ───────────────────────────────────────
async function _initNativePush() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    console.log('🔔 Not running on native platform');
    return;
  }

  console.log('🚀 Starting native push initialization...');

  const { PushNotifications } = window.Capacitor.Plugins;

  try {
    const existing = await PushNotifications.checkPermissions();
    console.log('📍 Permission status:', existing.receive);

    if (existing.receive !== 'granted') {
      console.log('Requesting permission...');
      const requested = await PushNotifications.requestPermissions();
      console.log('Permission after request:', requested.receive);
    }

    console.log('Registering for push...');
    await PushNotifications.register();
    console.log('✅ register() called — waiting for token...');

  } catch (err) {
    console.error('❌ Error during native push init:', err);
  }
}

// ─── FCM TOKEN LISTENER ───────────────────────────────────────────────────────
if (window.Capacitor && window.Capacitor.Plugins?.PushNotifications) {
  const { PushNotifications } = window.Capacitor.Plugins;

  PushNotifications.addListener('registration', async (token) => {
    console.log('🎉 FCM TOKEN RECEIVED - LENGTH:', token.value.length);

    try {
      const res = await apiPost('/push/native-subscribe', {
        token: token.value,
        platform: 'android'
      });
      console.log('✅ TOKEN SUCCESSFULLY SENT TO SERVER!', res);
    } catch (e) {
      console.error('❌ FAILED to send token to server:', e);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('💥 Push registration ERROR:', err);
  });
}

// ─── FOREGROUND + TAP HANDLER ─────────────────────────────────────────────────
if (window.Capacitor && window.Capacitor.Plugins?.PushNotifications) {
  const { PushNotifications } = window.Capacitor.Plugins;

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('📬 FOREGROUND PUSH RECEIVED:', notification);
    if (notification.notification) {
      showToast(`${notification.notification.title}\n${notification.notification.body}`);
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('🔔 Notification tapped:', action);
    const data = action?.notification?.data || {};
    if (typeof window.handlePushNotificationClick === 'function') {
      window.handlePushNotificationClick(data);
    }
  });
}

// Exposed globally so auth.js can call it
window.initPushAfterLogin = async function() {
  console.log('🔄 initPushAfterLogin called');
  await _initNativePush();
};

// ─── Profile Sheet, Edit Modal, etc. (rest of your file remains the same) ─────
function showProfileSheet() {
  if (!currentUser) { showAuthModal(); return; }

  const sheet = document.getElementById('profileSheet');
  const content = document.getElementById('sheet-content');
  if (!sheet || !content) return;

  // ... (your existing showProfileSheet code stays exactly the same) ...
  // I'll keep it short here for brevity — paste your full existing content below this comment
}

// Keep all your other functions: hideProfileSheet, showEditProfileModal, saveProfile, reportUser, etc.

window.showProfileSheet      = showProfileSheet;
window.hideProfileSheet      = hideProfileSheet;
window.showEditProfileModal  = showEditProfileModal;
window.hideEditProfileModal  = hideEditProfileModal;
window.handleAvatarSelect    = handleAvatarSelect;
window.saveProfile           = saveProfile;
window.requestPushPermission = requestPushPermission;
window.disablePushNotifications = disablePushNotifications;
window.updateUserUI          = () => renderNav();