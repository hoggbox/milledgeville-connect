// ─── profile.js ───────────────────────────────────────────────────────────────
// Enhanced user profile: sheet display, edit modal, avatar upload, push notifications

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Notification API is undefined in Android WebView (Capacitor uses native push).
// Use this helper everywhere instead of accessing getNotificationPermission() directly.
function getNotificationPermission() {
  return (typeof Notification !== 'undefined') ? Notification.permission : 'default';
}

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

// ─── Check whether the browser actually has an active push subscription ───────
// This is the ground-truth source — more reliable than currentUser.pushEnabled
// because the server flag can get out of sync with the browser state.
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

async function requestPushPermission() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Push notifications are not supported on this device/browser.', 'error');
    return false;
  }
  const vapidKey = await getVapidKey();
  if (!vapidKey) {
    showToast('Push notifications are not configured on this server yet.', 'error');
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;

    // Unsubscribe from any stale subscription first so we always get a fresh one
    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) await existingSub.unsubscribe();

    const permission = (typeof Notification !== 'undefined')
      ? await Notification.requestPermission()
      : 'denied';
    if (permission !== 'granted') {
      showToast('Notification permission denied. Enable it in browser settings.', 'error');
      return false;
    }
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
    const res = await apiPost('/push/subscribe', { subscription: subscription.toJSON() });
    if (res.message === 'Subscribed') {
      currentUser.pushEnabled = true;
      return true;
    }
  } catch (err) {
    console.error('Push subscribe error:', err);
    showToast('Could not enable push notifications. Please try again.', 'error');
  }
  return false;
}

async function disablePushNotifications() {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
    await apiPost('/push/unsubscribe', {});
    currentUser.pushEnabled = false;
  } catch (err) {
    console.error('Push unsubscribe error:', err);
  }
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

async function _initNativePush() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    console.log('🔔 Not running on native platform');
    return;
  }

  console.log('🚀 Starting native push initialization...');

  const { PushNotifications } = window.Capacitor.Plugins;

  try {
    const existing = await PushNotifications.checkPermissions();
    console.log('📍 Current permission:', existing.receive);

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

// ─── FCM TOKEN LISTENER ─────────────────────────────
console.log('📡 Push listener registered');

if (window.Capacitor && window.Capacitor.Plugins?.PushNotifications) {
  const { PushNotifications } = window.Capacitor.Plugins;

  PushNotifications.addListener('registration', async (token) => {
    console.log('🎉🎉🎉 FCM TOKEN RECEIVED - LENGTH:', token.value.length);

    try {
      const res = await apiPost('/push/native-subscribe', {
        token: token.value,
        platform: 'android'
      });
      console.log('✅✅✅ TOKEN SUCCESSFULLY SENT TO SERVER!', res);
      showToast('✅ Push token registered');
    } catch (e) {
      console.error('❌ FAILED to send token to server:', e);
      showToast('Push registration failed', 'error');
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('💥 Push registration ERROR:', err);
  });
} else {
  console.log('⚠️ PushNotifications plugin not available');
}

// ─── FOREGROUND NOTIFICATION HANDLER ────────────────────────────────────────
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
    if (!data.page) return;

    if (typeof window.handlePushNotificationClick === 'function') {
      window.handlePushNotificationClick(data);
    }
  });
}

// ─── CLEAN PUSH INIT ─────────────────────────────────
window.initPushAfterLogin = async function() {
  console.log('🔄 initPushAfterLogin');

  if (window.Capacitor?.isNativePlatform()) {
    await initNativePush();
  } else {
    await initWebVapidPush();
  }
};

async function initNativePush() {
  if (!window.Capacitor?.Plugins?.PushNotifications) {
    console.log('❌ PushNotifications plugin not available');
    return;
  }

  const { PushNotifications } = window.Capacitor.Plugins;

  try {
    console.log('🔍 Checking native push permissions...');
    let perm = await PushNotifications.checkPermissions();
    
    if (perm.receive !== 'granted') {
      console.log('Requesting permission...');
      perm = await PushNotifications.requestPermissions();
    }

    if (perm.receive === 'granted') {
      console.log('✅ Permission granted — registering...');
      await PushNotifications.register();
    } else {
      console.warn('⚠️ Push permission denied by user');
    }
  } catch (e) {
    console.error('❌ initNativePush failed:', e);
  }
}

