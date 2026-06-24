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

  if (currentUser) {
    navPages.push({ id: 'messages', icon: '✉️', label: 'Messages' });
  }

  if (isOwner) navPages.push({ id: 'owner-dashboard', icon: '🏪', label: 'My Biz' });
  if (canNews) navPages.push({ id: 'post-news',      icon: '📰', label: 'Post News' });

  // ── Desktop sidebar nav ──────────────────────────────────────────────────────
  let desktopHTML = '';

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

  // ... (rest of your renderNav remains the same - mobile nav, user area, etc.)

  // ── Safe badge updates + init ───────────────────────────────────────────────
  setTimeout(() => {
    if (typeof updateMessageBadge === 'function') updateMessageBadge();
    if (typeof initNotificationFeed === 'function') {
      initNotificationFeed();
    }
  }, 300);
}

window.navigate = loadPage;

// ─── Panel toggle wrapper (now more robust) ───────────────────────────────────
window._nfTogglePanel = function(origin) {
  console.log('[nav] _nfTogglePanel called with origin:', origin); // DEBUG

  if (typeof window._notificationFeedToggle === 'function') {
    console.log('[nav] Found _notificationFeedToggle — delegating');
    window._notificationFeedToggle(origin);
  } else {
    console.error('[nav] _notificationFeedToggle NOT FOUND — notificationFeed.js may not have loaded');
    // Fallback: try to init again
    if (typeof initNotificationFeed === 'function') initNotificationFeed();
  }
};