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
      : 'denied';  // Capacitor handles permissions natively — web path shouldn't reach here
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
    // 1. Check current permission
    const existing = await PushNotifications.checkPermissions();
    console.log('📍 Permission status:', existing.receive);

    if (existing.receive !== 'granted') {
      console.log('Requesting permission...');
      const requested = await PushNotifications.requestPermissions();
      console.log('Permission after request:', requested.receive);

      if (requested.receive !== 'granted') {
        console.warn('❌ Push permission denied by user');
        return;
      }
    }

    // 2. Register
    console.log('Registering for push...');
    await PushNotifications.register();
    console.log('✅ register() called');

  } catch (err) {
    console.error('❌ Error during native push init:', err);
  }
}

// ─── FCM TOKEN LISTENER (FINAL FIXED VERSION) ─────────────────────────────
console.log('📡 Push listener registered');

if (window.Capacitor && window.Capacitor.Plugins?.PushNotifications) {
  const { PushNotifications } = window.Capacitor.Plugins;

  PushNotifications.addListener('registration', async (token) => {
    console.log('🎉🎉🎉 FCM TOKEN RECEIVED - LENGTH:', token.value.length);
    console.log('First 100 chars:', token.value.substring(0, 100));

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
    const page = data.page;
    const id   = data.id;

    if (!page) return;

    // Navigate to the right page, then scroll to/highlight the specific post
    if (typeof loadPage === 'function') {
      loadPage(page).then(() => {
        if (id && page === 'shoutouts') {
          // Increased delay for better reliability after page load
          setTimeout(() => {
            const el = document.getElementById('shoutout-' + id);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-4', 'ring-emerald-400', 'ring-offset-2', 'ring-offset-slate-900');
              
              // Remove highlight after 4 seconds
              setTimeout(() => {
                el.classList.remove('ring-4', 'ring-emerald-400', 'ring-offset-2', 'ring-offset-slate-900');
              }, 4000);
            } else {
              console.warn(`Could not find shoutout-${id} element`);
            }
          }, 800);
        }
      });
    }
  });
}

// Exposed globally so auth.js can call it right after a successful login
window.initPushAfterLogin = _initNativePush;

// ─── Profile Sheet ────────────────────────────────────────────────────────────
function showProfileSheet() {
  if (!currentUser) { showAuthModal(); return; }

  const sheet = document.getElementById('profileSheet');
  const content = document.getElementById('sheet-content');
  if (!sheet || !content) return;

  const lastLoginText = currentUser.lastLogin
    ? `Last active: ${new Date(currentUser.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Just now';

  const isAdmin = currentUser.email === 'imhoggbox@gmail.com';
  const isVerified = !!currentUser.verifiedBusiness;
  const bizName = isVerified ? (currentUser.verifiedBusiness?.name || 'Your Business') : '';

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
      <button onclick="showEditProfileModal()"
              class="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition flex items-center gap-1.5">
        ✏️ Edit Profile
      </button>
    </div>

    <div class="flex justify-center -mt-20 mb-4 relative z-10">
      <div class="relative inline-block">
        <div class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-white shadow-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-7xl font-bold text-white">
          ${currentUser.avatar ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover" alt="avatar">` : (currentUser.name||'?')[0].toUpperCase()}
        </div>
        ${isVerified ? `<div class="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 border border-white">✓ Verified</div>` : ''}
      </div>
    </div>

<h2 class="text-3xl font-bold text-slate-900 mt-2">${currentUser.name}</h2>
<p class="text-emerald-600 text-base mb-1">${currentUser.email}</p>
${currentUser.neighborhood ? `<p class="text-slate-500 text-sm flex items-center justify-center gap-1">📍 ${currentUser.neighborhood}</p>` : ''}

<!-- Reputation Badge for Own Profile -->
<div class="flex justify-center mt-3 mb-6">
  <div class="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-bold text-xl px-6 py-2.5 rounded-3xl shadow">
    ⭐ ${currentUser.reputation || 0}
    <span class="text-base opacity-75">Reputation</span>
  </div>
