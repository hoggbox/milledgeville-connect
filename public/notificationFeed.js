// notificationFeed.js
// ─────────────────────────────────────────────────────────────────────────────
// Facebook-style in-app notification feed.
// • Bell icon injected into both desktop sidebar and mobile nav
// • Dropdown panel with grouped (Today / Earlier) notifications
// • Unread badge auto-polls every 30 s (or fires on SSE events)
// • Click navigates to the relevant page + highlights the item
// • Works even when push notifications are disabled
//
// Depends on: currentUser, navigate(), apiGet(), apiPost(), showToast()
// All defined in data.js / api helpers already in the app.
// ─────────────────────────────────────────────────────────────────────────────

// ─── State ───────────────────────────────────────────────────────────────────
let _nfPanelOpen   = false;
let _nfItems       = [];       // cached notifications
let _nfUnread      = 0;        // current unread count
let _nfLoading     = false;
let _nfCursor      = null;     // ISO date for pagination
let _nfHasMore     = true;
let _nfPollTimer   = null;
let _nfInitDone    = false;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// Call once after login / page ready. Safe to call multiple times.
window.initNotificationFeed = function () {
  if (!currentUser) return;

  _injectStyles();
  _injectBellIcons();   // always safe — idempotent (checks element IDs internally)

  if (_nfInitDone) return;   // only start polling once
  _nfInitDone = true;

  _startPolling();
  _fetchBadgeCount();   // immediate first count
};

// Re-render nav bells (called from renderNav() after nav rebuild)
window.refreshNotificationBell = function () {
  if (!currentUser) return;
  _injectBellIcons();
  _updateBadge(_nfUnread);
};

// ─── Polling ─────────────────────────────────────────────────────────────────
function _startPolling() {
  if (_nfPollTimer) return;
  _nfPollTimer = setInterval(_fetchBadgeCount, 30000);
}

async function _fetchBadgeCount() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/notifications/unread-count', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) return;
    const { count } = await res.json();
    _nfUnread = count || 0;
    _updateBadge(_nfUnread);
  } catch (_) { /* silent */ }
}

