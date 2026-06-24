const pages = [
  { id: 'home',        icon: '🏠', label: 'Home' },
  { id: 'directory',   icon: '📍', label: 'Directory' },
  { id: 'shoutouts',   icon: '🚦', label: 'Traffic' },
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

  // ── Desktop sidebar nav ──────────────────────────────────────────────────────
  let desktopHTML = '';

  // 🔔 Notification bell — desktop (only for logged-in users)
  if (currentUser) {
    desktopHTML += `
      <button onclick="window._nfTogglePanel('desktop')"
              id="nf-bell-desktop"
              class="nf-bell-btn flex items-center gap-3 w-full text-left px-6 py-4 rounded-3xl hover:bg-white/10 transition text-white relative">
        <span class="text-3xl relative" style="display:inline-block;">
          🔔
          <span id="nf-badge-desktop"
                class="nf-bell-badge hidden absolute bg-red-500 text-white font-bold flex items-center justify-center rounded-full shadow-md"
                style="top:-4px;right:-6px;min-width:18px;height:18px;font-size:10px;"></span>
        </span>
        <span class="font-medium">Notifications</span>
      </button>`;
  }

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

  // ── Desktop sidebar bottom user area ─────────────────────────────────────────
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

  // ── Mobile bottom nav — horizontally scrollable / swipeable strip ────────────
  if (!document.getElementById('mobile-nav-style')) {
    const style = document.createElement('style');
    style.id = 'mobile-nav-style';
    style.textContent = `
      #mobile-nav-scroll {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
        padding: 0 8px;
      }
      #mobile-nav-scroll::-webkit-scrollbar { display: none; }
      #mobile-nav-scroll .nav-btn {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-width: 64px;
        padding: 6px 8px;
        color: rgba(255,255,255,0.65);
        transition: color 0.15s;
        scroll-snap-align: start;
        position: relative;
        background: none;
        border: none;
        cursor: pointer;
      }
      #mobile-nav-scroll .nav-btn:active,
      #mobile-nav-scroll .nav-btn:hover { color: #fff; }
      #mobile-nav-scroll .nav-btn .nav-icon { font-size: 1.6rem; line-height: 1; }
      #mobile-nav-scroll .nav-btn .nav-label { font-size: 9px; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }

  // 🔔 Notification bell first in mobile nav (logged-in only)
  let mobileHTML = '<div id="mobile-nav-scroll">';

  if (currentUser) {
    mobileHTML += `
      <button onclick="window._nfTogglePanel('mobile')" id="nf-bell-mobile" class="nf-bell-btn nav-btn">
        <span class="nav-icon" style="position:relative;display:inline-block;">
          🔔
          <span id="nf-badge-mobile"
                class="nf-bell-badge hidden"
                style="position:absolute;top:-4px;right:-6px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4);"></span>
        </span>
        <span class="nav-label">Alerts</span>
      </button>`;
  }

  navPages.forEach(page => {
    let badge = '';
    if (page.id === 'messages') {
      badge = `<span id="messageBadge" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-md hidden"></span>`;
    }
    mobileHTML += `
      <button onclick="navigate('${page.id}')" class="nav-btn">
        <span class="nav-icon">${page.icon}</span>
        ${badge}
        <span class="nav-label">${page.label}</span>
      </button>`;
  });
  mobileHTML += '</div>';

  const mobileNavEl = document.getElementById('mobile-nav');
  if (mobileNavEl) mobileNavEl.innerHTML = mobileHTML;

  // ── Mobile topbar user area ──────────────────────────────────────────────────
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

  // ── Safe badge updates ───────────────────────────────────────────────────────
  setTimeout(() => {
    // Message badge
    if (typeof updateMessageBadge === 'function') {
      updateMessageBadge();
    }
    // Notification feed — init or re-attach after nav rebuild
    if (typeof initNotificationFeed === 'function') {
      initNotificationFeed();
    } else if (typeof window._nfUpdateBadge === 'function') {
      window._nfUpdateBadge();
    }
  }, 300);
}

window.navigate = loadPage; // defined in data.js

// ─── Panel toggle — called by bell buttons in both nav contexts ───────────────
// This thin wrapper lives in nav.js so it's available immediately after the
// nav renders, even if notificationFeed.js loads slightly later.
window._nfTogglePanel = function(origin) {
  if (typeof window._notificationFeedToggle === 'function') {
    window._notificationFeedToggle(origin);
  }
};