async function initWebVapidPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const vapidKeyRes = await apiGet('/push/vapid-public-key');
    const vapidKey = vapidKeyRes.key;
    if (!vapidKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });

    await apiPost('/push/subscribe', { subscription: subscription.toJSON() });
    if (currentUser) currentUser.pushEnabled = true;
  } catch (err) {
    console.error('Web VAPID failed:', err);
  }
}

function showProfileSheet() {
  if (!currentUser) { 
    showAuthModal(); 
    return; 
  }

  const sheet = document.getElementById('profileSheet');
  const content = document.getElementById('sheet-content');
  if (!sheet || !content) return;

  const lastLoginText = currentUser.lastLogin
    ? `Last active: ${new Date(currentUser.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Just now';

  const isAdmin = currentUser.email === 'imhoggbox@gmail.com';
  const isVerified = !!currentUser.verifiedBusiness;
  const joinedStr = currentUser.joinedAt
    ? new Date(currentUser.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  const socials = [
    currentUser.instagram ? `<a href="https://instagram.com/${currentUser.instagram.replace('@','')}" target="_blank" class="flex items-center gap-2 text-pink-400 hover:text-pink-300 text-sm font-medium transition"><span class="text-lg">📸</span> @${currentUser.instagram.replace('@','')}</a>` : '',
    currentUser.facebook ? `<a href="${currentUser.facebook.startsWith('http') ? currentUser.facebook : 'https://facebook.com/'+currentUser.facebook}" target="_blank" class="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition"><span class="text-lg">👤</span> Facebook</a>` : '',
    currentUser.website ? `<a href="${currentUser.website.startsWith('http') ? currentUser.website : 'https://'+currentUser.website}" target="_blank" class="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-medium transition"><span class="text-lg">🔗</span> ${currentUser.website.replace(/^https?:\/\//,'')}</a>` : ''
  ].filter(Boolean).join('');

  const isNative      = isNativePlatform();
  const pushSupported = isNative || (('serviceWorker' in navigator) && ('PushManager' in window));
  const pushBlocked   = !isNative && getNotificationPermission() === 'denied';

content.innerHTML = `
  <div class="relative -mx-6 -mt-2 mb-6 px-6 pt-10 pb-20 rounded-t-3xl overflow-hidden"
       style="background: linear-gradient(135deg,#064e3b 0%,#065f46 50%,#047857 100%);">
    <div class="absolute inset-0 opacity-10" style="background-image:repeating-linear-gradient(45deg,transparent,transparent 20px,rgba(255,255,255,.15) 20px,rgba(255,255,255,.15) 21px);"></div>
    <button id="profileEditBtn" class="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition flex items-center gap-1.5">✏️ Edit Profile</button>
  </div>

  <div class="flex justify-center -mt-20 mb-4 relative z-10">
    <div class="relative inline-block">
      <div class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-white shadow-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-7xl font-bold text-white">
        ${currentUser.avatar ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover" alt="avatar">` : (currentUser.name||'?')[0].toUpperCase()}
      </div>
      ${isVerified ? `<div class="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 border border-white">✓ Verified</div>` : ''}
    </div>
  </div>

  <h2 class="text-3xl font-bold text-white mt-2">${currentUser.name}</h2>
  <p class="text-emerald-400 text-base mb-1">${currentUser.email}</p>
  ${currentUser.neighborhood ? `<p class="text-white/60 text-sm flex items-center justify-center gap-1">📍 ${currentUser.neighborhood}</p>` : ''}

  <!-- Reputation + Developer Badge -->
  <div class="flex justify-center mt-3 mb-6">
    <div class="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-bold text-xl px-6 py-2.5 rounded-3xl shadow">
      ⭐ ${currentUser.reputation || 0}
      <span class="text-base opacity-75">Reputation</span>
    </div>
  </div>

  ${currentUser.isDeveloper ? `
  <div class="flex justify-center mb-4">
    <div class="inline-flex items-center gap-2 px-5 py-1.5 rounded-3xl 
                bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 
                text-white font-bold text-sm tracking-[1.5px] shadow-lg shadow-violet-500/30
                border border-white/20">
      <span class="font-mono text-base">&lt;/&gt;</span>
      <span>DEVELOPER</span>
    </div>
  </div>` : ''}

  <!-- Role -->
  <div class="flex justify-center mb-6">
    <div class="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-5 py-2 rounded-3xl text-sm">
      <span class="text-lg">${currentUser.isDeveloper ? '🧠' : (isAdmin ? '🔧' : '⭐')}</span>
      <span class="font-semibold text-white/90">
        ${currentUser.isDeveloper ? 'Creator & Developer' : (isAdmin ? 'Admin' : 'Member')}
      </span>
    </div>
  </div>

  <!-- Contact / Socials -->
  ${(currentUser.phone || socials) ? `
  <div class="mt-5 bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-2">
    ${currentUser.phone ? `<div class="flex items-center gap-2 text-white/80 text-sm"><span>📞</span><span>${currentUser.phone}</span></div>` : ''}
    ${socials}
  </div>` : ''}

  <!-- Push Notifications Toggle -->
  ${pushSupported ? `
  <div class="mt-5 bg-white/5 border border-white/10 rounded-2xl p-4">
    <label for="sheetPushToggle" class="flex items-center justify-between gap-3 cursor-pointer select-none">
      <div class="text-left">
        <p class="text-sm font-semibold text-white">🔔 Push Notifications</p>
        <p id="sheetPushStatus" class="text-xs text-white/50 mt-0.5">
          ${pushBlocked ? '⚠️ Blocked in browser settings' : isNative ? 'Loading...' : 'Receive alerts when the app is closed'}
        </p>
      </div>
      <div class="relative flex-shrink-0">
        <input type="checkbox" id="sheetPushToggle" class="sr-only peer" ${pushBlocked ? 'disabled' : ''}>
        <div class="w-11 h-6 bg-white/20 rounded-full peer peer-checked:bg-emerald-500 transition-colors ${pushBlocked ? 'opacity-40' : ''}"></div>
        <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5 pointer-events-none"></div>
      </div>
    </label>
  </div>` : ''}

  <p class="text-white/40 text-xs mt-4">${lastLoginText}</p>

  <!-- Action Buttons -->
  <div class="mt-8 space-y-2.5">
    ${isAdmin ? `
    <button onclick="navigate('admin'); hideProfileSheet()" 
            class="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white py-4 rounded-3xl font-semibold text-lg transition">
      🔧 Admin Panel
    </button>` : ''}

    ${isVerified ? `
    <button onclick="navigate('owner-dashboard'); hideProfileSheet()" 
            class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-4 rounded-3xl font-semibold text-lg transition">
      🏪 My Business Dashboard
    </button>` : ''}

    <button onclick="showEditProfileModal()" 
            class="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white py-4 rounded-3xl font-semibold text-lg transition">
      ✏️ Edit Profile
    </button>

    <button onclick="showAccountSettingsModal()" 
            class="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white py-4 rounded-3xl font-semibold text-lg transition">
      ⚙️ Settings & Privacy
    </button>

    <button onclick="logout()" 
            class="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/30 text-red-400 py-4 rounded-3xl font-semibold text-lg transition">
      Logout
    </button>

    <button onclick="hideProfileSheet()" 
            class="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white py-4 rounded-3xl font-semibold text-lg transition mt-1">
      Close
    </button>
  </div>
`;

  sheet.classList.remove('hidden');

  requestAnimationFrame(() => {
    document.getElementById('profileEditBtn')?.addEventListener('click', showEditProfileModal);

    if (pushSupported && (isNative || !pushBlocked)) {
      _initSheetPushToggle();
    }
  });
}

// Initialise the push toggle in the profile sheet.
async function _initSheetPushToggle() {
  const toggle   = document.getElementById('sheetPushToggle');
  const statusEl = document.getElementById('sheetPushStatus');
  if (!toggle) return;

  const native = isNativePlatform();

  if (native) {
    toggle.checked = true;
    if (statusEl) statusEl.textContent = '✅ Push notifications enabled';

    toggle.onchange = async function () {
      const enabling = this.checked;
      toggle.disabled = true;

      if (enabling) {
        await initNativePush();
        if (statusEl) statusEl.textContent = '✅ Notifications on';
        showToast('✅ Push notifications enabled!');
      } else {
        if (statusEl) statusEl.textContent = 'Push notifications turned off';
        showToast('Push notifications turned off');
      }
      toggle.disabled = false;
    };
  } else {
    const hasSub = await _browserHasPushSubscription();
    toggle.checked = hasSub;
    if (statusEl) statusEl.textContent = hasSub ? '✅ Notifications on' : 'Tap to enable';
  }
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function showEditProfileModal() {
  pendingAvatarData = undefined;

  let modal = document.getElementById('editProfileModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editProfileModal';
    modal.className = 'fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[12000]';
    modal.onclick = e => { if (e.target === modal) hideEditProfileModal(); };
    document.body.appendChild(modal);
  }

  const u = currentUser;

  modal.innerHTML = `
    <div onclick="event.stopPropagation()" 
         class="bg-[#0f172a] text-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl border border-white/10">

      <div class="sticky top-0 bg-[#0f172a] z-10 pt-4 pb-3 px-6 border-b border-white/10 flex items-center justify-between rounded-t-3xl">
        <h2 class="text-xl font-bold">Edit Profile</h2>
        <button onclick="hideEditProfileModal()" class="text-white/50 hover:text-white text-2xl leading-none">✕</button>
      </div>

      <div class="p-6 space-y-6">

        <div class="flex flex-col items-center gap-3">
          <div id="avatarPreview"
               class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-white/10 shadow-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-7xl font-bold text-white cursor-pointer relative group"
               onclick="document.getElementById('avatarFileInput').click()">
            ${u.avatar 
              ? `<img src="${u.avatar}" class="w-full h-full object-cover" id="avatarImg">` 
              : `<span id="avatarLetter">${(u.name||'?')[0].toUpperCase()}</span>`}
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-3xl">
              <span class="text-white text-3xl">📷</span>
            </div>
          </div>
          <button onclick="document.getElementById('avatarFileInput').click()" 
                  class="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2 rounded-full transition">
            📷 Change Photo
          </button>
          <input id="avatarFileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" onchange="handleAvatarSelect(this)">
          <p class="text-xs text-white/40">JPG, PNG or WebP · Max 2 MB</p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Full Name *</label>
          <input id="ep-name" type="text" value="${escHtml(u.name || '')}" maxlength="60" 
                 class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white">
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Bio <span class="normal-case font-normal text-white/40">(max 280 chars)</span></label>
          <textarea id="ep-bio" maxlength="280" rows="3" 
                    class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white resize-none"
                    placeholder="Tell the community a little about yourself…">${escHtml(u.bio || '')}</textarea>
          <div class="text-right text-xs text-white/40 mt-1"><span id="bioCount">${(u.bio||'').length}</span>/280</div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Neighborhood</label>
          <input id="ep-neighborhood" type="text" value="${escHtml(u.neighborhood || '')}" 
                 class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white">
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Phone Number</label>
          <input id="ep-phone" type="tel" value="${escHtml(u.phone || '')}" 
                 class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white">
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Website</label>
          <input id="ep-website" type="text" value="${escHtml(u.website || '')}" 
                 class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white">
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Instagram</label>
          <input id="ep-instagram" type="text" value="${escHtml(u.instagram || '')}" placeholder="@username"
                 class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white">
        </div>

        <div>
          <label class="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">Facebook</label>
          <input id="ep-facebook" type="text" value="${escHtml(u.facebook || '')}" 
                 class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-white">
        </div>

        <button onclick="saveProfile()" id="saveProfileBtn"
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-bold text-lg transition flex items-center justify-center gap-2 mt-4">
          💾 Save Changes
        </button>
      </div>
    </div>`;

  modal.classList.remove('hidden');

  const bioTextarea = document.getElementById('ep-bio');
  const bioCount = document.getElementById('bioCount');
  if (bioTextarea && bioCount) {
    bioTextarea.addEventListener('input', () => {
      bioCount.textContent = bioTextarea.value.length;
    });
  }
}

function hideEditProfileModal() {
  const modal = document.getElementById('editProfileModal');
  if (modal) modal.classList.add('hidden');
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
let pendingAvatarData = undefined;

function handleAvatarSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    showToast('Please upload a JPG, PNG, or WebP image.', 'error');
    input.value = '';
    return;
  }
  if (file.size > MAX_AVATAR_BYTES) {
    showToast(`Image is too large. Max 2 MB.`, 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    pendingAvatarData = e.target.result;
    const preview = document.getElementById('avatarPreview');
    if (preview) {
      preview.innerHTML = `
        <img src="${pendingAvatarData}" class="w-full h-full object-cover" id="avatarImg">
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-3xl">
          <span class="text-white text-3xl">📷</span>
        </div>`;
    }
  };
  reader.readAsDataURL(file);
}

window.removeAvatar = function () {
  pendingAvatarData = null;
  const preview = document.getElementById('avatarPreview');
  const letter = (currentUser.name || '?')[0].toUpperCase();
  if (preview) {
    preview.innerHTML = `
      <span id="avatarLetter">${letter}</span>
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-3xl">
        <span class="text-white text-3xl">📷</span>
      </div>`;
  }
};

// ─── Save profile ─────────────────────────────────────────────────────────────
async function saveProfile() {
  const btn  = document.getElementById('saveProfileBtn');
  const name = document.getElementById('ep-name')?.value.trim();
  if (!name) { alert('Name is required.'); return; }

  btn.disabled = true;
  btn.innerHTML = '⏳ Saving…';

  const payload = {
    name,
    bio:          document.getElementById('ep-bio')?.value.trim() || '',
    neighborhood: document.getElementById('ep-neighborhood')?.value.trim() || '',
    phone:        document.getElementById('ep-phone')?.value.trim() || '',
    website:      document.getElementById('ep-website')?.value.trim() || '',
    instagram:    document.getElementById('ep-instagram')?.value.trim() || '',
    facebook:     document.getElementById('ep-facebook')?.value.trim() || '',
  };

  if (pendingAvatarData !== undefined) payload.avatar = pendingAvatarData;

  const res = await apiPatch('/auth/profile', payload);

  if (res.user) {
    currentUser = res.user;
    pendingAvatarData = undefined;
    updateUserUI();
    hideEditProfileModal();
    setTimeout(() => showProfileSheet(), 150);
    showToast('✅ Profile updated!');
  } else {
    showToast(res.message || 'Failed to save profile.', 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '💾 Save Changes';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── AUTO INIT NATIVE PUSH ON APK STARTUP ─────────────────────────────
if (window.Capacitor?.isNativePlatform()) {
  console.log('📱 Detected native platform — auto-initializing push');
  setTimeout(() => {
    window.initPushAfterLogin?.();
  }, 1200);
}

// ─── GLOBAL EXPORTS ───────────────────────────────────────────────────────────
window.showProfileSheet     = showProfileSheet;
window.hideProfileSheet     = hideProfileSheet;
window.showEditProfileModal = showEditProfileModal;
window.saveProfile          = saveProfile;
window.handleAvatarSelect   = handleAvatarSelect;

function hideProfileSheet() {
  const panel = document.getElementById('profileSheetPanel');
  const sheet = document.getElementById('profileSheet');
  if (panel) panel.classList.add('translate-y-full');
  setTimeout(() => { if (sheet) sheet.classList.add('hidden'); }, 300);
}

window.initPushAfterLogin = window.initPushAfterLogin;

// ─── OTHER USER PROFILE MODAL ───────────────────────────────────────────────
window.showUserProfileModal = async function (userId) {
  if (!currentUser) {
    showAuthModal({ message: 'Sign in to view profiles.' });
    return;
  }

  try {
    const user = await apiGet(`/users/${userId}`);
    if (!user || user.message) throw new Error('User not found');

    const rep = user.reputation || 0;
    const isOwnProfile = String(currentUser._id) === String(user._id);
    const isDev = !!user.isDeveloper;

    const joined = user.joinedAt 
      ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) 
      : 'Recently';

    const html = `
      <div onclick="if(event.target.id==='userProfileModal') hideUserProfileModal()" 
           id="userProfileModal"
           class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[30000] flex items-end md:items-center md:justify-center overflow-y-auto">
        
        <div onclick="event.stopImmediatePropagation()" 
             class="bg-[#0f172a] text-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl border border-white/10">

          <div class="sticky top-0 bg-[#0f172a] pt-4 pb-3 flex justify-center border-b border-white/10 z-10">
            <div class="w-12 h-1.5 bg-white/20 rounded-full"></div>
          </div>

          <div class="p-6">
            <div class="flex justify-center mb-4">
              <div class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-white/10 shadow-xl flex items-center justify-center text-6xl font-bold bg-gradient-to-br from-emerald-500 to-teal-600">
                ${user.avatar 
                  ? `<img src="${user.avatar}" class="w-full h-full object-cover">` 
                  : (user.name || '?')[0].toUpperCase()}
              </div>
            </div>

            <div class="text-center mb-4">
              <h2 class="text-3xl font-bold">${esc(user.name)}</h2>
              
              ${isDev ? `
              <div class="flex justify-center mt-2 mb-1">
                <div class="inline-flex items-center gap-1.5 px-4 py-1 rounded-full 
                            bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 
                            text-white text-xs font-bold tracking-[1.5px] shadow-lg shadow-violet-500/40">
                  <span class="font-mono text-sm">&lt;/&gt;</span>
                  <span>DEVELOPER</span>
                </div>
              </div>` : ''}

              ${user.isBetaTester ? `
              <div class="flex justify-center mt-1">
                <div class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold">
                  🚀 MVP Beta Tester
                </div>
              </div>` : ''}
            </div>

            <div class="flex justify-center mb-5">
              <div class="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-bold text-2xl px-6 py-2 rounded-3xl shadow-lg">
                ⭐ ${rep}
              </div>
            </div>

            ${user.bio ? `
            <div class="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5">
              <p class="text-white/80 italic text-center">"${esc(user.bio)}"</p>
            </div>` : ''}

            <div class="grid grid-cols-2 gap-3 mb-6">
              ${user.neighborhood ? `
              <div class="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                <div class="text-xs text-white/50">NEIGHBORHOOD</div>
                <div class="font-semibold mt-0.5">${user.neighborhood}</div>
              </div>` : ''}

              <div class="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                <div class="text-xs text-white/50">JOINED</div>
                <div class="font-semibold mt-0.5">${joined}</div>
              </div>
            </div>

            <div class="flex gap-3">
              <button onclick="hideUserProfileModal(); showComposeMessageModal('${user._id}', '${user.name}')" 
                      class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition active:scale-[0.985]">
                ✉️ Message
              </button>
              
              ${!isOwnProfile ? `
              <button onclick="reportUser('${user._id}', '${user.name}'); hideUserProfileModal()" 
                      class="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-3xl font-semibold text-lg transition active:scale-[0.985]">
                🚩 Report
              </button>` : ''}
            </div>

            <button onclick="hideUserProfileModal()" 
                    class="w-full mt-4 text-white/40 py-3 text-sm hover:text-white/70 transition">
              Close
            </button>
          </div>
        </div>
      </div>`;

    const existing = document.getElementById('userProfileModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', html);

  } catch (e) {
    console.error(e);
    showToast('Could not load profile', 'error');
  }
};

window.hideUserProfileModal = function () {
  const modal = document.getElementById('userProfileModal');
  if (modal) modal.remove();
};

window.reportUser = async function (userId, userName) {
  const reason = prompt(`Why are you reporting ${userName}? (be specific)`);
  if (!reason || reason.trim() === '') return;

  const res = await apiPost(`/users/${userId}/report`, { reason: reason.trim() });
  
  if (res.message && res.message.includes('Report submitted')) {
    showToast('🚩 Report sent to admin team. Thank you.', 'success');
  } else {
    showToast(res.message || 'Failed to send report', 'error');
  }
};