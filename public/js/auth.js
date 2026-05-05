let currentUser = null;
let verificationPollInterval = null;

// ─── Auth Modal ───────────────────────────────────────────────────────────────
function showAuthModal(opts = {}) {
  const modal = document.getElementById('authModal');
  
  if (!modal) {
    console.error('❌ ERROR: authModal not found in the page!');
    alert('Login window is missing. Please hard refresh the page (Ctrl + Shift + R).');
    return;
  }

  modal.classList.remove('hidden');

  // If a specific prompt message was requested, show it above the form
  if (opts.message) {
    let msgEl = document.getElementById('authPromptMsg');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'authPromptMsg';
      msgEl.className = 'text-center text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-4 py-3 mb-4';
      document.querySelector('#authModal .p-8').prepend(msgEl);
    }
    msgEl.textContent = opts.message;
    msgEl.classList.remove('hidden');
  } else {
    const msgEl = document.getElementById('authPromptMsg');
    if (msgEl) msgEl.classList.add('hidden');
  }

  if (opts.register) {
    switchToRegister();
  } else {
    switchToLogin();
  }
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function switchToLogin() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const modalTitle = document.getElementById('modalTitle');

  if (loginForm) loginForm.classList.remove('hidden');
  if (registerForm) registerForm.classList.add('hidden');
  if (modalTitle) modalTitle.textContent = 'Welcome back';
}

function switchToRegister() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const modalTitle = document.getElementById('modalTitle');

  if (loginForm) loginForm.classList.add('hidden');
  if (registerForm) registerForm.classList.remove('hidden');
  if (modalTitle) modalTitle.textContent = 'Create account';
}

// ─── Prompt guests to sign in for gated actions ───────────────────────────────
// Call this anywhere a write action requires auth.
// msg = short description of what they need to sign in to do.
function requireAuth(msg) {
  if (currentUser) return true; // already logged in — proceed
  showAuthModal({ message: msg || 'Sign in to access this feature.' });
  return false;
}

async function handleRegister() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!name || !email || !password) return alert('All fields are required');

  const result = await apiPost('/auth/register', { name, email, password });

  if (result.token) {
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
      modalTitle.innerHTML = `
        <div class="text-emerald-600 text-5xl mb-4">✅</div>
        Account Created!<br>
        <span class="text-xl text-slate-600">Logging you in...</span>`;
    }
    setTimeout(() => {
      setToken(result.token);
      currentUser = result.user;
      updateUserUI();
      hideAuthModal();
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

    // ─── SAFE Auto-prompt for push notifications ───
    if (currentUser.pushEnabled && typeof requestPushPermission === 'function') {
      setTimeout(() => {
        // Extra safety check
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;

        navigator.serviceWorker.ready
          .then(reg => reg.pushManager.getSubscription())
          .then(sub => {
            if (!sub) {
              // Show friendly toast prompt
              const toast = document.createElement('div');
              toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 z-[99999] max-w-[90%]';
              toast.innerHTML = `
                <div class="flex-1">🔔 Get instant alerts for deals, events & messages?</div>
                <button class="bg-white text-emerald-600 px-5 py-2 rounded-2xl font-semibold text-sm whitespace-nowrap">Enable</button>
              `;
              document.body.appendChild(toast);

              toast.querySelector('button').onclick = async () => {
                toast.remove();
                await requestPushPermission();
              };

              setTimeout(() => toast.remove(), 12000);
            }
          })
          .catch(() => {}); // Silent fail if service worker not ready
      }, 1800);
    }

    loadPage(currentPage || 'home');
  } else {
    alert(result.message || 'Login failed');
  }
}

// ─── updateUserUI ─────────────────────────────────────────────────────────────
// Fallback — overridden by profile.js once it loads
function updateUserUI() {
  renderNav();
}

function logout() {
  hideProfileSheet();
  localStorage.removeItem('token');
  currentUser = null;
  stopVerificationPoll();
  updateUserUI();
  loadPage('home');
}

// ─── Auth check on page load ──────────────────────────────────────────────────
async function checkAuth() {
  const storedToken = localStorage.getItem('token');
  if (!storedToken) {
    // Guest — show app but without user-specific UI
    updateUserUI();
    return;
  }
  try {
    const result = await apiGet('/auth/me');
    if (result.user) {
      currentUser = result.user;
      updateUserUI();
    } else {
      // Token invalid / expired
      localStorage.removeItem('token');
      updateUserUI();
    }
  } catch (e) {
    updateUserUI();
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

window.showAuthModal           = showAuthModal;
window.hideAuthModal           = hideAuthModal;
window.switchToLogin           = switchToLogin;
window.switchToRegister        = switchToRegister;
window.handleLogin             = handleLogin;
window.handleRegister          = handleRegister;
window.logout                  = logout;
window.checkAuth               = checkAuth;
window.requireAuth             = requireAuth;
window.startVerificationPoll   = startVerificationPoll;
window.stopVerificationPoll    = stopVerificationPoll;
window.showToast               = showToast;