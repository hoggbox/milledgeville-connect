let currentUser = null;

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

  const result = await apiPost('/api/auth/register', { name, email, password });

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

  const result = await apiPost('/api/auth/login', { email, password });

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

// ====================== IMPROVED PROFILE SHEET ======================
async function showProfileSheet() {
  if (!currentUser) return;

  // Force fresh user data so verified badge shows immediately after admin approval
  try {
    const fresh = await apiGet('/api/auth/me');
    if (fresh && !fresh.message) currentUser = fresh;
  } catch(e) {}

  var user    = currentUser;
  var sheet   = document.getElementById('profileSheet');
  var content = document.getElementById('sheet-content');
  var isAdmin = user.email === 'imhoggbox@gmail.com';
  var avatarLetter = user.name[0].toUpperCase();
  var lastLogin = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
    : 'Just now';

  var statusBadge  = '';
  var ownerActions = '';

  if (user.verifiedOwner && user.claimedBusiness) {
    var bizName = (user.claimedBusiness.name || 'Your Business');
    statusBadge =
      '<div class="mt-6 px-8 py-6 bg-emerald-500/20 border-2 border-emerald-400 rounded-3xl text-center">' +
        '<div class="text-5xl mb-3">✅</div>' +
        '<p class="font-bold text-2xl text-emerald-400">Verified Business Owner</p>' +
        '<p class="text-white/80 mt-1">' + bizName + '</p>' +
      '</div>';
    ownerActions =
      '<button onclick="hideProfileSheet(); navigate(\'owner-dashboard\')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-semibold text-lg transition">🏬 Manage My Listing</button>' +
      '<button onclick="hideProfileSheet(); navigate(\'post-deal\')"       class="w-full bg-white/10 border border-white/30 hover:bg-white/20 text-white py-5 rounded-3xl font-semibold text-lg transition mt-3">🔥 Post New Deal</button>' +
      '<button onclick="hideProfileSheet(); navigate(\'post-event\')"      class="w-full bg-white/10 border border-white/30 hover:bg-white/20 text-white py-5 rounded-3xl font-semibold text-lg transition mt-3">📅 Post New Event</button>';
  } else if (user.pendingClaim && user.pendingClaim.businessName) {
    statusBadge =
      '<div class="mt-4 inline-flex items-center gap-2 bg-amber-500/15 text-amber-500 border border-amber-400/30 px-5 py-2 rounded-full text-sm font-semibold">⏳ Claim Pending Review</div>' +
      '<p class="text-gray-500 text-sm mt-1">' + user.pendingClaim.businessName + '</p>';
  } else if (user.pendingNewBusiness && user.pendingNewBusiness.businessName) {
    statusBadge =
      '<div class="mt-4 inline-flex items-center gap-2 bg-amber-500/15 text-amber-500 border border-amber-400/30 px-5 py-2 rounded-full text-sm font-semibold">⏳ New Business Pending</div>' +
      '<p class="text-gray-500 text-sm mt-1">' + user.pendingNewBusiness.businessName + '</p>';
  } else {
    statusBadge = '<div class="mt-4 inline-flex items-center gap-2 bg-gray-100 text-gray-500 px-5 py-2 rounded-full text-sm">👤 Local Resident</div>';
  }

  content.innerHTML =
    '<div class="flex justify-center mb-6">' +
      '<div class="w-24 h-24 bg-emerald-600 rounded-3xl flex items-center justify-center text-6xl font-bold text-white shadow-lg">' + avatarLetter + '</div>' +
    '</div>' +
    '<h2 class="text-3xl font-bold text-slate-900">' + user.name + '</h2>' +
    '<p class="text-emerald-600">' + user.email + '</p>' +
    '<p class="text-gray-400 text-sm mt-1">Last login: ' + lastLogin + '</p>' +
    statusBadge +
    '<div class="mt-8 space-y-3">' +
      ownerActions +
      (isAdmin ? '<button onclick="hideProfileSheet(); navigate(\'admin\')" class="w-full bg-amber-500 hover:bg-amber-400 text-white py-5 rounded-3xl font-semibold text-lg transition">🔧 Admin Panel</button>' : '') +
      '<button onclick="logout()" class="w-full bg-red-500 hover:bg-red-400 text-white py-5 rounded-3xl font-semibold text-lg transition">Log Out</button>' +
      '<button onclick="hideProfileSheet()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-5 rounded-3xl font-semibold text-lg transition">Close</button>' +
    '</div>';

  sheet.classList.remove('hidden');
  setTimeout(function() { var d = sheet.querySelector('div'); if(d) d.classList.remove('translate-y-full'); }, 10);
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

  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarAvatar) sidebarAvatar.innerHTML = avatarLetter;

  const mobileAvatar = document.getElementById('mobile-avatar');
  if (mobileAvatar) mobileAvatar.innerHTML = avatarLetter;
}

function logout() {
  hideProfileSheet();
  localStorage.removeItem('token');
  currentUser = null;
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
  if (!token) {
    showLockedState();
    return;
  }
  try {
    const result = await apiGet('/api/auth/me');
    if (result && !result.message) {
      currentUser = result;
      updateUserUI();
      hideLockedState();
    } else {
      showLockedState();
    }
  } catch (err) {
    console.error('Auth check failed', err);
    showLockedState();
  }
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