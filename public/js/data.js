let currentPage = 'home';
let allBusinesses = [];
let currentEditingBusiness = null;
let currentMessageReceiver = null; // for compose modal
let allMarketplaceItems = [];
let lastBroadcastTime = 0;

// ─── App-wide constants ───────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeBroadcast(raw) {
  if (!raw) return '';
  let safe = esc(raw);
  safe = safe.replace(
    /&lt;a\s+href=&quot;(https?:\/\/[^&"<>]+)&quot;&gt;([^&<>]+)&lt;\/a&gt;/gi,
    (_, url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#34d399;text-decoration:underline">${esc(label)}</a>`
  );
  return safe;
}

/** Returns true if the currently logged-in user is a site admin. */
function isAdmin() {
  return !!(currentUser && currentUser.isAdmin === true);
}

// ─── Star Rating Helper ────────────────────────────────────────────────────────
function renderStars(avg, count, interactive = false, businessId = '') {
  const full = Math.round(avg);
  if (interactive) {
    let html = `<div class="flex items-center gap-1" id="stars-${businessId}">`;
    for (let i = 1; i <= 5; i++) {
      html += `<button onclick="submitRating('${businessId}', ${i})" 
                       class="text-2xl transition hover:scale-125 star-btn" 
                       data-val="${i}"
                       style="color: ${i <= full ? '#f59e0b' : '#d1d5db'}">★</button>`;
    }
    html += `</div><p class="text-xs text-gray-400 mt-1">${count} rating${count !== 1 ? 's' : ''} · avg ${avg || '—'}</p>`;
    return html;
  } else {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += `<span style="color:${i <= full ? '#f59e0b' : '#d1d5db'}">★</span>`;
    }
    return `<span class="text-base leading-none">${stars}</span><span class="text-xs text-white/50 ml-1">${count > 0 ? avg : '—'}</span>`;
  }
}

window.submitRating = async function (businessId, score) {
  if (!requireAuth('sign in to rate businesses.')) return;
  const res = await apiPost(`/business/${businessId}/rate`, { score });
  if (res.avg !== undefined) {
    const starsEl = document.getElementById(`stars-${businessId}`);
    if (starsEl) {
      starsEl.querySelectorAll('.star-btn').forEach(btn => {
        btn.style.color = parseInt(btn.dataset.val) <= score ? '#f59e0b' : '#d1d5db';
      });
      const countEl = starsEl.nextElementSibling;
      if (countEl) countEl.textContent = `${res.count} rating${res.count !== 1 ? 's' : ''} · avg ${res.avg}`;
    }
    const cardStars = document.getElementById(`card-stars-${businessId}`);
    if (cardStars) {
      cardStars.innerHTML = renderStars(res.avg, res.count);
    }
  }
};

// ─── Guest auth nudge banner ──────────────────────────────────────────────────
function guestBanner(action) {
  return `
    <div class="bg-emerald-900/40 border border-emerald-500/30 rounded-3xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="text-3xl">👋</span>
        <div>
          <p class="font-semibold text-white text-sm">Join Milledgeville Connect</p>
          <p class="text-emerald-300 text-xs mt-0.5">Create a free account to ${action}</p>
        </div>
      </div>
      <div class="flex gap-2 flex-shrink-0">
        <button onclick="showAuthModal({register:true})"
                class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl text-sm font-semibold transition">
          Register Free
        </button>
        <button onclick="showAuthModal()"
                class="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-2xl text-sm font-semibold transition">
          Sign In
        </button>
      </div>
    </div>`;
}

// ─── Time helper ──────────────────────────────────────────────────────────────
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

// ─── SAFE Clickable User Helper (Clean Rep Badge) ─────────────────────────────
function renderClickableUser(userData, fallbackName = 'Anonymous') {
  if (!userData) return fallbackName;

  let userId = null;
  let displayName = fallbackName;
  let reputation = 0;

  if (typeof userData === 'object' && userData !== null) {
    userId = userData._id || userData.id;
    displayName = userData.name || userData.authorName || userData.author || fallbackName;
    reputation = userData.reputation || 0;
  } else if (typeof userData === 'string' && userData.length > 10) {
    userId = userData;
  }

  if (!userId) return displayName;

  const repHTML = reputation >= 10 
    ? `<span class="ml-1.5 inline-flex items-center gap-0.5 bg-gradient-to-r from-amber-400 to-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">⭐${reputation}</span>`
    : '';

  return `<span onclick="event.stopImmediatePropagation(); showUserProfileModal('${userId}')" 
                class="cursor-pointer hover:underline text-emerald-400 inline-flex items-center">
            ${displayName}${repHTML}
          </span>`;
}

// ─── In-App Update Banner ───────────────────────────────────────────────────
function showUpdateBanner(newVersion) {
  if (document.getElementById('updateBanner')) return;

  const bannerHTML = `
    <div id="updateBanner" class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-3xl shadow-2xl p-5 flex items-center gap-4 z-[9999] max-w-md border border-white/20">
      <div class="flex-1">
        <p class="font-semibold text-lg">🚀 New Update Available</p>
        <p class="text-sm opacity-90">Version ${newVersion} is ready</p>
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
}

window.dismissUpdateBanner = function() {
  const banner = document.getElementById('updateBanner');
  if (banner) banner.remove();
};

window.downloadUpdate = function() {
  apiPost('/analytics/update-clicked', { version: CURRENT_APP_VERSION }).catch(() => {});
  window.open(LATEST_APK_URL, '_blank');
  dismissUpdateBanner();
  showToast("✅ Opening download page...", "success");
};

async function checkForAppUpdate() {
  try {
    const latestVersion = "1.2.5";   // ← Change this when you release a new version

    if (latestVersion !== CURRENT_APP_VERSION) {
      setTimeout(() => {
        showUpdateBanner(latestVersion);
      }, 1500);
    }
  } catch (e) {
    // Update check failed silently — not critical
  }
}

// In-memory unread count so we can zero it instantly without a round-trip
let _unreadCount = 0;

function _setBadge(count) {
  _unreadCount = Math.max(0, count);
  // There can be two #messageBadge elements (desktop + mobile); update both
  document.querySelectorAll('#messageBadge').forEach(badge => {
    if (_unreadCount > 0) {
      badge.textContent = _unreadCount > 99 ? '99+' : _unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

async function updateMessageBadge() {
  if (typeof currentUser === 'undefined' || !currentUser?._id) return;
  try {
    const inbox = await apiGet('/messages/inbox');
    const unreadCount = inbox.filter(m =>
      !m.read && String(m.receiver?._id || m.receiver) === String(currentUser._id)
    ).length;
    _setBadge(unreadCount);
  } catch (e) {
    console.error('❌ [Badge] API error:', e);
  }
}

async function markConversationAsRead(otherId) {
  if (!currentUser || !currentUser._id || !otherId) return;

  // ── Instant optimistic update ──────────────────────────────────────────────
  // Decrement the in-memory counter for this conversation immediately so the
  // badge disappears without waiting for a server round-trip.
  // We'll correct the count with a real fetch after the server call.
  _setBadge(0); // safest: zero it instantly; server confirms shortly after

  try {
    await apiPost('/messages/mark-as-read', { otherId });
  } catch (e) {
    console.warn('⚠️ Backend mark-as-read failed (endpoint missing?) — using optimistic update');
  }

  // Badge already zeroed — messages are now marked read on the server
}

// markMessagesAsRead is defined below (near the messages system) to avoid duplication

// ─── Page Router ──────────────────────────────────────────────────────────────
async function loadPage(page) {
  currentPage = page;
  const content = document.getElementById('content');

  // ── Close any open profile toolbox / modals before navigating ─────────────
  const profileModal = document.getElementById('userProfileModal');
  if (profileModal) profileModal.remove();

  // Also close any other floating modals (safe cleanup)
  // Exclude permanent modals that live in the HTML and must never be removed
  const PERMANENT_MODALS = new Set(['authModal', 'profileSheet', 'userProfileModal']);
  document.querySelectorAll('[id$="Modal"], [id$="modal"], .modal').forEach(el => {
    if (el.id !== 'content' && !PERMANENT_MODALS.has(el.id)) el.remove();
  });

  // Show spinner immediately so navigation feels instant (no frozen UI)
  content.innerHTML = `
    <div class="flex items-center justify-center min-h-[40vh]">
      <div class="flex flex-col items-center gap-4 text-white/40">
        <div class="w-10 h-10 border-4 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
        <p class="text-sm font-medium">Loading…</p>
      </div>
    </div>`;

  if (page === 'messages')        { await loadMessagesPage(content); return; }
  if (page === 'admin')           { await loadAdminPage(content);        return; }
  if (page === 'owner-dashboard') { await loadOwnerDashboard(content);   return; }
  if (page === 'home')            { await loadHomePage(content);          return; }
  if (page === 'directory')       { await loadDirectoryPage(content);     return; }
  if (page === 'shoutouts')       { await loadShoutoutsPage(content);     return; }
  if (page === 'lostfound')       { await loadLostFoundPage(content);     return; }   // ← NEW
  if (page === 'marketplace')     { await loadMarketplacePage(content);   return; }   // ← NEW
  if (page === 'events')          { await loadEventsPage(content);           return; }
  if (page === 'deals')           { await loadDealsPage(content);            return; }
  if (page === 'post-news')       { await loadPostNewsPage(content);      return; }
  if (page === 'resources')       { await loadResourcesPage(content);     return; }
}

// ─── GLOBAL SEARCH ────────────────────────────────────────────────────────────
let searchTimeout = null;

window.initGlobalSearch = function () {
  const input = document.getElementById('globalSearchInput');
  const resultsContainer = document.getElementById('globalSearchResults');

  if (!input || !resultsContainer) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);

    const q = input.value.trim();
    if (q.length < 2) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.add('hidden');
      return;
    }

    searchTimeout = setTimeout(async () => {
      const res = await apiGet(`/search?q=${encodeURIComponent(q)}`);
      if (!res.results || res.results.length === 0) {
        resultsContainer.innerHTML = `<div class="p-4 text-white/60 text-sm">No results found for "${q}"</div>`;
        resultsContainer.classList.remove('hidden');
        return;
      }

      let html = '';
      res.results.forEach(item => {
        html += `
          <div onclick="handleSearchResultClick('${item.type}', '${item.id}')" 
               class="flex items-center gap-3 px-4 py-3 hover:bg-white/10 cursor-pointer border-b border-white/10 last:border-none">
            <span class="text-2xl">${item.icon}</span>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-white text-sm leading-tight">${item.title}</p>
              <p class="text-white/60 text-xs line-clamp-1">${item.subtitle}</p>
            </div>
          </div>`;
      });

      resultsContainer.innerHTML = html;
      resultsContainer.classList.remove('hidden');
    }, 300);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.classList.add('hidden');
    }
  });
};

window.handleSearchResultClick = function (type, id) {
  const resultsContainer = document.getElementById('globalSearchResults');
  resultsContainer.classList.add('hidden');
  document.getElementById('globalSearchInput').value = '';

  if (type === 'business') loadDirectoryAndOpen(id);
  else if (type === 'event') navigate('events');
  else if (type === 'deal') navigate('deals');
  else if (type === 'news') openNewsArticle(id);
  else if (type === 'shoutout') navigate('shoutouts');
};

document.addEventListener('DOMContentLoaded', () => {
  initGlobalSearch();
});

// ─── WMO weather code → icon/label ───────────────────────────────────────────
function wmoCond(code) {
  if (code === 0) return { icon: '☀️', label: 'Sunny' };
  if ([1, 2].includes(code)) return { icon: '⛅', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Overcast' };
  if ([45, 48].includes(code)) return { icon: '🌫️', label: 'Foggy' };
  if ([51, 53, 55, 61, 63].includes(code)) return { icon: '🌧️', label: 'Rainy' };
  if ([65, 80, 81, 82].includes(code)) return { icon: '⛈️', label: 'Showers' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '❄️', label: 'Snow' };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '🌤️', label: 'Mixed' };
}

// ─── HOME PAGE — WITH BUSINESS SPOTLIGHT + FILTERS + TODAY DIGEST ─────
async function loadHomePage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-8">

      <!-- Today in Milledgeville (Compact) -->
      <div class="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 rounded-3xl p-5 md:p-6 mb-8 text-white overflow-hidden relative">
        <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle at 80% 20%, white 1px, transparent 1px);background-size:24px 24px;"></div>
        
        <div class="relative grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          
          <!-- Left: Title + Date + Podcast -->
          <div class="flex items-start gap-3 min-w-0">
            <span class="text-3xl flex-shrink-0 mt-0.5">🌅</span>
            <div class="min-w-0 flex-1">
              <h1 class="text-[22px] font-bold leading-tight">Today in Milledgeville</h1>
              
              <div class="flex flex-wrap items-center gap-2 mt-1.5">
                <p class="text-emerald-100 text-xs">${new Date().toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'})}</p>
                
                <span onclick="showToast('🎙️ Milledgeville Connect Podcast — coming soon!')" 
                      class="inline-flex items-center gap-1.5 bg-[#1DB954] hover:bg-[#1ed760] active:bg-[#169c46] text-black font-black px-3.5 py-1 rounded-2xl text-xs shadow-lg cursor-pointer transition-all active:scale-95">
                  <span>🎙️</span>
                  <span class="font-extrabold">LISTEN</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Right: Weather -->
          <div id="weatherWidget" class="flex-shrink-0 bg-white/15 backdrop-blur rounded-2xl px-4 py-3 text-right self-start md:self-auto">
            <div class="flex items-center justify-between md:justify-end gap-3">
              <div>
                <div class="text-3xl leading-none mb-0.5" id="weatherIcon">—</div>
                <div class="text-2xl font-black leading-none" id="weatherTemp">—</div>
              </div>
              <div>
                <div class="text-[11px] text-emerald-100" id="weatherDesc">Loading…</div>
                <div class="flex justify-end gap-1 mt-1" id="weatherForecast"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Compact Digest -->
        <div id="todayDigest" class="relative grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
      </div>

      <!-- Business Spotlight -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">⭐</span>
            <h2 class="text-lg font-bold">Business Spotlight</h2>
          </div>
          <button onclick="navigate('directory')" class="text-xs text-emerald-400 font-semibold flex items-center gap-1">See all directory →</button>
        </div>
        <div id="spotlightScroll" class="flex gap-4 overflow-x-auto pb-4 hide-scrollbar snap-x snap-mandatory">
          <!-- Populated by JS below -->
        </div>
      </div>

      <!-- Hot Right Now -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">🔥</span>
            <h2 class="text-lg font-bold">Hot Right Now</h2>
          </div>
        </div>

        <!-- Filter buttons -->
        <div class="flex gap-2 mb-4 overflow-x-auto pb-2 hide-scrollbar">
          <button onclick="setHotFilter('all')" id="hotFilter-all" class="flex-shrink-0 px-5 py-2 rounded-3xl text-sm font-semibold bg-emerald-600 text-white">All</button>
          <button onclick="setHotFilter('news')" id="hotFilter-news" class="flex-shrink-0 px-5 py-2 rounded-3xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white/80">📰 News</button>
          <button onclick="setHotFilter('event')" id="hotFilter-event" class="flex-shrink-0 px-5 py-2 rounded-3xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white/80">📅 Events</button>
          <button onclick="setHotFilter('deal')" id="hotFilter-deal" class="flex-shrink-0 px-5 py-2 rounded-3xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white/80">🔥 Deals</button>
          <button onclick="setHotFilter('shoutout')" id="hotFilter-shoutout" class="flex-shrink-0 px-5 py-2 rounded-3xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white/80">🚦 Traffic Alert!</button>
        </div>

        <div id="hotFeed" class="space-y-3"></div>
        <div id="hotLoadMoreWrapper" class="mt-4 hidden">
          <button id="hotLoadMoreBtn" onclick="loadMoreHotItems()" class="w-full bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white py-3 rounded-3xl text-sm font-semibold transition">Load More</button>
        </div>
      </div>

      <!-- Community Stats Bar -->
      <div id="communityStatsBar" class="mb-8"></div>

      <!-- Quick actions -->
      <div class="grid grid-cols-2 gap-3 mb-8">
      <button onclick="navigate('shoutouts')" class="bg-white/10 hover:bg-white/20 rounded-3xl p-6 text-left">
      <span class="text-3xl">🚦</span>
      <p class="font-semibold mt-3">Post Traffic Alert</p>
      </button>
        <button onclick="navigate('events')" class="bg-white/10 hover:bg-white/20 rounded-3xl p-6 text-left">
          <span class="text-3xl">📅</span>
          <p class="font-semibold mt-3">See Events</p>
        </button>
      </div>
    </div>`;

  // Weather widget (bulletproof version)
  (async () => {
    try {
      const wRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=33.0801&longitude=-83.2321&current=temperature_2m,weathercode&daily=temperature_2m_max,weathercode,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=4');
      
      if (!wRes.ok) throw new Error('Weather API error');
      
      const wData = await wRes.json();
      const curr = wData.current;
      const daily = wData.daily || {};

      // Current weather
      const cond = wmoCond(curr.weathercode);
      const temp = Math.round(curr.temperature_2m);

      document.getElementById('weatherIcon').textContent = cond.icon;
      document.getElementById('weatherTemp').textContent = temp + '°F';
      document.getElementById('weatherDesc').textContent = cond.label;

      // Forecast (fixed field names)
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      let forecastHTML = '';

      const forecastDates = daily.time || daily.date || [];
      const forecastTemps = daily.temperature_2m_max || [];
      const forecastCodes = daily.weathercode || [];

      if (forecastDates.length > 1 && forecastTemps.length > 1 && forecastCodes.length > 1) {
        forecastHTML = forecastDates.slice(1, 4).map((d, i) => {
          const fc = wmoCond(forecastCodes[i + 1] || 0);
          const high = Math.round(forecastTemps[i + 1] || 0);
          const dow = days[new Date(d + 'T12:00:00').getDay()];
          return `<div class="bg-white/15 rounded-xl px-1.5 py-1 text-center" style="min-width:36px;">
            <div class="text-[9px] text-emerald-100 font-semibold">${dow}</div>
            <div class="text-sm leading-none my-0.5">${fc.icon}</div>
            <div class="text-[10px] font-bold">${high}°</div>
          </div>`;
        }).join('');
      }

      document.getElementById('weatherForecast').innerHTML = forecastHTML || '<div class="text-[9px] text-emerald-100">No forecast</div>';

    } catch (err) {
      console.warn('Weather error:', err);
      const desc = document.getElementById('weatherDesc');
      if (desc) desc.textContent = 'Weather unavailable';
    }
  })();

// AFTER — fire directory fetch in background; don't block home feed on it
function _renderSpotlight(businesses) {
  const spotEl = document.getElementById('spotlightScroll');
  if (!spotEl) return;
  // Prefer rated businesses; fall back to all businesses if none have ratings
  let sb = [...businesses]
    .filter(b => b.avgRating && b.avgRating > 0)
    .sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))
    .slice(0, 8);
  if (!sb.length) {
    sb = [...businesses].slice(0, 8);
  }
  spotEl.innerHTML = sb.length
    ? sb.map(b => `
      <div onclick="showBusinessDetail('${b._id}')"
           class="snap-center flex-shrink-0 w-56 bg-white/10 hover:bg-white/15 border border-white/10 rounded-3xl p-4 cursor-pointer transition">
        <div class="flex items-center gap-3 mb-3">
          ${b.logo
            ? `<img src="${b.logo}" class="w-10 h-10 object-cover rounded-2xl flex-shrink-0" alt="">`
            : `<div class="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">${b.category?.icon || '🏪'}</div>`}
          <div class="flex-1 min-w-0">
            <p class="font-semibold leading-tight text-white line-clamp-1">${b.name}</p>
            <p class="text-xs text-white/50">${b.category?.name || ''}</p>
          </div>
        </div>
        <div class="flex items-center justify-between">
          ${renderStars(b.avgRating || 0, b.ratings ? b.ratings.length : 0)}
          <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">Trending</span>
        </div>
      </div>`).join('')
    : `<p class="text-white/40 text-center py-8">No trending businesses yet</p>`;
}

if (allBusinesses.length === 0) {
  apiGet('/directory').then(d => {
    if (d && d.businesses) {
      // PRE-COMPUTE open status once (this fixes the hang)
      allBusinesses = d.businesses.map(b => {
        if (b.hours && b._openStatus === undefined) {
          b._openStatus = getOpenStatus(b.hours);
        }
        return b;
      });
      _renderSpotlight(allBusinesses);
    }
  }).catch(() => {
    _renderSpotlight([]);
  });
} else {
  _renderSpotlight(allBusinesses);
}

const [eventsRes, dealsRes, newsData, shoutoutsRes] = await Promise.all([
  apiGet('/events').catch(() => ({ events: [] })),
  apiGet('/deals').catch(() => ({ deals: [] })),
  apiGet('/news').catch(() => []),
  apiGet('/shoutouts').catch(() => ({ shoutouts: [] }))
]);

const eventsData = eventsRes.events || [];
const dealsData  = dealsRes.deals || [];
const shoutoutsData = shoutoutsRes.shoutouts || [];

  // Digest
  const digestHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-white/15 rounded-2xl p-3">
        <div class="text-[10px] uppercase tracking-widest text-emerald-200 font-bold mb-1">📅 Upcoming</div>
        <p class="font-semibold text-sm leading-snug">${eventsData[0] ? eventsData[0].title : 'No upcoming events'}</p>
      </div>
      <div class="bg-white/15 rounded-2xl p-3">
        <div class="text-[10px] uppercase tracking-widest text-amber-200 font-bold mb-1">🔥 Hot Deal</div>
        <p class="font-semibold text-sm leading-snug">${dealsData[0] ? dealsData[0].title : 'No active deals'}</p>
      </div>
    </div>`;
  document.getElementById('todayDigest').innerHTML = digestHTML;

  // Spotlight — rendered by _renderSpotlight() called above after directory data loads

  // ── FIXED Hot Right Now Feed (News + Shoutouts + Events + Deals) ─────────────
  const now = new Date();

  const newsItems = (newsData || []).map(n => ({
    type: 'news',
    sortDate: new Date(n.createdAt),
    data: n
  })).sort((a, b) => b.sortDate - a.sortDate);

  const eventItems = (eventsData || [])
    .filter(e => new Date(e.date) >= now)
    .map(e => ({
      type: 'event',
      sortDate: new Date(e.date),
      data: e
    }))
    .sort((a, b) => a.sortDate - b.sortDate);

  const dealItems = (dealsData || []).map(d => ({
    type: 'deal',
    sortDate: new Date(d.createdAt),
    data: d
  })).sort((a, b) => b.sortDate - a.sortDate);

  const shoutoutItems = (shoutoutsData || []).map(s => ({
    type: 'shoutout',
    sortDate: new Date(s.createdAt),
    data: s
  })).sort((a, b) => b.sortDate - a.sortDate);

  const allHotItems = [
    ...eventItems.slice(0, 3),
    ...newsItems,
    ...dealItems,
    ...shoutoutItems
  ].sort((a, b) => {
    if (a.type === 'event' && b.type !== 'event') return -1;
    if (b.type === 'event' && a.type !== 'event') return 1;
    return b.sortDate - a.sortDate;
  });

  window._hotItems = allHotItems;
  window._hotFilter = 'all';
  window._hotPage = 0;
  const HOT_PAGE_SIZE = 6;

  window.renderHotFeed = function (filter = 'all') {
    const container = document.getElementById('hotFeed');
    if (!container) return;

    let filtered = window._hotItems;
    if (filter !== 'all') {
      filtered = window._hotItems.filter(item => item.type === filter);
    }

    // Accumulate all pages from 0 through current page
    const visibleCount = (window._hotPage + 1) * HOT_PAGE_SIZE;
    const visibleItems = filtered.slice(0, visibleCount);

    let html = '';
    visibleItems.forEach(item => {
      if (item.type === 'news') {
        const n = item.data;
        html += `
          <div onclick="openNewsArticle('${n._id}')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
            <div class="flex-1">
              <span class="text-xs bg-blue-500 px-3 py-1 rounded-full">📰 NEWS</span>
              <h4 class="font-semibold text-lg mt-2">${n.title}</h4>
              <p class="text-white/70 line-clamp-2">${n.summary || ''}</p>
              <div class="text-xs text-white/50 mt-3">${timeAgo(n.createdAt)}</div>
            </div>
          </div>`;
      } else if (item.type === 'event') {
        const e = item.data;
        html += `
          <div onclick="navigate('events')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
            <div class="flex-1">
              <span class="text-xs bg-amber-500 px-3 py-1 rounded-full">📅 EVENT</span>
              <h4 class="font-semibold text-lg mt-2">${e.title}</h4>
              <p class="text-white/70">${e.description || ''}</p>
              <div class="text-xs text-white/50 mt-3">${formatDate(e.date)}</div>
            </div>
          </div>`;
      } else if (item.type === 'deal') {
        const d = item.data;
        html += `
          <div onclick="navigate('deals')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
            <div class="flex-1">
              <span class="text-xs bg-red-500 px-3 py-1 rounded-full">🔥 DEAL</span>
              <h4 class="font-semibold text-lg mt-2">${d.title}</h4>
              <p class="text-white/70">${d.description || ''}</p>
              <div class="text-xs text-white/50 mt-3">${timeAgo(d.createdAt)}</div>
            </div>
          </div>`;
} else if (item.type === 'shoutout') {
  const s = item.data;
  html += `
    <div onclick="navigate('shoutouts')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
      <div class="flex-1">
        <span class="text-xs bg-orange-500 px-3 py-1 rounded-full">🚦 TRAFFIC ALERT</span>
        <h4 class="font-semibold text-lg mt-2 line-clamp-2">${s.text}</h4>
        <div class="text-xs text-white/50 mt-3">by ${s.author || s.authorName || 'Community'} · ${timeAgo(s.createdAt)}</div>
      </div>
    </div>`;
}
    });

    container.innerHTML = html || `<p class="text-white/40 text-center py-12">No activity yet — be the first to post!</p>`;

    const hasMore = filtered.length > visibleCount;
    document.getElementById('hotLoadMoreWrapper').classList.toggle('hidden', !hasMore);
  };

  window.setHotFilter = function (filter) {
    window._hotFilter = filter;
    window._hotPage = 0;
    document.querySelectorAll('[id^="hotFilter-"]').forEach(btn => {
      if (btn.id === `hotFilter-${filter}`) {
        btn.classList.add('bg-emerald-600', 'text-white');
        btn.classList.remove('bg-white/10', 'text-white/80');
      } else {
        btn.classList.remove('bg-emerald-600', 'text-white');
        btn.classList.add('bg-white/10', 'text-white/80');
      }
    });
    window.renderHotFeed(filter);
  };

  window.loadMoreHotItems = function () {
    window._hotPage++;
    window.renderHotFeed(window._hotFilter);
  };

  // Render the feed
  window.renderHotFeed('all');

  // Community Stats Bar
  const activeDealsCount = (dealsData || []).length;
  const upcomingEvCount = (eventsData || []).filter(e => new Date(e.date) >= now).length;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shoutoutsTodayCount = (shoutoutsData || []).filter(s => new Date(s.createdAt) >= todayStart).length;

  // allBusinesses was already populated above from the parallel fetch — no second call needed
  const bizCount = allBusinesses.length;

  const statsBar = document.getElementById('communityStatsBar');
  if (statsBar) {
    statsBar.innerHTML = `
      <div class="bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5">
        <p class="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4 text-center">Community at a Glance</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div onclick="navigate('directory')" class="cursor-pointer group flex flex-col items-center bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl p-4 transition text-center">
            <span class="text-2xl mb-1">📍</span>
            <span class="text-xl font-black text-white group-hover:text-emerald-300 transition">${bizCount}</span>
            <span class="text-[11px] text-white/50 mt-0.5 leading-tight">Businesses<br>in Directory</span>
          </div>
          <div onclick="navigate('deals')" class="cursor-pointer group flex flex-col items-center bg-white/5 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 rounded-2xl p-4 transition text-center">
            <span class="text-2xl mb-1">🔥</span>
            <span class="text-xl font-black text-white group-hover:text-amber-300 transition">${activeDealsCount}</span>
            <span class="text-[11px] text-white/50 mt-0.5 leading-tight">Active<br>Deals</span>
          </div>
          <div onclick="navigate('events')" class="cursor-pointer group flex flex-col items-center bg-white/5 hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 rounded-2xl p-4 transition text-center">
            <span class="text-2xl mb-1">📅</span>
            <span class="text-xl font-black text-white group-hover:text-blue-300 transition">${upcomingEvCount}</span>
            <span class="text-[11px] text-white/50 mt-0.5 leading-tight">Upcoming<br>Events</span>
          </div>
          <div onclick="navigate('shoutouts')" class="cursor-pointer group flex flex-col items-center bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 rounded-2xl p-4 transition text-center">
            <span class="text-2xl mb-1">🚦</span>
            <span class="text-xl font-black text-white group-hover:text-red-300 transition">${shoutoutsTodayCount}</span>
            <span class="text-[11px] text-white/50 mt-0.5 leading-tight">Traffic Alerts<br>Today</span>
          </div>
        </div>
      </div>`;
  }
}
// ─── NEWS ARTICLE VIEWER ──────────────────────────────────────────────────────
window.openNewsArticle = async function (articleId) {
  const article = await apiGet(`/news/${articleId}`);
  if (!article || article.message) { showToast('Could not load article', 'error'); return; }

  const isAdmin    = isAdmin();
  const isAuthor   = currentUser && article.author && (article.author === currentUser._id || article.author === currentUser.id);
  const canDelete  = isAdmin || isAuthor;

  const imagesHTML = (article.images || []).length > 0
    ? `<div class="mt-6 grid grid-cols-2 gap-3">
        ${article.images.map((src, i) => `
          <div onclick="openImageViewer('${articleId}', ${i})"
               class="rounded-2xl overflow-hidden cursor-pointer hover:opacity-90 transition aspect-video bg-white/5">
            <img src="${src}" alt="Photo ${i+1}" class="w-full h-full object-cover" loading="lazy">
          </div>`).join('')}
       </div>`
    : '';

  const modalHTML = `
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
          <h1 class="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-3">${article.title}</h1>
          <p class="text-emerald-600 font-medium text-sm mb-6 leading-relaxed">${article.summary}</p>
          <div class="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
            <div class="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              ${(article.authorName || 'S')[0].toUpperCase()}
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-800">${article.authorName || 'Staff'}</p>
              <p class="text-xs text-gray-400">${formatDate(article.createdAt)}</p>
            </div>
          </div>
          <div class="prose prose-slate max-w-none text-slate-700 leading-relaxed text-[15px]" style="white-space:pre-wrap;">${article.content}</div>
          ${imagesHTML}
          <div class="mt-8 space-y-3">
            ${canDelete ? `<button onclick="deleteNewsArticle('${article._id}')" class="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-3 rounded-3xl font-semibold transition">🗑️ Delete Article</button>` : ''}
            <button onclick="closeNewsArticle()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">Close</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  window._newsArticleImages = article.images || [];
};

