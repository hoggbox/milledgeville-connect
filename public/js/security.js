// ─────────────────────────────────────────────────────────────────────────────
// security.js  —  Frontend XSS protection layer for Milledgeville Connect
//
// HOW TO USE:
//   Include this file BEFORE data.js in your HTML:
//     <script src="security.js"></script>
//     <script src="data.js"></script>
//
// This file:
//   1. Replaces / upgrades the existing esc() function
//   2. Adds safeURL(), stripHTML(), and safeAttr() helpers
//   3. Fixes renderClickableUser() which was injecting displayName raw
//   4. Fixes the global search renderer (item.title / item.subtitle were raw)
//   5. Patches renderHotFeed to escape all API text (titles, authors, etc.)
//   6. Adds a dev-mode innerHTML guard that warns on suspicious injection
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1.  CORE ESCAPING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * esc(str) — HTML-encode a value for safe injection into innerHTML.
 *
 * Replaces the simpler version in data.js.  The extra backtick escape
 * prevents template-literal injection in certain attribute contexts.
 *
 * ALWAYS use esc() whenever you put server data inside a template literal
 * that ends up in innerHTML / insertAdjacentHTML.
 */
window.esc = function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
};

/**
 * safeURL(url) — Validates a URL before putting it in href / src.
 *
 * Blocks: javascript:, data:, vbscript:, blob:, and anything that
 * doesn't start with http/https or a safe relative path.
 */
window.safeURL = function safeURL(url) {
  if (!url || typeof url !== 'string') return '#';
  const t = url.trim();
  if (/^(javascript|data|vbscript|blob)\s*:/i.test(t)) return '#';
  // Allow: https://, http://, /, #, relative paths
  if (!/^(https?:\/\/|\/|#)/.test(t)) return '#';
  return t;
};

/**
 * safeAttr(str) — Like esc() but also strips newlines / tabs that could
 * break out of HTML attribute values in certain parsers.
 */
window.safeAttr = function safeAttr(str) {
  if (str == null) return '';
  return esc(str).replace(/[\r\n\t]/g, ' ');
};

/**
 * stripHTML(str) — Removes all HTML tags, leaving plain text.
 *
 * Use when you want to display user content as text only, with no formatting
 * (e.g. notification messages, search subtitles, descriptions in cards).
 */
window.stripHTML = function stripHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\0/g, '')
    .trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.  FIXED renderClickableUser
//     BUG: displayName was injected raw → attacker could set name to
//          <img src=x onerror="..."> and execute arbitrary JS.
// ─────────────────────────────────────────────────────────────────────────────

window.renderClickableUser = function renderClickableUser(userData, fallbackName = 'Anonymous') {
  if (!userData) return esc(fallbackName);

  let userId      = null;
  let displayName = fallbackName;
  let reputation  = 0;

  if (typeof userData === 'object' && userData !== null) {
    userId      = userData._id || userData.id || null;
    displayName = userData.name || userData.authorName || userData.author || fallbackName;
    reputation  = Math.max(0, Number(userData.reputation) || 0);
  } else if (typeof userData === 'string' && userData.length > 10) {
    userId = userData;
  }

  if (!userId) return esc(String(displayName));

  // Reputation badge — reputation is always a Number so no escaping needed
  const repHTML = reputation >= 10
    ? `<span class="ml-1.5 inline-flex items-center gap-0.5 bg-gradient-to-r from-amber-400 to-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">⭐${reputation}</span>`
    : '';

  // esc() on BOTH userId (used in JS attribute) and displayName (displayed text)
  return `<span onclick="event.stopImmediatePropagation(); showUserProfileModal('${safeAttr(userId)}')"
                class="cursor-pointer hover:underline text-emerald-400 inline-flex items-center">
            ${esc(displayName)}${repHTML}
          </span>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.  FIXED Search-result renderer
//     BUG: item.title and item.subtitle came straight from the DB and were
//          injected raw into the search dropdown — classic stored-XSS path.
// ─────────────────────────────────────────────────────────────────────────────

// Safe emoji map so the server-supplied `icon` field is never trusted
const _SEARCH_ICONS = {
  business: '📍', event: '📅', deal: '🔥', news: '📰',
  shoutout: '🚦', lost: '🔎', market: '🛒'
};

/**
 * Call this from initGlobalSearch() instead of building HTML inline.
 *
 * Replace:
 *   html += `... ${item.icon} ... ${item.title} ... ${item.subtitle} ...`;
 * With:
 *   html += window._renderSearchResult(item);
 */
window._renderSearchResult = function _renderSearchResult(item) {
  const icon = _SEARCH_ICONS[item.type] || '🔍';
  return `
    <div onclick="handleSearchResultClick('${safeAttr(item.type)}', '${safeAttr(String(item.id))}')"
         class="flex items-center gap-3 px-4 py-3 hover:bg-white/10 cursor-pointer border-b border-white/10 last:border-none">
      <span class="text-2xl">${icon}</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-white text-sm leading-tight">${esc(item.title)}</p>
        <p class="text-white/60 text-xs line-clamp-1">${esc(item.subtitle)}</p>
      </div>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.  PATCH initGlobalSearch to use the safe renderer
//     We override the DOMContentLoaded listener with a safe version.
// ─────────────────────────────────────────────────────────────────────────────

window.initGlobalSearch = function initGlobalSearch() {
  const input            = document.getElementById('globalSearchInput');
  const resultsContainer = document.getElementById('globalSearchResults');
  if (!input || !resultsContainer) return;

  let searchTimeout = null;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();

    if (q.length < 2) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.add('hidden');
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        const res = await apiGet(`/search?q=${encodeURIComponent(q)}`);

        if (!res.results || res.results.length === 0) {
          // esc() the query string in case user typed HTML
          resultsContainer.innerHTML = `<div class="p-4 text-white/60 text-sm">No results found for "${esc(q)}"</div>`;
          resultsContainer.classList.remove('hidden');
          return;
        }

        resultsContainer.innerHTML = res.results.map(window._renderSearchResult).join('');
        resultsContainer.classList.remove('hidden');
      } catch (e) {
        console.error('[search]', e);
      }
    }, 300);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.classList.add('hidden');
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.initGlobalSearch();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.  SAFE renderHotFeed item builders
//     Provides a drop-in replacement for the inline template literals in
//     data.js's renderHotFeed().  Call these from the switch/if block.
//
//     BUGS FIXED:
//       • n.title, n.summary            — raw in news cards
//       • e.title, e.description        — raw in event cards
//       • d.title, d.description        — raw in deal cards
//       • s.text, s.author/authorName   — raw in shoutout cards
// ─────────────────────────────────────────────────────────────────────────────

