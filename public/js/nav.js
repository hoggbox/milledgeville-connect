const pages = [
  { id: 'home',        icon: '🏠', label: 'Home' },
  { id: 'directory',   icon: '📍', label: 'Directory' },
  { id: 'shoutouts',   icon: '💬', label: 'Shoutouts' },
  { id: 'lostfound',   icon: '🔎', label: 'Lost & Found' },
  { id: 'marketplace', icon: '🛒', label: 'Marketplace' },
  { id: 'events',      icon: '📅', label: 'Events' },
  { id: 'deals',       icon: '🔥', label: 'Deals' },
  { id: 'resources',   icon: '🌍', label: 'Resources' }
];

function renderNav() {
  const isOwner = currentUser && currentUser.verifiedBusiness;
  const isAdmin = currentUser && currentUser.email === 'imhoggbox@gmail.com';
  const canNews = currentUser && (currentUser.canPostNews || isAdmin);

  const navPages = [...pages];

  // Only show Messages button if logged in
  if (currentUser) {
    navPages.push({ id: 'messages', icon: '✉️', label: 'Messages' });
  }

  if (isOwner) navPages.push({ id: 'owner-dashboard', icon: '🏪', label: 'My Biz' });
  if (canNews) navPages.push({ id: 'post-news',      icon: '📰', label: 'Post News' });

  // Desktop sidebar nav
  let desktopHTML = '';
  navPages.forEach(page => {
    let badge = '';
    if (page.id === 'messages') {
      badge = `<span id="messageBadge" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-md hidden"></span>`;
    }
    desktopHTML += `
      <button onclick="navigate('${page.id}')" 
              class="flex items-center gap-3 w-full text-left px-6 py-4 rounded-3xl hover:bg-white/10 transition text-white relative">
        <span class="text-3xl">${page.icon}</span>
        <span class="font-medium">${page.label}</span>
        ${badge}
      </button>`;
  });
  const desktopNavEl = document.getElementById('desktop-nav');
  if (desktopNavEl) desktopNavEl.innerHTML = desktopHTML;

  // Desktop sidebar bottom user area
  const sidebarUserArea = document.getElementById('sidebar-user-area');
  if (sidebarUserArea) {
    if (currentUser) {
      sidebarUserArea.innerHTML = `
        <div onclick="showProfileSheet()" id="sidebar-avatar"
             title="${currentUser.verifiedBusiness ? 'Verified Business Owner' : currentUser.name}"
             class="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-2xl font-bold text-white cursor-pointer hover:scale-110 transition-transform overflow-hidden">
          ${currentUser.avatar
            ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover rounded-2xl" alt="avatar">`
            : (currentUser.name || '?')[0].toUpperCase()}
        </div>`;
    } else {
      sidebarUserArea.innerHTML = `
        <button onclick="showAuthModal()"
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-3xl font-semibold text-sm transition flex items-center justify-center gap-2">
          <span>👤</span> Sign In / Register
        </button>`;
    }
  }

  // Mobile bottom nav
  let mobileHTML = '';
  navPages.forEach(page => {
    let badge = '';
    if (page.id === 'messages') {
      badge = `<span id="messageBadge" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-md hidden"></span>`;
    }
    mobileHTML += `
      <button onclick="navigate('${page.id}')" class="flex flex-col items-center text-white/70 hover:text-white transition relative">
        <span class="text-3xl">${page.icon}</span>
        ${badge}
        <span class="text-[10px]">${page.label}</span>
      </button>`;
  });
  const mobileNavEl = document.getElementById('mobile-nav');
  if (mobileNavEl) mobileNavEl.innerHTML = mobileHTML;

  // Mobile topbar user area
  const topbarUserArea = document.getElementById('topbar-user-area');
  if (topbarUserArea) {
    if (currentUser) {
      topbarUserArea.innerHTML = `
        <div onclick="showProfileSheet()" id="mobile-avatar"
             class="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-2xl font-bold text-white cursor-pointer flex-shrink-0 overflow-hidden">
          ${currentUser.avatar
            ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover rounded-2xl" alt="avatar">`
            : (currentUser.name || '?')[0].toUpperCase()}
        </div>`;
    } else {
      topbarUserArea.innerHTML = `
        <button onclick="showAuthModal()"
                class="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-2xl text-sm font-semibold transition whitespace-nowrap">
          Sign In
        </button>`;
    }
  }

  // Safe badge update
  setTimeout(() => {
    if (typeof updateMessageBadge === 'function') {
      updateMessageBadge();
    }
  }, 300);
}

window.navigate = loadPage; // defined in data.js