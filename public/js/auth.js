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
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
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
  const email    = document.getElementById('loginEmail').value.trim();
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

// updateUserUI is defined (and overridden) in profile.js
// Fallback in case profile.js isn't loaded yet
function updateUserUI() {
  if (!currentUser) return;
  const letter     = (currentUser.name || '?')[0].toUpperCase();
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
  const overlay = document.getElementById('lockedOverlay');
  if (overlay) overlay.classList.remove('hidden');
  const content = document.getElementById('content');
  if (content) content.classList.add('blur-sm', 'pointer-events-none');
}

function hideLockedState() {
  const overlay = document.getElementById('lockedOverlay');
  if (overlay) overlay.classList.add('hidden');
  const content = document.getElementById('content');
  if (content) content.classList.remove('blur-sm', 'pointer-events-none');
}

async function checkAuth() {
  const storedToken = localStorage.getItem('token');
  if (!storedToken) {
    showLockedState();
    return;
  }
  try {
    const result = await apiGet('/auth/me');
    if (result.user) {
      currentUser = result.user;
      updateUserUI();
      hideLockedState();
    } else {
      // Token is invalid or expired — clear it
      localStorage.removeItem('token');
      showLockedState();
    }
  } catch (e) {
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
      const meRes = await apiGet('/auth/me');
      if (meRes.user) {
        currentUser = meRes.user;
        updateUserUI();
        showVerifiedNotification(currentUser.verifiedBusiness?.name || 'Your business');
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
  const el    = document.createElement('div');
  el.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[99999] ${color} text-white px-8 py-4 rounded-3xl shadow-2xl text-center font-semibold text-base`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

window.showAuthModal       = showAuthModal;
window.hideAuthModal       = hideAuthModal;
window.switchToLogin       = switchToLogin;
window.switchToRegister    = switchToRegister;
window.handleLogin         = handleLogin;
window.handleRegister      = handleRegister;
window.logout              = logout;
window.checkAuth           = checkAuth;
window.startVerificationPoll = startVerificationPoll;
window.stopVerificationPoll  = stopVerificationPoll;
window.showToast           = showToast;