window._hotItemHTML = {
  news(n) {
    return `
      <div onclick="openNewsArticle('${safeAttr(String(n._id))}')"
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-blue-500 px-3 py-1 rounded-full">📰 NEWS</span>
          <h4 class="font-semibold text-lg mt-2">${esc(n.title)}</h4>
          <p class="text-white/70 line-clamp-2">${esc(n.summary || '')}</p>
          <div class="text-xs text-white/50 mt-3">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
  },

  event(e) {
    return `
      <div onclick="navigate('events')"
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-amber-500 px-3 py-1 rounded-full">📅 EVENT</span>
          <h4 class="font-semibold text-lg mt-2">${esc(e.title)}</h4>
          <p class="text-white/70">${esc(e.description || '')}</p>
          <div class="text-xs text-white/50 mt-3">${formatDate(e.date)}</div>
        </div>
      </div>`;
  },

  deal(d) {
    return `
      <div onclick="navigate('deals')"
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-red-500 px-3 py-1 rounded-full">🔥 DEAL</span>
          <h4 class="font-semibold text-lg mt-2">${esc(d.title)}</h4>
          <p class="text-white/70">${esc(d.description || '')}</p>
          <div class="text-xs text-white/50 mt-3">${timeAgo(d.createdAt)}</div>
        </div>
      </div>`;
  },

  shoutout(s) {
    const author = s.author || s.authorName || 'Community';
    return `
      <div onclick="navigate('shoutouts')"
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-orange-500 px-3 py-1 rounded-full">🚦 TRAFFIC ALERT</span>
          <h4 class="font-semibold text-lg mt-2 line-clamp-2">${esc(s.text)}</h4>
          <div class="text-xs text-white/50 mt-3">by ${esc(author)} · ${timeAgo(s.createdAt)}</div>
        </div>
      </div>`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.  SAFE news article modal builder
//
//     BUG FIXED: article.title, article.summary, article.authorName, and
//     — most dangerously — article.content were all injected raw.
//
//     article.content is RICH TEXT.  We use stripHTML() to remove any
//     injected scripts/event-handlers while keeping line-breaks, then let
//     white-space:pre-wrap handle the display.
//
//     If you later add a real rich-text editor (Quill, TipTap, etc.), replace
//     stripHTML(article.content) with your editor's trusted sanitiser.
// ─────────────────────────────────────────────────────────────────────────────

window._buildNewsArticleHTML = function _buildNewsArticleHTML(article, canDelete) {
  const id         = safeAttr(String(article._id));
  const title      = esc(article.title || '');
  const summary    = esc(article.summary || '');
  const authorName = esc(article.authorName || 'Staff');
  // Rich content: strip tags but preserve line breaks via pre-wrap
  const content    = esc(stripHTML(article.content || ''));
  const initial    = esc((article.authorName || 'S')[0].toUpperCase());

  const imagesHTML = (article.images || []).length > 0
    ? `<div class="mt-6 grid grid-cols-2 gap-3">
        ${(article.images).map((src, i) => `
          <div onclick="openImageViewer('${id}', ${i})"
               class="rounded-2xl overflow-hidden cursor-pointer hover:opacity-90 transition aspect-video bg-white/5">
            <img src="${safeURL(src)}" alt="Photo ${i + 1}" class="w-full h-full object-cover" loading="lazy">
          </div>`).join('')}
       </div>`
    : '';

  return `
    <div onclick="if(event.target.id==='newsArticleModal')closeNewsArticle()" id="newsArticleModal"
         class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[12000] flex items-end md:items-center md:justify-center overflow-y-auto">
      <div onclick="event.stopImmediatePropagation()"
           class="bg-white text-slate-900 w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl">
        <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100 z-10">
          <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>
        <div class="h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
        <div class="p-6 pb-10">
          <div class="flex items-start gap-2 mb-4 flex-wrap">
            <span class="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">📰 News</span>
            <span class="text-xs text-gray-400 mt-0.5">${formatDateTime(article.createdAt)}</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-3">${title}</h1>
          <p class="text-emerald-600 font-medium text-sm mb-6 leading-relaxed">${summary}</p>
          <div class="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
            <div class="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              ${initial}
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-800">${authorName}</p>
              <p class="text-xs text-gray-400">${formatDate(article.createdAt)}</p>
            </div>
          </div>
          <div class="prose prose-slate max-w-none text-slate-700 leading-relaxed text-[15px]" style="white-space:pre-wrap;">${content}</div>
          ${imagesHTML}
          <div class="mt-8 space-y-3">
            ${canDelete ? `<button onclick="deleteNewsArticle('${id}')" class="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-3 rounded-3xl font-semibold transition">🗑️ Delete Article</button>` : ''}
            <button onclick="closeNewsArticle()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">Close</button>
          </div>
        </div>
      </div>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.  SAFE update-banner builder
//     BUG: newVersion was injected raw — if it comes from the server,
//     an attacker who controls the version endpoint could inject HTML.
// ─────────────────────────────────────────────────────────────────────────────

window.showUpdateBanner = function showUpdateBanner(newVersion) {
  if (document.getElementById('updateBanner')) return;

  const safeVersion = esc(String(newVersion || ''));

  const bannerHTML = `
    <div id="updateBanner"
         class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-3xl shadow-2xl p-5 flex items-center gap-4 z-[9999] max-w-md border border-white/20">
      <div class="flex-1">
        <p class="font-semibold text-lg">🚀 New Update Available</p>
        <p class="text-sm opacity-90">Version ${safeVersion} is ready</p>
      </div>
      <div class="flex gap-3">
        <button onclick="dismissUpdateBanner()"
                class="px-6 py-3 text-sm font-medium rounded-2xl bg-white/20 hover:bg-white/30 transition">
          Later
        </button>
        <button onclick="downloadUpdate()"
                class="px-7 py-3 text-sm font-semibold rounded-2xl bg-white text-emerald-700 hover:bg-white/90 transition shadow">
          Update Now
        </button>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', bannerHTML);
};

// ─────────────────────────────────────────────────────────────────────────────
// 8.  SAFE business spotlight renderer patch
//     BUG: b.name and b.category?.name were injected raw.
// ─────────────────────────────────────────────────────────────────────────────

window._renderSpotlightCard = function _renderSpotlightCard(b) {
  const id       = safeAttr(String(b._id));
  const name     = esc(b.name || '');
  const catName  = esc(b.category?.name || '');
  const catIcon  = b.category?.icon ? esc(b.category.icon) : '🏪';
  const logoSrc  = b.logo ? safeURL(b.logo) : null;

  return `
    <div onclick="showBusinessDetail('${id}')"
         class="snap-center flex-shrink-0 w-56 bg-white/10 hover:bg-white/15 border border-white/10 rounded-3xl p-4 cursor-pointer transition">
      <div class="flex items-center gap-3 mb-3">
        ${logoSrc
          ? `<img src="${logoSrc}" class="w-10 h-10 object-cover rounded-2xl flex-shrink-0" alt="">`
          : `<div class="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">${catIcon}</div>`}
        <div class="flex-1 min-w-0">
          <p class="font-semibold leading-tight text-white line-clamp-1">${name}</p>
          <p class="text-xs text-white/50">${catName}</p>
        </div>
      </div>
      <div class="flex items-center justify-between">
        ${typeof renderStars === 'function' ? renderStars(b.avgRating || 0, b.ratings ? b.ratings.length : 0) : ''}
        <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">Trending</span>
      </div>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 9.  DEV-MODE innerHTML guard
//     In development only, patches the innerHTML setter to log a warning
//     whenever it detects a suspicious pattern (script tags, javascript: URIs,
//     inline event handlers attached to fetches or evals).
//     This won't catch every case — it's a trip-wire, not a firewall.
// ─────────────────────────────────────────────────────────────────────────────

(function installDevGuard() {
  const isDev = ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname)
             || location.hostname.endsWith('.local');
  if (!isDev) return;

  const RISKY = /<script|javascript\s*:|onerror\s*=|onload\s*=|on\w+\s*=\s*["'][^"']*(?:fetch|eval|document\.write)/i;
  const orig  = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

  Object.defineProperty(Element.prototype, 'innerHTML', {
    set(value) {
      if (typeof value === 'string' && RISKY.test(value)) {
        console.warn(
          '%c[security.js] ⚠️  Suspicious innerHTML detected!',
          'background:#f00;color:#fff;font-weight:bold',
          '\nElement:', this,
          '\nSnippet:', value.substring(0, 300)
        );
      }
      orig.set.call(this, value);
    },
    get() { return orig.get.call(this); },
    configurable: true
  });

  console.info('%c[security.js] Dev-mode innerHTML guard active', 'color:#10b981;font-weight:bold');
})();

// ─────────────────────────────────────────────────────────────────────────────
// 10. BUSINESS EDIT MODAL — safe value injection
//     BUG: business.name, address, etc. were set as value="${raw}" which
//     allows attribute breakout: name = `" onfocus="evil()`.
//     Fix: always use .value = ... (DOM property) rather than HTML attributes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call this AFTER inserting the edit modal HTML.
 * The input values are set via DOM property assignment, which is always safe.
 *
 * Usage in openEditBusinessModal():
 *   document.body.insertAdjacentHTML('beforeend', skeletonHTML);
 *   window._fillEditModal(business);
 */
window._fillEditModal = function _fillEditModal(business) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';   // DOM property: never treated as HTML
  };
  setVal('editBizName',        business.name);
  setVal('editBizAddress',     business.address);
  setVal('editBizPhone',       business.phone);
  setVal('editBizEmail',       business.email);
  setVal('editBizDescription', business.description);
};

console.info('%c✅ security.js loaded', 'color:#10b981;font-weight:bold');