window.closeNewsArticle = function () {
  const el = document.getElementById('newsArticleModal');
  if (el) el.remove();
};

window.deleteNewsArticle = async function (id) {
  if (!confirm('Delete this article permanently?')) return;
  const res = await apiDelete(`/news/${id}`);
  if (res.message) {
    showToast('Article deleted');
    closeNewsArticle();
    loadPage(currentPage);
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// ─── IMAGE LIGHTBOX ───────────────────────────────────────────────────────────
window.openImageViewer = function (articleId, startIndex) {
  const images = window._newsArticleImages || [];
  if (!images.length) return;
  let current = startIndex;

  function render() {
    const existing = document.getElementById('imgLightbox');
    if (existing) existing.remove();

    const html = `
      <div id="imgLightbox" class="fixed inset-0 bg-black/95 z-[14000] flex items-center justify-center">
        <button onclick="document.getElementById('imgLightbox').remove()"
                class="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl font-bold transition z-10">✕</button>
        ${images.length > 1 ? `
          <button onclick="imgLightboxPrev()" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition z-10">‹</button>
          <button onclick="imgLightboxNext()" class="absolute right-16 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition z-10">›</button>` : ''}
        <div class="max-w-full max-h-full flex flex-col items-center px-16">
          <img src="${images[current]}" alt="Photo ${current+1}" class="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl">
          ${images.length > 1 ? `<p class="text-white/50 text-sm mt-3">${current+1} / ${images.length}</p>` : ''}
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  window.imgLightboxPrev = function () { current = (current - 1 + images.length) % images.length; render(); };
  window.imgLightboxNext = function () { current = (current + 1) % images.length; render(); };

  render();
};

// ─── POST NEWS PAGE ───────────────────────────────────────────────────────────
async function loadPostNewsPage(content) {
  const isAdmin   = isAdmin();
  const canPost   = currentUser && (currentUser.canPostNews || isAdmin);
  if (!canPost) {
    content.innerHTML = `<div class="max-w-2xl mx-auto px-4 py-12 text-center">
      <p class="text-4xl mb-4">🚫</p>
      <p class="text-white/60">You don't have permission to post news.</p>
    </div>`;
    return;
  }

  const existingNews = await apiGet('/news');

  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-10">
      <h2 class="text-3xl font-bold mb-6">📰 Post News</h2>

      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-8">
        <h3 class="font-semibold text-lg mb-5">Write a News Article</h3>
        <input id="newsTitle" type="text" placeholder="Headline / Title *"
               class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">
        <input id="newsSummary" type="text" placeholder="Short summary (shown on home page) *"
               class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">
        <textarea id="newsContent" rows="8" placeholder="Full article content *"
                  class="w-full mb-4 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400 resize-none"></textarea>

        <div class="mb-5">
          <p class="text-sm font-semibold text-white/70 mb-2">Photos (optional — click to add, drag to reorder)</p>
          <div id="newsImagePreviews" class="grid grid-cols-3 gap-2 mb-3"></div>
          <button onclick="document.getElementById('newsImageInput').click()"
                  class="w-full border-2 border-dashed border-white/20 hover:border-emerald-400 rounded-2xl py-4 text-white/50 hover:text-white transition text-sm font-medium">
            📷 Add Photos
          </button>
          <input id="newsImageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden"
                 onchange="handleNewsImages(this)">
        </div>

        <button onclick="submitNewsArticle()"
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-3xl font-semibold text-lg transition">
          📤 Publish Article
        </button>
      </div>

      <div>
        <h3 class="font-semibold text-lg mb-4">Published Articles</h3>
        <div id="myNewsList">
          ${!existingNews.length ? '<p class="text-white/50 text-center py-6">No articles yet.</p>' : ''}
        </div>
      </div>
    </div>`;

  if (existingNews.length) {
    const listEl = document.getElementById('myNewsList');
    listEl.innerHTML = existingNews.map(a => `
      <div class="bg-white/10 border border-white/10 rounded-3xl p-5 mb-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-bold leading-tight">${a.title}</p>
            <p class="text-xs text-white/50 mt-1">${formatDateTime(a.createdAt)} · By ${a.authorName || 'Staff'}</p>
            <p class="text-sm text-white/60 mt-2 line-clamp-2">${a.summary}</p>
            ${a.images && a.images.length > 0 ? `<p class="text-xs text-emerald-400 mt-1">📷 ${a.images.length} photo${a.images.length !== 1 ? 's' : ''}</p>` : ''}
          </div>
          <div class="flex flex-col gap-2 flex-shrink-0">
            <button onclick="openNewsArticle('${a._id}')" class="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-full transition">View</button>
            <button onclick="deleteNewsArticle('${a._id}')" class="text-xs bg-red-500/20 hover:bg-red-500/40 text-red-400 px-3 py-1.5 rounded-full transition">Delete</button>
          </div>
        </div>
      </div>`).join('');
  }

  window._pendingNewsImages = [];
}

window.handleNewsImages = function (input) {
  const files = Array.from(input.files);
  if (!window._pendingNewsImages) window._pendingNewsImages = [];

  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} is too large (max 5MB)`, 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      window._pendingNewsImages.push(e.target.result);
      renderNewsImagePreviews();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
};

function renderNewsImagePreviews() {
  const container = document.getElementById('newsImagePreviews');
  if (!container) return;
  container.innerHTML = (window._pendingNewsImages || []).map((src, i) => `
    <div class="relative aspect-video bg-white/10 rounded-2xl overflow-hidden group">
      <img src="${src}" class="w-full h-full object-cover" alt="Preview ${i+1}">
      <button onclick="removeNewsImage(${i})"
              class="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs transition opacity-0 group-hover:opacity-100">✕</button>
    </div>`).join('');
}

window.removeNewsImage = function (index) {
  if (window._pendingNewsImages) {
    window._pendingNewsImages.splice(index, 1);
    renderNewsImagePreviews();
  }
};

window.submitNewsArticle = async function () {
  const title   = document.getElementById('newsTitle')?.value.trim();
  const summary = document.getElementById('newsSummary')?.value.trim();
  const content = document.getElementById('newsContent')?.value.trim();
  if (!title || !summary || !content) { showToast('Title, summary, and content are required', 'error'); return; }

  const res = await apiPost('/news', {
    title,
    summary,
    content,
    images: window._pendingNewsImages || []
  });

  if (res._id) {
    window._pendingNewsImages = [];
    showToast('✅ Article published!');
    loadPage('post-news');
  } else {
    showToast(res.message || 'Error publishing article', 'error');
  }
};

window.loadDirectoryAndOpen = async function (businessId) {
  await loadDirectoryPage(document.getElementById('content'));
  showBusinessDetail(businessId);
};

async function loadDirectoryPage(content) {
  // Paint the shell instantly — user sees the page right away
  content.innerHTML = `
    <h2 class="text-3xl md:text-4xl font-bold mb-5">Local Directory</h2>
    ${!currentUser ? guestBanner('rate businesses, claim your listing, and more') : ''}
    <div class="mb-4">
      <input id="directorySearch" type="text" placeholder="Search businesses or keywords..."
             style="box-sizing:border-box;width:100%;"
             class="w-full bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400 text-base"
             onkeyup="filterDirectory()">
    </div>
    <div id="dirCategoryBar" class="flex gap-2 mb-5 overflow-x-auto pb-2 hide-scrollbar" style="-webkit-overflow-scrolling:touch;width:100%;">
      <button onclick="renderDirectory(allBusinesses)"
              class="flex-shrink-0 bg-emerald-500/30 hover:bg-emerald-500/50 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition font-semibold">All</button>
    </div>
    <div id="directoryResults" style="width:100%;min-width:0;">
      <div class="flex flex-col gap-3">
        ${[1,2,3,4,5].map(() => `
          <div class="bg-white/5 rounded-3xl p-4 animate-pulse h-28"></div>`).join('')}
      </div>
    </div>`;

  // Render cached categories INSTANTLY (fixes slow/empty category bar on load)
  if (window._dirCategories && window._dirCategories.length > 0) {
    const bar = document.getElementById('dirCategoryBar');
    if (bar) {
      bar.innerHTML = `
        <button onclick="renderDirectory(allBusinesses)"
                class="flex-shrink-0 bg-emerald-500/30 hover:bg-emerald-500/50 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition font-semibold">All</button>
        ${window._dirCategories.map(cat => `
          <button onclick="filterByCategory('${cat._id}')"
                  class="flex-shrink-0 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition flex items-center gap-1">
            <span>${cat.icon}</span><span>${cat.name}</span>
          </button>`).join('')}`;
    }
  }

  // If we already have cached businesses, render them immediately with simple cards
  if (allBusinesses.length > 0) {
    renderDirectory(allBusinesses);
  }

  // Fetch fresh data in the background (non-blocking) — updates everything when ready
  try {
    const data = await apiGet('/directory');
    if (data && data.businesses) {
      allBusinesses = data.businesses;
      renderDirectory(allBusinesses);
      _renderCategoryBar(data.categories);
    }
  } catch (e) {
    console.error('Directory fetch failed', e);
    if (allBusinesses.length === 0) {
      document.getElementById('directoryResults').innerHTML =
        `<p class="text-center text-white/50 py-12">Failed to load directory. Please refresh.</p>`;
    }
  }
}

function _renderCategoryBar(categories) {
  const bar = document.getElementById('dirCategoryBar');
  if (!bar) return;
  // Fall back to previously cached categories if API didn't return them
  const cats = (categories && categories.length) ? categories : (window._dirCategories || []);
  if (!cats.length) return;
  // Cache for other pages that use ensureDirCategories()
  if (cats.length) window._dirCategories = cats;
  bar.innerHTML = `
    <button onclick="renderDirectory(allBusinesses)"
            class="flex-shrink-0 bg-emerald-500/30 hover:bg-emerald-500/50 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition font-semibold">All</button>
    ${cats.map(cat => `
      <button onclick="filterByCategory('${cat._id}')"
              class="flex-shrink-0 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition flex items-center gap-1">
        <span>${cat.icon}</span><span>${cat.name}</span>
      </button>`).join('')}`;
}

// ─── "Open now" badge helper ──────────────────────────────────────────────────
function getOpenStatus(hoursStr) {
  if (!hoursStr) return null;
  // Parse a simple hours string like "Mon-Fri 8am-5pm • Sat 9am-3pm"
  // Returns { open: bool, label: string }
  try {
    const now     = new Date();
    const dayIdx  = now.getDay(); // 0=Sun,1=Mon,...6=Sat
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const today   = dayNames[dayIdx];

    // Split segments by • or ,
    const segments = hoursStr.split(/[•,]/).map(s => s.trim());

    for (const seg of segments) {
      const lower = seg.toLowerCase();

      // Check if today's day is mentioned
      const dayMatch = lower.match(/^(sun|mon|tue|wed|thu|fri|sat)(?:-(sun|mon|tue|wed|thu|fri|sat))?/);
      if (!dayMatch) continue;

      const startDay = dayNames.indexOf(dayMatch[1]);
      const endDay   = dayMatch[2] ? dayNames.indexOf(dayMatch[2]) : startDay;

      // Check range (handles Mon-Fri etc.)
      let inRange = false;
      if (startDay <= endDay) {
        inRange = dayIdx >= startDay && dayIdx <= endDay;
      } else {
        // wraps (e.g. Sat-Mon)
        inRange = dayIdx >= startDay || dayIdx <= endDay;
      }
      if (!inRange) continue;

      // Parse times from this segment
      const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
      if (!timeMatch) continue;

      function toMins(h, m, ampm) {
        let hour = parseInt(h);
        const min = parseInt(m || 0);
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return hour * 60 + min;
      }

      const openMins  = toMins(timeMatch[1], timeMatch[2], timeMatch[3]);
      const closeMins = toMins(timeMatch[4], timeMatch[5], timeMatch[6]);
      const nowMins   = now.getHours() * 60 + now.getMinutes();

      if (nowMins >= openMins && nowMins < closeMins) {
        return { open: true,  label: 'Open Now' };
      } else {
        return { open: false, label: 'Closed' };
      }
    }
    return null; // couldn't determine
  } catch (_) {
    return null;
  }
}

function renderDirectory(businesses) {
  const container = document.getElementById('directoryResults');
  if (!container) return;

  if (!businesses || businesses.length === 0) {
    container.innerHTML = `<p class="text-center text-white/50 py-12">No businesses found</p>`;
    return;
  }

    let html = '<div class="space-y-4">';
  businesses.forEach(b => {
    html += `
      <div onclick="showBusinessDetail('${b._id}')" 
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex items-center gap-4">
        ${b.logo 
          ? `<img src="${b.logo}" class="w-12 h-12 rounded-2xl object-cover flex-shrink-0" alt="">` 
          : `<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">${b.category?.icon || '🏪'}</div>`}
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-lg leading-tight">${b.name}</h3>
          <p class="text-white/70 text-sm">${b.address || 'Milledgeville, GA'}</p>
          ${b.phone ? `<p class="text-emerald-400 text-xs mt-0.5">📞 ${b.phone}</p>` : ''}
          ${b.hours ? `<p class="text-white/50 text-xs">${b.hours}</p>` : ''}
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function filterDirectory() {
  const searchTerm = (document.getElementById('directorySearch')?.value || '').toLowerCase();
  const filtered = allBusinesses.filter(b =>
    b.name.toLowerCase().includes(searchTerm) ||
    (b.description && b.description.toLowerCase().includes(searchTerm)) ||
    (b.keywords && b.keywords.some(k => k.toLowerCase().includes(searchTerm)))
  );
  renderDirectory(filtered);
}

async function filterByCategory(catId) {
  const filtered = allBusinesses.filter(b => b.category && b.category._id === catId);
  renderDirectory(filtered);
}
// ─── BUSINESS DETAIL MODAL — WITH FOLLOW BUTTON ───────────────────────────────
async function showBusinessDetail(id) {
  const business = allBusinesses.find(b => b._id === id);
  if (!business) return;

  const avg     = business.avgRating || 0;
  const count   = business.ratings ? business.ratings.length : 0;
  const isOwned = !!business.owner;

  // Fetch reviews (first 3 shown, rest behind "See all")
  const reviews = await apiGet(`/business/${id}/reviews`);
  const preview = (reviews || []).slice(0, 3);

  const isFollowing = currentUser && business.followers && business.followers.includes(currentUser._id);

  // ── New field helpers ──────────────────────────────────────────────────────
  const openStatus   = getOpenStatus(business.hours);
  const tagColors = [
    'bg-emerald-100 text-emerald-700',
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
  ];

  const enrichedInfoSection = `
    <!-- ─── Enriched Business Profile ──────────────────────────────────── -->
    <div class="bg-gray-50 rounded-2xl p-4 mb-4 space-y-3">

      ${business.logo ? `
        <div class="flex items-center gap-3 pb-3 border-b border-gray-200">
          <img src="${business.logo}" alt="${business.name} logo"
               class="w-14 h-14 rounded-2xl object-cover border border-gray-200 shadow-sm flex-shrink-0">
          <div>
            <p class="font-bold text-slate-900 text-base leading-tight">${business.name}</p>
            ${business.priceRange ? `<span class="text-xs font-semibold text-gray-500">${business.priceRange} · ${business.category?.name || ''}</span>` : `<span class="text-xs text-gray-500">${business.category?.name || ''}</span>`}
          </div>
        </div>` : (business.priceRange ? `
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-700">Price Range:</span>
          <span class="text-sm font-bold text-emerald-700">${business.priceRange}</span>
        </div>` : '')}

      ${business.hours ? `
        <div class="flex items-start gap-2">
          <span class="text-base flex-shrink-0 mt-0.5">🕐</span>
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm text-gray-700">${business.hours}</span>
              ${openStatus ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${openStatus.open ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}">${openStatus.label}</span>` : ''}
            </div>
          </div>
        </div>` : ''}

      ${(business.website || business.email) ? `
        <div class="flex flex-wrap gap-2">
          ${business.website ? `
            <a href="${business.website}" target="_blank" onclick="event.stopPropagation()"
               class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition">
              🌐 Visit Website
            </a>` : ''}
          ${business.email ? `
            <a href="mailto:${business.email}" onclick="event.stopPropagation()"
               class="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition">
              ✉️ Send Email
            </a>` : ''}
        </div>` : ''}

      ${(business.tags && business.tags.length > 0) ? `
        <div class="flex flex-wrap gap-1.5">
          ${business.tags.map((tag, i) => `<span class="text-xs font-semibold px-2.5 py-1 rounded-full ${tagColors[i % tagColors.length]}">${tag}</span>`).join('')}
        </div>` : ''}

    </div>`;

  const modalHTML = `
    <div onclick="if(event.target.id==='businessModal')hideBusinessModal()" id="businessModal"
         class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[12000] flex items-end md:items-center md:justify-center">
      <div onclick="event.stopImmediatePropagation()"
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100">
          <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>
        <div class="h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
        <div class="p-6">
          <div class="flex items-start justify-between mb-1">
            <h1 class="text-3xl font-bold leading-tight">${business.name}</h1>
            ${isOwned ? `<span class="text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full mt-1">✓ Verified Owner</span>` : ''}
          </div>
          <p class="text-emerald-600 text-sm mb-1">${business.category?.name || ''}</p>
          <p class="text-gray-500 mb-4 flex items-center gap-1"><span>📍</span> ${business.address || 'Milledgeville, GA'}</p>

          ${enrichedInfoSection}

          <!-- FOLLOW BUTTON -->
          ${currentUser ? `
            <button onclick="toggleFollow('${id}')" id="follow-btn-${id}"
                    class="w-full mb-4 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-3xl font-semibold transition">
              ${isFollowing ? '❤️ Following this business' : '🔖 Follow this business'}
            </button>` : ''}

          <!-- Menu button (food businesses only) -->
          ${business.menu ? `
            <button onclick="showMenuViewer('${id}')"
                    class="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold py-3 rounded-2xl mb-4 transition">
              🍽️ View Menu
            </button>` : ''}

         <!-- Contact -->
<div class="space-y-3 mb-5">
  ${business.phone ? `
    <a href="tel:${business.phone}" class="flex items-center gap-3 bg-emerald-50 hover:bg-emerald-100 transition p-4 rounded-2xl text-emerald-700 font-semibold">
      <span class="text-2xl">📞</span> ${business.phone}
    </a>` : ''}

  ${business.website ? `
    <a href="${business.website}" target="_blank" class="flex items-center gap-3 bg-blue-50 hover:bg-blue-100 transition p-4 rounded-2xl text-blue-700 font-semibold">
      <span class="text-2xl">🌐</span> Visit Website
    </a>` : ''}

  <!-- NEW: Get Directions button -->
  ${business.address ? `
    <button onclick="getDirections('${business.address}')" 
            class="flex items-center gap-3 bg-blue-50 hover:bg-blue-100 transition p-4 rounded-2xl text-blue-700 font-semibold w-full">
      <span class="text-2xl">🗺️</span> 
      Get Directions
    </button>` : ''}
</div>

          ${business.description ? `<p class="text-gray-600 leading-relaxed mb-5">${business.description}</p>` : ''}

          <!-- ─── Photo Gallery ─────────────────────────────────────────── -->
          ${(() => {
            const isOwner = currentUser && currentUser.verifiedBusiness &&
              (String(currentUser.verifiedBusiness._id || currentUser.verifiedBusiness) === String(id));
            const hasPhotos = business.photos && business.photos.length > 0;
            if (!hasPhotos && !isOwner) return '';
            const canAddMore = isOwner && (business.photos || []).length < 5;
            return `
          <div class="border-t border-gray-100 pt-5 mb-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-lg text-slate-900">📷 Photos</h3>
              ${canAddMore ? `
                <button onclick="document.getElementById('bizPhotoInput-${id}').click()"
                        class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-2xl font-semibold transition">
                  + Add Photos (${5 - (business.photos || []).length} left)
                </button>
                <input id="bizPhotoInput-${id}" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden"
                       onchange="handleBizPhotoUpload('${id}', this)">` : ''}
            </div>
            ${hasPhotos ? `
              <div class="grid grid-cols-3 gap-2">
                ${business.photos.map((src, i) => `
                  <div class="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 group cursor-pointer"
                       onclick="openBizPhotoLightbox('${id}', ${i})">
                    <img src="${src}" alt="Photo ${i+1}" class="w-full h-full object-cover hover:opacity-90 transition" loading="lazy">
                    ${isOwner ? `
                      <button onclick="event.stopPropagation(); deleteBizPhoto('${id}', ${i})"
                              class="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs transition opacity-0 group-hover:opacity-100">✕</button>` : ''}
                  </div>`).join('')}
              </div>` : `<p class="text-gray-400 text-sm text-center py-4">No photos yet. Add up to 5 to showcase your business.</p>`}
          </div>`;
          })()}
          <!-- ─── Reviews Section ─────────────────────────────────────────── -->
          <div class="border-t border-gray-100 pt-5 mb-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-lg text-slate-900">⭐ Reviews
                <span class="text-sm font-normal text-gray-400 ml-1">(${reviews.length})</span>
              </h3>
              ${reviews.length > 3 ? `
                <button onclick="showAllReviews('${id}')"
                        class="text-xs text-emerald-600 hover:text-emerald-500 font-semibold transition">
                  See all ${reviews.length} →
                </button>` : ''}
            </div>

            <!-- Review summary bar -->
            ${reviews.length > 0 ? renderReviewSummary(reviews) : ''}

            <!-- Write a review -->
            ${currentUser ? `
              <div id="writeReviewBox" class="mb-4">
                <button onclick="toggleWriteReview('${id}')"
                        class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-2xl transition text-sm">
                  ✏️ Write a Review
                </button>
                <div id="reviewForm-${id}" class="hidden mt-3 bg-gray-50 rounded-2xl p-4 space-y-3">
                  <div>
                    <p class="text-xs font-semibold text-gray-500 mb-2">Your Rating *</p>
                    <div class="flex gap-1" id="reviewStarPicker-${id}">
                      ${[1,2,3,4,5].map(s => `
                        <button onclick="setReviewStar('${id}',${s})" data-star="${s}"
                                class="text-3xl transition hover:scale-110 review-star-btn" style="color:#d1d5db;">★</button>`).join('')}
                    </div>
                  </div>
                  <input id="reviewTitle-${id}" type="text" placeholder="Headline (optional)" maxlength="100"
                         class="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-sm">
                  <textarea id="reviewBody-${id}" rows="3" placeholder="Share your experience…" maxlength="1000"
                            class="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-sm resize-none"></textarea>
                  <div class="flex gap-2">
                    <button onclick="submitReview('${id}')"
                            class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-2xl font-semibold text-sm transition">
                      Submit Review
                    </button>
                    <button onclick="toggleWriteReview('${id}')"
                            class="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-2xl text-sm transition">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>` : `
              <div class="mb-4">
                <button onclick="hideBusinessModal();showAuthModal({message:'Sign in to leave a review.'})"
                        class="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-semibold py-3 rounded-2xl transition text-sm">
                  ✏️ Sign in to Review
                </button>
              </div>`}

            <!-- Review cards (preview) -->
            <div id="reviewCards-${id}" class="space-y-3">
              ${preview.length ? preview.map(r => renderReviewCard(r, id)).join('') : `
                <div class="text-center py-6 text-gray-400 text-sm">
                  <p class="text-3xl mb-2">💬</p>
                  No reviews yet — be the first!
                </div>`}
            </div>
          </div>

          <!-- Actions -->
          <div class="space-y-3">
            ${!isOwned && currentUser ? `
              <button onclick="hideBusinessModal();showClaimModal('${business._id}')"
                      class="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-3xl font-semibold transition">
                🏷️ Claim This Business
              </button>` : ''}
            ${!isOwned && !currentUser ? `
              <button onclick="hideBusinessModal();showAuthModal({message:'Sign in to claim your business listing.'})"
                      class="w-full bg-amber-500/80 hover:bg-amber-500 text-white py-4 rounded-3xl font-semibold transition">
                🏷️ Own This Business? Sign In to Claim
              </button>` : ''}
            <button onclick="hideBusinessModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">Close</button>
          </div>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  window._currentBizReviews = reviews;
  window._currentBizId      = id;
}

window.toggleFollow = async function (businessId) {
  if (!requireAuth('Sign in to follow businesses.')) return;
  const res = await apiPost(`/business/${businessId}/follow`, {});
  if (res.following !== undefined) {
    const btn = document.getElementById(`follow-btn-${businessId}`);
    if (btn) btn.innerHTML = res.following ? '❤️ Following this business' : '🔖 Follow this business';
    showToast(res.following ? '✅ You are now following this business!' : '👋 Unfollowed');
  }
};

// ─── Review helpers ───────────────────────────────────────────────────────────
function renderReviewSummary(reviews) {
  const avg   = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const avgR  = Math.round(avg * 10) / 10;
  const dist  = [5,4,3,2,1].map(s => ({ star: s, count: reviews.filter(r => r.rating === s).length }));

  return `
    <div class="bg-gray-50 rounded-2xl p-4 mb-4">
      <div class="flex items-center gap-5">
        <div class="text-center flex-shrink-0">
          <div class="text-5xl font-black text-slate-900">${avgR}</div>
          <div class="flex gap-0.5 justify-center mt-1">
            ${[1,2,3,4,5].map(s => `<span style="color:${s<=Math.round(avgR)?'#f59e0b':'#d1d5db'};font-size:16px;">★</span>`).join('')}
          </div>
          <div class="text-xs text-gray-400 mt-1">${reviews.length} review${reviews.length!==1?'s':''}</div>
        </div>
        <div class="flex-1 space-y-1.5">
          ${dist.map(d => {
            const pct = reviews.length ? Math.round((d.count / reviews.length) * 100) : 0;
            return `
              <div class="flex items-center gap-2 text-xs">
                <span class="text-gray-500 w-3 text-right flex-shrink-0">${d.star}</span>
                <span class="text-amber-400 flex-shrink-0">★</span>
                <div class="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-amber-400 h-full rounded-full" style="width:${pct}%"></div>
                </div>
                <span class="text-gray-400 w-5 flex-shrink-0">${d.count}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function renderReviewCard(r, bizId) {
  const stars = [1,2,3,4,5].map(s => `<span style="color:${s<=r.rating?'#f59e0b':'#d1d5db'};font-size:13px;">★</span>`).join('');
  const isAdmin  = isAdmin();
  const isAuthor = currentUser && (r.user === currentUser._id || r.user === currentUser.id);
  return `
    <div class="bg-gray-50 border border-gray-100 rounded-2xl p-4" id="review-card-${r._id}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            ${(r.authorName||'?')[0].toUpperCase()}
          </div>
          <div>
            <p class="font-semibold text-sm text-slate-800">${r.authorName || 'Anonymous'}</p>
            <div class="flex items-center gap-1">${stars}<span class="text-xs text-gray-400 ml-1">${timeAgo(r.createdAt)}</span></div>
          </div>
        </div>
        ${isAuthor || isAdmin ? `
          <button onclick="deleteReview('${bizId}','${r._id}')"
                  class="text-xs text-red-400 hover:text-red-600 transition font-semibold flex-shrink-0">Delete</button>` : ''}
      </div>
      ${r.title ? `<p class="font-semibold text-slate-800 text-sm mb-1">${r.title}</p>` : ''}
      ${r.body  ? `<p class="text-sm text-gray-600 leading-relaxed">${r.body}</p>` : ''}
    </div>`;
}

let _reviewStarRating = 0;
window.setReviewStar = function (bizId, star) {
  _reviewStarRating = star;
  document.querySelectorAll(`#reviewStarPicker-${bizId} .review-star-btn`).forEach(btn => {
    btn.style.color = parseInt(btn.dataset.star) <= star ? '#f59e0b' : '#d1d5db';
  });
};

window.toggleWriteReview = function (bizId) {
  const form = document.getElementById(`reviewForm-${bizId}`);
  if (form) form.classList.toggle('hidden');
};

window.submitReview = async function (bizId) {
  if (!_reviewStarRating) { showToast('Please select a star rating.', 'error'); return; }
  const title = document.getElementById(`reviewTitle-${bizId}`)?.value.trim();
  const body  = document.getElementById(`reviewBody-${bizId}`)?.value.trim();
  const res   = await apiPost(`/business/${bizId}/reviews`, { rating: _reviewStarRating, title, body });
  if (res._id) {
    showToast('✅ Review posted!');
    const updatedReviews = await apiGet(`/business/${bizId}/reviews`);
    window._currentBizReviews = updatedReviews;
    const preview = updatedReviews.slice(0, 3);
    const container = document.getElementById(`reviewCards-${bizId}`);
    if (container) container.innerHTML = preview.map(r => renderReviewCard(r, bizId)).join('');
    const form = document.getElementById(`reviewForm-${bizId}`);
    if (form) form.classList.add('hidden');
    _reviewStarRating = 0;
  } else {
    showToast(res.message || 'Error posting review', 'error');
  }
};

window.deleteReview = async function (bizId, reviewId) {
  if (!confirm('Delete this review?')) return;
  const res = await apiDelete(`/business/${bizId}/reviews/${reviewId}`);
  if (res.message === 'Deleted') {
    showToast('Review deleted');
    const card = document.getElementById(`review-card-${reviewId}`);
    if (card) card.remove();
    if (window._currentBizReviews) {
      window._currentBizReviews = window._currentBizReviews.filter(r => r._id !== reviewId);
    }
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// All reviews modal
window.showAllReviews = async function (bizId) {
  const business = allBusinesses.find(b => b._id === bizId);
  const reviews  = window._currentBizReviews || await apiGet(`/business/${bizId}/reviews`);
  const filterOpts = ['All', '5 Stars', '4 Stars', '3 Stars', '2 Stars', '1 Star'];

  const html = `
    <div onclick="if(event.target.id==='allReviewsModal')closeAllReviews()" id="allReviewsModal"
         class="fixed inset-0 bg-black/75 backdrop-blur-sm z-[13000] flex items-end md:items-center md:justify-center">
      <div onclick="event.stopImmediatePropagation()"
           class="bg-white text-slate-900 w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100 z-10">
          <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>
        <div class="h-1 bg-gradient-to-r from-amber-400 to-orange-400"></div>
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold">All Reviews</h2>
            <span class="text-sm text-gray-400">${business?.name || ''}</span>
          </div>
          ${reviews.length > 0 ? renderReviewSummary(reviews) : ''}

          <!-- Filter chips -->
          <div class="flex gap-2 overflow-x-auto pb-2 mb-4 hide-scrollbar">
            ${filterOpts.map((f, i) => `
              <button onclick="filterReviews(${i}, '${bizId}')" id="rchip-${i}"
                      class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition ${i===0 ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                ${f}
              </button>`).join('')}
          </div>

          <div id="allReviewsList" class="space-y-3">
            ${reviews.map(r => renderReviewCard(r, bizId)).join('')}
          </div>
          <button onclick="closeAllReviews()" class="w-full mt-6 bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">Close</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  window._allReviewsData  = reviews;
  window._allReviewsBizId = bizId;
};

window.filterReviews = function (chipIdx, bizId) {
  const starFilter = [0, 5, 4, 3, 2, 1][chipIdx];
  const filtered   = starFilter === 0
    ? window._allReviewsData
    : window._allReviewsData.filter(r => r.rating === starFilter);

  document.querySelectorAll('[id^="rchip-"]').forEach((btn, i) => {
    btn.className = i === chipIdx
      ? 'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition bg-amber-500 text-white'
      : 'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition bg-gray-100 text-gray-600 hover:bg-gray-200';
  });

  const list = document.getElementById('allReviewsList');
  if (list) list.innerHTML = filtered.length
    ? filtered.map(r => renderReviewCard(r, bizId)).join('')
    : `<p class="text-center text-gray-400 py-8">No ${starFilter}-star reviews yet.</p>`;
};

window.closeAllReviews = function () {
  const el = document.getElementById('allReviewsModal');
  if (el) el.remove();
};

// ─── Menu viewer ──────────────────────────────────────────────────────────────
window.showMenuViewer = function (bizId) {
  const business = allBusinesses.find(b => b._id === bizId);
  if (!business || !business.menu) return;

  const isImg  = business.menu.startsWith('data:image');
  const isPdf  = business.menu.startsWith('data:application/pdf');

  const html = `
    <div onclick="if(event.target.id==='menuViewerModal')closeMenuViewer()" id="menuViewerModal"
         class="fixed inset-0 bg-black/85 z-[14000] flex items-center justify-center p-4">
      <div onclick="event.stopImmediatePropagation()"
           class="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl">
        <div class="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-xl font-bold">🍽️ Menu — ${business.name}</h2>
          <button onclick="closeMenuViewer()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>
        <div class="p-4">
          ${isImg ? `<img src="${business.menu}" alt="Menu" class="w-full rounded-2xl" style="max-height:75vh;object-fit:contain;">` :
            isPdf ? `<iframe src="${business.menu}" class="w-full rounded-2xl border border-gray-100" style="height:75vh;"></iframe>` :
            `<p class="text-center text-gray-400 py-12">Menu format not supported for preview.</p>`}
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.closeMenuViewer = function () {
  const el = document.getElementById('menuViewerModal');
  if (el) el.remove();
};

function hideBusinessModal() {
  const modal = document.getElementById('businessModal');
  if (modal) modal.remove();
}
// ─── CLAIM MODAL ──────────────────────────────────────────────────────────────
window.showClaimModal = function (businessId) {
  const business = allBusinesses.find(b => b._id === businessId);
  if (!business) return;

  if (business.owner) {
    showToast('This business has already been claimed.', 'error');
    return;
  }

  const html = `
    <div onclick="if(event.target.id==='claimModalBg')closeClaimModal()" id="claimModalBg"
         class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[13000] flex items-end md:items-center md:justify-center">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl overflow-auto max-h-[90vh]">
        <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100">
          <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>
        <div class="p-6">
          <div class="text-center mb-6">
            <div class="text-5xl mb-3">🏷️</div>
            <h2 class="text-2xl font-bold">Claim "${business.name}"</h2>
            <p class="text-gray-500 text-sm mt-2">Provide your info so we can verify you're the owner. Our admin will review and approve your request.</p>
          </div>
          <div class="space-y-3">
            <input id="claimOwnerName" type="text" placeholder="Your full name (owner)"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <input id="claimPhone" type="tel" placeholder="Business phone number"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <input id="claimAddress" type="text" placeholder="Business address"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <textarea id="claimMessage" rows="3" placeholder="Anything else to verify? (optional)"
                      class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50 resize-none"></textarea>

            <!-- Food / Restaurant checkbox -->
            <label class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 cursor-pointer select-none">
              <div class="relative flex-shrink-0 mt-0.5">
                <input type="checkbox" id="claimIsRestaurant" class="sr-only peer">
                <div class="w-5 h-5 rounded-md border-2 border-amber-300 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-colors flex items-center justify-center">
                  <svg class="w-3 h-3 text-white hidden peer-checked:block" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
              </div>
              <div>
                <p class="font-semibold text-amber-800 text-sm">🍽️ Food or Restaurant Business</p>
                <p class="text-amber-600 text-xs mt-0.5">Check this if your business serves food. If approved, you'll be able to upload a menu to your listing.</p>
              </div>
            </label>
          </div>
          <div id="claimStatus" class="hidden mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-sm text-center">
            ⏳ Your claim has been submitted! You'll be notified once approved.
          </div>
          <div class="space-y-3 mt-6" id="claimActions">
            <button onclick="submitClaim('${businessId}')" 
                    class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition">
              Submit Claim Request
            </button>
            <button onclick="closeClaimModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.submitClaim = async function (businessId) {
  const ownerName = document.getElementById('claimOwnerName').value.trim();
  const phone = document.getElementById('claimPhone').value.trim();
  const address = document.getElementById('claimAddress').value.trim();
  const message = document.getElementById('claimMessage').value.trim();
  const isRestaurant = document.getElementById('claimIsRestaurant')?.checked || false;

  if (!ownerName || !phone || !address) {
    showToast('Please fill in your name, phone, and address.', 'error');
    return;
  }

  const res = await apiPost(`/claim/${businessId}`, { ownerName, phone, address, message, isRestaurant });

  if (res.message && res.message.includes('submitted')) {
    document.getElementById('claimStatus').classList.remove('hidden');
    document.getElementById('claimActions').innerHTML = `
      <button onclick="closeClaimModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">Close</button>`;
    startVerificationPoll(businessId);
  } else {
    showToast(res.message || 'Something went wrong', 'error');
  }
};

window.closeClaimModal = function () {
  const el = document.getElementById('claimModalBg');
  if (el) el.remove();
};

// Stub — polls for claim approval after submission (backend integration point)
function startVerificationPoll(businessId) {
  // Future: poll /claim/:businessId/status every 30s and notify user when approved
}

// ─── SHOUTOUTS — PAGINATED + PHOTO UPLOAD ───────────────────────────────────
async function loadShoutoutsPage(content) {
  let shoutoutsPage = 1;
  const PAGE_SIZE = 8;

  const renderPage = async (page = 1) => {
    shoutoutsPage = page;

    // Show loading state
    content.innerHTML = `
      <div class="max-w-2xl mx-auto px-2 pb-10">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h1 class="text-3xl md:text-4xl font-bold">🚦 Community Traffic Alerts</h1>
            <p class="text-emerald-300 text-sm mt-1">Live traffic alerts • Auto-delete after 8 hours</p>
          </div>
        </div>

        <!-- Compose Box -->
        ${currentUser ? `
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5 mb-8">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 bg-emerald-500 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0">${currentUser.name[0].toUpperCase()}</div>
            <div class="flex-1">
              <textarea id="shoutoutInput" rows="2" 
                class="w-full bg-white/10 border border-white/20 rounded-2xl p-3 text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400 resize-none text-sm" 
                placeholder="What's happening in Milledgeville?"></textarea>

              <!-- Photo picker -->
              <div class="mt-3 flex items-center gap-3">
                <button onclick="document.getElementById('shoutoutImageInput').click()" 
                        class="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-2xl text-sm font-semibold text-white/80 transition">
                  📷 Add photos
                </button>
                <input id="shoutoutImageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden"
                       onchange="handleShoutoutImages(this)">
                <div id="shoutoutImagePreviews" class="flex gap-2 flex-wrap"></div>
              </div>

              <div class="flex justify-end mt-4">
                <button onclick="postShoutoutWithPhoto()" 
                        class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-2xl text-sm font-semibold transition">
                  Post Traffic Alert
                </button>
              </div>
            </div>
          </div>
        </div>` : guestBanner('post traffic alerts, comment, and like')}

        <div id="shoutoutsFeed" class="space-y-4 min-h-[300px]"></div>

        <!-- Pagination -->
        <div id="shoutoutPagination" class="flex justify-center items-center gap-3 mt-8"></div>
      </div>`;

    try {
      const res = await apiGet(`/shoutouts?page=${page}&limit=${PAGE_SIZE}`);
      const { shoutouts = [], pagination = {} } = res;
      const feed = document.getElementById('shoutoutsFeed');

      if (!res || !Array.isArray(shoutouts)) {
        if (feed) feed.innerHTML = `<p class="text-red-400 text-center py-12">Error loading traffic alerts</p>`;
        return;
      }

      if (!shoutouts.length) {
        feed.innerHTML = `<p class="text-center text-white/50 py-16">No active traffic alerts right now.<br>Be the first to post one! 🚦</p>`;
      } else {
        feed.innerHTML = shoutouts.map(s => renderShoutoutCard(s)).join('');
      }

      renderPaginationControls(pagination);
    } catch (err) {
      console.error(err);
      document.getElementById('shoutoutsFeed').innerHTML = 
        `<p class="text-red-400 text-center py-12">Failed to load traffic alerts. Please try again.</p>`;
    }
  };

  // Pagination UI
  function renderPaginationControls(p) {
    const container = document.getElementById('shoutoutPagination');
    if (!p || p.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = `
      <button onclick="window._loadShoutoutPage(${Math.max(1, shoutoutsPage-1)})" 
              class="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-3xl transition ${!p.hasPrev ? 'opacity-40 pointer-events-none' : ''}">
        ← Previous
      </button>

      <div class="px-6 py-3 bg-white/5 rounded-3xl text-sm font-medium text-white/70">
        Page <span class="text-white font-semibold">${p.currentPage}</span> of ${p.totalPages}
      </div>

      <button onclick="window._loadShoutoutPage(${Math.min(p.totalPages, shoutoutsPage+1)})" 
              class="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-3xl transition ${!p.hasNext ? 'opacity-40 pointer-events-none' : ''}">
        Next →
      </button>
    `;

    container.innerHTML = html;
  }

  // Make pagination buttons work globally
  window._loadShoutoutPage = (page) => renderPage(page);

  // Initial render
  await renderPage(1);
}

// Make sure router can call it
window.loadShoutoutsPage = loadShoutoutsPage;

// ─── SHOUTOUT IMAGE LIGHTBOX ──────────────────────────────────────────────────
window.openShoutoutImageViewer = function (shoutoutId, startIndex) {
  // Find the shoutout's images from the DOM's img src attributes within its card
  const card = document.getElementById(`shoutout-${shoutoutId}`);
  if (!card) return;
  const imgs = Array.from(card.querySelectorAll('.hide-scrollbar img')).map(img => img.src);
  if (!imgs.length) return;

  let current = startIndex;

  function render() {
    const existing = document.getElementById('shoutoutImgLightbox');
    if (existing) existing.remove();

    const html = `
      <div id="shoutoutImgLightbox" class="fixed inset-0 bg-black/95 z-[14000] flex items-center justify-center">
        <button onclick="document.getElementById('shoutoutImgLightbox').remove()"
                class="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl font-bold transition z-10">✕</button>
        ${imgs.length > 1 ? `
          <button onclick="shoutoutLightboxPrev()" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition z-10">‹</button>
          <button onclick="shoutoutLightboxNext()" class="absolute right-16 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition z-10">›</button>` : ''}
        <div class="max-w-full max-h-full flex flex-col items-center px-16">
          <img src="${imgs[current]}" alt="Photo ${current+1}" class="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl">
          ${imgs.length > 1 ? `<p class="text-white/50 text-sm mt-3">${current+1} / ${imgs.length}</p>` : ''}
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  window.shoutoutLightboxPrev = function () { current = (current - 1 + imgs.length) % imgs.length; render(); };
  window.shoutoutLightboxNext = function () { current = (current + 1) % imgs.length; render(); };

  render();
};

// ─── PHOTO UPLOAD FOR SHOUTOUTS ───────────────────────────────────────────────
let _pendingShoutoutImages = [];

window.handleShoutoutImages = function (input) {
  const files = Array.from(input.files);
  if (!_pendingShoutoutImages) _pendingShoutoutImages = [];

  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} is too large (max 5MB)`, 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      _pendingShoutoutImages.push(e.target.result);
      renderShoutoutImagePreviews();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
};

function renderShoutoutImagePreviews() {
  const container = document.getElementById('shoutoutImagePreviews');
  if (!container) return;
  container.innerHTML = _pendingShoutoutImages.map((src, i) => `
    <div class="relative w-16 h-16 bg-white/10 rounded-2xl overflow-hidden group">
      <img src="${src}" class="w-full h-full object-cover" alt="Preview">
      <button onclick="removeShoutoutImage(${i}); event.stopImmediatePropagation()" 
              class="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-bl flex items-center justify-center">✕</button>
    </div>`).join('');
}

window.removeShoutoutImage = function (index) {
  _pendingShoutoutImages.splice(index, 1);
  renderShoutoutImagePreviews();
};

window.postShoutoutWithPhoto = async function () {
  if (!requireAuth('Sign in to post traffic alerts.')) return;
  const input = document.getElementById('shoutoutInput');
  if (!input || !input.value.trim()) return;

  const res = await apiPost('/shoutouts', { 
    text: input.value.trim(),
    images: _pendingShoutoutImages || []
  });

  if (res._id) {
    showToast('✅ Traffic Alert posted!');
    _pendingShoutoutImages = [];
    input.value = '';
    loadPage('shoutouts');
  } else {
    showToast(res.message || 'Error posting traffic alert', 'error');
  }
}

function renderShoutoutCard(s) {
  const authorLetter = s.author ? s.author[0].toUpperCase() : '?';
  const likeCount = s.likes ? s.likes.length : 0;
  const comments = s.comments || [];
  const commentCount = comments.length;

  const isAdmin = isAdmin();
  const isAuthor = currentUser && (s.authorId === currentUser._id || s.authorId === currentUser.id);

  // Still There state
  const stillThereVoters = s.stillThereVoters || [];
  const stillThereCount = stillThereVoters.length;
  const myId = currentUser?._id || currentUser?.id || '';
  const hasVotedStillThere = stillThereVoters.some(v => (v?._id || v)?.toString() === myId?.toString());

  // Cleared state
  const clearedBy = s.clearedBy || [];
  const clearCount = clearedBy.length;
  const CLEAR_THRESHOLD = 8;
  const isCleared = s.cleared === true;
  const hasVotedCleared = clearedBy.some(v => (v?._id || v)?.toString() === myId?.toString());
  const clearProgress = Math.min(clearCount, CLEAR_THRESHOLD);

  // Location tag
  const locationTag = s.location?.label
    ? `<span class="inline-flex items-center gap-1 text-[11px] text-sky-300/80 bg-sky-500/10 border border-sky-500/20 rounded-full px-2.5 py-0.5 mt-1">
         📍 ${s.location.label}
       </span>`
    : '';

  let allCommentsHtml = '';
  comments.forEach(c => { allCommentsHtml += renderCommentRow(c, s._id); });

  const commentLabel = commentCount > 0
    ? `💬 ${commentCount} Comment${commentCount !== 1 ? 's' : ''}`
    : '💬 Comment';

  // Card opacity/style when cleared
  const clearedStyle = isCleared
    ? 'opacity-50 border-white/5'
    : 'border-white/10';
  const clearedBanner = isCleared
    ? `<div class="flex items-center gap-1.5 bg-white/5 rounded-2xl px-3 py-1.5 mb-3 text-xs text-white/50 font-medium">
         ✅ <span>Community marked this alert as cleared</span>
       </div>`
    : '';

  return `
    <div class="bg-white/10 backdrop-blur-xl border ${clearedStyle} rounded-3xl p-5 transition-all" id="shoutout-${s._id}">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex items-start gap-3 flex-1 min-w-0">
          <div class="w-9 h-9 bg-emerald-600 rounded-2xl flex items-center justify-center text-base font-bold flex-shrink-0">${authorLetter}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-white">${s.author || 'Community Member'} ${renderClickableUser(s.authorId || s.author)}</div>
            <div class="flex flex-wrap items-center gap-2 mt-0.5">
              <span class="text-[11px] text-white/40">${timeAgo(s.createdAt)}</span>
              ${locationTag}
            </div>
          </div>
        </div>
        
        <!-- Flag button -->
        ${!isAuthor && currentUser ? `
          <button onclick="flagShoutout('${s._id}')" 
                  class="text-white/30 hover:text-orange-400 transition text-sm flex-shrink-0" title="Flag this alert">
            🚩
          </button>` : ''}
        
        ${isAuthor || isAdmin ? `
          <button onclick="deleteShoutout('${s._id}')" 
                  class="text-white/30 hover:text-red-400 transition text-sm flex-shrink-0" title="Delete shoutout">🗑️</button>` : ''}
      </div>

      ${clearedBanner}

      <p class="text-white/85 leading-relaxed mb-3">${s.text}</p>
      ${(s.images && s.images.length > 0) ? `
        <div class="flex gap-2 overflow-x-auto pb-1 mb-3 hide-scrollbar" style="-webkit-overflow-scrolling:touch;">
          ${s.images.map((src, i) => `
            <div onclick="openShoutoutImageViewer('${s._id}', ${i}); event.stopPropagation();"
                 class="flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden cursor-pointer bg-white/10 hover:opacity-90 transition">
              <img src="${src}" alt="Photo ${i+1}" class="w-full h-full object-cover" loading="lazy">
            </div>`).join('')}
        </div>` : ''}
      ${likeCount > 0 ? `<div class="text-xs text-white/35 mb-1">❤️ ${likeCount}</div>` : ''}

      <!-- Cleared progress bar (only shown if votes are accumulating but not yet cleared) -->
      ${!isCleared && clearCount > 0 ? `
        <div class="mb-2">
          <div class="flex justify-between text-[10px] text-white/30 mb-1">
            <span>Cleared by community</span>
            <span>${clearCount}/${CLEAR_THRESHOLD}</span>
          </div>
          <div class="h-1 bg-white/10 rounded-full overflow-hidden">
            <div class="h-full bg-amber-400/60 rounded-full transition-all" style="width:${(clearProgress/CLEAR_THRESHOLD)*100}%"></div>
          </div>
        </div>` : ''}

      <div class="flex items-center gap-1 border-t border-white/10 pt-2">
        <!-- Like -->
        <button onclick="${currentUser ? `toggleLike('${s._id}')` : `showAuthModal({message:'Sign in to like.'})`}" id="like-btn-${s._id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white/50 hover:text-pink-400 hover:bg-white/5 transition font-medium text-sm">
          <span id="like-icon-${s._id}">${likeCount > 0 ? '❤️' : '🤍'}</span>
          <span id="like-label-${s._id}">Like</span>
        </button>

        <!-- Still There -->
        ${!isCleared ? `
        <button onclick="${currentUser ? `markStillThere('${s._id}')` : `showAuthModal({message:'Sign in to confirm alerts.'})`}"
                id="still-there-btn-${s._id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition font-medium text-sm
                  ${hasVotedStillThere ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/50 hover:text-emerald-400 hover:bg-white/5'}"
                title="${hasVotedStillThere ? 'You confirmed this is still active' : 'Confirm this alert is still active'}">
          👀 <span id="still-there-label-${s._id}">${hasVotedStillThere ? `Still There (${stillThereCount})` : stillThereCount > 0 ? `Still There (${stillThereCount})` : 'Still There'}</span>
        </button>` : ''}

        <!-- Cleared -->
        <button onclick="${currentUser ? `markCleared('${s._id}')` : `showAuthModal({message:'Sign in to mark alerts cleared.'})`}"
                id="clear-btn-${s._id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition font-medium text-sm
                  ${isCleared ? 'text-green-400 bg-green-500/10' : hasVotedCleared ? 'text-green-400/70 bg-white/5' : 'text-white/50 hover:text-green-400 hover:bg-white/5'}"
                title="${isCleared ? 'Alert cleared by community' : hasVotedCleared ? 'You marked this cleared' : 'Mark as cleared / resolved'}">
          ✅ <span id="clear-label-${s._id}">${isCleared ? 'Cleared' : hasVotedCleared ? `Cleared (${clearCount}/8)` : clearCount > 0 ? `Cleared (${clearCount}/8)` : 'Cleared'}</span>
        </button>

        <!-- Comment -->
        <button onclick="${currentUser ? `toggleCommentSection('${s._id}')` : `showAuthModal({message:'Sign in to comment.'})`}" id="comment-btn-${s._id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white/50 hover:text-emerald-400 hover:bg-white/5 transition font-medium text-sm">
          ${commentLabel}
        </button>
      </div>
      <div id="comment-section-${s._id}" class="hidden mt-3 border-t border-white/10 pt-3 space-y-2">
        ${allCommentsHtml}
        ${currentUser ? `
          <div class="flex items-start gap-2 ${commentCount > 0 ? 'mt-3' : ''}">
            <div class="w-7 h-7 bg-emerald-500 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">${currentUser.name[0].toUpperCase()}</div>
            <div class="flex-1 flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl px-3 py-2">
              <input id="commentinput-${s._id}" type="text"
                class="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none" placeholder="Write a comment...">
              <button onclick="postComment('${s._id}')" class="text-emerald-400 font-semibold">Post</button>
            </div>
          </div>` : ''}
      </div>
    </div>`;
}

function renderCommentRow(c, shoutoutId) {
  const cLetter = c.author ? c.author[0].toUpperCase() : '?';
  const replies = c.replies || [];
  const replyCount = replies.length;
  const isAdmin = isAdmin();
  const isCommentAuthor = currentUser && (c.authorId === currentUser._id || c.authorId === currentUser.id);

  let repliesHtml = '';
  if (replyCount > 0) {
    repliesHtml = `<div class="ml-9 mt-1 space-y-1">`;
    replies.forEach(r => {
      const rLetter = r.author ? r.author[0].toUpperCase() : '?';
      repliesHtml += `
        <div class="flex items-start gap-2" id="reply-${r._id}">
          <div class="w-6 h-6 bg-teal-600 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">${rLetter}</div>
          <div class="flex-1 bg-white/5 rounded-2xl px-3 py-1.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-white/80">${r.author}</span>
              <span class="text-[10px] text-white/30">${timeAgo(r.createdAt)}</span>
            </div>
            <p class="text-sm text-white/75">${r.text}</p>
          </div>
        </div>`;
    });
    repliesHtml += `</div>`;
  }

  return `
    <div class="comment-block" id="comment-${c._id}">
      <div class="flex items-start gap-2">
        <div class="w-7 h-7 bg-slate-600 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">${cLetter}</div>
        <div class="flex-1 min-w-0">
          <div class="bg-white/5 rounded-2xl px-3 py-2 inline-block max-w-full">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-semibold text-white/80">${c.author}</span>
              <span class="text-[10px] text-white/30">${timeAgo(c.createdAt)}</span>
              ${isCommentAuthor || isAdmin ? `
                <button onclick="deleteComment('${shoutoutId}','${c._id}')" 
                        class="text-[10px] text-red-400/50 hover:text-red-400 transition ml-1">✕ delete</button>` : ''}
            </div>
            <p class="text-sm text-white/80 mt-0.5">${c.text}</p>
          </div>
          ${currentUser ? `
            <div class="flex items-center gap-3 mt-1 ml-2">
              <button onclick="toggleReplyBox('${shoutoutId}','${c._id}')" 
                      class="text-[11px] text-white/40 hover:text-emerald-400 transition font-semibold">Reply</button>
            </div>
            <div id="replybox-${c._id}" class="hidden mt-2 flex items-start gap-2">
              <div class="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">${currentUser.name[0].toUpperCase()}</div>
              <div class="flex-1 flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl px-3 py-1.5">
                <input id="replyinput-${c._id}" type="text"
                  class="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none text-sm"
                  placeholder="Reply to ${c.author}…"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();submitReply('${shoutoutId}','${c._id}');}">
                <button onclick="submitReply('${shoutoutId}','${c._id}')" 
                        class="text-emerald-400 hover:text-emerald-300 transition text-xs font-semibold">Post</button>
              </div>
            </div>` : `
            <div class="flex items-center gap-3 mt-1 ml-2">
              <button onclick="showAuthModal({message:'Sign in to reply.'})"
                      class="text-[11px] text-white/40 hover:text-emerald-400 transition font-semibold">Reply</button>
            </div>`}
        </div>
      </div>
      ${repliesHtml}
    </div>`;
}

// ─── Shoutout interactions ────────────────────────────────────────────────────
window.toggleLike = async function (shoutoutId) {
  if (!requireAuth('Sign in to like traffic alerts.')) return;
  const res = await apiPost(`/shoutouts/${shoutoutId}/like`, {});
  if (res.likes !== undefined) {
    const icon = document.getElementById(`like-icon-${shoutoutId}`);
    const label = document.getElementById(`like-label-${shoutoutId}`);
    if (icon) icon.textContent = res.liked ? '❤️' : '🤍';
    if (label) label.textContent = 'Like';
  }
};

window.toggleCommentSection = function (shoutoutId) {
  const section = document.getElementById(`comment-section-${shoutoutId}`);
  if (!section) return;
  const isHidden = section.classList.contains('hidden');
  section.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    const input = document.getElementById(`commentinput-${shoutoutId}`);
    if (input) setTimeout(() => { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }
};

window.submitComment = async function (shoutoutId) {
  if (!requireAuth('Sign in to comment.')) return;
  const input = document.getElementById(`commentinput-${shoutoutId}`);
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  const res = await apiPost(`/shoutouts/${shoutoutId}/comments`, { text });
  if (res._id) {
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error posting comment', 'error');
  }
};

window.toggleReplyBox = function (shoutoutId, commentId) {
  const box = document.getElementById(`replybox-${commentId}`);
  if (!box) return;
  const isHidden = box.classList.contains('hidden');
  box.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    const input = document.getElementById(`replyinput-${commentId}`);
    if (input) { input.focus(); }
  }
};

window.submitReply = async function (shoutoutId, commentId) {
  if (!requireAuth('Sign in to reply.')) return;
  const input = document.getElementById(`replyinput-${commentId}`);
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  const res = await apiPost(`/shoutouts/${shoutoutId}/comments/${commentId}/replies`, { text });
  if (res._id) {
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error posting reply', 'error');
  }
};

window.deleteComment = async function (shoutoutId, commentId) {
  if (!confirm('Delete this comment?')) return;
  const res = await apiDelete(`/shoutouts/${shoutoutId}/comments/${commentId}`);
  if (res.message === 'Deleted') {
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.deleteShoutout = async function (shoutoutId) {
  if (!confirm('Delete this traffic alert?')) return;
  const res = await apiDelete(`/shoutouts/${shoutoutId}`);
  if (res.message) {
    showToast('Traffic alert deleted');
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// ─── postComment: alias so the "Post" button in renderShoutoutCard works ───────
window.postComment = async function (shoutoutId) {
  return window.submitComment(shoutoutId);
};

// ─── STILL THERE — confirm a traffic alert is still active ────────────────────
window.markStillThere = async function (shoutoutId) {
  if (!requireAuth('Sign in to confirm alerts.')) return;
  const res = await apiPost(`/shoutouts/${shoutoutId}/still-there`, {});

  if (res.alreadyVoted) {
    showToast('You already confirmed this alert is still active.', 'info');
    return;
  }

  if (res.stillThereCount !== undefined) {
    // Update button label in-place without a full page reload
    const btn = document.getElementById(`still-there-btn-${shoutoutId}`);
    const label = document.getElementById(`still-there-label-${shoutoutId}`);
    if (label) label.textContent = `Still There (${res.stillThereCount})`;
    if (btn) {
      btn.classList.remove('text-white/50', 'hover:text-emerald-400', 'hover:bg-white/5');
      btn.classList.add('text-emerald-400', 'bg-emerald-500/10');
    }
    showToast('👀 Thanks for confirming this alert is still active!', 'success');
  } else {
    showToast(res.message || 'Error confirming alert', 'error');
  }
};

// ─── CLEARED — mark a traffic alert as resolved ───────────────────────────────
window.markCleared = async function (shoutoutId) {
  if (!requireAuth('Sign in to mark alerts cleared.')) return;
  const res = await apiPost(`/shoutouts/${shoutoutId}/clear`, {});

  if (res.alreadyVoted) {
    showToast(`You already marked this cleared (${res.clearCount}/8 votes).`, 'info');
    return;
  }

  if (res.clearCount !== undefined) {
    const btn = document.getElementById(`clear-btn-${shoutoutId}`);
    const label = document.getElementById(`clear-label-${shoutoutId}`);

    if (res.cleared) {
      // Threshold reached — mark the whole card as cleared
      if (label) label.textContent = 'Cleared';
      if (btn) {
        btn.classList.remove('text-white/50', 'hover:text-green-400', 'hover:bg-white/5', 'text-green-400/70', 'bg-white/5');
        btn.classList.add('text-green-400', 'bg-green-500/10');
      }
      // Dim the card and show the cleared banner
      const card = document.getElementById(`shoutout-${shoutoutId}`);
      if (card) {
        card.classList.add('opacity-50');
        card.classList.remove('border-white/10');
        card.classList.add('border-white/5');
        const existingBanner = card.querySelector('.cleared-banner');
        if (!existingBanner) {
          card.insertAdjacentHTML('afterbegin',
            `<div class="cleared-banner flex items-center gap-1.5 bg-white/5 rounded-2xl px-3 py-1.5 mb-3 text-xs text-white/50 font-medium">
               ✅ <span>Community marked this alert as cleared</span>
             </div>`
          );
        }
        // Hide the "Still There" button
        const stillThereBtn = document.getElementById(`still-there-btn-${shoutoutId}`);
        if (stillThereBtn) stillThereBtn.remove();
      }
      showToast('✅ Alert marked as cleared by the community!', 'success');
    } else {
      // Vote recorded, threshold not yet reached
      if (label) label.textContent = `Cleared (${res.clearCount}/8)`;
      if (btn) {
        btn.classList.remove('text-white/50', 'hover:text-green-400', 'hover:bg-white/5');
        btn.classList.add('text-green-400/70', 'bg-white/5');
      }
      showToast(`✅ Cleared vote recorded (${res.clearCount}/${res.threshold} needed).`, 'success');
    }
  } else {
    showToast(res.message || 'Error marking alert cleared', 'error');
  }
};
// ─── EVENTS & DEALS ──────────────────────────────────────────────────────────
window._dirCategories = window._dirCategories || [];

async function ensureDirCategories() {
  if (window._dirCategories.length) return;
  try {
    const data = await apiGet('/directory');
    window._dirCategories = (data.categories || []).map(c => ({ name: c.name, icon: c.icon || '📁' }));
  } catch (e) { /* fail silently */ }
}

const EVENT_CATEGORIES = [
  { name: 'Community',             icon: '🏘️'  },
  { name: 'Food & Drink',          icon: '🍽️'  },
  { name: 'Music & Entertainment', icon: '🎶'  },
  { name: 'Sports & Fitness',      icon: '⚽'  },
  { name: 'Family & Kids',         icon: '👨‍👩‍👧'  },
  { name: 'Arts & Culture',        icon: '🎨'  },
  { name: 'Business & Networking', icon: '💼'  },
  { name: 'Education & Classes',   icon: '📚'  },
  { name: 'Health & Wellness',     icon: '🧘'  },
  { name: 'Charity & Fundraiser',  icon: '❤️'  },
  { name: 'Holiday & Seasonal',    icon: '🎉'  },
  { name: 'Other',                 icon: '📌'  },
];

function catIcon(name) {
  if (!name) return '📁';
  const evtMatch = EVENT_CATEGORIES.find(c => c.name === name);
  if (evtMatch) return evtMatch.icon;
  const dirMatch = (window._dirCategories || []).find(c => c.name === name);
  return dirMatch ? dirMatch.icon : '📁';
}

async function loadDealsPage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">🔥 Hot Deals</h1>
        ${currentUser && currentUser.verifiedBusiness ? `
        <button onclick="navigate('owner-dashboard')" 
                class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">📤</span> Post New Deal
        </button>` : ''}
      </div>

      <!-- Search + Filter -->
      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <input id="dealsSearchInput" type="text" placeholder="Search deals..." 
               class="flex-1 bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400">

        <select id="dealsFilter" onchange="filterAndRenderDeals()"
                class="bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
          <option value="all">All Deals</option>
          <option value="active">Active Only</option>
        </select>
      </div>

      <div id="dealsList" class="space-y-4"></div>
      <div id="dealsPagination" class="flex justify-center gap-3 mt-8"></div>
    </div>`;

  window.currentDealsPage = 1;
  window.currentDealsSearch = '';
  window.currentDealsFilter = 'all';

  // Live search
  document.getElementById('dealsSearchInput').addEventListener('input', debounce(() => {
    window.currentDealsSearch = document.getElementById('dealsSearchInput').value.trim().toLowerCase();
    window.currentDealsPage = 1;
    renderDealsPage();
  }, 300));

  await renderDealsPage();
}

async function renderDealsPage() {
  const res = await apiGet(`/deals?page=${window.currentDealsPage}&limit=8`);
  const deals = res.deals || [];
  const pagination = res.pagination || {};

  const container = document.getElementById('dealsList');
  
  let filtered = deals.filter(deal => {
    const matchesSearch = !window.currentDealsSearch || 
      deal.title.toLowerCase().includes(window.currentDealsSearch) ||
      (deal.description || '').toLowerCase().includes(window.currentDealsSearch);
    
    const matchesFilter = window.currentDealsFilter === 'all' || 
      !deal.expires || new Date(deal.expires) > new Date();
    
    return matchesSearch && matchesFilter;
  });

  let html = '';
  if (filtered.length === 0) {
    html = `<p class="text-white/40 text-center py-16">No ${window.currentDealsFilter === 'active' ? 'active ' : ''}deals found right now.</p>`;
  } else {
    html = filtered.map(deal => `
      <div onclick="showDealDetail('${deal._id}')" 
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition">
        <div class="flex justify-between items-start">
          <div>
            <h3 class="font-semibold text-lg">${deal.title}</h3>
            <p class="text-white/70 line-clamp-2 mt-1">${deal.description || ''}</p>
          </div>
          ${deal.business?.name ? `<span class="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full">${deal.business.name}</span>` : ''}
        </div>
        
        <div class="flex items-center gap-3 mt-4 text-xs text-white/50">
          ${deal.expires ? `<span>Expires ${formatDate(deal.expires)}</span>` : ''}
          <span>·</span>
          <span>Posted ${timeAgo(deal.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
  renderDealsPagination(pagination);
}

function renderDealsPagination(p) {
  const container = document.getElementById('dealsPagination');
  if (!p.totalPages || p.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button onclick="changeDealsPage(${Math.max(1, window.currentDealsPage-1)})" 
            class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 ${!p.hasPrev ? 'opacity-40 pointer-events-none' : ''}">
      ← Prev
    </button>
    <span class="px-6 py-3 text-white/70">Page ${p.currentPage} of ${p.totalPages}</span>
    <button onclick="changeDealsPage(${Math.min(p.totalPages, window.currentDealsPage+1)})" 
            class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 ${!p.hasNext ? 'opacity-40 pointer-events-none' : ''}">
      Next →
    </button>`;

  container.innerHTML = html;
}

window.changeDealsPage = function(page) {
  window.currentDealsPage = page;
  renderDealsPage();
};

window.filterAndRenderDeals = function() {
  window.currentDealsFilter = document.getElementById('dealsFilter').value;
  window.currentDealsPage = 1;
  renderDealsPage();
};

// ─── EVENTS PAGE — WITH RSVP BUTTONS ──────────────────────────────────────────
async function loadEventsPage(content) {
  const [eventsRes] = await Promise.all([apiGet('/events'), ensureDirCategories()]);
  const allEvents = Array.isArray(eventsRes) ? eventsRes : (eventsRes?.events || []);
  window._allEvents   = allEvents;
  window._eventFilter = 'All';
  window._eventSearch = '';
  window._eventTime   = 'upcoming';

  const now            = new Date();
  const upcomingEvents = allEvents.filter(e => new Date(e.date) >= now);

  content.innerHTML = `
    <div class="max-w-3xl mx-auto px-2 pb-10">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-3xl md:text-4xl font-bold">📅 Events</h2>
        <span class="text-sm text-white/40">${upcomingEvents.length} upcoming</span>
      </div>

      ${!currentUser ? guestBanner('post events and connect with the community') : ''}

      <div class="flex gap-2 mb-4">
        <input id="eventSearchInput" type="text" placeholder="Search events…"
               class="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400"
               oninput="window._eventSearch=this.value; renderEventsFiltered()">
        <select id="eventTimeSelect" onchange="window._eventTime=this.value; renderEventsFiltered()"
                class="border border-white/20 rounded-2xl px-3 py-3 text-sm text-white focus:outline-none focus:border-emerald-400"
                style="background:#1e293b;color-scheme:dark;">
          <option value="upcoming">Upcoming</option>
          <option value="all">All</option>
          <option value="past">Past</option>
        </select>
      </div>

      <div id="eventChips" class="flex gap-2 mb-6 overflow-x-auto pb-2 hide-scrollbar" style="-webkit-overflow-scrolling:touch;"></div>
      <div id="eventResults"></div>
    </div>`;

  renderEventsFiltered();
}

window.renderEventsFiltered = function () {
  const search    = (window._eventSearch || '').toLowerCase();
  const filter    = window._eventFilter  || 'All';
  const time      = window._eventTime    || 'upcoming';
  const now       = new Date();
  const allEvents = window._allEvents    || [];

  const pool       = time === 'past' ? allEvents.filter(e => new Date(e.date) < now) : allEvents.filter(e => new Date(e.date) >= now);
  const poolCatSet = new Set(pool.map(e => e.category).filter(Boolean));
  const activeCats = EVENT_CATEGORIES.filter(c => poolCatSet.has(c.name));

  if (filter !== 'All' && !activeCats.find(c => c.name === filter)) window._eventFilter = 'All';
  const currentFilter = window._eventFilter || 'All';

  const chips = document.getElementById('eventChips');
  if (chips) {
    chips.innerHTML = `
      <button onclick="window._eventFilter='All'; renderEventsFiltered()"
              class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${currentFilter === 'All' ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
        All
      </button>
      ${activeCats.map(cat => {
        const safe = cat.name.replace(/'/g, "\\'");
        return `
        <button onclick="window._eventFilter='${safe}'; renderEventsFiltered()"
                class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${currentFilter === cat.name ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
          <span>${cat.icon}</span><span>${cat.name}</span>
        </button>`;
      }).join('')}`;
  }

let events = allEvents.filter(e => {
  const eDate = new Date(e.date);
  const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));

  // Hide events older than 3 days
  if (eDate < threeDaysAgo) return false;

  if (time === 'upcoming' && eDate < now)  return false;
  if (time === 'past'     && eDate >= now) return false;
  if (currentFilter !== 'All' && e.category !== currentFilter) return false;
  if (search && !e.title.toLowerCase().includes(search) &&
      !(e.description||'').toLowerCase().includes(search) &&
      !(e.location||'').toLowerCase().includes(search)) return false;
  return true;
});

  time === 'past' ? events.sort((a,b) => new Date(b.date) - new Date(a.date))
                  : events.sort((a,b) => new Date(a.date) - new Date(b.date));

  const container = document.getElementById('eventResults');
  if (!container) return;

  if (!events.length) {
    const msg = time === 'upcoming' ? 'No upcoming events' : time === 'past' ? 'No past events' : 'No events found';
    container.innerHTML = `
      <div class="text-center py-16 bg-white/5 border border-white/10 rounded-3xl">
        <p class="text-4xl mb-3">📅</p>
        <p class="text-white/50 text-sm">${msg}</p>
        ${currentFilter !== 'All' ? `<button onclick="window._eventFilter='All';renderEventsFiltered()" class="mt-3 text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition">Clear filter</button>` : ''}
      </div>`;
    return;
  }

  if (time !== 'past') {
    const grouped = {};
    events.forEach(e => {
      const key = new Date(e.date).toLocaleDateString('en-US', { month:'long', year:'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });
    container.innerHTML = Object.entries(grouped).map(([month, mes]) => `
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-xs font-bold uppercase tracking-widest text-emerald-400">${month}</span>
          <div class="flex-1 h-px bg-white/10"></div>
        </div>
        <div class="space-y-3">${mes.map(e => renderEventCard(e, now)).join('')}</div>
      </div>`).join('');
  } else {
    container.innerHTML = `<div class="space-y-3">${events.map(e => renderEventCard(e, now)).join('')}</div>`;
  }
}

function renderEventCard(e, now) {
  const eDate   = new Date(e.date);
  const isPast  = eDate < now;
  const icon    = catIcon(e.category);
  const label   = e.category || 'General';

  const rsvpCount = e.rsvps ? e.rsvps.length : 0;

  // Gray out + Past badge for events that have already happened
  const pastStyles = isPast 
    ? 'opacity-60 grayscale-[0.3] border border-white/10' 
    : 'border border-white/10 hover:border-emerald-500/30';

  const pastBadge = isPast 
    ? `<span class="text-[10px] bg-gray-500/30 text-gray-300 px-2 py-0.5 rounded-full">Past Event</span>` 
    : '';

  const rsvpHTML = currentUser && !isPast ? `
    <button onclick="toggleRSVP('${e._id}'); event.stopImmediatePropagation()" 
            class="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 py-2 rounded-2xl text-sm font-semibold transition">
      ${e.rsvps && e.rsvps.includes(currentUser._id) ? '✅ Going' : '🎟️ RSVP'}
    </button>` : '';

  return `
    <div onclick="showEventDetail('${e._id}')" 
         class="bg-white/10 ${pastStyles} rounded-3xl p-5 cursor-pointer transition">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">${icon} ${label}</span>
            ${pastBadge}
          </div>
          <h3 class="font-bold text-lg leading-snug">${e.title}</h3>
          <p class="text-white/70 text-sm mt-1 line-clamp-2">${e.description || ''}</p>
          
          <div class="flex items-center gap-2 text-xs text-white/50 mt-3">
            <span>📅 ${formatDate(e.date)}</span>
            ${e.location ? `<span>· 📍 ${e.location}</span>` : ''}
          </div>
        </div>
      </div>
      
      ${rsvpHTML}
      
      ${rsvpCount > 0 ? `
        <div class="text-xs text-emerald-400 mt-2 flex items-center gap-1">
          <span>🎟️</span> <span>${rsvpCount} going</span>
        </div>` : ''}
    </div>`;
}

// ─── RESOURCES PAGE ───────────────────────────────────────────────────────────
let _allResources = [];
let _resourceCategories = [];

async function loadResourcesPage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-10">
          <!-- RESOURCES TABS -->
      <div class="flex gap-2 mb-6 border-b border-white/20 pb-2">
        <button onclick="showResourcesTab('all')" id="resTab-all"
                class="px-5 py-2 rounded-3xl text-sm font-semibold bg-emerald-600 text-white">All</button>
        <button onclick="showResourcesTab('new-residents')" id="resTab-new-residents"
                class="px-5 py-2 rounded-3xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white/80">🏠 New Residents</button>
      </div>
      <h2 class="text-3xl md:text-4xl font-bold mb-6">🌍 Community Resources</h2>
      <div class="space-y-3">
        ${[1,2,3,4].map(() => `
          <div class="bg-white/10 rounded-3xl p-5 animate-pulse">
            <div class="flex gap-3">
              <div class="w-12 h-12 bg-white/10 rounded-2xl flex-shrink-0"></div>
              <div class="flex-1">
                <div class="h-4 bg-white/10 rounded-full mb-2 w-2/3"></div>
                <div class="h-3 bg-white/10 rounded-full w-1/3 mb-2"></div>
                <div class="h-3 bg-white/10 rounded-full w-full"></div>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  try {
    const data = await apiGet('/resources');

    if (!data || data.message) {
      content.innerHTML = `
        <div class="max-w-2xl mx-auto px-2 py-16 text-center">
          <p class="text-4xl mb-4">⚠️</p>
          <p class="text-white/60 text-sm">Could not load resources. Please try again.</p>
          <button onclick="loadResourcesPage(document.getElementById('content'))" 
                  class="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-sm font-semibold transition">
            Retry
          </button>
        </div>`;
      return;
    }

    _allResources = data.businesses || [];
    _resourceCategories = data.categories || [];

    const RESOURCE_CATS = [
      { name: 'Churches',           icon: '⛪' },
      { name: 'Recycling Centers',  icon: '♻️' },
      { name: 'Fishing Spots',      icon: '🎣' },
      { name: 'Parks & Recreation', icon: '🌳' },
      { name: 'Libraries',          icon: '📚' },
    ];

    const presentCatNames = new Set(_allResources.map(b => b.category?.name).filter(Boolean));
    const visibleCats = RESOURCE_CATS.filter(c => presentCatNames.has(c.name));

    content.innerHTML = `
      <div class="max-w-2xl mx-auto px-2 pb-10">
      
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-3xl md:text-4xl font-bold">🌍 Community Resources</h2>
          <span class="text-sm text-white/40">${_allResources.length} listed</span>
        </div>
        <p class="text-white/50 text-sm mb-5 leading-relaxed">
          Free and public resources available to everyone in the Milledgeville community.
        </p>

        <!-- Category filter chips -->
        <div class="flex gap-2 mb-6 overflow-x-auto pb-2 hide-scrollbar" style="-webkit-overflow-scrolling:touch;" id="resourceChips">
          <button onclick="filterResources('All')"
                  id="resChip-All"
                  class="flex-shrink-0 bg-emerald-500/30 hover:bg-emerald-500/50 border border-emerald-500/30 px-4 py-2 rounded-full text-sm font-semibold transition text-white">
            All
          </button>
          ${visibleCats.map(c => `
            <button onclick="filterResources('${c.name}')"
                    id="resChip-${c.name.replace(/\s+/g, '-').replace(/[&]/g, '')}"
                    class="flex-shrink-0 bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition flex items-center gap-1.5 text-white/80">
              <span>${c.icon}</span><span>${c.name}</span>
            </button>`).join('')}
        </div>

        <!-- Search -->
        <div class="mb-5">
          <input id="resourceSearch" type="text" placeholder="Search resources…"
                 class="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400"
                 oninput="filterResources(window._activeResourceFilter || 'All')">
        </div>

        <div id="resourcesResults"></div>
      </div>`;

    window._activeResourceFilter = 'All';
    renderResourcesList(_allResources);

  } catch (err) {
    content.innerHTML = `
      <div class="max-w-2xl mx-auto px-2 py-16 text-center">
        <p class="text-4xl mb-4">⚠️</p>
        <p class="text-white/60 text-sm">Could not load resources. Please try again.</p>
        <button onclick="loadResourcesPage(document.getElementById('content'))" 
                class="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-sm font-semibold transition">
          Retry
        </button>
      </div>`;
  }
}

window.filterResources = function (categoryName) {
  window._activeResourceFilter = categoryName;

  document.querySelectorAll('[id^="resChip-"]').forEach(btn => {
    btn.className = btn.className
      .replace('bg-emerald-500/30 border-emerald-500/30 text-white', 'bg-white/10 border-white/10 text-white/80')
      .replace('hover:bg-emerald-500/50', 'hover:bg-white/20');
  });
  const activeChipId = 'resChip-' + (categoryName === 'All' ? 'All' : categoryName.replace(/\s+/g, '-').replace(/[&]/g, ''));
  const activeChip = document.getElementById(activeChipId);
  if (activeChip) {
    activeChip.className = activeChip.className
      .replace('bg-white/10 border-white/10 text-white/80', 'bg-emerald-500/30 border-emerald-500/30 text-white')
      .replace('hover:bg-white/20', 'hover:bg-emerald-500/50');
  }

  const search = (document.getElementById('resourceSearch')?.value || '').toLowerCase();

  const filtered = _allResources.filter(b => {
    const catMatch = categoryName === 'All' || b.category?.name === categoryName;
    const searchMatch = !search ||
      b.name.toLowerCase().includes(search) ||
      (b.description || '').toLowerCase().includes(search) ||
      (b.address || '').toLowerCase().includes(search);
    return catMatch && searchMatch;
  });

  renderResourcesList(filtered);
};

function renderResourcesList(items) {
  const container = document.getElementById('resourcesResults');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="text-center py-16 bg-white/5 border border-white/10 rounded-3xl">
        <p class="text-4xl mb-3">🔍</p>
        <p class="text-white/50 text-sm">No resources match your search.</p>
        <button onclick="filterResources('All')" class="mt-3 text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition">
          Clear filter
        </button>
      </div>`;
    return;
  }

  const grouped = {};
  items.forEach(item => {
    const catName = item.category?.name || 'Other';
    const catIcon = item.category?.icon || '📍';
    if (!grouped[catName]) grouped[catName] = { icon: catIcon, items: [] };
    grouped[catName].items.push(item);
  });

  container.innerHTML = Object.entries(grouped).map(([catName, group]) => `
    <div class="mb-7">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-lg">${group.icon}</span>
        <h3 class="font-bold text-base text-white">${catName}</h3>
        <div class="flex-1 h-px bg-white/10"></div>
        <span class="text-xs text-white/30">${group.items.length}</span>
      </div>
      <div class="space-y-3">
        ${group.items.map(item => renderResourceCard(item)).join('')}
      </div>
    </div>`).join('');
}

function renderResourceCard(item) {
  const icon = item.category?.icon || '📍';
  const catName = item.category?.name || 'Resource';

  let description = item.description || '';
  let hoursLine = '';
  const hoursMatch = description.match(/\n\n🕒 Hours: (.+)$/s);
  if (hoursMatch) {
    hoursLine = hoursMatch[1].trim();
    description = description.replace(/\n\n🕒 Hours: .+$/s, '').trim();
  }

  return `
    <div onclick="showResourceDetail('${item._id}')"
         class="bg-white/10 hover:bg-white/15 border border-white/10 hover:border-emerald-500/30 rounded-3xl p-5 cursor-pointer transition-all duration-200 group">
      <div class="flex gap-4">
        <div class="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
          ${icon}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-base leading-tight group-hover:text-emerald-300 transition-colors mb-1">${item.name}</h3>
          ${item.address ? `
            <p class="text-emerald-300 text-xs flex items-center gap-1 mb-1">
              <span>📍</span><span class="truncate">${item.address}</span>
            </p>` : ''}
          ${item.phone ? `
            <p class="text-white/50 text-xs flex items-center gap-1 mb-1">
              <span>📞</span><span>${item.phone}</span>
            </p>` : ''}
          ${hoursLine ? `
            <p class="text-amber-300/70 text-xs flex items-start gap-1 mb-1">
              <span class="flex-shrink-0">🕒</span><span>${hoursLine}</span>
            </p>` : ''}
          ${description ? `
            <p class="text-white/55 text-xs mt-2 line-clamp-2 leading-relaxed">${description}</p>` : ''}
        </div>
        <span class="text-white/20 group-hover:text-white/50 transition flex-shrink-0 self-center text-lg">›</span>
      </div>
    </div>`;
}

window.showResourceDetail = function (id) {
  const item = _allResources.find(b => b._id === id);
  if (!item) return;

  const icon = item.category?.icon || '📍';
  const catName = item.category?.name || 'Resource';

  let description = item.description || '';
  let hoursLine = '';
  const hoursMatch = description.match(/\n\n🕒 Hours: (.+)$/s);
  if (hoursMatch) {
    hoursLine = hoursMatch[1].trim();
    description = description.replace(/\n\n🕒 Hours: .+$/s, '').trim();
  }

  const modalHTML = `
    <div onclick="if(event.target.id==='resourceModal')closeResourceDetail()" id="resourceModal"
         class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[12000] flex items-end md:items-center md:justify-center">
      <div onclick="event.stopImmediatePropagation()"
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100">
          <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>
        <div class="h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
        <div class="p-6">
          <div class="flex items-start gap-4 mb-5">
            <div class="w-14 h-14 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
              ${icon}
            </div>
            <div class="flex-1 min-w-0">
              <h1 class="text-2xl font-bold leading-tight text-slate-900">${item.name}</h1>
              <span class="inline-block mt-1 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                ${icon} ${catName}
              </span>
            </div>
          </div>

          <div class="space-y-3 mb-6">
            ${item.address ? `
              <div class="flex items-start gap-3 bg-slate-50 rounded-2xl p-4">
                <span class="text-xl flex-shrink-0">📍</span>
                <div>
                  <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Address</p>
                  <p class="text-slate-700 font-medium text-sm">${item.address}</p>
                </div>
              </div>` : ''}
            ${item.phone ? `
              <a href="tel:${item.phone}" class="flex items-start gap-3 bg-emerald-50 hover:bg-emerald-100 rounded-2xl p-4 transition">
                <span class="text-xl flex-shrink-0">📞</span>
                <div>
                  <p class="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Phone</p>
                  <p class="text-emerald-700 font-semibold text-sm">${item.phone}</p>
                </div>
              </a>` : ''}
            ${hoursLine ? `
              <div class="flex items-start gap-3 bg-amber-50 rounded-2xl p-4">
                <span class="text-xl flex-shrink-0">🕒</span>
                <div>
                  <p class="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Hours</p>
                  <p class="text-amber-800 text-sm leading-relaxed">${hoursLine}</p>
                </div>
              </div>` : ''}
            ${item.website ? `
              <a href="${item.website.startsWith('http') ? item.website : 'https://'+item.website}" target="_blank"
                 class="flex items-start gap-3 bg-blue-50 hover:bg-blue-100 rounded-2xl p-4 transition">
                <span class="text-xl flex-shrink-0">🌐</span>
                <div>
                  <p class="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">Website</p>
                  <p class="text-blue-700 font-semibold text-sm">${item.website.replace(/^https?:\/\//, '')}</p>
                </div>
              </a>` : ''}
          </div>

          ${description ? `
            <div class="mb-6">
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">About</p>
              <p class="text-slate-600 leading-relaxed text-sm">${description}</p>
            </div>` : ''}

          <button onclick="closeResourceDetail()"
                  class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

window.closeResourceDetail = function () {
  const el = document.getElementById('resourceModal');
  if (el) el.remove();
};

// ─── OWNER DASHBOARD ──────────────────────────────────────────────────────────
async function loadOwnerDashboard(content) {
  await ensureDirCategories();

  const biz        = currentUser && currentUser.verifiedBusiness;
  const bizCatName = biz?.category?.name || (typeof biz?.category === 'string' ? biz.category : '') || '';

  const selectStyle = 'background:#1e293b;color-scheme:dark;';
  const selectClass = 'w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 text-white focus:outline-none focus:border-emerald-400';
  const inputClass  = 'w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400';

  const dealCatOptions = window._dirCategories.map(c =>
    `<option value="${c.name}" ${c.name === bizCatName ? 'selected' : ''}>${c.icon} ${c.name}</option>`
  ).join('');

  const eventCatOptions = EVENT_CATEGORIES.map(c =>
    `<option value="${c.name}">${c.icon} ${c.name}</option>`
  ).join('');

  const dealAutoHint = bizCatName
    ? `<p class="text-xs text-emerald-400/70 -mt-1 mb-3 px-1">✨ Auto-selected: ${bizCatName}</p>`
    : '';

  // Build tab list — Menu tab only for restaurants
  const tabs = [
    { id: 'listing', label: 'Listing',  icon: '📋' },
    { id: 'photos',  label: 'Photos',   icon: '📷' },
    ...(biz && biz.isRestaurant ? [{ id: 'menu', label: 'Menu', icon: '🍽️' }] : []),
    { id: 'deals',   label: 'Deals',    icon: '🔥' },
    { id: 'events',  label: 'Events',   icon: '📅' },
  ];

  content.innerHTML = `
    <div class="max-w-2xl mx-auto pb-10">

      <!-- ─── Header ───────────────────────────────────────────────────────── -->
      <div class="px-4 pt-2 pb-4">
        <h2 class="text-2xl font-bold">🏪 My Dashboard</h2>
        ${biz ? `<p class="text-emerald-400 text-sm font-semibold mt-0.5">${biz.name}</p>` : '<p class="text-white/40 text-sm mt-0.5">No verified business yet</p>'}
      </div>

      <!-- ─── Top Tab Bar ───────────────────────────────────────────────────── -->
      <div class="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pb-3 pt-1 border-b border-white/10">
        <div class="flex gap-1 overflow-x-auto hide-scrollbar">
          ${tabs.map((t, i) => `
            <button onclick="switchDashTab('${t.id}')" id="dtab-${t.id}"
                    class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all
                           ${i === 0 ? 'bg-emerald-600 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}">
              <span>${t.icon}</span><span>${t.label}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="px-4 pt-6">

        <!-- ═══ TAB: Listing ════════════════════════════════════════════════ -->
        <div id="dtabContent-listing">

          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
            <h3 class="font-bold text-base mb-4 flex items-center gap-2"><span>🏢</span> Basic Info</h3>
            <input id="ownerName"           type="text" placeholder="Business Name *"                          class="${inputClass}">
            <input id="ownerAddress"        type="text" placeholder="Address"                                  class="${inputClass}">
            <input id="ownerPhone"          type="tel"  placeholder="Phone"                                    class="${inputClass}">
            <input id="ownerWebsite"        type="url"  placeholder="Website (e.g. https://yourbusiness.com)"  class="${inputClass}">
            <textarea id="ownerDescription" rows="3"    placeholder="Description — tell customers what makes your business special"
                      class="${inputClass} resize-none"></textarea>
            <button onclick="saveOwnerListing()"
                    class="w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-semibold transition">
              💾 Save Info
            </button>
          </div>

          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
            <h3 class="font-bold text-base mb-1 flex items-center gap-2"><span>🕐</span> Business Hours</h3>
            <p class="text-white/35 text-xs mb-3">Format: <span class="font-mono text-white/50">Mon-Fri 9am-5pm • Sat 10am-3pm • Sun Closed</span></p>
            <input id="ownerHours" type="text"
                   placeholder="e.g. Mon-Fri 9am-5pm • Sat 10am-3pm"
                   class="${inputClass}">
            <p class="text-white/30 text-xs mb-4 -mt-1 px-1">Drives the live Open/Closed badge on your business card.</p>
            <button onclick="saveOwnerHours()"
                    class="w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-semibold transition">
              💾 Save Hours
            </button>
          </div>

        </div>

        <!-- ═══ TAB: Photos ════════════════════════════════════════════════ -->
        <div id="dtabContent-photos" class="hidden">
          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
            <h3 class="font-bold text-base mb-1 flex items-center gap-2"><span>📷</span> Photo Gallery</h3>
            <p class="text-white/40 text-xs mb-4">Up to 5 photos shown on your listing. Customers can tap to browse them full screen.</p>
            <div id="ownerPhotoGrid" class="grid grid-cols-3 gap-2 mb-4"></div>
            <button onclick="document.getElementById('ownerPhotoInput').click()"
                    class="w-full border-2 border-dashed border-white/20 hover:border-emerald-400 rounded-2xl py-5 text-white/50 hover:text-white transition text-sm font-medium">
              📷 Add Photos (up to 5 total)
            </button>
            <input id="ownerPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden"
                   onchange="handleOwnerPhotoUpload(this)">
          </div>
        </div>

        <!-- ═══ TAB: Menu (restaurants only) ══════════════════════════════ -->
        ${biz && biz.isRestaurant ? `
        <div id="dtabContent-menu" class="hidden">
          <div class="bg-white/10 backdrop-blur-xl border border-amber-500/20 rounded-3xl p-6 mb-4">
            <h3 class="font-bold text-base mb-1 flex items-center gap-2"><span>🍽️</span> Restaurant Menu</h3>
            <p class="text-white/40 text-xs mb-4">Upload an image or PDF (max 5 MB). Appears as a "View Menu" button on your listing.</p>
            ${biz.menu ? `
              <div class="mb-4 bg-white/5 rounded-2xl overflow-hidden">
                ${biz.menu.startsWith('data:image')
                  ? `<img src="${biz.menu}" alt="Current Menu" class="w-full max-h-64 object-contain">`
                  : `<div class="p-4 flex items-center gap-3"><span class="text-3xl">📄</span><p class="text-sm font-semibold">Menu PDF uploaded</p></div>`}
              </div>
              <p class="text-xs text-emerald-400 mb-3">✅ Menu is live on your listing</p>` : ''}
            <div id="menuPreviewBox" class="hidden mb-4 bg-white/5 rounded-2xl overflow-hidden">
              <img id="menuPreviewImg" src="" alt="Menu preview" class="w-full max-h-64 object-contain hidden">
              <div id="menuPdfLabel" class="hidden p-4 flex items-center gap-3"><span class="text-3xl">📄</span><p class="text-sm font-semibold">PDF ready to upload</p></div>
            </div>
            <button onclick="document.getElementById('menuFileInput').click()"
                    class="w-full border-2 border-dashed border-amber-500/40 hover:border-amber-400 rounded-2xl py-4 text-white/60 hover:text-white transition text-sm font-medium mb-3">
              📁 Choose Menu File (Image or PDF)
            </button>
            <input id="menuFileInput" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="hidden"
                   onchange="handleMenuFileSelect(this)">
            <div class="flex gap-3">
              <button onclick="uploadMenu()" id="menuUploadBtn"
                      class="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-3xl font-semibold transition hidden">
                📤 Upload Menu
              </button>
              ${biz.menu ? `
              <button onclick="removeMenu()"
                      class="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 py-4 rounded-3xl font-semibold transition text-sm">
                🗑️ Remove Menu
              </button>` : ''}
            </div>
          </div>
        </div>` : ''}

        <!-- ═══ TAB: Deals ════════════════════════════════════════════════ -->
        <div id="dtabContent-deals" class="hidden">
          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
            <h3 class="font-bold text-base mb-4 flex items-center gap-2"><span>🔥</span> Post a Deal</h3>
            <input id="dealTitle" type="text" placeholder="Deal Title *" class="${inputClass}">
            <textarea id="dealDesc" rows="2" placeholder="Deal description" class="${inputClass} resize-none"></textarea>
            <select id="dealCategory" class="${selectClass}" style="${selectStyle}">
              <option value="">Select Category *</option>
              ${dealCatOptions}
            </select>
            ${dealAutoHint}
            <label class="block text-xs text-white/50 mb-1 px-1">Expiry Date (optional)</label>
            <input id="dealExpires" type="date" class="${inputClass}">
            <button onclick="addOwnerDeal()" class="w-full bg-amber-500 hover:bg-amber-600 py-4 rounded-3xl font-semibold mt-1">🔥 Post Deal</button>
          </div>
          <p class="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-1">Your Active Deals</p>
          <div id="ownerDealsList"></div>
        </div>

        <!-- ═══ TAB: Events ═══════════════════════════════════════════════ -->
        <div id="dtabContent-events" class="hidden">
          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
            <h3 class="font-bold text-base mb-4 flex items-center gap-2"><span>📅</span> Post an Event</h3>
            <input id="eventTitle"    type="text"           placeholder="Event Title *"       class="${inputClass}">
            <label class="block text-xs text-white/50 mb-1 px-1">Event Date & Time *</label>
            <input id="eventDate"     type="datetime-local"                                   class="${inputClass}">
            <input id="eventLocation" type="text"           placeholder="Location (optional)" class="${inputClass}">
            <select id="eventCategory" class="${selectClass}" style="${selectStyle}">
              <option value="">Select Event Type *</option>
              ${eventCatOptions}
            </select>
            <textarea id="eventDesc" rows="2" placeholder="Event description" class="${inputClass} resize-none"></textarea>
            <button onclick="addOwnerEvent()" class="w-full bg-emerald-500 hover:bg-emerald-600 py-4 rounded-3xl font-semibold mt-1">📅 Post Event</button>
          </div>
          <p class="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-1">Your Events</p>
          <div id="ownerEventsList"></div>
        </div>

      </div>
    </div>`;

  // Pre-populate listing fields
  if (currentUser && currentUser.verifiedBusiness) {
    const biz = currentUser.verifiedBusiness;
    document.getElementById('ownerName').value        = biz.name        || '';
    document.getElementById('ownerAddress').value     = biz.address     || '';
    document.getElementById('ownerPhone').value       = biz.phone       || '';
    document.getElementById('ownerWebsite').value     = biz.website     || '';
    document.getElementById('ownerDescription').value = biz.description || '';
    document.getElementById('ownerHours').value       = biz.hours       || '';
  }
}

window.switchDashTab = function (tabId) {
  const allIds = ['listing', 'photos', 'menu', 'deals', 'events'];
  allIds.forEach(id => {
    const btn     = document.getElementById(`dtab-${id}`);
    const content = document.getElementById(`dtabContent-${id}`);
    if (!btn || !content) return;
    const active = id === tabId;
    content.classList.toggle('hidden', !active);
    if (active) {
      btn.className = btn.className
        .replace('text-white/50 hover:text-white hover:bg-white/10', '')
        .trim() + ' bg-emerald-600 text-white';
    } else {
      btn.className = btn.className
        .replace('bg-emerald-600 text-white', '')
        .trim() + ' text-white/50 hover:text-white hover:bg-white/10';
    }
  });
  if (tabId === 'deals')  loadOwnerDeals();
  if (tabId === 'events') loadOwnerEvents();
  if (tabId === 'photos') renderOwnerPhotoGrid();
};

window.saveOwnerListing = async function () {
  const name        = document.getElementById('ownerName').value.trim();
  const address     = document.getElementById('ownerAddress').value.trim();
  const phone       = document.getElementById('ownerPhone').value.trim();
  const website     = document.getElementById('ownerWebsite').value.trim();
  const description = document.getElementById('ownerDescription').value.trim();
  const res = await apiPost('/owner/business', { name, address, phone, website, description }, 'PUT');
  if (res._id) {
    currentUser.verifiedBusiness = res;
    showToast('✅ Listing updated!');
  } else {
    showToast(res.message || 'Error saving', 'error');
  }
};

window.saveOwnerHours = async function () {
  const hours = document.getElementById('ownerHours').value.trim();
  const res = await apiPost('/owner/business', { hours }, 'PUT');
  if (res._id) {
    currentUser.verifiedBusiness = res;
    showToast('✅ Hours updated!');
  } else {
    showToast(res.message || 'Error saving hours', 'error');
  }
};

async function loadOwnerDeals() {
  const container = document.getElementById('ownerDealsList');
  if (!container) return;
  const deals = await apiGet('/owner/deals');
  if (!deals.length) {
    container.innerHTML = `<p class="text-white/50 text-center py-6 text-sm">No deals posted yet.</p>`;
    return;
  }
  const catMap = Object.fromEntries((window._dirCategories || []).map(c => [c.name, c.icon]));
  container.innerHTML = deals.map(d => `
    <div class="bg-white/10 border border-white/10 rounded-3xl p-5 mb-3">
      <div class="flex justify-between items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            ${d.category ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/20">${catMap[d.category]||'📁'} ${d.category}</span>` : ''}
            ${d.expires ? `<span class="text-[11px] text-white/40">Exp. ${new Date(d.expires).toLocaleDateString()}</span>` : ''}
          </div>
          <div class="font-bold leading-snug">${d.title}</div>
          ${d.description ? `<div class="text-sm text-white/60 mt-1 line-clamp-2">${d.description}</div>` : ''}
        </div>
        <button onclick="deleteOwnerDeal('${d._id}')" class="text-red-400 hover:text-red-300 text-lg flex-shrink-0">🗑️</button>
      </div>
    </div>`).join('');
}

async function loadOwnerEvents() {
  const container = document.getElementById('ownerEventsList');
  if (!container) return;
  const events = await apiGet('/owner/events');
  if (!events.length) {
    container.innerHTML = `<p class="text-white/50 text-center py-6 text-sm">No events posted yet.</p>`;
    return;
  }
  const catMap = Object.fromEntries(EVENT_CATEGORIES.map(c => [c.name, c.icon]));
  container.innerHTML = events.map(e => `
    <div class="bg-white/10 border border-white/10 rounded-3xl p-5 mb-3">
      <div class="flex justify-between items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            ${e.category ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">${catMap[e.category]||'📅'} ${e.category}</span>` : ''}
            <span class="text-[11px] text-white/40">${new Date(e.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</span>
          </div>
          <div class="font-bold leading-snug">${e.title}</div>
          ${e.location ? `<div class="text-xs text-emerald-300 mt-1">📍 ${e.location}</div>` : ''}
          ${e.description ? `<div class="text-sm text-white/60 mt-1 line-clamp-2">${e.description}</div>` : ''}
        </div>
        <button onclick="deleteOwnerEvent('${e._id}')" class="text-red-400 hover:text-red-300 text-lg flex-shrink-0">🗑️</button>
      </div>
    </div>`).join('');
}

window.addOwnerDeal = async function () {
  const title       = document.getElementById('dealTitle').value.trim();
  const description = document.getElementById('dealDesc').value.trim();
  const expires     = document.getElementById('dealExpires').value;
  const category    = document.getElementById('dealCategory').value;
  if (!title)    { showToast('Title is required', 'error'); return; }
  if (!category) { showToast('Please select a category', 'error'); return; }
  const res = await apiPost('/owner/deals', { title, description, expires, category });
  if (res._id) {
    showToast('🔥 Deal posted!');
    document.getElementById('dealTitle').value    = '';
    document.getElementById('dealDesc').value     = '';
    document.getElementById('dealExpires').value  = '';
    document.getElementById('dealCategory').value = '';
    loadOwnerDeals();
  } else {
    showToast(res.message || 'Error posting deal', 'error');
  }
};

window.deleteOwnerDeal = async function (id) {
  if (!confirm('Delete this deal?')) return;
  await apiDelete(`/owner/deals/${id}`);
  showToast('Deal deleted');
  loadOwnerDeals();
};

window.addOwnerEvent = async function () {
  const title       = document.getElementById('eventTitle').value.trim();
  const date        = document.getElementById('eventDate').value;
  const location    = document.getElementById('eventLocation').value.trim();
  const description = document.getElementById('eventDesc').value.trim();
  const category    = document.getElementById('eventCategory').value;
  if (!title)    { showToast('Title is required', 'error'); return; }
  if (!date)     { showToast('Date is required', 'error'); return; }
  if (!category) { showToast('Please select a category', 'error'); return; }
  const res = await apiPost('/owner/events', { title, date, location, description, category });
  if (res._id) {
    showToast('📅 Event posted!');
    document.getElementById('eventTitle').value    = '';
    document.getElementById('eventDate').value     = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventDesc').value     = '';
    document.getElementById('eventCategory').value = '';
    loadOwnerEvents();
  } else {
    showToast(res.message || 'Error posting event', 'error');
  }
};

window.deleteOwnerEvent = async function (id) {
  if (!confirm('Delete this event?')) return;
  await apiDelete(`/owner/events/${id}`);
  showToast('Event deleted');
  loadOwnerEvents();
};

// ─── CUTTING-EDGE ADMIN PANEL (2026 Style) ───────────────────────────────────
async function loadAdminPage(content) {
  content.innerHTML = `
    <div class="max-w-screen-2xl mx-auto px-3 md:px-6 py-6">

      <!-- Mobile Top Tabs (Horizontal Scroll) -->
      <div class="md:hidden flex overflow-x-auto gap-2 pb-4 hide-scrollbar mb-6 border-b border-white/10">
        ${[
          {id:0, label:'Dashboard', icon:'📊'},
          {id:1, label:'Users',     icon:'👥'},
          {id:2, label:'Mod',       icon:'🛡️'},
          {id:3, label:'Businesses',icon:'🏪'},
          {id:4, label:'Claims',    icon:'📬'},
          {id:5, label:'Broadcast', icon:'📢'},
          {id:6, label:'Analytics', icon:'📈'},
          {id:7, label:'Reports',   icon:'🚩'}
        ].map(tab => `
          <button onclick="switchAdminTab(${tab.id})" id="mobileTab${tab.id}"
                  class="admin-tab whitespace-nowrap flex items-center gap-2 px-5 py-3 rounded-3xl text-sm font-semibold flex-shrink-0 transition-all
                         ${window.currentAdminTab === tab.id ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
            <span class="text-lg">${tab.icon}</span>
            <span>${tab.label}</span>
          </button>
        `).join('')}
      </div>

      <div class="flex gap-6">

        <!-- Desktop Sidebar -->
        <div class="hidden md:block w-72 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 h-fit sticky top-6 flex-shrink-0">
          <div class="flex items-center gap-3 mb-10 px-2">
            <div class="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-2xl">🔧</div>
            <h1 class="text-2xl font-bold">Admin Control</h1>
          </div>

          <nav class="space-y-1 text-sm">
            <button onclick="switchAdminTab(0)" id="adminTab0" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold bg-emerald-600 text-white">📊 Dashboard</button>
            <button onclick="switchAdminTab(1)" id="adminTab1" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">👥 Users & Reputation</button>
            <button onclick="switchAdminTab(2)" id="adminTab2" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">🛡️ Moderation</button>
            <button onclick="switchAdminTab(3)" id="adminTab3" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">🏪 Businesses</button>
            <button onclick="switchAdminTab(4)" id="adminTab4" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">📬 Claims</button>
            <button onclick="switchAdminTab(5)" id="adminTab5" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">📢 Broadcast</button>
            <button onclick="switchAdminTab(6)" id="adminTab6" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">📈 Analytics</button>
            <button onclick="switchAdminTab(7)" id="adminTab7" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">🚩 Reports</button>
          </nav>
        </div>

        <!-- Main Content -->
        <div class="flex-1 min-w-0" id="adminMainContent"></div>
      </div>
    </div>`;

  window.currentAdminTab = 0;
  await switchAdminTab(0);
}

// ─── MODERATION PANEL ────────────────────────────────────────────────────────
async function loadModerationPanel() {
  const container = document.getElementById('adminMainContent');
  container.innerHTML = `<div class="p-8 text-center text-white/60">Loading...</div>`;

  try {
    const [shoutouts, lostitems, marketplace] = await Promise.all([
      apiGet('/shoutouts?limit=50'),
      apiGet('/admin/lostitems'),
      apiGet('/admin/marketplace')
    ]);

    container.innerHTML = `
      <div class="p-6 space-y-8">
        <h2 class="text-2xl font-bold text-white">🛡️ Moderation</h2>

        <section>
          <h3 class="text-lg font-semibold text-white mb-3">Traffic Alerts</h3>
          <div class="space-y-2">
            ${(shoutouts.shoutouts || []).map(s => `
              <div class="bg-white/10 rounded-2xl p-4 flex items-start justify-between gap-3">
                <div>
                  <p class="text-white text-sm">${s.text}</p>
                  <p class="text-white/50 text-xs mt-1">by ${s.author}</p>
                </div>
                <button onclick="adminDeleteShoutout('${s._id}')" class="text-red-400 hover:text-red-300 text-sm flex-shrink-0">Delete</button>
              </div>`).join('') || '<p class="text-white/40">No active traffic alerts</p>'}
          </div>
        </section>

        <section>
          <h3 class="text-lg font-semibold text-white mb-3">Lost & Found Items</h3>
          <div class="space-y-2">
            ${(lostitems || []).map(i => `
              <div class="bg-white/10 rounded-2xl p-4 flex items-start justify-between gap-3">
                <div>
                  <p class="text-white text-sm font-medium">${i.title}</p>
                  <p class="text-white/50 text-xs">by ${i.authorName} · ${i.type}</p>
                </div>
                <button onclick="adminDeleteLostItem('${i._id}')" class="text-red-400 hover:text-red-300 text-sm flex-shrink-0">Delete</button>
              </div>`).join('') || '<p class="text-white/40">No items</p>'}
          </div>
        </section>

        <section>
          <h3 class="text-lg font-semibold text-white mb-3">Marketplace Listings</h3>
          <div class="space-y-2">
            ${(marketplace || []).map(m => `
              <div class="bg-white/10 rounded-2xl p-4 flex items-start justify-between gap-3">
                <div>
                  <p class="text-white text-sm font-medium">${m.title}</p>
                  <p class="text-white/50 text-xs">$${m.price} · by ${m.authorName}</p>
                </div>
                <button onclick="adminDeleteMarketItem('${m._id}')" class="text-red-400 hover:text-red-300 text-sm flex-shrink-0">Delete</button>
              </div>`).join('') || '<p class="text-white/40">No listings</p>'}
          </div>
        </section>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-red-400">Failed to load moderation panel: ${err.message}</div>`;
  }
}

window.adminDeleteShoutout = async function(id) {
  if (!confirm('Delete this traffic alert?')) return;
  await apiDelete(`/shoutouts/${id}`);
  await loadModerationPanel();
};
window.adminDeleteLostItem = async function(id) {
  if (!confirm('Delete this lost & found item?')) return;
  await apiDelete(`/admin/lostitems/${id}`);
  await loadModerationPanel();
};
window.adminDeleteMarketItem = async function(id) {
  if (!confirm('Delete this marketplace listing?')) return;
  await apiDelete(`/admin/marketplace/${id}`);
  await loadModerationPanel();
};

// ─── CLAIMS PANEL ─────────────────────────────────────────────────────────────
async function loadAdminClaims() {
  const container = document.getElementById('adminMainContent');
  container.innerHTML = `<div class="p-8 text-center text-white/60">Loading Claims...</div>`;

  try {
    const claims = await apiGet('/admin/claims');

    container.innerHTML = `
      <div class="p-6 space-y-6">
        <h2 class="text-2xl font-bold text-white">📬 Pending Business Claims</h2>
        ${!claims.length ? '<p class="text-white/40">No pending claims.</p>' :
          claims.map(c => `
            <div class="bg-white/10 rounded-3xl p-5 space-y-3">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-white font-semibold text-lg">${c.business?.name || 'Unknown Business'}</p>
                  <p class="text-white/60 text-sm">${c.business?.address || ''}</p>
                </div>
                <span class="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-xs font-semibold">Pending</span>
              </div>
              <div class="bg-black/20 rounded-2xl p-4 text-sm space-y-1">
                <p class="text-white/80"><span class="text-white/40">Claimant:</span> ${c.user?.name} (${c.user?.email})</p>
                <p class="text-white/80"><span class="text-white/40">Owner Name:</span> ${c.verificationInfo?.ownerName || '—'}</p>
                <p class="text-white/80"><span class="text-white/40">Phone:</span> ${c.verificationInfo?.phone || '—'}</p>
                <p class="text-white/80"><span class="text-white/40">Address:</span> ${c.verificationInfo?.address || '—'}</p>
                <p class="text-white/80"><span class="text-white/40">Message:</span> ${c.verificationInfo?.message || '—'}</p>
                <p class="text-white/80"><span class="text-white/40">Restaurant:</span> ${c.verificationInfo?.isRestaurant ? 'Yes' : 'No'}</p>
              </div>
              <div class="flex gap-3">
                <button onclick="adminClaimDecision('${c._id}', 'approved')"
                  class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-2xl font-semibold text-sm">
                  ✅ Approve
                </button>
                <button onclick="adminClaimDecision('${c._id}', 'rejected')"
                  class="flex-1 bg-red-600/40 hover:bg-red-600/60 text-red-300 py-2.5 rounded-2xl font-semibold text-sm">
                  ❌ Reject
                </button>
              </div>
            </div>`).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-red-400">Failed to load claims: ${err.message}</div>`;
  }
}

window.adminClaimDecision = async function(claimId, decision) {
  const label = decision === 'approved' ? 'approve' : 'reject';
  if (!confirm(`Are you sure you want to ${label} this claim?`)) return;
  try {
    await apiPost(`/admin/claims/${claimId}/decision`, { decision });
    showToast(decision === 'approved' ? '✅ Claim approved! Business ownership granted.' : '❌ Claim rejected.', decision === 'approved' ? 'success' : 'error');
    await loadAdminClaims(); // Refresh
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

window.switchAdminTab = async function(tab) {
  window.currentAdminTab = tab;

  // Fix: Use correct class name that actually exists in your sidebar
  document.querySelectorAll('.admin-tab').forEach(btn => {
    if (parseInt(btn.id.replace('adminTab', '')) === tab) {
      btn.classList.add('bg-emerald-600', 'text-white');
      btn.classList.remove('hover:bg-white/10');
    } else {
      btn.classList.remove('bg-emerald-600', 'text-white');
      btn.classList.add('hover:bg-white/10');
    }
  });

  const container = document.getElementById('adminMainContent');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
    </div>`;

try {
    if (tab === 0) await renderAdminDashboard();
    else if (tab === 1) await renderAdminUsers();
    else if (tab === 2) {                    // Moderation
      await loadModerationPanelSafe();
    } else if (tab === 3) await renderAdminBusinesses();
    else if (tab === 4) {                    // Claims
      await loadAdminClaimsSafe();
    } else if (tab === 5) await renderAdminBroadcast();
    else if (tab === 6) await renderAdminAnalytics();
    else if (tab === 7) await renderAdminReports();   // ← NEW REPORTS TAB
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="text-center py-20 text-red-400">
        Failed to load this tab.<br>
        <span class="text-white/50 text-sm">Check browser console for details</span>
      </div>`;
  }
};

// ─── MENU UPLOAD (owner dashboard) ───────────────────────────────────────────
window._pendingMenuFile = null;

window.handleMenuFileSelect = function (input) {
  const file = input.files[0];
  if (!file) return;
  const MAX = 5 * 1024 * 1024;
  if (file.size > MAX) { showToast('File too large. Max 5 MB.', 'error'); input.value = ''; return; }

  window._pendingMenuFile = file;
  const isImg = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';

  const box     = document.getElementById('menuPreviewBox');
  const img     = document.getElementById('menuPreviewImg');
  const pdfLbl  = document.getElementById('menuPdfLabel');
  const uploadBtn = document.getElementById('menuUploadBtn');

  if (box) box.classList.remove('hidden');
  if (uploadBtn) uploadBtn.classList.remove('hidden');

  if (isImg && img) {
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; img.classList.remove('hidden'); if (pdfLbl) pdfLbl.classList.add('hidden'); };
    reader.readAsDataURL(file);
  } else if (isPdf && pdfLbl) {
    pdfLbl.classList.remove('hidden');
    if (img) img.classList.add('hidden');
  }
};

window.uploadMenu = async function () {
  if (!window._pendingMenuFile) return;
  const btn = document.getElementById('menuUploadBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Uploading…'; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const res = await apiPost('/owner/business/menu', { menu: e.target.result }, 'PUT');
    if (res.message === 'Menu updated') {
      showToast('✅ Menu uploaded!');
      window._pendingMenuFile = null;
      const meRes = await apiGet('/auth/me');
      if (meRes.user) { currentUser = meRes.user; }
      loadPage('owner-dashboard');
    } else {
      showToast(res.message || 'Error uploading menu', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '📤 Upload Menu'; }
    }
  };
  reader.readAsDataURL(window._pendingMenuFile);
};

window.removeMenu = async function () {
  if (!confirm('Remove your menu from the listing?')) return;
  const res = await apiPost('/owner/business/menu', { menu: null }, 'PUT');
  if (res.message === 'Menu updated') {
    showToast('Menu removed');
    const meRes = await apiGet('/auth/me');
    if (meRes.user) { currentUser = meRes.user; }
    loadPage('owner-dashboard');
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// ─── NOTE: toggleRSVP and postShoutoutWithPhoto are defined above — duplicates removed ───

// ─── BIZ PHOTO GALLERY FUNCTIONS ─────────────────────────────────────────────
window.handleBizPhotoUpload = async function (bizId, input) {
  const files = Array.from(input.files);
  const business = allBusinesses.find(b => b._id === bizId);
  const currentCount = (business && business.photos) ? business.photos.length : 0;
  const slots = 5 - currentCount;
  if (slots <= 0) { showToast('Maximum 5 photos already uploaded', 'error'); input.value = ''; return; }

  const toUpload = files.slice(0, slots);
  if (files.length > slots) showToast(`Only ${slots} slot(s) left — uploading first ${slots}`, 'error');

  const base64s = await Promise.all(toUpload.map(file => new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} too large (max 5MB)`, 'error'); resolve(null); return; }
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  })));

  const validPhotos = base64s.filter(Boolean);
  if (!validPhotos.length) { input.value = ''; return; }

  const res = await apiPost('/owner/business/photos', { photos: validPhotos });
  if (res.message === 'Photos updated') {
    showToast('✅ Photos uploaded!');
    const meRes = await apiGet('/auth/me');
    if (meRes.user) currentUser = meRes.user;
    // Refresh directory data and re-open modal
    const dirData = await apiGet('/directory');
    allBusinesses = dirData.businesses;
    hideBusinessModal();
    showBusinessDetail(bizId);
  } else {
    showToast(res.message || 'Error uploading photos', 'error');
  }
  input.value = '';
};

window.deleteBizPhoto = async function (bizId, index) {
  if (!confirm('Remove this photo?')) return;
  const res = await apiDelete(`/owner/business/photos/${index}`);
  if (res.message === 'Photo deleted') {
    showToast('Photo removed');
    const meRes = await apiGet('/auth/me');
    if (meRes.user) currentUser = meRes.user;
    const dirData = await apiGet('/directory');
    allBusinesses = dirData.businesses;
    hideBusinessModal();
    showBusinessDetail(bizId);
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.openBizPhotoLightbox = function (bizId, startIndex) {
  const business = allBusinesses.find(b => b._id === bizId);
  if (!business || !business.photos || !business.photos.length) return;
  const images = business.photos;
  let current = startIndex;

  function render() {
    const existing = document.getElementById('bizPhotoLightbox');
    if (existing) existing.remove();
    const html = `
      <div id="bizPhotoLightbox" class="fixed inset-0 bg-black/95 z-[14000] flex items-center justify-center">
        <button onclick="document.getElementById('bizPhotoLightbox').remove()"
                class="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl font-bold transition z-10">✕</button>
        ${images.length > 1 ? `
          <button onclick="bizLightboxPrev()" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition z-10">‹</button>
          <button onclick="bizLightboxNext()" class="absolute right-16 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition z-10">›</button>` : ''}
        <div class="max-w-full max-h-full flex flex-col items-center px-16">
          <img src="${images[current]}" alt="Photo ${current+1}" class="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl">
          ${images.length > 1 ? `<p class="text-white/50 text-sm mt-3">${current+1} / ${images.length}</p>` : ''}
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  window.bizLightboxPrev = function () { current = (current - 1 + images.length) % images.length; render(); };
  window.bizLightboxNext = function () { current = (current + 1) % images.length; render(); };
  render();
};

// ─── Owner dashboard photo tab functions ─────────────────────────────────────
window.handleOwnerPhotoUpload = async function (input) {
  const files = Array.from(input.files);
  const biz = currentUser && currentUser.verifiedBusiness;
  const currentCount = (biz && biz.photos) ? biz.photos.length : 0;
  const slots = 5 - currentCount;
  if (slots <= 0) { showToast('Maximum 5 photos already uploaded', 'error'); input.value = ''; return; }

  const toUpload = files.slice(0, slots);
  if (files.length > slots) showToast(`Only ${slots} slot(s) left`, 'error');

  const base64s = await Promise.all(toUpload.map(file => new Promise((resolve) => {
    if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} too large (max 5MB)`, 'error'); resolve(null); return; }
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  })));

  const validPhotos = base64s.filter(Boolean);
  if (!validPhotos.length) { input.value = ''; return; }

  const res = await apiPost('/owner/business/photos', { photos: validPhotos });
  if (res.message === 'Photos updated') {
    showToast('✅ Photos uploaded!');
    const meRes = await apiGet('/auth/me');
    if (meRes.user) currentUser = meRes.user;
    renderOwnerPhotoGrid();
  } else {
    showToast(res.message || 'Error uploading photos', 'error');
  }
  input.value = '';
};

window.deleteOwnerPhoto = async function (index) {
  if (!confirm('Remove this photo?')) return;
  const res = await apiDelete(`/owner/business/photos/${index}`);
  if (res.message === 'Photo deleted') {
    showToast('Photo removed');
    const meRes = await apiGet('/auth/me');
    if (meRes.user) currentUser = meRes.user;
    renderOwnerPhotoGrid();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

function renderOwnerPhotoGrid() {
  const container = document.getElementById('ownerPhotoGrid');
  if (!container) return;
  const biz = currentUser && currentUser.verifiedBusiness;
  const photos = (biz && biz.photos) || [];
  if (!photos.length) {
    container.innerHTML = `<p class="col-span-3 text-white/40 text-sm text-center py-4">No photos uploaded yet. Add up to 5 photos.</p>`;
    return;
  }
  container.innerHTML = photos.map((src, i) => `
    <div class="relative aspect-square rounded-2xl overflow-hidden bg-white/10 group">
      <img src="${src}" alt="Photo ${i+1}" class="w-full h-full object-cover" loading="lazy">
      <button onclick="deleteOwnerPhoto(${i})"
              class="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs transition opacity-0 group-hover:opacity-100">✕</button>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// LOST & FOUND + MARKETPLACE — FULL MODALS & DETAIL VIEWS
// ─────────────────────────────────────────────────────────────────────────────

let currentLostItemId = null;
let currentMarketItemId = null;

// ====================== LOST & FOUND ======================

window.showPostLostItemModal = function() {
  if (!requireAuth('Sign in to post a lost/found item')) return;

  let modal = document.getElementById('lostItemModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'lostItemModal';
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[13000]';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div onclick="if(event.target.id==='lostItemModal')hideLostItemModal()" class="bg-white text-slate-900 w-full max-w-lg mx-4 rounded-3xl overflow-hidden">
      <div class="px-6 pt-6 pb-2">
        <h2 class="text-2xl font-bold mb-4">Post Lost or Found Item</h2>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-semibold mb-1">Type</label>
            <div class="flex gap-3">
              <button onclick="this.classList.add('bg-emerald-600','text-white');document.getElementById('lostType').value='lost';document.querySelectorAll('#lostItemModal button').forEach(b=>b!==this&&b.classList.remove('bg-emerald-600','text-white'))" class="flex-1 py-3 rounded-2xl border border-emerald-600">Lost</button>
              <button onclick="this.classList.add('bg-emerald-600','text-white');document.getElementById('lostType').value='found';document.querySelectorAll('#lostItemModal button').forEach(b=>b!==this&&b.classList.remove('bg-emerald-600','text-white'))" class="flex-1 py-3 rounded-2xl border border-emerald-600">Found</button>
            </div>
            <input type="hidden" id="lostType" value="lost">
          </div>

          <input id="lostTitle" type="text" placeholder="Title (e.g. Lost Black Wallet)" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none">
          
          <textarea id="lostDesc" rows="3" placeholder="Describe the item..." class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none"></textarea>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold mb-1">Location</label>
              <input id="lostLocation" type="text" placeholder="Milledgeville, GA" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none">
            </div>
            <div>
              <label class="block text-sm font-semibold mb-1">Date</label>
              <input id="lostDate" type="date" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none">
            </div>
          </div>

          <label class="flex items-center gap-2">
            <input type="checkbox" id="isPet" class="w-5 h-5 accent-emerald-600">
            <span class="font-medium">This is a lost pet 🐾</span>
          </label>

          <div>
            <label class="block text-sm font-semibold mb-2">Photos (optional)</label>
            <input type="file" id="lostImages" multiple accept="image/*" class="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">
          </div>
        </div>
      </div>

      <div class="p-6 border-t flex gap-3">
        <button onclick="hideLostItemModal()" class="flex-1 py-4 rounded-3xl border border-slate-300 font-semibold">Cancel</button>
        <button onclick="postLostItem()" class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-semibold">Post Item</button>
      </div>
    </div>`;

  modal.style.display = 'flex';
};

window.hideLostItemModal = function() {
  const modal = document.getElementById('lostItemModal');
  if (modal) modal.remove();
};

window.postLostItem = async function() {
  const title = document.getElementById('lostTitle').value.trim();
  const description = document.getElementById('lostDesc').value.trim();
  if (!title || !description) return alert("Title and description required");

  const files = document.getElementById('lostImages').files;
  let images = [];
  if (files.length) {
    for (let file of files) {
      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      images.push(base64);
    }
  }

  const payload = {
    title,
    description,
    type: document.getElementById('lostType').value,
    isPet: document.getElementById('isPet').checked,
    location: document.getElementById('lostLocation').value.trim(),
    date: document.getElementById('lostDate').value || undefined,
    images
  };

  const res = await apiPost('/lostitems', payload);
  if (res._id) {
    showToast('✅ Item posted!');
    hideLostItemModal();
    loadPage('lostfound');
  } else {
    alert(res.message || 'Error posting item');
  }
};

window.showLostItemDetail = async function(id) {
  currentLostItemId = id;
  
  try {
    const res = await apiGet('/lostitems');
    const items = res.items || res;                    // handle both formats
    
    const item = Array.isArray(items) 
      ? items.find(i => String(i._id) === String(id)) 
      : null;

    if (!item) {
      showToast('Item not found', 'error');
      return;
    }

    const isOwner = item.owner && 
      String(item.owner._id || item.owner) === String(currentUser?._id || '');

    let html = `
      <div class="fixed inset-0 bg-black/70 z-[14000] flex items-center justify-center p-4">
        <div class="bg-white text-slate-900 w-full max-w-2xl rounded-3xl max-h-[90vh] overflow-auto">
          <div class="sticky top-0 bg-white px-6 py-4 border-b flex justify-between items-center">
            <h2 class="text-xl font-bold">${item.title}</h2>
            <button onclick="hideLostDetailModal()" class="text-3xl leading-none">×</button>
          </div>
          
          <div class="p-6">
            ${item.images && item.images.length ? 
              `<div class="grid grid-cols-2 gap-3 mb-6">${item.images.map(src => `<img src="${src}" class="rounded-2xl w-full aspect-square object-cover">`).join('')}</div>` : ''}
            
            <p class="text-slate-700 leading-relaxed">${item.description}</p>
            
            <div class="flex gap-6 text-sm mt-6">
              <div><span class="font-semibold">Type:</span> ${item.type.toUpperCase()}</div>
              ${item.isPet ? `<div class="text-amber-600">🐾 Lost Pet</div>` : ''}
              ${item.location ? `<div><span class="font-semibold">📍</span> ${item.location}</div>` : ''}
            </div>

            <div class="mt-8">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold">💬 Comments</h3>
                ${!isOwner && item.owner ? `
                  <button onclick="showComposeMessageModal('${item.owner?._id || item.owner}', '${item.owner?.name || 'Owner'}')" 
                          class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-2xl font-semibold transition">
                    ✉️ Message Owner
                  </button>` : ''}
              </div>
              <div id="lostCommentsContainer" class="space-y-4"></div>
              
              <div class="mt-6">
                <textarea id="lostCommentInput" rows="2" class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none" placeholder="Write a comment..."></textarea>
                <button onclick="postLostComment()" class="mt-3 bg-emerald-600 text-white px-8 py-3 rounded-3xl font-semibold">Post Comment</button>
              </div>
            </div>
          </div>

          ${isOwner ? `
          <div class="p-6 border-t bg-emerald-50 flex justify-end">
            <button onclick="markLostResolved()" class="bg-emerald-600 text-white px-8 py-3 rounded-3xl font-semibold">Mark as Resolved ✅</button>
          </div>` : ''}
        </div>
      </div>`;

    const detailDiv = document.createElement('div');
    detailDiv.id = 'lostDetailModal';
    detailDiv.innerHTML = html;
    document.body.appendChild(detailDiv);

    renderLostComments(item);

  } catch (e) {
    console.error(e);
    showToast('Failed to load item', 'error');
  }
};

window.hideLostDetailModal = function() {
  const modal = document.getElementById('lostDetailModal');
  if (modal) modal.remove();
};

window.postLostComment = async function() {
  const input = document.getElementById('lostCommentInput');
  if (!input || !input.value.trim()) return;
  
  await apiPost(`/lostitems/${currentLostItemId}/comments`, { text: input.value.trim() });
  input.value = '';

  // Safe reload
  try {
    const res = await apiGet('/lostitems');
    const items = res.items || res;
    const item = Array.isArray(items) ? items.find(i => String(i._id) === String(currentLostItemId)) : null;
    if (item) renderLostComments(item);
  } catch (e) {
    console.error(e);
  }
};

async function renderLostComments(item) {
  const container = document.getElementById('lostCommentsContainer');
  if (!container || !item) {
    if (container) container.innerHTML = '<p class="text-slate-400 text-center py-4">No comments yet</p>';
    return;
  }

  const comments = item.comments || [];

  if (!comments.length) {
    container.innerHTML = '<p class="text-slate-400 text-center py-4">No comments yet — be the first!</p>';
    return;
  }

  let html = '';
  comments.forEach(c => {
    const authorId = c.authorId?._id || c.authorId;
    const authorName = c.author || 'Anonymous';

    html += `<div class="bg-slate-100 rounded-2xl p-4">
      <p onclick="event.stopImmediatePropagation(); showUserProfileModal('${authorId}')" 
         class="font-medium cursor-pointer hover:underline">${authorName}</p>
      <p class="text-slate-700">${c.text || ''}</p>
    </div>`;
  });

  container.innerHTML = html;
}

window.markLostResolved = async function() {
  if (!currentLostItemId) return;
  if (!confirm('Mark this item as resolved?')) return;
  try {
    const res = await apiPost(`/lostitems/${currentLostItemId}/resolve`, {});
    showToast('✅ Marked as resolved!');
    hideLostDetailModal();
    loadPage('lostfound');
  } catch (e) {
    showToast('Error marking resolved', 'error');
  }
};

// ====================== MARKETPLACE ======================

window.showPostMarketplaceModal = function() {
  if (!requireAuth('Sign in to sell something')) return;

  let modal = document.getElementById('marketModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'marketModal';
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[13000]';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div onclick="if(event.target.id==='marketModal')hideMarketModal()" class="bg-white text-slate-900 w-full max-w-lg mx-4 rounded-3xl overflow-hidden">
      <div class="px-6 pt-6 pb-2">
        <h2 class="text-2xl font-bold mb-4">Post Marketplace Listing</h2>
        
        <input id="marketTitle" type="text" placeholder="Item title" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none mb-4">
        <textarea id="marketDesc" rows="3" placeholder="Description" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none mb-4"></textarea>
        
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-semibold mb-1">Price ($)</label>
            <input id="marketPrice" type="number" placeholder="25" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none">
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1">Condition</label>
            <select id="marketCondition" class="w-full px-4 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none">
              <option value="new">New</option>
              <option value="like-new">Like New</option>
              <option value="used" selected>Used</option>
              <option value="fair">Fair</option>
            </select>
          </div>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-semibold mb-2">Photos</label>
          <input type="file" id="marketImages" multiple accept="image/*" class="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">
        </div>
      </div>

      <div class="p-6 border-t flex gap-3">
        <button onclick="hideMarketModal()" class="flex-1 py-4 rounded-3xl border border-slate-300 font-semibold">Cancel</button>
        <button onclick="postMarketplaceItem()" class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-semibold">Post Listing</button>
      </div>
    </div>`;
  modal.style.display = 'flex';
};

window.hideMarketModal = function() {
  const modal = document.getElementById('marketModal');
  if (modal) modal.remove();
};

window.postMarketplaceItem = async function() {
  const title = document.getElementById('marketTitle').value.trim();
  const description = document.getElementById('marketDesc').value.trim();
  const price = parseFloat(document.getElementById('marketPrice').value);

  if (!title || !description || !price) return alert("Title, description and price required");

  const files = document.getElementById('marketImages').files;
  let images = [];
  if (files.length) {
    for (let file of files) {
      const base64 = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = e => r(e.target.result);
        reader.readAsDataURL(file);
      });
      images.push(base64);
    }
  }

  const payload = { title, description, price, images, condition: document.getElementById('marketCondition').value };
  const res = await apiPost('/marketplace', payload);

  if (res._id) {
    showToast('✅ Listing posted!');
    hideMarketModal();
    loadPage('marketplace');
  }
};

window.showMarketplaceDetail = async function(id) {
  currentMarketItemId = id;
  
  try {
    // First try cached data (instant)
    let item = allMarketplaceItems.find(i => String(i._id) === String(id));

    // If not in cache, fetch once and cache it
    if (!item) {
      const res = await apiGet('/marketplace');
      allMarketplaceItems = res.items || res || [];
      item = allMarketplaceItems.find(i => String(i._id) === String(id));
    }

    if (!item) {
      showToast('Item not found', 'error');
      return;
    }

    const isSeller = item.seller && 
      String(item.seller._id || item.seller) === String(currentUser?._id || '');

    let html = `
      <div class="fixed inset-0 bg-black/70 z-[14000] flex items-center justify-center p-4">
        <div class="bg-white text-slate-900 w-full max-w-2xl rounded-3xl max-h-[90vh] overflow-auto">
          <div class="sticky top-0 bg-white px-6 py-4 border-b flex justify-between">
            <div>
              <h2 class="text-xl font-bold">${item.title}</h2>
              <p class="text-3xl font-bold text-emerald-600">$${item.price}</p>
            </div>
            <button onclick="hideMarketDetailModal()" class="text-3xl">×</button>
          </div>
          
          <div class="p-6">
            ${item.images && item.images.length ? 
              `<div class="grid grid-cols-3 gap-3 mb-6">${item.images.map(src => `<img src="${src}" class="rounded-2xl aspect-square object-cover">`).join('')}</div>` : ''}
            
            <p class="text-slate-700">${item.description || ''}</p>
            
            <div class="mt-8">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold">💬 Comments</h3>
                ${!isSeller && item.seller ? `
                  <button onclick="showComposeMessageModal('${item.seller?._id || item.seller}', '${item.seller?.name || 'Seller'}')" 
                          class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-2xl font-semibold transition">
                    ✉️ Message Seller
                  </button>` : ''}
              </div>
              <div id="marketCommentsContainer" class="space-y-4"></div>
              
              <div class="mt-6">
                <textarea id="marketCommentInput" rows="2" class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-500 outline-none" placeholder="Write a comment..."></textarea>
                <button onclick="postMarketComment()" class="mt-3 bg-emerald-600 text-white px-8 py-3 rounded-3xl font-semibold">Post Comment</button>
              </div>
            </div>
          </div>

          ${isSeller ? `
          <div class="p-6 border-t bg-amber-50 flex justify-end">
            <button onclick="markMarketSold()" class="bg-amber-600 text-white px-8 py-3 rounded-3xl font-semibold">Mark as Sold ✅</button>
          </div>` : ''}
        </div>
      </div>`;

    const div = document.createElement('div');
    div.id = 'marketDetailModal';
    div.innerHTML = html;
    document.body.appendChild(div);

    renderMarketComments(item);

  } catch (e) {
    console.error(e);
    showToast('Failed to load item', 'error');
  }
};

window.hideMarketDetailModal = function() {
  const modal = document.getElementById('marketDetailModal');
  if (modal) modal.remove();
};

window.postMarketComment = async function() {
  const input = document.getElementById('marketCommentInput');
  if (!input || !input.value.trim()) return;

  await apiPost(`/marketplace/${currentMarketItemId}/comments`, { text: input.value.trim() });
  
  input.value = '';

  // Reload the item safely
  try {
    const res = await apiGet('/marketplace');
    const items = res.items || res;                    // handle both {items: []} and [] formats
    const item = Array.isArray(items) 
      ? items.find(i => String(i._id) === String(currentMarketItemId)) 
      : null;

    if (item) renderMarketComments(item);
  } catch (e) {
    console.error('Failed to refresh comments', e);
  }
};

function renderMarketComments(item) {
  const container = document.getElementById('marketCommentsContainer');
  if (!container || !item) return;

  const comments = item.comments || [];
  
  if (!comments.length) {
    container.innerHTML = '<p class="text-slate-400 text-center py-4">No comments yet — be the first!</p>';
    return;
  }

  container.innerHTML = comments.map(c => {
    const authorId = c.authorId?._id || c.authorId;
    return `<div class="bg-slate-100 rounded-2xl p-4">
      <p onclick="event.stopImmediatePropagation(); showUserProfileModal('${authorId}')" 
         class="font-medium cursor-pointer hover:underline">${c.author || 'Anonymous'}</p>
      <p class="text-slate-700">${c.text}</p>
    </div>`;
  }).join('');
}

window.markMarketSold = async function() {
  if (confirm('Mark this item as sold?')) {
    await apiPost(`/marketplace/${currentMarketItemId}/sold`, {});
    hideMarketDetailModal();
    loadPage('marketplace');
  }
};

async function loadLostFoundPage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">🔎 Lost & Found</h1>
        <button onclick="showPostLostItemModal()" 
                class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">📤</span> Post Item
        </button>
      </div>

      <!-- Search + Filters -->
      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <input id="lostSearchInput" type="text" placeholder="Search lost & found items..." 
               class="flex-1 bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400">

<select id="lostTypeFilter" onchange="filterAndRenderLostItems()"
        class="bg-white/10 border border-white/30 rounded-3xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400 focus:bg-white/20 appearance-none">
  <option value="all" class="bg-slate-900 text-white">All Items</option>
  <option value="lost" class="bg-slate-900 text-white">Lost Only</option>
  <option value="found" class="bg-slate-900 text-white">Found Only</option>
</select>
      </div>

      <div id="lostItemsList" class="space-y-4"></div>
      <div id="lostPagination" class="flex justify-center gap-3 mt-8"></div>
    </div>`;

  window.currentLostPage = 1;
  window.currentLostSearch = '';
  window.currentLostFilter = 'all';

  // Live search
  document.getElementById('lostSearchInput').addEventListener('input', debounce(() => {
    window.currentLostSearch = document.getElementById('lostSearchInput').value.trim().toLowerCase();
    window.currentLostPage = 1;
    renderLostItemsPage();
  }, 300));

  await renderLostItemsPage();
}

async function renderLostItemsPage() {
  const res = await apiGet(`/lostitems?page=${window.currentLostPage}&limit=8`);
  const items = res.items || [];
  const pagination = res.pagination || {};

  const container = document.getElementById('lostItemsList');
  
  let filtered = items.filter(item => {
    const matchesSearch = !window.currentLostSearch || 
      item.title.toLowerCase().includes(window.currentLostSearch) ||
      item.description.toLowerCase().includes(window.currentLostSearch);
    
    const matchesFilter = window.currentLostFilter === 'all' || 
      item.type === window.currentLostFilter;
    
    return matchesSearch && matchesFilter;
  });

  let html = '';
  if (filtered.length === 0) {
    html = `<p class="text-white/40 text-center py-16">No items found.</p>`;
  } else {
    html = filtered.map(item => `
      <div id="lost-${item._id}" onclick="showLostItemDetail('${item._id}')" 
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition">
        <div class="flex gap-4">
          ${item.images?.[0] ? 
            `<img src="${item.images[0]}" class="w-24 h-24 object-cover rounded-2xl flex-shrink-0" alt="">` : 
            `<div class="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center text-5xl">🔎</div>`}
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <span class="px-3 py-1 text-xs font-bold rounded-full ${item.type === 'lost' ? 'bg-red-500' : 'bg-emerald-500'}">
                ${item.type.toUpperCase()}
              </span>
              ${item.isPet ? `<span class="text-amber-400 text-sm">🐾 Lost Pet</span>` : ''}
            </div>
            
            <h3 class="font-semibold text-lg mt-2">${item.title}</h3>
            <p class="text-white/70 line-clamp-2">${item.description}</p>
            
            <div class="flex items-center gap-2 mt-4 text-xs text-white/50">
              <span>📍 ${item.location || 'Unknown'}</span>
              <span>·</span>
              ${renderClickableUser(item.owner, item.authorName || 'Anonymous')}
              <span>·</span>
              <span>${timeAgo(item.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
  renderLostPagination(pagination);
}

function renderLostPagination(p) {
  const container = document.getElementById('lostPagination');
  if (!p.totalPages || p.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button onclick="changeLostPage(${Math.max(1, window.currentLostPage-1)})" 
            class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 ${!p.hasPrev ? 'opacity-40 pointer-events-none' : ''}">
      ← Prev
    </button>
    <span class="px-6 py-3 text-white/70">Page ${p.currentPage} of ${p.totalPages}</span>
    <button onclick="changeLostPage(${Math.min(p.totalPages, window.currentLostPage+1)})" 
            class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 ${!p.hasNext ? 'opacity-40 pointer-events-none' : ''}">
      Next →
    </button>`;

  container.innerHTML = html;
}

window.changeLostPage = function(page) {
  window.currentLostPage = page;
  renderLostItemsPage();
};

window.filterAndRenderLostItems = function() {
  window.currentLostFilter = document.getElementById('lostTypeFilter').value;
  window.currentLostPage = 1;
  renderLostItemsPage();
};

async function loadMarketplacePage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">🛒 Marketplace</h1>
        <button onclick="showPostMarketplaceModal()" 
                class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">📤</span> Sell Something
        </button>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <input id="marketSearchInput" type="text" placeholder="Search items..." 
               class="flex-1 bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400">
        
        <select id="marketConditionFilter" onchange="filterAndRenderMarketplace()"
                class="bg-white/10 border border-white/30 rounded-3xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
          <option value="all">All Conditions</option>
          <option value="new">New</option>
          <option value="like-new">Like New</option>
          <option value="used">Used</option>
          <option value="fair">Fair</option>
        </select>
      </div>

      <div id="marketItemsList" class="space-y-4 min-h-[400px]"></div>
    </div>`;

  // Load data once and cache it
  if (allMarketplaceItems.length === 0) {
    try {
      const res = await apiGet('/marketplace');
      allMarketplaceItems = res.items || res || [];
    } catch (e) {
      console.error(e);
    }
  }

  window.currentMarketSearch = '';
  window.currentMarketFilter = 'all';

  const searchInput = document.getElementById('marketSearchInput');
  searchInput.addEventListener('input', debounce(() => {
    window.currentMarketSearch = searchInput.value.trim().toLowerCase();
    renderMarketplacePage();
  }, 250));

  renderMarketplacePage();
}

async function renderMarketplacePage() {
  const container = document.getElementById('marketItemsList');
  if (!container) return;

  container.innerHTML = `<div class="py-20 text-center text-white/40">Loading marketplace...</div>`;

  let filtered = allMarketplaceItems;

  if (window.currentMarketSearch) {
    filtered = filtered.filter(item => 
      (item.title || '').toLowerCase().includes(window.currentMarketSearch) ||
      (item.description || '').toLowerCase().includes(window.currentMarketSearch)
    );
  }

  if (window.currentMarketFilter !== 'all') {
    filtered = filtered.filter(item => item.condition === window.currentMarketFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-white/40 text-center py-20">No listings found.</p>`;
    return;
  }

  let html = filtered.map(item => `
    <div onclick="showMarketplaceDetail('${item._id}')" 
         class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition active:scale-[0.98]">
      <div class="flex gap-4">
        ${item.images?.[0] ? 
          `<img src="${item.images[0]}" class="w-24 h-24 object-cover rounded-2xl flex-shrink-0" alt="">` : 
          `<div class="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center text-5xl flex-shrink-0">🛒</div>`}
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start">
            <h3 class="font-semibold text-lg leading-tight pr-2">${item.title}</h3>
            <p class="text-2xl font-bold text-emerald-400 whitespace-nowrap">$${item.price}</p>
          </div>
          <p class="text-white/70 line-clamp-2 mt-1">${item.description || ''}</p>
          <div class="flex items-center gap-2 mt-4 text-xs text-white/60">
            <span class="px-3 py-1 bg-white/10 rounded-full">${item.condition}</span>
            <span>${timeAgo(item.createdAt)}</span>
            <span class="text-white/40">•</span>
            ${renderClickableUser(item.seller)}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
}

function renderMarketPagination(p) {
  const container = document.getElementById('marketPagination');
  if (!p.totalPages || p.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button onclick="changeMarketPage(${Math.max(1, window.currentMarketPage-1)})" 
            class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 ${!p.hasPrev ? 'opacity-40 pointer-events-none' : ''}">
      ← Prev
    </button>
    <span class="px-6 py-3 text-white/70">Page ${p.currentPage} of ${p.totalPages}</span>
    <button onclick="changeMarketPage(${Math.min(p.totalPages, window.currentMarketPage+1)})" 
            class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 ${!p.hasNext ? 'opacity-40 pointer-events-none' : ''}">
      Next →
    </button>`;

  container.innerHTML = html;
}

window.changeMarketPage = function(page) {
  window.currentMarketPage = page;
  renderMarketplacePage();
};

window.filterAndRenderMarketplace = function() {
  window.currentMarketFilter = document.getElementById('marketConditionFilter').value;
  window.currentMarketPage = 1;
  renderMarketplacePage();
};

// Simple debounce helper
function debounce(func, delay) {
  let timeout;
  return function() {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, arguments), delay);
  };
}

// ─── SAFE LOADERS FOR ORIGINAL PANELS ─────────────────────────────────────
async function loadModerationPanelSafe() {
  try {
    await loadModerationPanel();
  } catch (e) {
    console.error(e);
    const container = document.getElementById('adminMainContent');
    if (container) container.innerHTML = `<div class="p-8 text-red-400">Moderation panel crashed.</div>`;
  }
}

async function loadAdminClaimsSafe() {
  try {
    await loadAdminClaims();
  } catch (e) {
    console.error(e);
    const container = document.getElementById('adminMainContent');
    if (container) container.innerHTML = `<div class="p-8 text-red-400">Claims panel crashed.</div>`;
  }
}

// ====================== MESSAGING SYSTEM ======================
async function loadMessagesPage(content) {
  if (!requireAuth('Sign in to access messages')) return;
  _setBadge(0);

  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-10">

      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Messages</h1>
          <p class="text-white/40 text-sm mt-0.5">Your private conversations</p>
        </div>
        <button onclick="showComposeMessageModal()"
                class="bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-900/40 px-5 py-2.5 rounded-2xl font-semibold text-sm flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Compose
        </button>
      </div>

      <!-- Tab switcher -->
      <div class="relative flex bg-white/5 border border-white/10 rounded-2xl p-1 mb-6 gap-1">
        <button onclick="switchMessageTab(0)" id="msgTab0"
                class="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all bg-emerald-600 text-white shadow-sm">
          📥 Inbox
        </button>
        <button onclick="switchMessageTab(1)" id="msgTab1"
                class="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all text-white/50 hover:text-white/80">
          📤 Sent
        </button>
      </div>

      <div id="messagesList" class="space-y-3"></div>
    </div>`;

    window.currentMessageTab = 0;
  const msgs = await renderMessagesList(0);
  if (msgs && msgs.length > 0) {
    markMessagesAsRead(msgs); // pass already-fetched msgs to avoid extra API call + race condition
  }
}

async function markMessagesAsRead(inboxMsgs = null) {
  if (!currentUser) return;
  _setBadge(0);
  try {
    const inbox = inboxMsgs || await apiGet('/messages/inbox');
    const unreadSenders = [...new Set(
      inbox
        .filter(m => !m.read && String(m.receiver?._id || m.receiver) === String(currentUser._id))
        .map(m => m.sender?._id || m.sender)
        .filter(Boolean)
    )];
    await Promise.all(
      unreadSenders.map(senderId => apiPost('/messages/mark-as-read', { otherId: senderId }).catch(() => {}))
    );
  } catch (e) {
    console.warn('⚠️ markMessagesAsRead partial failure:', e);
  }
}

async function renderMessagesList(tab) {
  const container = document.getElementById('messagesList');
  if (!container) return [];

  // Guard: wait for currentUser if not ready yet (prevents crash on initial load)
  if (typeof currentUser === 'undefined' || !currentUser?._id) {
    console.warn('[Messages] currentUser not ready yet, retrying in 300ms...');
    setTimeout(() => renderMessagesList(tab), 300);
    return [];
  }

  let msgs = [];
  try {
    const raw = tab === 0
      ? await apiGet('/messages/inbox')
      : await apiGet('/messages/outbox');
    msgs = Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('Failed to load messages', e);
    container.innerHTML = `<p class="text-white/50 text-center py-8">Failed to load messages</p>`;
    return [];
  }

  // Group by the OTHER person so we only show ONE card per conversation
  const conversations = {};
  const myId = String(currentUser._id); // normalize to string for safe comparison

  msgs.forEach(m => {
    const other = tab === 0 ? m.sender : m.receiver;
    let otherId = other?._id || other;
    if (!otherId) return;

    otherId = String(otherId); // normalize to string
    if (otherId === myId) return; // skip self

    if (!conversations[otherId]) {
      conversations[otherId] = {
        otherId: otherId,
        otherName: other?.name || other || 'User',
        lastMessage: m.text,
        timestamp: m.createdAt,
        unread: tab === 0 && !m.read
      };
    } else {
      // keep the newest message
      if (new Date(m.createdAt) > new Date(conversations[otherId].timestamp)) {
        conversations[otherId].lastMessage = m.text;
        conversations[otherId].timestamp = m.createdAt;
      }
    }
  });

  const conversationArray = Object.values(conversations)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let html = '';
  if (conversationArray.length === 0) {
    html = `
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-3xl mb-4">💬</div>
        <p class="text-white/40 font-medium">No messages yet</p>
        <p class="text-white/25 text-sm mt-1">Start a conversation with someone</p>
      </div>`;
  } else {
    conversationArray.forEach(conv => {
      // Generate a consistent avatar color from the name
      const colors = ['bg-violet-500','bg-sky-500','bg-rose-500','bg-amber-500','bg-teal-500','bg-pink-500','bg-indigo-500'];
      const colorIdx = conv.otherName.charCodeAt(0) % colors.length;
      const initials = conv.otherName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

      html += `
        <div data-other-id="${conv.otherId}"
             class="group relative bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] hover:border-white/[0.16] rounded-2xl p-4 flex gap-4 items-center transition-all cursor-pointer"
             onclick="openConversation('${conv.otherId}')">

          <!-- Avatar -->
          <div class="flex-shrink-0 relative">
            <div class="w-12 h-12 ${colors[colorIdx]} rounded-2xl flex items-center justify-center font-bold text-white text-sm shadow-lg">
              ${initials}
            </div>
            ${conv.unread ? `<span class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-900 shadow msg-new-pill"></span>` : ''}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 mb-0.5">
              <p class="font-semibold text-[15px] ${conv.unread ? 'text-white' : 'text-white/80'} truncate">${conv.otherName}</p>
              <span class="flex-shrink-0 text-[11px] text-white/35">${timeAgo(conv.timestamp)}</span>
            </div>
            <p class="text-sm ${conv.unread ? 'text-white/70 font-medium' : 'text-white/40'} truncate">${esc(conv.lastMessage)}</p>
          </div>

          <!-- Delete button -->
          <button onclick="event.stopPropagation(); confirmDeleteConversation('${conv.otherId}', '${conv.otherName.replace(/'/g, "\\'")}', ${tab})"
                  title="Delete conversation"
                  class="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all p-2 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>`;
    });
  }

  container.innerHTML = html;
  return msgs;
}

// ─── Delete conversation ─────────────────────────────────────────────────────
window.confirmDeleteConversation = function(otherId, otherName, tab) {
  const modalHTML = `
    <div id="deleteConvModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[25000]">
      <div class="bg-white text-slate-900 rounded-3xl max-w-sm w-full mx-4 p-6 shadow-2xl">
        <div class="text-center mb-5">
          <div class="text-4xl mb-3">🗑️</div>
          <h3 class="text-xl font-bold">Delete Conversation</h3>
          <p class="text-slate-500 text-sm mt-2">
            Remove your copy of all messages with <strong>${otherName}</strong>?
            This only affects your view — the other person's messages are unaffected.
          </p>
        </div>
        <div class="flex gap-3">
          <button onclick="document.getElementById('deleteConvModal').remove()"
                  class="flex-1 py-3 border border-slate-200 rounded-3xl font-semibold hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onclick="deleteConversation('${otherId}', ${tab})"
                  class="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-3xl font-semibold transition">
            Delete
          </button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

window.deleteConversation = async function(otherId, tab) {
  const modal = document.getElementById('deleteConvModal');
  if (modal) modal.remove();

  // Optimistically remove the row immediately so it feels instant
  const row = document.querySelector(`[data-other-id="${otherId}"]`);
  if (row) row.remove();

  try {
    const res = await apiDelete(`/messages/conversation/${otherId}`);
    if (res.deleted !== undefined || res.message) {
      showToast('🗑️ Conversation deleted');
      updateMessageBadge();
    } else {
      showToast('Could not delete — please try again', 'error');
      renderMessagesList(tab); // restore on failure
    }
  } catch (e) {
    console.error('Delete conversation error:', e);
    showToast('Network error — could not delete', 'error');
    renderMessagesList(tab);
  }
};

// ====================== FIXED COMPOSE MODAL (high z-index + pre-fill) ======================
window.showComposeMessageModal = function(preSelectedUserId = null, preSelectedName = 'User') {
  hideUserProfileModal();
  hideMarketDetailModal();
  hideLostDetailModal();

  const modalHTML = `
    <div id="composeModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-[20000]">
      <div onclick="if(event.target.id==='composeModal')hideComposeModal()"
           class="bg-slate-950 border border-white/10 w-full max-w-lg mx-0 md:mx-4 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">New Message</h2>
          <button onclick="hideComposeModal()"
                  class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all text-lg leading-none">
            ×
          </button>
        </div>

        <div class="p-6 space-y-4">
          ${preSelectedUserId ? `
          <div class="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div class="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">
              ${preSelectedName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="text-[11px] text-emerald-400/70 font-medium uppercase tracking-wide">To</p>
              <p class="text-sm font-semibold text-emerald-300">${preSelectedName}</p>
            </div>
            <input type="hidden" id="composeReceiverId" value="${preSelectedUserId}">
          </div>` : `
          <div>
            <label class="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">Recipient ID</label>
            <input id="composeRecipientId" type="text" placeholder="Paste user ID…"
                   class="w-full bg-white/[0.07] border border-white/[0.12] focus:border-emerald-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none transition-all">
            <p class="text-[11px] text-white/30 mt-1.5">Tip: click any username on the site to message them directly</p>
          </div>`}

          <div>
            <label class="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">Message</label>
            <textarea id="composeText" rows="5"
                      class="w-full bg-white/[0.07] border border-white/[0.12] focus:border-emerald-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none transition-all resize-none"
                      placeholder="Write your message…"></textarea>
          </div>

          <div class="flex gap-3 pt-1">
            <button onclick="hideComposeModal()"
                    class="flex-1 py-3.5 bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 rounded-2xl font-semibold text-sm transition-all">
              Cancel
            </button>
            <button onclick="sendComposedMessage()"
                    class="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] rounded-2xl font-semibold text-sm transition-all shadow-lg shadow-emerald-900/40">
              Send Message
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const div = document.createElement('div');
  div.innerHTML = modalHTML;
  document.body.appendChild(div);
};

window.hideComposeModal = function() {
  const modal = document.getElementById('composeModal');
  if (modal) modal.remove();
};

updateMessageBadge();

window.sendComposedMessage = async function() {
  const receiverId = document.getElementById('composeReceiverId') 
    ? document.getElementById('composeReceiverId').value 
    : document.getElementById('composeRecipientId')?.value.trim();

  const text = document.getElementById('composeText').value.trim();

  if (!receiverId || !text) {
    alert('User ID and message are required');
    return;
  }

  const res = await apiPost('/messages', { receiverId, text });

  if (res._id || res.message?.includes('sent')) {
    showToast('✅ Message sent!');
    hideComposeModal();
    loadMessagesPage(document.getElementById('content'));
  } else {
    alert(res.message || 'Failed to send message');
  }
};

// ─── FULL INBOX / CONVERSATION SYSTEM ───────────────────────────────────────
window.switchMessageTab = async function(tab) {
  window.currentMessageTab = tab;

  const tab0 = document.getElementById('msgTab0');
  const tab1 = document.getElementById('msgTab1');
  if (tab0) {
    tab0.className = tab === 0
      ? 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all bg-emerald-600 text-white shadow-sm'
      : 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all text-white/50 hover:text-white/80';
    tab0.textContent = '📥 Inbox';
  }
  if (tab1) {
    tab1.className = tab === 1
      ? 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all bg-emerald-600 text-white shadow-sm'
      : 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all text-white/50 hover:text-white/80';
    tab1.textContent = '📤 Sent';
  }

  const msgs = await renderMessagesList(tab);

  if (tab === 0) {
    markMessagesAsRead(msgs); // pass already-fetched messages — avoids a 3rd API call
  }
  updateMessageBadge();
};

window.openConversation = async function(otherId) {
  hideConversationModal(); // close any old one

  // ── Instantly remove the "new" badge from this conversation row ──────────
  _setBadge(Math.max(0, _unreadCount - 1));
  // Also visually clear the "new" pill on the inbox list row for this otherId
  document.querySelectorAll(`[data-other-id="${otherId}"] .msg-new-pill`).forEach(el => el.remove());
  const modalHTML = `
    <div id="conversationModal" onclick="if(event.target.id==='conversationModal')hideConversationModal()" 
         class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-[16000] p-0 md:p-4">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-slate-950 border border-white/10 w-full max-w-lg rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col shadow-2xl">

        <!-- Chat header -->
        <div class="px-5 py-4 border-b border-white/10 flex items-center gap-3 bg-slate-900/80 backdrop-blur">
          <button onclick="hideConversationModal()"
                  class="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-all -ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-[16px] truncate" id="chatWithName">Chat</h3>
            <p class="text-[11px] text-white/40">Private message</p>
          </div>
        </div>

        <!-- Message thread -->
        <div id="conversationThread" class="flex-1 overflow-y-auto px-4 py-5 space-y-3 bg-slate-950"
             style="background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0); background-size: 28px 28px;">
        </div>

        <!-- Reply bar -->
        <div class="px-4 py-4 border-t border-white/10 bg-slate-900/80 backdrop-blur flex gap-3 items-end">
          <input id="replyInput" type="text" placeholder="Type a message…"
                 onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();sendReply('${otherId}');}"
                 class="flex-1 bg-white/[0.07] border border-white/[0.12] focus:border-emerald-500/50 focus:bg-white/[0.09] rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none transition-all">
          <button onclick="sendReply('${otherId}')"
                  class="flex-shrink-0 bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/50">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
  
  const modal = document.createElement('div');
  modal.innerHTML = modalHTML;
  document.body.appendChild(modal.firstElementChild);

  await loadConversationThread(otherId);
  markConversationAsRead(otherId);   // ← THIS IS THE KEY LINE
};

window.hideConversationModal = function() {
  const modal = document.getElementById('conversationModal');
  if (modal) modal.remove();
};

async function loadConversationThread(otherId) {
  const container = document.getElementById('conversationThread');
  if (!container) return;

  try {
    const messages = await apiGet(`/messages/conversation/${otherId}`);
    const nameEl = document.getElementById('chatWithName');
    if (nameEl && messages.length > 0) {
      nameEl.textContent = messages[0].sender?._id === currentUser._id 
        ? messages[0].receiver?.name || 'User' 
        : messages[0].sender?.name || 'User';
    }

    let html = '';
    messages.forEach(m => {
      const isMine = String(m.sender?._id || m.sender) === String(currentUser._id);
      html += `
        <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[78%]">
            <div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm
                        ${isMine
                          ? 'bg-emerald-600 text-white rounded-br-md'
                          : 'bg-white/10 text-white/90 rounded-bl-md border border-white/[0.08]'}">
              ${esc(m.text)}
            </div>
            <p class="text-[10px] text-white/30 mt-1 ${isMine ? 'text-right pr-1' : 'pl-1'}">${timeAgo(m.createdAt)}</p>
          </div>
        </div>`;
    });

    container.innerHTML = html || `
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="text-4xl mb-3 opacity-30">💬</div>
        <p class="text-white/30 text-sm">No messages yet — say hello!</p>
      </div>`;
    container.scrollTop = container.scrollHeight;

    markConversationAsRead(otherId);   // ← extra safety
  } catch (e) {
    console.error('Failed to load conversation thread', e);
  }
}

window.sendReply = async function(otherId) {
  const input = document.getElementById('replyInput');
  const text = input.value.trim();
  if (!text) return;

  await apiPost('/messages', { receiverId: otherId, text });
  input.value = '';
  await loadConversationThread(otherId);
  updateMessageBadge();
};

// ─── Global exports ───────────────────────────────────────────────────────────
window.loadLostFoundPage     = loadLostFoundPage;
window.loadMarketplacePage   = loadMarketplacePage;
window.loadResourcesPage     = loadResourcesPage;
window.loadPage              = loadPage;
window.postShoutout          = postShoutoutWithPhoto;
window.navigate              = loadPage;
window.filterDirectory       = filterDirectory;
window.filterByCategory      = filterByCategory;
window.showBusinessDetail    = showBusinessDetail;
window.hideBusinessModal     = hideBusinessModal;
window.switchAdminTab        = switchAdminTab;
window.renderDirectory       = renderDirectory;
window.getDirections = function(address) {
  if (!address) {
    showToast('No address available for this business', 'error');
    return;
  }
  const encoded = encodeURIComponent(address);
  window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
};

window.toggleRSVP = async function(eventId) {
  if (!requireAuth('Sign in to RSVP for events.')) return;

  try {
    const res = await apiPost(`/events/${eventId}/rsvp`, {});

    // Success if we get rsvpCount or going back from server
    if (res.rsvpCount !== undefined || res.going !== undefined || res.message) {
      if (res.message) {
        showToast(res.message);
      } else {
        showToast(res.going ? '✅ You are now going!' : '👋 You are no longer going');
      }
      
      // Refresh the events page so the count updates live
      if (currentPage === 'events') {
        loadEventsPage(document.getElementById('content'));
      }
    } else {
      showToast('RSVP failed — please try again', 'error');
    }
  } catch (err) {
    console.error('RSVP error:', err);
    showToast('Network error — could not RSVP', 'error');
  }
};

window.showEventDetail = async function(eventId) {
  const events = await apiGet('/events');
  const event = events.find(e => e._id === eventId);
  if (!event) return;

  const isPast = new Date(event.date) < new Date();
  const rsvpCount = event.rsvps ? event.rsvps.length : 0;
  const isGoing = currentUser && event.rsvps && event.rsvps.includes(currentUser._id);

  const modalHTML = `
    <div onclick="if(event.target.id==='eventDetailModal') document.getElementById('eventDetailModal').remove()" 
         id="eventDetailModal" class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[15000]">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        
        <div class="sticky top-0 bg-white px-6 py-4 border-b flex justify-between items-center">
          <h2 class="text-2xl font-bold">${event.title}</h2>
          <button onclick="document.getElementById('eventDetailModal').remove()" class="text-3xl text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div class="p-6">
          <div class="flex items-center gap-2 mb-4">
            <span class="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">${event.category || 'General'}</span>
            ${isPast ? `<span class="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full">Past Event</span>` : ''}
          </div>

          <p class="text-gray-700 leading-relaxed">${event.description || 'No description provided.'}</p>

          <div class="mt-6 space-y-3 text-sm">
            <div class="flex items-center gap-3">
              <span class="text-xl">📅</span>
              <div>
                <p class="font-semibold">${formatDate(event.date)}</p>
                <p class="text-gray-500 text-xs">${new Date(event.date).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</p>
              </div>
            </div>
            
            ${event.location ? `
            <div class="flex items-center gap-3">
              <span class="text-xl">📍</span>
              <p>${event.location}</p>
            </div>` : ''}
          </div>

          <div class="mt-8">
            <div class="flex items-center justify-between mb-2">
              <p class="font-semibold">Going (${rsvpCount})</p>
              ${currentUser && !isPast ? `
                <button onclick="toggleRSVP('${event._id}'); document.getElementById('eventDetailModal').remove()" 
                        class="px-5 py-2 rounded-2xl text-sm font-semibold transition ${isGoing ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}">
                  ${isGoing ? '✅ You\'re Going' : '🎟️ RSVP'}
                </button>` : ''}
            </div>
            
            ${rsvpCount > 0 ? `
              <div class="text-xs text-gray-500">This event has ${rsvpCount} people going</div>` : ''}
          </div>
        </div>

        <div class="p-6 border-t">
          <button onclick="document.getElementById('eventDetailModal').remove()" 
                  class="w-full py-4 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-3xl font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

window.showDealDetail = async function(dealId) {
  const deals = await apiGet('/deals');
  const deal = deals.find(d => d._id === dealId);
  if (!deal) return;

  const modalHTML = `
    <div onclick="if(event.target.id==='dealDetailModal') document.getElementById('dealDetailModal').remove()" 
         id="dealDetailModal" class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[15000]">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        
        <div class="sticky top-0 bg-white px-6 py-4 border-b flex justify-between items-center">
          <h2 class="text-2xl font-bold">${deal.title}</h2>
          <button onclick="document.getElementById('dealDetailModal').remove()" class="text-3xl text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div class="p-6">
          <p class="text-emerald-600 text-3xl font-bold mb-4">🔥 ${deal.title}</p>
          <p class="text-gray-700 leading-relaxed">${deal.description || 'No description provided.'}</p>
          
          ${deal.expires ? `
          <div class="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p class="text-amber-700 font-medium">Expires: ${formatDate(deal.expires)}</p>
          </div>` : ''}

          ${deal.business?.name ? `
          <div class="mt-4 text-sm">
            <span class="font-semibold">From:</span> ${deal.business.name}
          </div>` : ''}
        </div>

        <div class="p-6 border-t">
          <button onclick="document.getElementById('dealDetailModal').remove()" 
                  class="w-full py-4 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-3xl font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// ─── ADMIN DASHBOARD (Tab 0) ─────────────────────────────────────────────────
async function renderAdminDashboard() {
  const container = document.getElementById('adminMainContent');
  const stats = await apiGet('/admin/stats').catch(() => ({}));

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <div class="text-emerald-400 text-3xl mb-2">👥</div>
        <div class="text-4xl font-bold">${stats.totalUsers || 0}</div>
        <div class="text-white/50 text-sm">Total Users</div>
      </div>
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <div class="text-amber-400 text-3xl mb-2">🚦</div>
        <div class="text-4xl font-bold">${stats.activeShoutouts || 0}</div>
        <div class="text-white/50 text-sm">Active Traffic Alerts</div>
      </div>
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <div class="text-rose-400 text-3xl mb-2">🛒</div>
        <div class="text-4xl font-bold">${stats.marketplaceItems || 0}</div>
        <div class="text-white/50 text-sm">Marketplace Listings</div>
      </div>
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <div class="text-sky-400 text-3xl mb-2">⭐</div>
        <div class="text-4xl font-bold">${stats.totalReputation || 0}</div>
        <div class="text-white/50 text-sm">Total Reputation Points</div>
      </div>
    </div>

    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
      <h3 class="font-bold mb-4">Recent Activity</h3>
      <div id="recentActivity" class="space-y-3 text-sm">
        <!-- Filled by JS -->
      </div>
    </div>`;
}

// ─── USERS MANAGEMENT (Tab 1) ────────────────────────────────────────────────
async function renderAdminUsers() {
  const container = document.getElementById('adminMainContent');
  
  try {
    window._adminUsersData = await apiGet('/admin/users');
    
    if (!Array.isArray(window._adminUsersData)) {
      throw new Error('Invalid users data');
    }

    container.innerHTML = `
      <div class="mb-4">
        <input type="text" id="userSearch" placeholder="🔍 Search by name or email…" 
               class="w-full bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 text-base">
      </div>
      <div id="usersCardList" class="space-y-3"></div>`;

    renderUsersTable(window._adminUsersData);

    document.getElementById('userSearch').addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = window._adminUsersData.filter(u => 
        (u.name || '').toLowerCase().includes(term) || 
        (u.email || '').toLowerCase().includes(term)
      );
      renderUsersTable(filtered);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="p-8 text-red-400">Failed to load users. Backend may be restarting.</div>`;
  }
}

function renderUsersTable(users) {
  const list = document.getElementById('usersCardList');
  if (!list) return;
  list.innerHTML = users.map(u => `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            ${u.name[0].toUpperCase()}
          </div>
          <div class="min-w-0">
            <div class="font-semibold truncate">${u.name}</div>
            <div class="text-white/50 text-xs truncate">${u.email}</div>
            <div class="text-white/40 text-xs mt-0.5">Joined ${new Date(u.joinedAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="flex-shrink-0 text-right">
          <span class="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">⭐ ${u.reputation || 0}</span>
          ${u.isModerator ? `<div class="mt-1"><span class="inline-flex items-center gap-1 bg-purple-500/20 text-purple-400 text-xs font-semibold px-2.5 py-1 rounded-full">👮 Mod</span></div>` : ''}
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
        <button onclick="adminEditReputation('${u._id}')" 
                class="flex-1 min-w-[80px] px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold rounded-xl transition">
          ⭐ Edit Rep
        </button>
        <button onclick="adminToggleModerator('${u._id}', ${!!u.isModerator})" 
                class="flex-1 min-w-[80px] px-3 py-2 ${u.isModerator ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 hover:bg-white/20 text-white/70'} text-xs font-semibold rounded-xl transition">
          👮 ${u.isModerator ? 'Remove Mod' : 'Make Mod'}
        </button>
        <button onclick="adminDeleteUser('${u._id}', '${u.name.replace(/'/g,"\\'")}') " 
                class="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold rounded-xl transition">
          🗑️ Delete
        </button>
      </div>
    </div>
  `).join('');
}

window.adminToggleModerator = async function(userId, currentlyMod) {
  const action = currentlyMod ? 'remove moderator from' : 'make moderator';
  if (!confirm(`Are you sure you want to ${action} this user?`)) return;
  const res = await apiPost(`/admin/users/${userId}/moderator`, { isModerator: !currentlyMod });
  if (res.success !== undefined) {
    showToast(res.isModerator ? '👮 Moderator granted' : 'Moderator removed', 'success');
    renderAdminUsers();
  } else {
    showToast(res.message || 'Failed to update', 'error');
  }
};

window.adminDeleteUser = async function(userId, userName) {
  if (!confirm(`Permanently delete "${userName}"? This cannot be undone.`)) return;
  const res = await apiDelete(`/admin/users/${userId}`);
  if (res.message) {
    showToast(`🗑️ ${userName} deleted`, 'success');
    renderAdminUsers();
  } else {
    showToast('Failed to delete user', 'error');
  }
};

// ─── BUSINESSES MANAGEMENT (Tab 3) ───────────────────────────────────────────
async function renderAdminBusinesses() {
  const container = document.getElementById('adminMainContent');
  const data = await apiGet('/directory');

  container.innerHTML = `
    <div class="space-y-4">
      <!-- Add Business Button -->
      <button onclick="showAddBusinessModal()"
              class="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl transition text-sm">
        ➕ Add New Business
      </button>

      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5">
        <h3 class="font-bold text-base mb-4">All Businesses (${data.businesses.length})</h3>
        <div class="space-y-3 max-h-[65vh] overflow-auto pr-1" id="businessList">
          ${data.businesses.map(b => `
            <div class="flex items-center justify-between bg-white/5 rounded-2xl p-3 gap-3">
              <div class="flex items-center gap-3 min-w-0">
                ${b.logo
                  ? `<img src="${b.logo}" class="w-10 h-10 rounded-xl object-cover flex-shrink-0">`
                  : `<div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl flex-shrink-0">${b.category?.icon || '🏪'}</div>`}
                <div class="min-w-0">
                  <div class="font-semibold text-sm truncate">${b.name}</div>
                  <div class="text-xs text-white/50 truncate">${b.address || 'No address'}</div>
                </div>
              </div>
              <div class="flex gap-2 flex-shrink-0">
                <button onclick="editBusiness('${b._id}')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-xl">Edit</button>
                <button onclick="deleteBusiness('${b._id}')" class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-xl">Del</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

window.showAddBusinessModal = function() {
  const existing = document.getElementById('addBusinessModal');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', `
    <div id="addBusinessModal" onclick="if(event.target.id==='addBusinessModal') document.getElementById('addBusinessModal').remove()"
         class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[20000] p-4">
      <div onclick="event.stopPropagation()"
           class="bg-[#1a2332] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl">

        <div class="sticky top-0 bg-[#1a2332] px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 class="text-lg font-bold">➕ Add New Business</h2>
          <button onclick="document.getElementById('addBusinessModal').remove()" class="text-2xl text-white/50 hover:text-white leading-none">×</button>
        </div>

        <div class="p-5 space-y-3">
          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Business Name *</label>
            <input id="abName" type="text" placeholder="e.g. Joe's Diner"
                   class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
          </div>
          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Address</label>
            <input id="abAddress" type="text" placeholder="123 Main St, Milledgeville"
                   class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-white/50 uppercase tracking-wide">Phone</label>
              <input id="abPhone" type="tel" placeholder="(478) 555-0100"
                     class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
            </div>
            <div>
              <label class="text-xs text-white/50 uppercase tracking-wide">Email</label>
              <input id="abEmail" type="email" placeholder="hello@biz.com"
                     class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
            </div>
          </div>
          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Website</label>
            <input id="abWebsite" type="url" placeholder="https://..."
                   class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
          </div>
          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Description</label>
            <textarea id="abDescription" rows="3" placeholder="Brief description of the business…"
                      class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400 resize-none"></textarea>
          </div>
          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Logo URL (optional)</label>
            <input id="abLogo" type="url" placeholder="https://..."
                   class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
          </div>
        </div>

        <div class="px-5 pb-5 flex gap-3">
          <button onclick="document.getElementById('addBusinessModal').remove()"
                  class="flex-1 py-3.5 bg-white/10 hover:bg-white/20 rounded-2xl font-semibold text-sm transition">
            Cancel
          </button>
          <button onclick="submitAddBusiness()"
                  class="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-semibold text-sm transition">
            ✅ Add Business
          </button>
        </div>
      </div>
    </div>`);
};

window.submitAddBusiness = async function() {
  const name = document.getElementById('abName').value.trim();
  if (!name) return showToast('Business name is required', 'error');

  const payload = {
    name,
    address:     document.getElementById('abAddress').value.trim(),
    phone:       document.getElementById('abPhone').value.trim(),
    email:       document.getElementById('abEmail').value.trim(),
    website:     document.getElementById('abWebsite').value.trim(),
    description: document.getElementById('abDescription').value.trim(),
    logo:        document.getElementById('abLogo').value.trim() || null,
  };

  const res = await apiPost('/admin/business', payload);
  if (res.business) {
    showToast(`🏪 "${name}" added!`, 'success');
    document.getElementById('addBusinessModal').remove();
    renderAdminBusinesses();
  } else {
    showToast(res.message || 'Failed to add business', 'error');
  }
};

// ─── REPORTS MANAGEMENT ──────────────────────────────────────────────────────
window.reviewReport = async function(reportId) {
  const action = prompt("Mark report as:\n\n1 = reviewed\n2 = dismissed");
  if (!action) return;
  
  const status = action === '1' ? 'reviewed' : 'dismissed';
  
  const res = await apiPatch(`/admin/reports/${reportId}`, { status });
  if (res) {
    showToast(`Report marked as ${status}`);
    renderAdminReports();
  }
};

async function renderAdminReports() {
  const container = document.getElementById('adminMainContent');
  
  try {
    const reports = await apiGet('/admin/reports?status=pending');
    
    let html = `
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <h3 class="font-bold text-xl mb-6">🚩 Pending Reports (${reports.length})</h3>`;

    if (reports.length === 0) {
      html += `<p class="text-white/50 py-16 text-center text-lg">No pending reports — all good!</p>`;
    } else {
      html += reports.map(r => {
        const reporterName = r.reporter?.name || r.reporter || 'Unknown';
        const reportedName = r.reportedUser?.name || 'Unknown User';
        const shoutoutText = r.snapshotText ? `"${r.snapshotText.substring(0, 120)}${r.snapshotText.length > 120 ? '...' : ''}"` : '';
        
        return `
          <div class="bg-white/5 rounded-2xl p-5 mb-4 border border-white/10">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-3">
                  <span class="px-3 py-1 text-xs font-bold rounded-full ${r.type === 'shoutout' ? 'bg-orange-500' : 'bg-red-500'}">
                    ${r.type.toUpperCase()}
                  </span>
                  <span class="text-xs text-white/60">Reported by ${reporterName}</span>
                </div>
                
                <p class="font-semibold text-white mb-1">${reportedName}</p>
                
                ${shoutoutText ? `
                <p class="text-white/70 text-sm mt-2 italic">${shoutoutText}</p>` : ''}
                
                ${r.reason ? `
                <div class="mt-3 bg-white/10 rounded-xl p-3 text-sm">
                  <span class="text-white/50 text-xs block mb-1">REASON:</span>
                  <span class="text-white">${r.reason}</span>
                </div>` : ''}
              </div>
              
              <button onclick="reviewReport('${r._id}')" 
                      class="flex-shrink-0 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl transition">
                Review
              </button>
            </div>
          </div>`;
      }).join('');
    }

    html += `</div>`;
    container.innerHTML = html;

  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="p-8 text-red-400">Failed to load reports.</div>`;
  }
}

// ─── BROADCAST MESSAGE (Tab 5) ───────────────────────────────────────────────
async function renderAdminBroadcast() {
  const container = document.getElementById('adminMainContent');
  container.innerHTML = `
    <div class="max-w-2xl mx-auto bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
      <h3 class="font-bold text-xl mb-2">📢 Send Broadcast Message</h3>
      <p class="text-white/50 text-sm mb-6">Plain text only. To add a link use: &lt;a href="https://..."&gt;link text&lt;/a&gt;</p>
      <div class="mb-4">
        <label class="block text-xs text-white/60 mb-2">Message</label>
        <textarea id="broadcastText" rows="8"
                  class="w-full bg-white/10 border border-white/20 rounded-3xl p-5 text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400 resize-none font-mono text-sm"
                  placeholder="Write your message here. Plain text only."></textarea>
      </div>
      <div class="mb-6">
        <p class="text-xs text-white/40 mb-2 uppercase tracking-wide">Preview — what users will see</p>
        <div id="broadcastPreview" class="min-h-[48px] bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white/80 text-sm leading-relaxed">
          <span class="text-white/30 italic">Start typing to preview…</span>
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="sendBroadcast()"
                class="flex-1 bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-semibold text-lg transition">
          📤 Send to All Users
        </button>
        <button onclick="sendBroadcast(true)"
                class="flex-1 bg-amber-500 hover:bg-amber-600 py-4 rounded-3xl font-semibold text-lg transition">
          📍 Send to Verified Owners Only
        </button>
      </div>
    </div>`;

  document.getElementById('broadcastText').addEventListener('input', function () {
    const preview = document.getElementById('broadcastPreview');
    const sanitized = sanitizeBroadcast(this.value.trim());
    preview.innerHTML = sanitized || '<span class="text-white/30 italic">Start typing to preview…</span>';
  });
}

window.sendBroadcast = async function (ownersOnly = false) {
  const now = Date.now();
  if (now - lastBroadcastTime < 10000) {
    return showToast('Please wait 10 seconds between broadcasts', 'error');
  }
  const raw = document.getElementById('broadcastText').value.trim();
  if (!raw) return showToast('Message cannot be empty', 'error');
  const message = sanitizeBroadcast(raw);
  if (!confirm(`Send to ${ownersOnly ? 'verified owners only' : 'ALL users'}?`)) return;
  lastBroadcastTime = now;
  try {
    showToast('Sending...', 'success');
    const res = await apiPost('/admin/broadcast', { message, ownersOnly });
    showToast(`✅ Sent to ${res.sent || 'users'}!`, 'success');
    document.getElementById('broadcastText').value = '';
    document.getElementById('broadcastPreview').innerHTML = '<span class="text-white/30 italic">Start typing to preview…</span>';
  } catch (e) {
    console.error(e);
    showToast('Failed to send broadcast', 'error');
  }
};

// ─── ADMIN — EDIT BUSINESS ─────────────────────────────────────────────────
window.editBusiness = async function(businessId) {
  const business = allBusinesses.find(b => b._id === businessId);
  if (!business) return showToast('Business not found', 'error');

  const html = `
    <div id="editBusinessModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[20000] p-4">
      <div class="bg-white text-slate-900 w-full max-w-lg rounded-3xl max-h-[90vh] overflow-auto">
        <div class="sticky top-0 bg-white p-6 border-b flex justify-between items-center">
          <h2 class="text-2xl font-bold">Edit Business</h2>
          <button onclick="closeEditBusinessModal()" class="text-3xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        
        <div class="p-6 space-y-4">
          <input id="editBizName" value="${business.name || ''}" placeholder="Business Name" 
                 class="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:border-emerald-500 outline-none">
          
          <input id="editBizAddress" value="${business.address || ''}" placeholder="Address" 
                 class="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:border-emerald-500 outline-none">
          
          <div class="grid grid-cols-2 gap-3">
            <input id="editBizPhone" value="${business.phone || ''}" placeholder="Phone" 
                   class="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:border-emerald-500 outline-none">
            <input id="editBizEmail" value="${business.email || ''}" placeholder="Email" 
                   class="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:border-emerald-500 outline-none">
          </div>

          <textarea id="editBizDescription" rows="3" placeholder="Description"
                    class="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:border-emerald-500 outline-none">${business.description || ''}</textarea>

          <button onclick="saveBusinessEdit('${businessId}')" 
                  class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold">
            Save Changes
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
};

window.closeEditBusinessModal = function() {
  const modal = document.getElementById('editBusinessModal');
  if (modal) modal.remove();
};

window.saveBusinessEdit = async function(businessId) {
  const payload = {
    name: document.getElementById('editBizName').value.trim(),
    address: document.getElementById('editBizAddress').value.trim(),
    phone: document.getElementById('editBizPhone').value.trim(),
    email: document.getElementById('editBizEmail').value.trim(),
    description: document.getElementById('editBizDescription').value.trim()
  };

  if (!payload.name) {
    return showToast('Business name is required', 'error');
  }

  try {
    showToast('Saving changes...', 'success');

    const res = await apiRequest(`/admin/business/${businessId}`, payload, 'PUT');

    if (res.business || res.message === 'Business updated successfully') {
      showToast('✅ Business updated successfully!', 'success');
      closeEditBusinessModal();
      const data = await apiGet('/directory');
      allBusinesses = data.businesses || [];
      renderAdminBusinesses();
    } else {
      showToast(res.message || 'Failed to save changes', 'error');
      console.error("Update failed:", res);
    }
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Failed to save changes', 'error');
  }
};

// Helper for PUT requests (add near your other api functions if not present)
window.apiPut = async function(url, data) {
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (e) {
    console.error(e);
    return { message: 'Network error' };
  }
};

// ─── ADMIN — DELETE BUSINESS ───────────────────────────────────────────────
window.deleteBusiness = async function(businessId) {
  if (!confirm('Delete this business permanently? This cannot be undone.')) return;

  try {
    await apiDelete(`/admin/business/${businessId}`);
    showToast('✅ Business deleted', 'success');
    
    // Refresh list
    const data = await apiGet('/directory');
    allBusinesses = data.businesses || [];
    renderAdminBusinesses();
  } catch (e) {
    showToast('Failed to delete business', 'error');
  }
};

async function renderAdminAnalytics() {
  const container = document.getElementById('adminMainContent');
  
  let stats = {};
  try {
    stats = await apiGet('/admin/stats') || {};
  } catch (e) {
    // Stats endpoint may not be implemented yet — show zeros
  }

  container.innerHTML = `
    <div class="space-y-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-center">
          <div class="text-4xl mb-2">👥</div>
          <div class="text-4xl font-bold">${stats.totalUsers || 0}</div>
          <div class="text-white/60 text-sm mt-1">Total Users</div>
        </div>
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-center">
          <div class="text-4xl mb-2">🚦</div>
          <div class="text-4xl font-bold">${stats.activeShoutouts || 0}</div>
          <div class="text-white/60 text-sm mt-1">Active traffic alerts</div>
        </div>
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-center">
          <div class="text-4xl mb-2">🛒</div>
          <div class="text-4xl font-bold">${stats.marketplaceItems || 0}</div>
          <div class="text-white/60 text-sm mt-1">Marketplace</div>
        </div>
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-center">
          <div class="text-4xl mb-2">⭐</div>
          <div class="text-4xl font-bold">${stats.totalReputation || 0}</div>
          <div class="text-white/60 text-sm mt-1">Reputation Points</div>
        </div>
      </div>

      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <h3 class="font-bold mb-4">Today's Activity</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white/5 rounded-2xl p-4">
            <div class="text-emerald-400 text-xl">🚦 Traffic Alerts</div>
            <div class="text-3xl font-bold mt-1">${stats.shoutoutsToday || 0}</div>
          </div>
          <div class="bg-white/5 rounded-2xl p-4">
            <div class="text-amber-400 text-xl">🛒 Marketplace</div>
            <div class="text-3xl font-bold mt-1">${stats.marketplaceToday || 0}</div>
          </div>
          <div class="bg-white/5 rounded-2xl p-4">
            <div class="text-sky-400 text-xl">🔎 Lost & Found</div>
            <div class="text-3xl font-bold mt-1">${stats.lostFoundToday || 0}</div>
          </div>
        </div>
      </div>

      ${Object.keys(stats).length === 0 ? `
      <div class="text-center py-12 border border-dashed border-white/20 rounded-3xl">
        <p class="text-white/50">Backend <code>/admin/stats</code> route not implemented yet.</p>
        <p class="text-xs text-white/30 mt-2">Add it in your api.js to see real numbers.</p>
      </div>` : ''}
    </div>`;
}

// ─── FLAG A SHOUTOUT / TRAFFIC ALERT ───────────────────────────────────────
window.flagShoutout = async function (shoutoutId) {
  if (!currentUser) {
    showAuthModal({ message: 'Sign in to flag posts.' });
    return;
  }

  if (!confirm('Flag this traffic alert as inappropriate?')) return;

  const res = await apiPost(`/shoutouts/${shoutoutId}/flag`, {});

  if (res.removed) {
    showToast('🚩 Post was removed by community flags', 'success');
    // Remove from DOM immediately
    const card = document.getElementById(`shoutout-${shoutoutId}`);
    if (card) card.remove();
  } else {
    showToast('🚩 Thank you — your flag has been recorded.', 'success');
  }
};

// Live badge updates every 30 seconds
setInterval(() => {
  if (typeof currentUser !== 'undefined' && currentUser) {
    updateMessageBadge();
  }
}, 30000);

// ─── Push Notifications ───────────────────────────────────────────────────────
// initPushAfterLogin is defined in profile.js (_initNativePush).
// That version correctly checks existing permissions before re-requesting,
// preventing the black-screen bug on startup. No duplicate needed here.