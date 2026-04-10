let currentUser = null;
let verificationPollInterval = null;

function showAuthModal() {
  document.getElementById('authModal').classList.remove('hidden');
  switchToLogin();
}

function hideAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function switchToLogin() {
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('modalTitle').textContent = 'Welcome back';
}

function switchToRegister() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
  document.getElementById('modalTitle').textContent = 'Create account';
}

async function handleRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!name || !email || !password) return alert('All fields are required');

  const result = await apiPost('/auth/register', { name, email, password });

  if (result.token) {
    document.getElementById('modalTitle').innerHTML = `
      <div class="text-emerald-600 text-5xl mb-4">✅</div>
      Account Created!<br>
      <span class="text-xl text-slate-600">Logging you in...</span>`;
    setTimeout(() => {
      setToken(result.token);
      currentUser = result.user;
      updateUserUI();
      hideAuthModal();
      hideLockedState();
      loadPage('home');
    }, 1600);
  } else {
    alert(result.message || 'Registration failed');
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const result = await apiPost('/auth/login', { email, password });

  if (result.token) {
    setToken(result.token);
    currentUser = result.user;
    updateUserUI();
    hideAuthModal();
    hideLockedState();
    loadPage('home');
  } else {
    alert(result.message || 'Login failed');
  }
}

function showProfileSheet() {
  if (!currentUser) return;
  const sheet = document.getElementById('profileSheet');
  const content = document.getElementById('sheet-content');

  const avatarLetter = currentUser.name[0].toUpperCase();
  const lastLoginText = currentUser.lastLogin
    ? `Last logged in: ${new Date(currentUser.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Just now';

  const isAdmin = currentUser.email === 'imhoggbox@gmail.com';
  const isVerified = !!currentUser.verifiedBusiness;
  const bizName = isVerified ? (currentUser.verifiedBusiness?.name || 'Your Business') : '';

  content.innerHTML = `
    <div class="flex justify-center mb-6">
      <div class="relative inline-block">
        <div class="w-28 h-28 bg-emerald-500 rounded-3xl flex items-center justify-center text-7xl font-bold text-white shadow-inner">
          ${avatarLetter}
        </div>
        ${isVerified ? `<div class="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">✓ Verified</div>` : ''}
      </div>
    </div>
    <h2 class="text-3xl font-bold text-slate-900">${currentUser.name}</h2>
    <p class="text-emerald-600 text-lg">${currentUser.email}</p>
    ${isVerified ? `<div class="mt-3 inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-full">🏪 ${bizName}</div>` : ''}
    <p class="text-gray-500 text-sm mt-6">${lastLoginText}</p>

    <div class="mt-10 space-y-3">
      ${isAdmin ? `<button onclick="navigate('admin')" class="w-full bg-amber-500 hover:bg-amber-600 text-white py-5 rounded-3xl font-semibold text-xl transition">🔧 Admin Panel</button>` : ''}
      ${isVerified ? `<button onclick="navigate('owner-dashboard');hideProfileSheet();" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-3xl font-semibold text-xl transition">🏪 My Business Dashboard</button>` : ''}
      <button onclick="logout()" class="w-full bg-red-500 hover:bg-red-600 text-white py-5 rounded-3xl font-semibold text-xl transition">Logout</button>
      <button onclick="hideProfileSheet()" class="w-full bg-gray-200 hover:bg-gray-300 text-slate-900 py-5 rounded-3xl font-semibold text-xl transition">Close</button>
    </div>
  `;

  sheet.classList.remove('hidden');
  setTimeout(() => { sheet.querySelector('div').classList.remove('translate-y-full'); }, 10);
}

function hideProfileSheet() {
  const sheet = document.getElementById('profileSheet');
  const inner = sheet.querySelector('div');
  inner.classList.add('translate-y-full');
  setTimeout(() => { sheet.classList.add('hidden'); }, 300);
}

function updateUserUI() {
  if (!currentUser) return;
  const avatarLetter = currentUser.name[0].toUpperCase();
  const isVerified = !!currentUser.verifiedBusiness;

  const sidebarEl = document.getElementById('sidebar-avatar');
  const mobileEl = document.getElementById('mobile-avatar');

  if (sidebarEl) {
    sidebarEl.innerHTML = avatarLetter;
    sidebarEl.title = isVerified ? 'Verified Business Owner' : currentUser.name;
  }
  if (mobileEl) {
    mobileEl.innerHTML = avatarLetter;
  }

  // Show/hide owner dashboard nav item
  renderNav();
}

function logout() {
  hideProfileSheet();
  localStorage.removeItem('token');
  currentUser = null;
  stopVerificationPoll();
  updateUserUI();
  showLockedState();
}

function showLockedState() {
  document.getElementById('lockedOverlay').classList.remove('hidden');
  document.getElementById('content').classList.add('blur-sm', 'pointer-events-none');
}

function hideLockedState() {
  document.getElementById('lockedOverlay').classList.add('hidden');
  document.getElementById('content').classList.remove('blur-sm', 'pointer-events-none');
}

async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) { showLockedState(); return; }
  const result = await apiGet('/auth/me');
  if (result.user) {
    currentUser = result.user;
    updateUserUI();
    hideLockedState();
  } else {
    showLockedState();
  }
}

// ─── Verification polling ─────────────────────────────────────────────────────
function startVerificationPoll(businessId) {
  stopVerificationPoll();
  verificationPollInterval = setInterval(async () => {
    const res = await apiGet(`/claim/status/${businessId}`);
    if (res.status === 'approved') {
      stopVerificationPoll();
      // Refresh user data
      const meRes = await apiGet('/auth/me');
      if (meRes.user) {
        currentUser = meRes.user;
        updateUserUI();
        showVerifiedNotification(currentUser.verifiedBusiness?.name || 'Your business');
        // Reload current directory page to show updated state
        if (typeof loadPage !== 'undefined') loadPage('directory');
      }
    } else if (res.status === 'rejected') {
      stopVerificationPoll();
      showToast('❌ Your claim was not approved. Please contact support.', 'error');
    }
  }, 5000);
}

function stopVerificationPoll() {
  if (verificationPollInterval) {
    clearInterval(verificationPollInterval);
    verificationPollInterval = null;
  }
}

function showVerifiedNotification(bizName) {
  const el = document.createElement('div');
  el.className = 'fixed top-6 left-1/2 -translate-x-1/2 z-[99999] bg-emerald-500 text-white px-8 py-5 rounded-3xl shadow-2xl text-center font-semibold text-lg animate-bounce-in';
  el.innerHTML = `🎉 You're now a Verified Business Owner!<br><span class="text-emerald-100 text-sm font-normal">${bizName}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function showToast(message, type = 'info') {
  const color = type === 'error' ? 'bg-red-500' : 'bg-slate-800';
  const el = document.createElement('div');
  el.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[99999] ${color} text-white px-8 py-4 rounded-3xl shadow-2xl text-center font-semibold text-base`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.switchToLogin = switchToLogin;
window.switchToRegister = switchToRegister;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.showProfileSheet = showProfileSheet;
window.hideProfileSheet = hideProfileSheet;
window.logout = logout;
window.startVerificationPoll = startVerificationPoll;
window.stopVerificationPoll = stopVerificationPoll;
window.showToast = showToast;