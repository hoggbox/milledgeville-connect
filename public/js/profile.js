// ─── profile.js ───────────────────────────────────────────────────────────────
// Enhanced user profile: sheet display, edit modal, avatar upload

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES    = ['image/jpeg', 'image/png', 'image/webp'];

// ─── Avatar helpers ───────────────────────────────────────────────────────────
function getAvatarHTML(user, size = 'lg') {
  const dims   = size === 'lg' ? 'w-28 h-28 text-7xl rounded-3xl' : 'w-10 h-10 text-2xl rounded-2xl';
  const letter = (user.name || '?')[0].toUpperCase();
  if (user.avatar) {
    return `<img src="${user.avatar}" alt="avatar"
                 class="${dims === 'w-28 h-28 text-7xl rounded-3xl' ? 'w-28 h-28 rounded-3xl' : 'w-10 h-10 rounded-2xl'} object-cover shadow-inner"
                 style="object-fit:cover;">`;
  }
  return `<div class="${dims} bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-white shadow-inner">${letter}</div>`;
}

function updateSidebarAvatars() {
  if (!currentUser) return;
  const letter = (currentUser.name || '?')[0].toUpperCase();
  ['sidebar-avatar', 'mobile-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentUser.avatar) {
      el.innerHTML = `<img src="${currentUser.avatar}" class="w-full h-full object-cover rounded-2xl" alt="avatar">`;
    } else {
      el.innerHTML = letter;
      el.style.background = '';
    }
  });
}

