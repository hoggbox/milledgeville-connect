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
    ? `Last logged in: ${new Date(currentUser.lastLogin).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}`
    : 'Just now';

  const isAdmin = currentUser.email === 'imhoggbox@gmail.com';

  content.innerHTML = `
    <div class="flex justify-center mb-6">
      <div class="w-28 h-28 bg-emerald-500 rounded-3xl flex items-center justify-center text-7xl font-bold text-white shadow-inner">
        ${avatarLetter}
      </div>
    </div>
    <h2 class="text-3xl font-bold text-slate-900">${currentUser.name}</h2>
    <p class="text-emerald-600 text-lg">${currentUser.email}</p>
    <p class="text-gray-500 text-sm mt-6">${lastLoginText}</p>
    
    <div class="mt-10 space-y-3">
      ${isAdmin ? `<button onclick="navigate('admin')" class="w-full bg-amber-500 hover:bg-amber-600 text-white py-5 rounded-3xl font-semibold text-xl transition">🔧 Admin Panel</button>` : ''}
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

  document.getElementById('sidebar-avatar').innerHTML = avatarLetter;
  document.getElementById('mobile-avatar').innerHTML = avatarLetter;
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
  const result = await apiGet('/auth/me');
  if (result.user) {
    currentUser = result.user;
    updateUserUI();
    hideLockedState();
  } else {
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