</div>
    <!-- Beta Tester Badge -->
    ${currentUser.isBetaTester ? `
    <div class="flex justify-center mt-2 mb-2">
      <div class="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold text-sm px-4 py-1.5 rounded-full shadow">
        🚀 MVP Beta Tester
      </div>
    </div>` : ''}

    ${currentUser.bio ? `<p class="text-slate-600 text-sm mt-4 px-2 leading-relaxed italic">"${escHtml(currentUser.bio)}"</p>` : ''}
    ${isVerified ? `<div class="mt-4 inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-full">🏪 ${bizName}</div>` : ''}

    <div class="mt-6 grid grid-cols-3 gap-3">
      <div class="bg-slate-50 border border-slate-100 rounded-2xl py-3 flex flex-col items-center">
        <span class="text-xl font-bold text-slate-800">🗓️</span>
        <span class="text-xs text-slate-500 mt-1">Joined</span>
        <span class="text-xs font-semibold text-slate-700">${joinedStr}</span>
      </div>
      <div class="bg-slate-50 border border-slate-100 rounded-2xl py-3 flex flex-col items-center">
        <span class="text-lg font-bold text-slate-800">${isVerified ? '🏪' : '🌱'}</span>
        <span class="text-xs text-slate-500 mt-1">Status</span>
        <span class="text-xs font-semibold text-slate-700">${isVerified ? 'Owner' : 'Member'}</span>
      </div>
      <div class="bg-slate-50 border border-slate-100 rounded-2xl py-3 flex flex-col items-center">
        <span class="text-lg font-bold text-slate-800">${isAdmin ? '🔧' : '⭐'}</span>
        <span class="text-xs text-slate-500 mt-1">Role</span>
        <span class="text-xs font-semibold text-slate-700">${isAdmin ? 'Admin' : 'User'}</span>
      </div>
    </div>

    ${(currentUser.phone || socials) ? `
    <div class="mt-5 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left space-y-2">
      ${currentUser.phone ? `<div class="flex items-center gap-2 text-slate-600 text-sm"><span>📞</span><span>${currentUser.phone}</span></div>` : ''}
      ${socials}
    </div>` : ''}

    <!-- ─── Push notification quick-toggle in profile sheet ─────────────── -->
    ${pushSupported ? `
    <div class="mt-5 bg-slateald-50 border border-slate-100 rounded-2xl p-4">
      <label for="sheetPushToggle" class="flex items-center justify-between gap-3 cursor-pointer select-none">
        <div class="text-left">
          <p class="text-sm font-semibold text-slate-800">🔔 Push Notifications</p>
          <p id="sheetPushStatus" class="text-xs text-slate-500 mt-0.5">
            ${pushBlocked ? '⚠️ Blocked in browser settings' : isNative ? 'Loading...' : 'Receive alerts when the app is closed'}
          </p>
        </div>
        <div class="relative flex-shrink-0">
          <input type="checkbox" id="sheetPushToggle" class="sr-only peer" ${pushBlocked ? 'disabled' : ''}>
          <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors ${pushBlocked ? 'opacity-40' : ''}"></div>
          <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5 pointer-events-none"></div>
        </div>
      </label>
    </div>` : ''}

    <p class="text-slate-400 text-xs mt-4">${lastLoginText}</p>

      <div class="mt-8 space-y-3">
        ${isAdmin ? `<button onclick="navigate('admin')" class="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-3xl font-semibold text-lg transition">🔧 Admin Panel</button>` : ''}
        ${isVerified ? `<button onclick="navigate('owner-dashboard');hideProfileSheet();" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition">🏪 My Business Dashboard</button>` : ''}
        
        <button onclick="showEditProfileModal()" class="w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-3xl font-semibold text-lg transition">✏️ Edit Profile</button>
        
        <!-- Delete Account Button -->
        <button onclick="showDeleteAccountModal()" 
                class="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 py-4 rounded-3xl font-semibold text-lg transition">
          🗑️ Delete My Account
        </button>

        <button onclick="logout()" class="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-3xl font-semibold text-lg transition">Logout</button>
        <button onclick="hideProfileSheet()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-800 py-4 rounded-3xl font-semibold text-lg transition">Close</button>
      </div>
  `;

  sheet.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const panel = document.getElementById('profileSheetPanel');
      if (panel) panel.classList.remove('translate-y-full');
    });
  });

  // ── Wire up the sheet push toggle after render ────────────────────────────
  if (pushSupported && (isNative || !pushBlocked)) {
    _initSheetPushToggle();
  }
}

// Initialise the push toggle in the profile sheet.
// Handles both native Capacitor (FCM) and web push (VAPID) paths.
async function _initSheetPushToggle() {
  const toggle   = document.getElementById('sheetPushToggle');
  const statusEl = document.getElementById('sheetPushStatus');
  if (!toggle) return;

  const native = isNativePlatform();
  console.log('🔔 Native platform in toggle:', native);

  if (native) {
    toggle.checked = true;
    if (statusEl) statusEl.textContent = '✅ Push notifications enabled';

    toggle.onchange = async function () {
      const enabling = this.checked;
      toggle.disabled = true;

      if (enabling) {
        await _initNativePush();
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

function hideProfileSheet() {
  const sheet = document.getElementById('profileSheet');
  if (!sheet) return;
  const panel = document.getElementById('profileSheetPanel');
  if (panel) {
    panel.classList.add('translate-y-full');
    setTimeout(() => { sheet.classList.add('hidden'); }, 300);
  } else {
    sheet.classList.add('hidden');
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
  const isNative = isNativePlatform();
  const pushSupported = isNative || (('serviceWorker' in navigator) && ('PushManager' in window));
  const pushBlocked = !isNative && getNotificationPermission() === 'denied';

  modal.innerHTML = `
    <div onclick="event.stopPropagation()" class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl">

      <div class="sticky top-0 bg-white z-10 pt-4 pb-3 px-6 border-b border-slate-100 flex items-center justify-between">
        <h2 class="text-xl font-bold">Edit Profile</h2>
        <button onclick="hideEditProfileModal()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">✕</button>
      </div>

      <div class="p-6 space-y-6">

        <!-- Avatar upload -->
        <div class="flex flex-col items-center gap-3">
          <div id="avatarPreview"
               class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-emerald-200 shadow-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-7xl font-bold text-white cursor-pointer relative group"
               onclick="document.getElementById('avatarFileInput').click()">
            ${u.avatar ? `<img src="${u.avatar}" class="w-full h-full object-cover" id="avatarImg">` : `<span id="avatarLetter">${(u.name||'?')[0].toUpperCase()}</span>`}
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-3xl">
              <span class="text-white text-3xl">📷</span>
            </div>
          </div>
          <div class="text-center">
            <button onclick="document.getElementById('avatarFileInput').click()" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-sm font-semibold px-5 py-2 rounded-full transition">📷 Change Photo</button>
            ${u.avatar ? `<button onclick="removeAvatar()" class="ml-2 text-red-500 hover:text-red-700 text-sm font-medium transition">Remove</button>` : ''}
          </div>
          <input id="avatarFileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" onchange="handleAvatarSelect(this)">
          <p class="text-xs text-slate-400">JPG, PNG or WebP · Max 2 MB</p>
          <div id="avatarError" class="hidden text-xs text-red-500 font-medium text-center"></div>
        </div>

        <!-- Name -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Full Name *</label>
          <input id="ep-name" type="text" value="${escHtml(u.name || '')}" maxlength="60" class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-base">
        </div>

        <!-- Bio -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Bio <span class="normal-case font-normal text-slate-400">(max 280 chars)</span></label>
          <textarea id="ep-bio" maxlength="280" rows="3" class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-sm resize-none" placeholder="Tell the community a little about yourself…">${escHtml(u.bio || '')}</textarea>
          <div class="text-right text-xs text-slate-400 mt-1"><span id="bioCount">${(u.bio||'').length}</span>/280</div>
        </div>

        <!-- Notification preferences -->
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-4">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notification Preferences</p>

          <!-- In-app toggles -->
          ${[
            { id: 'ep-notifyDeals',           label: '🔥 New Deals',                    checked: u.notifyDeals !== false },
            { id: 'ep-notifyEvents',          label: '📅 Upcoming Events',               checked: u.notifyEvents !== false },
            { id: 'ep-notifyShoutouts',       label: '🚗 New Traffic Alerts',            checked: !!u.notifyShoutouts },
            { id: 'ep-notifyShoutoutComments',label: '💬 Comments on Traffic Alerts',    checked: !!u.notifyShoutoutComments },
          ].map(n => `
            <label class="flex items-center justify-between cursor-pointer select-none">
              <span class="text-sm font-medium text-slate-700">${n.label}</span>
              <div class="relative">
                <input type="checkbox" id="${n.id}" ${n.checked ? 'checked' : ''} class="sr-only peer">
                <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors"></div>
                <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
              </div>
            </label>`).join('')}

          <!-- Push notification master toggle -->
          <div class="border-t border-emerald-200 pt-4 mt-2">
            <label for="ep-pushEnabled" class="flex items-start justify-between gap-3 ${pushSupported && !pushBlocked ? 'cursor-pointer' : ''} select-none">
              <div class="flex-1">
                <p class="text-sm font-semibold text-slate-700">🔔 Push Notifications</p>
                <p class="text-xs text-slate-500 mt-0.5">Receive alerts even when the app is closed.</p>
              </div>
              <div class="relative flex-shrink-0 mt-0.5">
                <input type="checkbox" id="ep-pushEnabled" class="sr-only peer" ${!pushSupported || pushBlocked ? 'disabled' : ''}>
                <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors ${!pushSupported || pushBlocked ? 'opacity-40' : ''}"></div>
                <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5 pointer-events-none"></div>
              </div>
            </label>
          </div>
        </div>

        <!-- Save -->
        <button onclick="saveProfile()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-bold text-lg transition flex items-center justify-center gap-2" id="saveProfileBtn">
          💾 Save Changes
        </button>
      </div>
    </div>`;

  modal.classList.remove('hidden');
  setTimeout(() => _initEditPushToggle(), 150);

  // Bio character counter
  const bioTextarea = document.getElementById('ep-bio');
  const bioCount    = document.getElementById('bioCount');
  if (bioTextarea && bioCount) {
    bioTextarea.addEventListener('input', () => { 
      bioCount.textContent = bioTextarea.value.length; 
    });
  }
}

// Wire up the push toggle inside the Edit Profile modal.
// Always reads the real browser subscription state — never trusts currentUser.pushEnabled alone.
async function _initEditPushToggle() {
  const pushCheckbox = document.getElementById('ep-pushEnabled');
  const statusEl     = document.getElementById('pushStatusMsg');
  if (!pushCheckbox || pushCheckbox.disabled) return;

  // Set initial checked state from the browser, not the server flag
  const hasSub = await _browserHasPushSubscription();
  pushCheckbox.checked = hasSub;
  if (currentUser) currentUser.pushEnabled = hasSub; // keep in sync

  pushCheckbox.onchange = async function () {
    const enabling = this.checked;

    // Guard: browser has since denied the permission
    if (enabling && getNotificationPermission() === 'denied') {
      this.checked = false;
      if (statusEl) {
        statusEl.textContent = '⚠️ Notifications are blocked. Tap the 🔒 lock icon in the address bar → allow notifications → then toggle again.';
        statusEl.style.color = '#d97706';
        statusEl.classList.remove('hidden');
      }
      return;
    }

    this.disabled = true;
    if (statusEl) {
      statusEl.style.color = '';
      statusEl.textContent = enabling ? '⏳ Requesting permission...' : '⏳ Disabling...';
      statusEl.classList.remove('hidden');
    }

    if (enabling) {
      const success = await requestPushPermission();
      if (success) {
        if (statusEl) { statusEl.textContent = '✅ Push notifications enabled!'; statusEl.style.color = '#059669'; }
        showToast('✅ Push notifications turned on');
      } else {
        this.checked = false;
        if (statusEl) {
          statusEl.textContent = getNotificationPermission() === 'denied'
            ? '⚠️ Blocked in browser. Allow notifications in site settings.'
            : 'Could not enable — please try again.';
          statusEl.style.color = '#d97706';
        }
      }
    } else {
      await disablePushNotifications();
      if (statusEl) { statusEl.textContent = 'Push notifications disabled.'; statusEl.style.color = ''; }
      showToast('Push notifications turned off');
    }

    this.disabled = false;
    setTimeout(() => { if (statusEl) statusEl.classList.add('hidden'); }, 4000);
  };
}

// ─── Hide Edit Profile Modal ──────────────────────────────────────────────────
function hideEditProfileModal() {
  const modal = document.getElementById('editProfileModal');
  if (modal) modal.classList.add('hidden');
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
let pendingAvatarData = undefined;

function handleAvatarSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const errEl = document.getElementById('avatarError');
  if (errEl) errEl.classList.add('hidden');

  if (!ALLOWED_TYPES.includes(file.type)) {
    if (errEl) { errEl.textContent = 'Please upload a JPG, PNG, or WebP image.'; errEl.classList.remove('hidden'); }
    input.value = '';
    return;
  }
  if (file.size > MAX_AVATAR_BYTES) {
    if (errEl) {
      errEl.textContent = `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please use an image under 2 MB.`;
      errEl.classList.remove('hidden');
    }
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

  const pushIsOn = await _browserHasPushSubscription();

  const payload = {
    name,
    bio:                     document.getElementById('ep-bio')?.value.trim() || '',
    neighborhood:            document.getElementById('ep-neighborhood')?.value.trim() || '',
    phone:                   document.getElementById('ep-phone')?.value.trim() || '',
    website:                 document.getElementById('ep-website')?.value.trim() || '',
    instagram:               document.getElementById('ep-instagram')?.value.trim() || '',
    facebook:                document.getElementById('ep-facebook')?.value.trim() || '',

    notifyDeals:             document.getElementById('ep-notifyDeals')?.checked ?? true,
    notifyEvents:            document.getElementById('ep-notifyEvents')?.checked ?? true,
    notifyShoutouts:         document.getElementById('ep-notifyShoutouts')?.checked ?? false,
    notifyShoutoutComments:  document.getElementById('ep-notifyShoutoutComments')?.checked ?? false,
    notifyLostFound:         document.getElementById('ep-notifyLostFound')?.checked ?? true,
    notifyMarketplace:       document.getElementById('ep-notifyMarketplace')?.checked ?? true,
    notifyMessages:          document.getElementById('ep-notifyMessages')?.checked ?? true,

    pushEnabled: pushIsOn,
  };

  if (pendingAvatarData !== undefined) payload.avatar = pendingAvatarData;

  const res = await apiPatch('/auth/profile', payload);

  if (res.user) {
    currentUser = res.user;
    currentUser.pushEnabled = pushIsOn;
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

// ─── Escape helper ────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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

    const html = `
      <div onclick="if(event.target.id==='userProfileModal')hideUserProfileModal()" 
           id="userProfileModal"
           class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[13000] flex items-end md:items-center md:justify-center overflow-y-auto">
        <div onclick="event.stopImmediatePropagation()" 
             class="bg-white text-slate-900 w-full md:max-w-md rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl">

          <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100 z-10">
            <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
          </div>

          <div class="p-6">
            <!-- Avatar -->
            <div class="flex justify-center mb-4">
              <div class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-emerald-200 shadow-xl flex items-center justify-center text-6xl font-bold bg-gradient-to-br from-emerald-500 to-teal-600">
                ${user.avatar 
                  ? `<img src="${user.avatar}" class="w-full h-full object-cover">` 
                  : (user.name || '?')[0].toUpperCase()}
              </div>
            </div>

            <h2 class="text-3xl font-bold text-center mb-1">${user.name}</h2>

            <!-- Beta Tester Badge -->
            ${user.isBetaTester ? `
            <div class="flex justify-center mb-2">
              <div class="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold text-sm px-4 py-1.5 rounded-full shadow">
                🚀 MVP Beta Tester
              </div>
            </div>` : ''}
            
            <!-- Reputation -->
            <div class="flex justify-center mb-6">
              <div class="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-bold text-2xl px-6 py-2 rounded-3xl shadow-lg">
                ⭐ ${rep}
                <span class="text-base font-normal opacity-75">Reputation</span>
              </div>
            </div>

            ${user.bio ? `<p class="text-center text-slate-600 italic mb-6">"${escHtml(user.bio)}"</p>` : ''}

            ${user.neighborhood ? `
            <div class="text-center text-slate-500 mb-6">
              📍 ${user.neighborhood}
            </div>` : ''}

            <!-- Action Buttons -->
            <div class="flex gap-3 mt-8">
              <button onclick="hideUserProfileModal(); showComposeMessageModal('${user._id}', '${user.name}')" 
                      class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg">
                ✉️ Message
              </button>
              
              ${!isOwnProfile ? `
              <button onclick="reportUser('${user._id}', '${user.name}'); hideUserProfileModal()" 
                      class="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-3xl font-semibold text-lg">
                🚩 Report User
              </button>` : ''}
            </div>

            <button onclick="hideUserProfileModal()" 
                    class="w-full mt-4 text-slate-400 py-3 text-sm">
              Close
            </button>
          </div>
        </div>
      </div>`;

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

// ─── REPORT A USER ─────────────────────────────────────────────────────────
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

// ─── Exports ──────────────────────────────────────────────────────────────────
window.showProfileSheet      = showProfileSheet;
window.hideProfileSheet      = hideProfileSheet;
window.showEditProfileModal  = showEditProfileModal;
window.hideEditProfileModal  = hideEditProfileModal;
window.handleAvatarSelect    = handleAvatarSelect;
window.saveProfile           = saveProfile;
window.requestPushPermission = requestPushPermission;
window.disablePushNotifications = disablePushNotifications;
window.updateUserUI          = () => renderNav();