// ─── Profile Sheet ────────────────────────────────────────────────────────────
function showProfileSheet() {
  // If not logged in, show auth modal instead of silently failing
  if (!currentUser) {
    showAuthModal();
    return;
  }

  const sheet   = document.getElementById('profileSheet');
  const content = document.getElementById('sheet-content');
  if (!sheet || !content) return;

  const lastLoginText = currentUser.lastLogin
    ? `Last active: ${new Date(currentUser.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Just now';

  const isAdmin    = currentUser.email === 'imhoggbox@gmail.com';
  const isVerified = !!currentUser.verifiedBusiness;
  const bizName    = isVerified ? (currentUser.verifiedBusiness?.name || 'Your Business') : '';

  const joinedStr = currentUser.joinedAt
    ? new Date(currentUser.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  // Social link rows
  const socials = [
    currentUser.instagram ? `<a href="https://instagram.com/${currentUser.instagram.replace('@','')}" target="_blank"
        class="flex items-center gap-2 text-pink-400 hover:text-pink-300 text-sm font-medium transition">
        <span class="text-lg">📸</span> @${currentUser.instagram.replace('@','')}
      </a>` : '',
    currentUser.facebook ? `<a href="${currentUser.facebook.startsWith('http') ? currentUser.facebook : 'https://facebook.com/'+currentUser.facebook}" target="_blank"
        class="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition">
        <span class="text-lg">👤</span> Facebook
      </a>` : '',
    currentUser.website ? `<a href="${currentUser.website.startsWith('http') ? currentUser.website : 'https://'+currentUser.website}" target="_blank"
        class="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-medium transition">
        <span class="text-lg">🔗</span> ${currentUser.website.replace(/^https?:\/\//,'')}
      </a>` : ''
  ].filter(Boolean).join('');

  content.innerHTML = `
    <!-- Header gradient banner -->
    <div class="relative -mx-6 -mt-2 mb-6 px-6 pt-10 pb-20 rounded-t-3xl overflow-hidden"
         style="background: linear-gradient(135deg,#064e3b 0%,#065f46 50%,#047857 100%);">
      <div class="absolute inset-0 opacity-10"
           style="background-image:repeating-linear-gradient(45deg,transparent,transparent 20px,rgba(255,255,255,.15) 20px,rgba(255,255,255,.15) 21px);"></div>
      <!-- edit button -->
      <button onclick="showEditProfileModal()"
              class="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition flex items-center gap-1.5">
        ✏️ Edit Profile
      </button>
    </div>

    <!-- Avatar overlapping banner -->
    <div class="flex justify-center -mt-20 mb-4 relative z-10">
      <div class="relative inline-block">
        <div class="w-28 h-28 rounded-3xl overflow-hidden ring-4 ring-white shadow-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-7xl font-bold text-white">
          ${currentUser.avatar
            ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover" alt="avatar">`
            : (currentUser.name||'?')[0].toUpperCase()}
        </div>
        ${isVerified ? `<div class="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 border border-white">✓ Verified</div>` : ''}
      </div>
    </div>

    <!-- Name / email -->
    <h2 class="text-3xl font-bold text-slate-900 mt-2">${currentUser.name}</h2>
    <p class="text-emerald-600 text-base mb-1">${currentUser.email}</p>
    ${currentUser.neighborhood ? `<p class="text-slate-500 text-sm flex items-center justify-center gap-1">📍 ${currentUser.neighborhood}</p>` : ''}

    <!-- Bio -->
    ${currentUser.bio ? `<p class="text-slate-600 text-sm mt-4 px-2 leading-relaxed italic">"${currentUser.bio}"</p>` : ''}

    <!-- Verified business badge -->
    ${isVerified ? `<div class="mt-4 inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-full">🏪 ${bizName}</div>` : ''}

    <!-- Stats strip -->
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

    <!-- Contact / social -->
    ${(currentUser.phone || socials) ? `
    <div class="mt-5 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left space-y-2">
      ${currentUser.phone ? `<div class="flex items-center gap-2 text-slate-600 text-sm"><span>📞</span><span>${currentUser.phone}</span></div>` : ''}
      ${socials}
    </div>` : ''}

    <p class="text-slate-400 text-xs mt-4">${lastLoginText}</p>

    <!-- Action buttons -->
    <div class="mt-8 space-y-3">
      ${isAdmin    ? `<button onclick="navigate('admin')" class="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-3xl font-semibold text-lg transition">🔧 Admin Panel</button>` : ''}
      ${isVerified ? `<button onclick="navigate('owner-dashboard');hideProfileSheet();" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition">🏪 My Business Dashboard</button>` : ''}
      <button onclick="showEditProfileModal()" class="w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-3xl font-semibold text-lg transition">✏️ Edit Profile</button>
      <button onclick="logout()" class="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-3xl font-semibold text-lg transition">Logout</button>
      <button onclick="hideProfileSheet()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-800 py-4 rounded-3xl font-semibold text-lg transition">Close</button>
    </div>
  `;

  // Show the sheet — remove hidden first, then animate slide-up on next frame
  sheet.classList.remove('hidden');

  // Use requestAnimationFrame (double-rAF) to ensure the browser has painted
  // before triggering the CSS transition. More reliable than setTimeout(fn, 10).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const panel = document.getElementById('profileSheetPanel');
      if (panel) panel.classList.remove('translate-y-full');
    });
  });
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
  // Reset pending avatar state each time modal opens
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
         class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl">

      <!-- Sticky header -->
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
            ${u.avatar
              ? `<img src="${u.avatar}" class="w-full h-full object-cover" id="avatarImg">`
              : `<span id="avatarLetter">${(u.name||'?')[0].toUpperCase()}</span>`}
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-3xl">
              <span class="text-white text-3xl">📷</span>
            </div>
          </div>
          <div class="text-center">
            <button onclick="document.getElementById('avatarFileInput').click()"
                    class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-sm font-semibold px-5 py-2 rounded-full transition">
              📷 Change Photo
            </button>
            ${u.avatar ? `<button onclick="removeAvatar()" class="ml-2 text-red-500 hover:text-red-700 text-sm font-medium transition">Remove</button>` : ''}
          </div>
          <input id="avatarFileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"
                 onchange="handleAvatarSelect(this)">
          <p class="text-xs text-slate-400">JPG, PNG or WebP · Max 2 MB · Displayed at 112×112 px</p>
          <div id="avatarError" class="hidden text-xs text-red-500 font-medium text-center"></div>
        </div>

        <!-- Name -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Full Name *</label>
          <input id="ep-name" type="text" value="${escHtml(u.name || '')}" maxlength="60"
                 class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-base">
        </div>

        <!-- Bio -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Bio <span class="normal-case font-normal text-slate-400">(max 280 chars)</span></label>
          <textarea id="ep-bio" maxlength="280" rows="3"
                    class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-sm resize-none"
                    placeholder="Tell the community a little about yourself…">${escHtml(u.bio || '')}</textarea>
          <div class="text-right text-xs text-slate-400 mt-1"><span id="bioCount">${(u.bio||'').length}</span>/280</div>
        </div>

        <!-- Neighborhood -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Neighborhood / Area</label>
          <input id="ep-neighborhood" type="text" value="${escHtml(u.neighborhood || '')}" maxlength="80"
                 placeholder="e.g. Downtown Milledgeville, North Campus…"
                 class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-sm">
        </div>

        <!-- Phone -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Phone (optional)</label>
          <input id="ep-phone" type="tel" value="${escHtml(u.phone || '')}" maxlength="20"
                 placeholder="(478) 555-0100"
                 class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-sm">
        </div>

        <!-- Website -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Website</label>
          <input id="ep-website" type="url" value="${escHtml(u.website || '')}" maxlength="120"
                 placeholder="yoursite.com"
                 class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none text-sm">
        </div>

        <!-- Social section -->
        <div class="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Social Links</p>
          <div class="flex items-center gap-3">
            <span class="text-xl w-7 flex-shrink-0">📸</span>
            <input id="ep-instagram" type="text" value="${escHtml(u.instagram || '')}" maxlength="60"
                   placeholder="@yourhandle"
                   class="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-pink-400 outline-none text-sm">
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xl w-7 flex-shrink-0">👤</span>
            <input id="ep-facebook" type="text" value="${escHtml(u.facebook || '')}" maxlength="120"
                   placeholder="facebook.com/you or username"
                   class="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-blue-400 outline-none text-sm">
          </div>
        </div>

        <!-- Notification preferences -->
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notification Preferences</p>
          ${[
            { id: 'ep-notifyDeals',    label: '🔥 New Deals',      checked: u.notifyDeals !== false },
            { id: 'ep-notifyEvents',   label: '📅 Upcoming Events', checked: u.notifyEvents !== false },
            { id: 'ep-notifyShoutouts',label: '💬 Shoutouts',       checked: !!u.notifyShoutouts },
          ].map(n => `
            <label class="flex items-center justify-between cursor-pointer select-none">
              <span class="text-sm font-medium text-slate-700">${n.label}</span>
              <div class="relative">
                <input type="checkbox" id="${n.id}" ${n.checked ? 'checked' : ''} class="sr-only peer">
                <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors"></div>
                <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
              </div>
            </label>`).join('')}
        </div>

        <!-- Save button -->
        <button onclick="saveProfile()"
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-bold text-lg transition flex items-center justify-center gap-2"
                id="saveProfileBtn">
          💾 Save Changes
        </button>

        <p class="text-center text-xs text-slate-400 pb-2">
          Want to change your email or password? Contact support.
        </p>
      </div>
    </div>`;

  modal.classList.remove('hidden');

  // Live bio counter
  const bioTextarea = document.getElementById('ep-bio');
  const bioCount    = document.getElementById('bioCount');
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

// ─── Avatar selection & validation ───────────────────────────────────────────
let pendingAvatarData = undefined; // undefined = unchanged, null = remove, string = new base64

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
    pendingAvatarData = e.target.result; // base64 data URI
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
  const letter  = (currentUser.name || '?')[0].toUpperCase();
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

  btn.disabled  = true;
  btn.innerHTML = '⏳ Saving…';

  const payload = {
    name,
    bio:           document.getElementById('ep-bio')?.value.trim()        || '',
    neighborhood:  document.getElementById('ep-neighborhood')?.value.trim() || '',
    phone:         document.getElementById('ep-phone')?.value.trim()       || '',
    website:       document.getElementById('ep-website')?.value.trim()     || '',
    instagram:     document.getElementById('ep-instagram')?.value.trim()   || '',
    facebook:      document.getElementById('ep-facebook')?.value.trim()    || '',
    notifyDeals:   document.getElementById('ep-notifyDeals')?.checked      ?? true,
    notifyEvents:  document.getElementById('ep-notifyEvents')?.checked     ?? true,
    notifyShoutouts: document.getElementById('ep-notifyShoutouts')?.checked ?? false,
  };

  // Avatar: only include if it changed
  if (pendingAvatarData !== undefined) {
    payload.avatar = pendingAvatarData; // null = remove, string = new image
  }

  const res = await apiPatch('/auth/profile', payload);

  if (res.user) {
    currentUser       = res.user;
    pendingAvatarData = undefined;
    updateUserUI();
    hideEditProfileModal();
    // Small delay so the edit modal finishes closing before the profile sheet re-renders
    setTimeout(() => showProfileSheet(), 150);
    showToast('✅ Profile updated!');
  } else {
    showToast(res.message || 'Failed to save profile.', 'error');
    btn.disabled  = false;
    btn.innerHTML = '💾 Save Changes';
  }
}

// ─── Escape helper ────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── Override updateUserUI to also update sidebar avatars ─────────────────────
window.updateUserUI = function () {
  if (!currentUser) return;
  const letter     = (currentUser.name||'?')[0].toUpperCase();
  const isVerified = !!currentUser.verifiedBusiness;

  ['sidebar-avatar','mobile-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentUser.avatar) {
      el.innerHTML = `<img src="${currentUser.avatar}" class="w-full h-full object-cover rounded-2xl" alt="avatar">`;
    } else {
      el.innerHTML = letter;
    }
    if (id === 'sidebar-avatar') el.title = isVerified ? 'Verified Business Owner' : currentUser.name;
  });

  renderNav();
};

// ─── Exports ──────────────────────────────────────────────────────────────────
window.showProfileSheet      = showProfileSheet;
window.hideProfileSheet      = hideProfileSheet;
window.showEditProfileModal  = showEditProfileModal;
window.hideEditProfileModal  = hideEditProfileModal;
window.handleAvatarSelect    = handleAvatarSelect;
window.saveProfile           = saveProfile;