// ─── Badge update ─────────────────────────────────────────────────────────────
function _updateBadge(count) {
  document.querySelectorAll('.nf-bell-badge').forEach(el => {
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : count;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

// ─── Inject bell icons into the nav ──────────────────────────────────────────
function _injectBellIcons() {
  // ── Desktop sidebar ────────────────────────────────────────────────────────
  const desktopNav = document.getElementById('desktop-nav');
  if (desktopNav && !document.getElementById('nf-bell-desktop')) {
    // Insert bell button before the nav list items (first child)
    const btn = document.createElement('button');
    btn.id = 'nf-bell-desktop';
    btn.className = 'nf-bell-btn flex items-center gap-3 w-full text-left px-6 py-4 rounded-3xl hover:bg-white/10 transition text-white relative';
    btn.innerHTML = `
      <span class="text-3xl relative">
        🔔
        <span class="nf-bell-badge hidden absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-md"></span>
      </span>
      <span class="font-medium">Notifications</span>
    `;
    btn.onclick = (e) => { e.stopPropagation(); _togglePanel('desktop'); };
    desktopNav.insertBefore(btn, desktopNav.firstChild);
  }

  // ── Mobile bottom nav ──────────────────────────────────────────────────────
  const mobileScroll = document.getElementById('mobile-nav')
    || document.getElementById('mobile-nav-scroll');
  if (mobileScroll && !document.getElementById('nf-bell-mobile')) {
    const btn = document.createElement('button');
    btn.id = 'nf-bell-mobile';
    btn.className = 'nf-bell-btn nav-btn';
    btn.innerHTML = `
      <span class="nav-icon relative" style="display:inline-block;">
        🔔
        <span class="nf-bell-badge hidden" style="
          position:absolute;top:-4px;right:-6px;
          background:#ef4444;color:#fff;font-size:9px;font-weight:700;
          min-width:16px;height:16px;border-radius:999px;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 1px 3px rgba(0,0,0,.4);
        "></span>
      </span>
      <span class="nav-label">Alerts</span>
    `;
    btn.onclick = (e) => { e.stopPropagation(); _togglePanel('mobile'); };
    // Insert after the first child so it's near the front
    mobileScroll.insertBefore(btn, mobileScroll.children[1] || null);
  }

  _updateBadge(_nfUnread);
}

// ─── Panel toggle ─────────────────────────────────────────────────────────────
function _togglePanel(origin) {
  const existing = document.getElementById('nf-panel');
  if (existing) {
    existing.remove();
    _nfPanelOpen = false;
    return;
  }
  _nfPanelOpen = true;
  _openPanel(origin);
  // fetch fresh items
  _nfItems   = [];
  _nfCursor  = null;
  _nfHasMore = true;
  _loadNotifications();
}

// Expose for the nav.js bridge (called by the bell buttons rendered in renderNav)
window._notificationFeedToggle = _togglePanel;

// ─── Build panel DOM ──────────────────────────────────────────────────────────
function _openPanel(origin) {
  const panel = document.createElement('div');
  panel.id = 'nf-panel';
  panel.className = 'nf-panel';

  // Position differs for desktop vs mobile
  if (origin === 'desktop') {
    panel.classList.add('nf-panel--desktop');
  } else {
    panel.classList.add('nf-panel--mobile');
  }

  panel.innerHTML = `
    <div class="nf-header">
      <span class="nf-header-title">Notifications</span>
      <div class="nf-header-actions">
        <button class="nf-action-btn" id="nf-mark-all-btn" title="Mark all as read">✓ All read</button>
        <button class="nf-action-btn nf-action-btn--danger" id="nf-clear-btn" title="Clear all">Clear</button>
        <button class="nf-close-btn" id="nf-close">✕</button>
      </div>
    </div>
    <div class="nf-list" id="nf-list">
      <div class="nf-spinner">Loading…</div>
    </div>
    <button class="nf-load-more hidden" id="nf-load-more">Load older</button>
  `;

  document.body.appendChild(panel);

  // Wire controls
  document.getElementById('nf-close').onclick      = () => { panel.remove(); _nfPanelOpen = false; };
  document.getElementById('nf-mark-all-btn').onclick = _markAllRead;
  document.getElementById('nf-clear-btn').onclick    = _clearAll;
  document.getElementById('nf-load-more').onclick    = _loadNotifications;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', _outsideClick);
  }, 50);
}

function _outsideClick(e) {
  const panel = document.getElementById('nf-panel');
  if (!panel) { document.removeEventListener('click', _outsideClick); return; }
  if (!panel.contains(e.target) && !e.target.closest('.nf-bell-btn')) {
    panel.remove();
    _nfPanelOpen = false;
    document.removeEventListener('click', _outsideClick);
  }
}

// ─── Load / render notifications ─────────────────────────────────────────────
async function _loadNotifications() {
  if (_nfLoading || !_nfHasMore) return;
  _nfLoading = true;

  const list     = document.getElementById('nf-list');
  const loadMore = document.getElementById('nf-load-more');

  try {
    let url = '/api/notifications?limit=30';
    if (_nfCursor) url += `&before=${encodeURIComponent(_nfCursor)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('fetch failed');
    const { notifications, unreadCount } = await res.json();

    _nfUnread = unreadCount;
    _updateBadge(_nfUnread);

    if (!notifications.length) {
      _nfHasMore = false;
      if (!_nfItems.length) {
        if (list) list.innerHTML = '<div class="nf-empty">You\'re all caught up! 🎉</div>';
      }
      if (loadMore) loadMore.classList.add('hidden');
      return;
    }

    _nfItems = [..._nfItems, ...notifications];
    _nfCursor = notifications[notifications.length - 1].createdAt;
    _nfHasMore = notifications.length === 30;

    if (list) _renderList(list);
    if (loadMore) {
      _nfHasMore ? loadMore.classList.remove('hidden') : loadMore.classList.add('hidden');
    }

  } catch (err) {
    if (list) list.innerHTML = '<div class="nf-empty nf-error">Couldn\'t load notifications.</div>';
  } finally {
    _nfLoading = false;
  }
}

function _renderList(container) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Group into Today / Earlier
  const todayItems   = _nfItems.filter(n => new Date(n.createdAt) >= today);
  const earlierItems = _nfItems.filter(n => new Date(n.createdAt) <  today);

  let html = '';

  if (todayItems.length) {
    html += `<div class="nf-group-label">Today</div>`;
    html += todayItems.map(_renderItem).join('');
  }
  if (earlierItems.length) {
    html += `<div class="nf-group-label">Earlier</div>`;
    html += earlierItems.map(_renderItem).join('');
  }

  container.innerHTML = html || '<div class="nf-empty">No notifications yet.</div>';

  // Wire item clicks
  container.querySelectorAll('.nf-item[data-id]').forEach(el => {
    el.onclick = () => _handleItemClick(el.dataset.id, el.dataset.page, el.dataset.itemid, el.dataset.anchor);
  });
  container.querySelectorAll('.nf-item-dismiss').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); _dismissItem(el.dataset.nid); };
  });
}

function _renderItem(n) {
  const avatar = n.actorAvatar
    ? `<img src="${_esc(n.actorAvatar)}" class="nf-avatar" alt="">`
    : `<div class="nf-avatar nf-avatar--letter" style="background:${_letterBg(n.actorName)}">${(n.actorName || '?')[0].toUpperCase()}</div>`;

  const icon = _typeIcon(n.type);
  const time = _relTime(new Date(n.createdAt));
  const unreadClass = n.read ? '' : 'nf-item--unread';

  return `
    <div class="nf-item ${unreadClass}" 
         data-id="${n._id}" 
         data-page="${_esc(n.linkPage || '')}"
         data-itemid="${_esc(n.linkItemId || '')}"
         data-anchor="${_esc(n.linkAnchor || '')}">
      <div class="nf-avatar-wrap">
        ${avatar}
        <span class="nf-type-icon">${icon}</span>
      </div>
      <div class="nf-content">
        <div class="nf-title">${_esc(n.title)}</div>
        ${n.body ? `<div class="nf-body">${_esc(n.body)}</div>` : ''}
        <div class="nf-time">${time}</div>
      </div>
      ${!n.read ? '<div class="nf-unread-dot"></div>' : ''}
      <button class="nf-item-dismiss" data-nid="${n._id}" title="Dismiss">✕</button>
    </div>
  `;
}

// ─── Item click → navigate + highlight ───────────────────────────────────────
async function _handleItemClick(id, page, itemId, anchor) {
  // Mark read
  _markRead(id);

  // Find and update locally
  const notif = _nfItems.find(n => n._id === id);
  if (notif) notif.read = true;

  // Re-render
  const list = document.getElementById('nf-list');
  if (list) _renderList(list);
  _updateBadge(Math.max(0, _nfUnread - 1));

  // Close panel
  document.getElementById('nf-panel')?.remove();
  _nfPanelOpen = false;
  document.removeEventListener('click', _outsideClick);

  // Navigate
  if (page && typeof navigate === 'function') {
    navigate(page);

    // After navigation, attempt to scroll to the specific item
    if (itemId || anchor) {
      setTimeout(() => {
        const targetId = anchor || `item-${itemId}` || itemId;
        const el = document.getElementById(targetId)
          || document.querySelector(`[data-id="${itemId}"]`)
          || document.querySelector(`[data-postid="${itemId}"]`);

        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief flash highlight
          el.classList.add('nf-highlight-flash');
          setTimeout(() => el.classList.remove('nf-highlight-flash'), 2000);
        }
      }, 600); // wait for page to render
    }
  }
}

// ─── Mark read / dismiss ──────────────────────────────────────────────────────
async function _markRead(id) {
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ id })
    });
  } catch (_) {}
}

async function _markAllRead() {
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ all: true })
    });
    _nfItems.forEach(n => n.read = true);
    _nfUnread = 0;
    _updateBadge(0);
    const list = document.getElementById('nf-list');
    if (list) _renderList(list);
    showToast('All notifications marked as read', 'success');
  } catch (_) {
    showToast('Could not mark all as read', 'error');
  }
}

async function _dismissItem(id) {
  try {
    await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    _nfItems = _nfItems.filter(n => n._id !== id);
    const list = document.getElementById('nf-list');
    if (list) _renderList(list);
  } catch (_) {}
}

async function _clearAll() {
  if (!confirm('Clear all notifications?')) return;
  try {
    await fetch('/api/notifications', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    _nfItems   = [];
    _nfUnread  = 0;
    _updateBadge(0);
    const list = document.getElementById('nf-list');
    if (list) list.innerHTML = '<div class="nf-empty">You\'re all caught up! 🎉</div>';
    showToast('Notifications cleared', 'success');
  } catch (_) {
    showToast('Could not clear notifications', 'error');
  }
}

// ─── Utility helpers ─────────────────────────────────────────────────────────
function _esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _typeIcon(type) {
  const icons = {
    comment: '💬', reply: '↩️', like: '❤️',
    new_event: '📅', new_deal: '🔥', new_shoutout: '🚦',
    new_marketplace: '🛒', new_lost: '🔎', new_news: '📰',
    message: '✉️', follow: '⭐', system: '📢',
  };
  return icons[type] || '🔔';
}

function _relTime(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function _letterBg(name) {
  const colors = ['#059669','#7c3aed','#b45309','#0284c7','#be123c','#0f766e'];
  const i = (name || '?').charCodeAt(0) % colors.length;
  return colors[i];
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('nf-styles')) return;
  const style = document.createElement('style');
  style.id = 'nf-styles';
  style.textContent = `
    /* ── Panel shell ───────────────────────────────────────────────────────── */
    .nf-panel {
      position: fixed;
      z-index: 99999;
      background: #0f172a;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: nf-slide-in 0.18s ease;
    }
    @keyframes nf-slide-in {
      from { opacity: 0; transform: translateY(-8px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }

    /* Desktop: anchored left of sidebar */
    .nf-panel--desktop {
      top: 80px;
      left: 264px;   /* sidebar width (240px) + 24px gap */
      width: 380px;
      max-height: 80vh;
    }

    /* Mobile: full-width sheet from top */
    .nf-panel--mobile {
      top: 60px;
      left: 8px;
      right: 8px;
      width: auto;
      max-height: 75vh;
    }

    /* ── Header ─────────────────────────────────────────────────────────────── */
    .nf-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .nf-header-title {
      font-size: 17px;
      font-weight: 700;
      color: #fff;
    }
    .nf-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nf-action-btn {
      background: rgba(255,255,255,0.08);
      border: none;
      border-radius: 8px;
      color: rgba(255,255,255,0.7);
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .nf-action-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
    .nf-action-btn--danger:hover { background: rgba(239,68,68,0.2); color: #f87171; }
    .nf-close-btn {
      background: none; border: none;
      color: rgba(255,255,255,0.4);
      font-size: 14px; cursor: pointer;
      padding: 4px 6px; border-radius: 6px;
      transition: color 0.15s;
    }
    .nf-close-btn:hover { color: #fff; }

    /* ── List ───────────────────────────────────────────────────────────────── */
    .nf-list {
      overflow-y: auto;
      flex: 1;
      padding: 8px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .nf-group-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(255,255,255,0.35);
      padding: 10px 18px 4px;
    }
    .nf-empty {
      text-align: center;
      color: rgba(255,255,255,0.35);
      font-size: 14px;
      padding: 40px 20px;
    }
    .nf-error { color: #f87171; }
    .nf-spinner {
      text-align: center;
      color: rgba(255,255,255,0.35);
      font-size: 13px;
      padding: 30px;
    }

    /* ── Item ───────────────────────────────────────────────────────────────── */
    .nf-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 18px;
      cursor: pointer;
      position: relative;
      transition: background 0.12s;
      border-radius: 0;
    }
    .nf-item:hover { background: rgba(255,255,255,0.05); }
    .nf-item--unread { background: rgba(5,150,105,0.07); }
    .nf-item--unread:hover { background: rgba(5,150,105,0.12); }

    /* Avatar */
    .nf-avatar-wrap { position: relative; flex-shrink: 0; }
    .nf-avatar {
      width: 44px; height: 44px;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }
    .nf-avatar--letter {
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 800; color: #fff;
    }
    .nf-type-icon {
      position: absolute; bottom: -3px; right: -4px;
      font-size: 14px; line-height: 1;
      background: #0f172a; border-radius: 50%;
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
    }

    /* Content */
    .nf-content { flex: 1; min-width: 0; }
    .nf-title {
      font-size: 13.5px; font-weight: 600; color: #f1f5f9;
      line-height: 1.35;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .nf-body {
      font-size: 12.5px; color: rgba(255,255,255,0.55);
      margin-top: 2px; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .nf-time {
      font-size: 11.5px; color: #34d399;
      margin-top: 4px; font-weight: 500;
    }

    /* Unread dot */
    .nf-unread-dot {
      flex-shrink: 0;
      width: 9px; height: 9px;
      background: #10b981;
      border-radius: 50%;
      margin-top: 16px;
    }

    /* Dismiss X button */
    .nf-item-dismiss {
      position: absolute; top: 8px; right: 10px;
      background: none; border: none;
      color: rgba(255,255,255,0.25); font-size: 11px;
      cursor: pointer; padding: 2px 4px; border-radius: 4px;
      opacity: 0; transition: opacity 0.15s, color 0.15s;
      line-height: 1;
    }
    .nf-item:hover .nf-item-dismiss { opacity: 1; }
    .nf-item-dismiss:hover { color: #f87171 !important; }

    /* ── Load more ──────────────────────────────────────────────────────────── */
    .nf-load-more {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: none; border-top: 1px solid rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.5); font-size: 13px;
      padding: 12px; cursor: pointer;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    .nf-load-more:hover { background: rgba(255,255,255,0.1); color: #fff; }

    /* ── Highlight flash (after navigate) ───────────────────────────────────── */
    @keyframes nf-flash {
      0%   { box-shadow: 0 0 0 3px rgba(52,211,153,0.7); }
      50%  { box-shadow: 0 0 0 8px rgba(52,211,153,0.2); }
      100% { box-shadow: 0 0 0 3px rgba(52,211,153,0); }
    }
    .nf-highlight-flash {
      animation: nf-flash 1.8s ease forwards;
      border-radius: 12px;
    }
  `;
  document.head.appendChild(style);
}

// ─── Public helper: fire a notification from client-side code ─────────────────
// (Use this for testing or for lightweight local-only toasts)
// For real persistence, call the server route instead.
window.notifyFeedPush = function({ type = 'system', title, body = '', linkPage = '', linkItemId = '', linkAnchor = '' } = {}) {
  _nfUnread += 1;
  _updateBadge(_nfUnread);
  // Optionally show a toast too
  showToast(`🔔 ${title}`, 'info');
};