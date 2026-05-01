let currentPage = 'home';
let allBusinesses = [];
let currentEditingBusiness = null;
let currentMessageReceiver = null; // for compose modal

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

// ─── SAFE Clickable User Helper ───────────────────────────────────────────────
function renderClickableUser(userData, fallbackName = 'Anonymous') {
  if (!userData) return fallbackName;

  let userId = null;
  let displayName = fallbackName;

  if (typeof userData === 'object' && userData !== null) {
    userId = userData._id || userData.id;
    displayName = userData.name || userData.authorName || userData.author || fallbackName;
  } else if (typeof userData === 'string' && userData.length > 10) {
    userId = userData; // already an ID
  }

  if (!userId) return displayName;

  return `<span onclick="event.stopImmediatePropagation(); showUserProfileModal('${userId}')" class="cursor-pointer hover:underline text-emerald-400">${displayName}</span>`;
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
    console.log(`📨 [Read] Marking conversation with ${otherId} as read...`);
    await apiPost('/messages/mark-as-read', { otherId });
    console.log('✅ Messages marked as read on server');
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
          <button onclick="setHotFilter('shoutout')" id="hotFilter-shoutout" class="flex-shrink-0 px-5 py-2 rounded-3xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white/80">💬 Shoutouts</button>
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
          <span class="text-3xl">💬</span>
          <p class="font-semibold mt-3">Post a Shoutout</p>
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

      function wmoCond(code) {
        if (code === 0) return { icon: '☀️', label: 'Sunny' };
        if ([1,2].includes(code)) return { icon: '⛅', label: 'Partly cloudy' };
        if (code === 3) return { icon: '☁️', label: 'Overcast' };
        if ([45,48].includes(code)) return { icon: '🌫️', label: 'Foggy' };
        if ([51,53,55,61,63].includes(code)) return { icon: '🌧️', label: 'Rainy' };
        if ([65,80,81,82].includes(code)) return { icon: '⛈️', label: 'Showers' };
        if ([71,73,75,77,85,86].includes(code)) return { icon: '❄️', label: 'Snow' };
        if ([95,96,99].includes(code)) return { icon: '⛈️', label: 'Thunderstorm' };
        return { icon: '🌤️', label: 'Mixed' };
      }

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

const [eventsData, dealsData, newsData, shoutoutsData] = await Promise.all([
  apiGet('/events').catch(() => []),
  apiGet('/deals').catch(() => []),
  apiGet('/news').catch(() => []),
  apiGet('/shoutouts').catch(() => []),
]);

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
              <span class="text-xs bg-emerald-500 px-3 py-1 rounded-full">💬 SHOUTOUT</span>
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
          <div onclick="navigate('shoutouts')" class="cursor-pointer group flex flex-col items-center bg-white/5 hover:bg-purple-500/10 border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 transition text-center">
            <span class="text-2xl mb-1">💬</span>
            <span class="text-xl font-black text-white group-hover:text-purple-300 transition">${shoutoutsTodayCount}</span>
            <span class="text-[11px] text-white/50 mt-0.5 leading-tight">Shoutouts<br>Today</span>
          </div>
        </div>
      </div>`;
  }
}
// ─── NEWS ARTICLE VIEWER ──────────────────────────────────────────────────────
window.openNewsArticle = async function (articleId) {
  const article = await apiGet(`/news/${articleId}`);
  if (!article || article.message) { showToast('Could not load article', 'error'); return; }

  const isAdmin    = currentUser && currentUser.email === 'imhoggbox@gmail.com';
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
  const isAdmin   = currentUser && currentUser.email === 'imhoggbox@gmail.com';
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
  const isAdmin  = currentUser && currentUser.email === 'imhoggbox@gmail.com';
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

// ─── SHOUTOUTS — UPDATED WITH PHOTO UPLOAD ───────────────────────────────────
async function loadShoutoutsPage(content) {
  const shoutouts = await apiGet('/shoutouts');

  let html = `<div class="max-w-2xl mx-auto px-2">
    <h2 class="text-3xl md:text-4xl font-bold mb-6">Community Shoutouts</h2>`;

  if (currentUser) {
    html += `
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5 mb-6">
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
              <button onclick="postShoutoutWithPhoto()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-2xl text-sm font-semibold transition">Post Shoutout</button>
            </div>
          </div>
        </div>
      </div>`;
  } else {
    html += guestBanner('post shoutouts, comment, and like');
  }

  if (!shoutouts.length) {
    html += `<p class="text-center text-white/50 py-12">No shoutouts yet — be the first!</p>`;
  } else {
    html += `<div class="space-y-4" id="shoutoutsFeed">`;
    shoutouts.forEach(s => { html += renderShoutoutCard(s); });
    html += `</div>`;
  }

  html += `</div>`;
  content.innerHTML = html;
}

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
  if (!requireAuth('Sign in to post shoutouts.')) return;
  const input = document.getElementById('shoutoutInput');
  if (!input || !input.value.trim()) return;

  const res = await apiPost('/shoutouts', { 
    text: input.value.trim(),
    images: _pendingShoutoutImages || []
  });

  if (res._id) {
    showToast('✅ Shoutout posted!');
    _pendingShoutoutImages = [];
    input.value = '';
    showToast('✅ Shoutout posted!');
    loadPage('shoutouts');
  } else {
    showToast(res.message || 'Error posting shoutout', 'error');
  }
}

function renderShoutoutCard(s) {
  const authorLetter = s.author ? s.author[0].toUpperCase() : '?';
  const likeCount = s.likes ? s.likes.length : 0;
  const comments = s.comments || [];
  const commentCount = comments.length;

  const isAdmin = currentUser && currentUser.email === 'imhoggbox@gmail.com';
  const isAuthor = currentUser && (s.authorId === currentUser._id || s.authorId === currentUser.id);

  let allCommentsHtml = '';
  comments.forEach(c => { allCommentsHtml += renderCommentRow(c, s._id); });

  const commentLabel = commentCount > 0
    ? `💬 ${commentCount} Comment${commentCount !== 1 ? 's' : ''}`
    : '💬 Comment';

  return `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5" id="shoutout-${s._id}">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex items-start gap-3 flex-1 min-w-0">
          <div class="w-9 h-9 bg-emerald-600 rounded-2xl flex items-center justify-center text-base font-bold flex-shrink-0">${authorLetter}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-white">${s.author || 'Community Member'}</div>
            <div class="text-[11px] text-white/40">${timeAgo(s.createdAt)}</div>
          </div>
        </div>
        ${isAuthor || isAdmin ? `
          <button onclick="deleteShoutout('${s._id}')" 
                  class="text-white/30 hover:text-red-400 transition text-sm flex-shrink-0" title="Delete shoutout">🗑️</button>` : ''}
      </div>
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
      <div class="flex items-center gap-1 border-t border-white/10 pt-2">
        <button onclick="${currentUser ? `toggleLike('${s._id}')` : `showAuthModal({message:'Sign in to like shoutouts.'})`}" id="like-btn-${s._id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white/50 hover:text-pink-400 hover:bg-white/5 transition font-medium text-sm">
          <span id="like-icon-${s._id}">${likeCount > 0 ? '❤️' : '🤍'}</span>
          <span id="like-label-${s._id}">Like</span>
        </button>
        <button onclick="${currentUser ? `toggleCommentSection('${s._id}')` : `showAuthModal({message:'Sign in to comment on shoutouts.'})`}" id="comment-btn-${s._id}"
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
                class="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none text-sm"
                placeholder="Write a comment… (Enter to post)"
                onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitComment('${s._id}');}">
              <button onclick="submitComment('${s._id}')" class="text-emerald-400 hover:text-emerald-300 transition flex-shrink-0 text-sm font-semibold">Post</button>
            </div>
          </div>` : `
          <div class="mt-3 text-center">
            <button onclick="showAuthModal({message:'Sign in to comment.'})"
                    class="text-xs text-emerald-400 hover:text-emerald-300 transition font-semibold">
              Sign in to comment →
            </button>
          </div>`}
      </div>
    </div>`;
}

function renderCommentRow(c, shoutoutId) {
  const cLetter = c.author ? c.author[0].toUpperCase() : '?';
  const replies = c.replies || [];
  const replyCount = replies.length;
  const isAdmin = currentUser && currentUser.email === 'imhoggbox@gmail.com';
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
  if (!requireAuth('Sign in to like shoutouts.')) return;
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
  if (!confirm('Delete this shoutout?')) return;
  const res = await apiDelete(`/shoutouts/${shoutoutId}`);
  if (res.message) {
    showToast('Shoutout deleted');
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error', 'error');
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

// ─── DEALS PAGE ───────────────────────────────────────────────────────────────
async function loadDealsPage(content) {
  const [allDeals] = await Promise.all([apiGet('/deals'), ensureDirCategories()]);
  window._allDeals   = allDeals;
  window._dealFilter = 'All';
  window._dealSearch = '';
  window._dealSort   = 'newest';

  const now         = new Date();
  const activeDeals = allDeals.filter(d => !d.expires || new Date(d.expires) >= now);

  content.innerHTML = `
    <div class="max-w-3xl mx-auto px-2 pb-10">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-3xl md:text-4xl font-bold">🔥 Deals</h2>
        <span class="text-sm text-white/40">${activeDeals.length} active</span>
      </div>

      ${!currentUser ? guestBanner('post deals and get notified about new offers') : ''}

      <div class="flex gap-2 mb-4">
        <input id="dealSearchInput" type="text" placeholder="Search deals…"
               class="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-amber-400"
               oninput="window._dealSearch=this.value; renderDealsFiltered()">
        <select id="dealSortSelect" onchange="window._dealSort=this.value; renderDealsFiltered()"
                class="border border-white/20 rounded-2xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-400"
                style="background:#1e293b;color-scheme:dark;">
          <option value="newest">Newest</option>
          <option value="expiring">Expiring Soon</option>
          <option value="az">A–Z</option>
        </select>
      </div>

      <div id="dealChips" class="flex gap-2 mb-6 overflow-x-auto pb-2 hide-scrollbar" style="-webkit-overflow-scrolling:touch;"></div>
      <div id="dealResults"></div>
    </div>`;

  renderDealsFiltered();
}

window.renderDealsFiltered = function () {
  const search    = (window._dealSearch || '').toLowerCase();
  const filter    = window._dealFilter  || 'All';
  const sort      = window._dealSort    || 'newest';
  const now       = new Date();
  const allDeals  = window._allDeals    || [];

  const activeDeals = allDeals.filter(d => !d.expires || new Date(d.expires) >= now);
  const activeCats  = [...new Set(activeDeals.map(d => d.category).filter(Boolean))].sort();

  if (filter !== 'All' && !activeCats.includes(filter)) window._dealFilter = 'All';
  const currentFilter = window._dealFilter || 'All';

  const chips = document.getElementById('dealChips');
  if (chips) {
    chips.innerHTML = `
      <button onclick="window._dealFilter='All'; renderDealsFiltered()"
              class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${currentFilter === 'All' ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
        All
      </button>
      ${activeCats.map(name => {
        const safe = name.replace(/'/g, "\\'");
        return `
        <button onclick="window._dealFilter='${safe}'; renderDealsFiltered()"
                class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${currentFilter === name ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
          <span>${catIcon(name)}</span><span>${name}</span>
        </button>`;
      }).join('')}`;
  }

  let deals = allDeals.filter(d => {
    if (currentFilter !== 'All' && d.category !== currentFilter) return false;
    if (search && !d.title.toLowerCase().includes(search) && !(d.description||'').toLowerCase().includes(search)) return false;
    return true;
  });

  if (sort === 'expiring') {
    const withExpiry    = deals.filter(d => d.expires).sort((a,b) => new Date(a.expires) - new Date(b.expires));
    const withoutExpiry = deals.filter(d => !d.expires);
    deals = [...withExpiry, ...withoutExpiry];
  } else if (sort === 'az') {
    deals.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    deals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const container = document.getElementById('dealResults');
  if (!container) return;

  if (!deals.length) {
    container.innerHTML = `
      <div class="text-center py-16 bg-white/5 border border-white/10 rounded-3xl">
        <p class="text-4xl mb-3">🏷️</p>
        <p class="text-white/50 text-sm">No deals found</p>
        ${currentFilter !== 'All' ? `<button onclick="window._dealFilter='All';renderDealsFiltered()" class="mt-3 text-amber-400 text-sm font-semibold hover:text-amber-300 transition">Clear filter</button>` : ''}
      </div>`;
    return;
  }

  container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">` +
    deals.map(d => {
      const expired   = d.expires && new Date(d.expires) < now;
      const expiresIn = d.expires ? Math.ceil((new Date(d.expires) - now) / (1000*60*60*24)) : null;
      const urgency   = expiresIn !== null && expiresIn <= 3 && !expired;
      const icon      = catIcon(d.category);
      const label     = d.category || 'General';
      return `
        <div class="bg-white/10 backdrop-blur-xl border ${urgency ? 'border-amber-500/50' : expired ? 'border-white/5 opacity-60' : 'border-white/10'} rounded-3xl overflow-hidden transition hover:bg-white/15">
          <div class="h-1.5 ${expired ? 'bg-white/10' : urgency ? 'bg-gradient-to-r from-amber-500 to-orange-400' : 'bg-gradient-to-r from-amber-500/60 to-yellow-500/60'}"></div>
          <div class="p-5">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-2xl flex items-center justify-center text-xl ${expired ? 'bg-white/5' : 'bg-amber-500/20'} flex-shrink-0">${icon}</div>
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${expired ? 'bg-white/10 text-white/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">${label}</span>
              </div>
              ${expired ? `<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/20 flex-shrink-0">Expired</span>`
                : urgency ? `<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0 animate-pulse">⚡ ${expiresIn}d left</span>`
                : ''}
            </div>
            <h3 class="font-bold text-base leading-snug mb-2 ${expired ? 'text-white/40 line-through' : 'text-white'}">${d.title}</h3>
            ${d.description ? `<p class="text-sm text-white/60 leading-relaxed mb-3 line-clamp-2">${d.description}</p>` : ''}
            <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
              <div class="text-xs text-white/40">${d.business?.name ? `🏪 ${d.business.name}` : d.owner?.name ? `👤 ${d.owner.name}` : ''}</div>
              <div class="text-xs text-white/40">${d.expires ? (expired ? `Expired ${new Date(d.expires).toLocaleDateString()}` : `Expires ${new Date(d.expires).toLocaleDateString()}`) : 'No expiry'}</div>
            </div>
          </div>
        </div>`;
    }).join('') + `</div>`;
};

// ─── EVENTS PAGE — WITH RSVP BUTTONS ──────────────────────────────────────────
async function loadEventsPage(content) {
  const [allEvents] = await Promise.all([apiGet('/events'), ensureDirCategories()]);
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
    if (time === 'upcoming' && eDate < now)  return false;
    if (time === 'past'     && eDate >= now) return false;
    if (currentFilter !== 'All' && e.category !== currentFilter) return false;
    if (search && !e.title.toLowerCase().includes(search) &&
        !(e.description||'').toLowerCase().includes(search) &&
        !(e.location||'').toLowerCase().includes(search)) return false;
    return true;
  });

  time === 'past' ? events.sort((a,b) => new Date(b.date) - new Date(a.date))
                  : events.sort((a,b) => new Date(a.date) - new Date(a.date));

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

  const rsvpHTML = currentUser ? `
    <button onclick="toggleRSVP('${e._id}'); event.stopImmediatePropagation()" 
            class="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 py-2 rounded-2xl text-sm font-semibold transition">
      👋 ${rsvpCount} going • I'm going!
    </button>` : '';

  return `
    <div class="bg-white/10 backdrop-blur-xl border ${isPast ? 'border-white/5 opacity-70' : 'border-white/10 hover:bg-white/15'} rounded-3xl overflow-hidden transition">
      <div class="h-1 ${isPast ? 'bg-white/10' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}"></div>
      <div class="p-5 flex items-start gap-4">
        <div class="flex-shrink-0 w-14 text-center bg-white/10 rounded-2xl py-2 px-1">
          <div class="text-[10px] font-bold uppercase text-white/50">${eDate.toLocaleDateString('en-US', { weekday:'short' })}</div>
          <div class="text-2xl font-black leading-tight ${isPast ? 'text-white/40' : 'text-white'}">${eDate.getDate()}</div>
          <div class="text-[10px] font-bold uppercase text-emerald-400">${eDate.toLocaleDateString('en-US', { month:'short' })}</div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-bold text-base leading-snug ${isPast ? 'text-white/50' : 'text-white'}">${e.title}</h3>
          </div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">${icon} ${label}</span>
            <span class="text-xs text-white/40">🕐 ${eDate.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}</span>
          </div>
          ${e.description ? `<p class="text-sm text-white/60 leading-relaxed line-clamp-2 mb-2">${e.description}</p>` : ''}
          ${e.location ? `<p class="text-xs text-white/40 flex items-center gap-1">📍 ${e.location}</p>` : ''}
          ${e.owner?.name ? `<p class="text-xs text-white/30 mt-1">Posted by ${e.owner.name}</p>` : ''}
          ${rsvpHTML}
        </div>
      </div>
    </div>`;
}

window.toggleRSVP = async function (eventId) {
  if (!requireAuth('Sign in to RSVP')) return;
  const res = await apiPost(`/events/${eventId}/rsvp`, {});
  if (res.rsvpCount !== undefined) {
    showToast(res.going ? '✅ You are going!' : '👋 You are no longer going');
    if (currentPage === 'events') loadEventsPage(document.getElementById('content'));
  }
};

// ─── RESOURCES PAGE ───────────────────────────────────────────────────────────
let _allResources = [];
let _resourceCategories = [];

async function loadResourcesPage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-10">
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

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────
async function loadAdminPage(content) {
  content.innerHTML = `
    <div class="px-2 md:px-4 max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold mb-6">🔧 Admin Panel</h2>
      <div class="flex border-b border-white/20 mb-6 overflow-x-auto hide-scrollbar">
        <button onclick="switchAdminTab(0)" id="tab0" class="flex-shrink-0 px-4 py-4 text-center font-semibold border-b-2 border-emerald-500 text-white whitespace-nowrap text-sm">Add / Edit</button>
        <button onclick="switchAdminTab(1)" id="tab1" class="flex-shrink-0 px-4 py-4 text-center font-semibold text-white/70 whitespace-nowrap text-sm">Manage</button>
        <button onclick="switchAdminTab(2)" id="tab2" class="flex-shrink-0 px-4 py-4 text-center font-semibold text-white/70 whitespace-nowrap text-sm">
          Claims <span id="claimBadge" class="hidden ml-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full"></span>
        </button>
        <button onclick="switchAdminTab(3)" id="tab3" class="flex-shrink-0 px-4 py-4 text-center font-semibold text-white/70 whitespace-nowrap text-sm">🛡️ Moderate</button>
        <button onclick="switchAdminTab(4)" id="tab4" class="flex-shrink-0 px-4 py-4 text-center font-semibold text-white/70 whitespace-nowrap text-sm">📰 News</button>
        <button onclick="switchAdminTab(5)" id="tab5" class="flex-shrink-0 px-4 py-4 text-center font-semibold text-white/70 whitespace-nowrap text-sm">👥 Users</button>
      </div>

      <div id="adminTab0">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <h3 id="adminFormTitle" class="font-semibold mb-4 text-lg">Add New Business</h3>
          <input id="adminName" type="text" placeholder="Business Name" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40">
          <input id="adminAddress" type="text" placeholder="Address" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40">
          <input id="adminPhone" type="text" placeholder="Phone" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40">
          <input id="adminWebsite" type="text" placeholder="Website (optional)" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40">
          <textarea id="adminDescription" rows="3" placeholder="Short description" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40"></textarea>
          <select id="adminCategory" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-slate-800 text-white">
            <option value="">Select Category</option>
          </select>
          <div class="flex gap-3">
            <button onclick="saveBusiness()" id="saveBtn" class="flex-1 bg-emerald-600 hover:bg-emerald-700 py-5 rounded-3xl font-semibold text-xl">Save Business</button>
            <button onclick="cancelEdit()" class="flex-1 bg-gray-600 hover:bg-gray-700 py-5 rounded-3xl font-semibold text-xl" id="cancelBtn">Cancel</button>
          </div>
        </div>
      </div>

      <div id="adminTab1" class="hidden">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <div id="manageList"></div>
        </div>
      </div>

      <div id="adminTab2" class="hidden">
        <div id="claimsList"></div>
      </div>

      <div id="adminTab3" class="hidden">
        <div id="moderationPanel"></div>
      </div>

      <div id="adminTab4" class="hidden">
        <div id="adminNewsPanel"></div>
      </div>

      <div id="adminTab5" class="hidden">
        <div id="adminUsersPanel"></div>
      </div>
    </div>`;

  const data = await apiGet('/directory');
  const select = document.getElementById('adminCategory');
  data.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat._id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    select.appendChild(opt);
  });

  loadManageList();
  loadAdminClaims();
  loadModerationPanel();
  loadAdminNewsPanel();
  loadAdminUsersPanel();
}

window.switchAdminTab = function (tab) {
  [0, 1, 2, 3, 4, 5].forEach(i => {
    const t = document.getElementById(`adminTab${i}`);
    const btn = document.getElementById(`tab${i}`);
    if (!t || !btn) return;
    t.classList.toggle('hidden', i !== tab);
    btn.classList.toggle('border-b-2', i === tab);
    btn.classList.toggle('border-emerald-500', i === tab);
    btn.classList.toggle('text-white', i === tab);
    btn.classList.toggle('text-white/70', i !== tab);
  });
};

// ─── ADMIN: NEWS PANEL ────────────────────────────────────────────────────────
async function loadAdminNewsPanel() {
  const container = document.getElementById('adminNewsPanel');
  if (!container) return;

  container.innerHTML = `<div class="text-center py-8 text-white/40 animate-pulse">Loading news…</div>`;

  const articles = await apiGet('/news');

  if (!articles.length) {
    container.innerHTML = `
      <div class="bg-white/10 border border-white/10 rounded-3xl p-8 text-center">
        <p class="text-4xl mb-3">📰</p>
        <p class="text-white/60">No news articles published yet.</p>
        <button onclick="navigate('post-news')" class="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-3xl font-semibold text-sm transition">Write First Article</button>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-lg">All Published Articles (${articles.length})</h3>
      <button onclick="navigate('post-news')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-2xl text-sm font-semibold transition">+ Write New</button>
    </div>
    <div class="space-y-3">
      ${articles.map(a => `
        <div class="bg-white/10 border border-white/10 rounded-3xl p-5">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="font-bold leading-tight">${a.title}</p>
              <p class="text-xs text-white/50 mt-1">${formatDateTime(a.createdAt)} · By ${a.authorName || 'Staff'}</p>
              <p class="text-sm text-white/60 mt-2 line-clamp-2">${a.summary}</p>
              ${a.images && a.images.length > 0 ? `<p class="text-xs text-emerald-400 mt-1">📷 ${a.images.length} photo${a.images.length !== 1 ? 's' : ''}</p>` : ''}
            </div>
            <div class="flex flex-col gap-2 flex-shrink-0">
              <button onclick="openNewsArticle('${a._id}')" class="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-full transition">View</button>
              <button onclick="adminDeleteNews('${a._id}')" class="text-xs bg-red-500/20 hover:bg-red-500/40 text-red-400 px-3 py-1.5 rounded-full transition">Delete</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

window.adminDeleteNews = async function (id) {
  if (!confirm('Delete this article permanently?')) return;
  const res = await apiDelete(`/admin/news/${id}`);
  if (res.message) {
    showToast('Article deleted');
    loadAdminNewsPanel();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// ─── ADMIN: USER MANAGEMENT PANEL ─────────────────────────────────────────────
async function loadAdminUsersPanel() {
  const container = document.getElementById('adminUsersPanel');
  if (!container) return;

  container.innerHTML = `<div class="text-center py-8 text-white/40 animate-pulse">Loading users…</div>`;

  const users = await apiGet('/admin/users');

  if (!users || users.message) {
    container.innerHTML = `<div class="text-center py-8 text-red-400">Failed to load users.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-lg">All Users (${users.length})</h3>
    </div>
    <div class="mb-4">
      <input id="userSearchInput" type="text" placeholder="Search by name or email…"
             class="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400 text-sm"
             oninput="filterAdminUsers()">
    </div>
    <div id="adminUsersList">
      ${renderAdminUsersList(users)}
    </div>`;

  window._adminUsersData = users;
}

function renderAdminUsersList(users) {
  if (!users.length) return `<p class="text-white/50 text-center py-8">No users found.</p>`;

  return users.map(u => {
    const isAdminUser  = u.email === 'imhoggbox@gmail.com';
    const isVerified   = !!u.verifiedBusiness;
    const joinDate     = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
    const lastLogin    = u.lastLogin ? timeAgo(u.lastLogin) : 'Never';

    return `
      <div class="bg-white/10 border border-white/10 rounded-3xl p-5 mb-3" id="userrow-${u._id}">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            <div class="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              ${(u.name || '?')[0].toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-bold text-sm">${u.name}</p>
                ${isAdminUser ? `<span class="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">Admin</span>` : ''}
                ${isVerified ? `<span class="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">Verified Owner</span>` : ''}
                ${u.canPostNews ? `<span class="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">📰 News Access</span>` : ''}
              </div>
              <p class="text-xs text-white/50 mt-0.5">${u.email}</p>
              ${isVerified && u.verifiedBusiness ? `<p class="text-xs text-emerald-400 mt-0.5">🏪 ${u.verifiedBusiness.name}</p>` : ''}
              <p class="text-xs text-white/30 mt-1">Joined ${joinDate} · Last seen ${lastLogin}</p>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <span class="text-xs font-semibold text-white/70">📰 News Posting Access</span>
            <div class="relative">
              <input type="checkbox" id="newstoggle-${u._id}" ${u.canPostNews ? 'checked' : ''} ${isAdminUser ? 'disabled' : ''}
                     class="sr-only peer" onchange="toggleNewsAccess('${u._id}', this.checked)">
              <div class="w-10 h-5 bg-white/20 rounded-full peer peer-checked:bg-emerald-500 transition-colors peer-disabled:opacity-40"></div>
              <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
            </div>
          </label>

          ${!isAdminUser ? `
            <button onclick="adminDeleteUser('${u._id}', '${u.name.replace(/'/g, "\\'")}')"
                    class="text-xs bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-white px-3 py-1.5 rounded-2xl border border-red-500/20 transition font-semibold">
              🗑️ Delete User
            </button>` : ''}
        </div>
      </div>`;
  }).join('');
}

window.filterAdminUsers = function () {
  const search = (document.getElementById('userSearchInput')?.value || '').toLowerCase();
  const filtered = (window._adminUsersData || []).filter(u =>
    u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
  );
  const list = document.getElementById('adminUsersList');
  if (list) list.innerHTML = renderAdminUsersList(filtered);
};

window.toggleNewsAccess = async function (userId, allow) {
  const res = await apiPost(`/admin/users/${userId}/news-access`, { canPostNews: allow }, 'PATCH');
  if (res.user) {
    showToast(allow ? '✅ News access granted!' : '🚫 News access removed');
    const idx = (window._adminUsersData || []).findIndex(u => u._id === userId);
    if (idx !== -1) window._adminUsersData[idx].canPostNews = allow;
    if (currentUser && currentUser._id === userId) {
      currentUser.canPostNews = allow;
      renderNav();
    }
  } else {
    showToast(res.message || 'Error updating access', 'error');
    const cb = document.getElementById(`newstoggle-${userId}`);
    if (cb) cb.checked = !allow;
  }
};

window.adminDeleteUser = async function (userId, userName) {
  if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
  const res = await apiDelete(`/admin/users/${userId}`);
  if (res.message === 'User deleted') {
    showToast('User deleted');
    window._adminUsersData = (window._adminUsersData || []).filter(u => u._id !== userId);
    const row = document.getElementById(`userrow-${userId}`);
    if (row) { row.style.opacity = '0'; setTimeout(() => row.remove(), 300); }
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// ─── ADMIN CLAIMS ─────────────────────────────────────────────────────────────
async function loadAdminClaims() {
  const container = document.getElementById('claimsList');
  if (!container) return;
  const claims = await apiGet('/admin/claims');
  const badge = document.getElementById('claimBadge');
  if (badge) {
    if (claims.length > 0) {
      badge.textContent = claims.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  if (!claims.length) {
    container.innerHTML = `<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center text-white/60">No pending claim requests</div>`;
    return;
  }
  container.innerHTML = claims.map(c => `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4" id="claim-${c._id}">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="font-bold text-lg">${c.business?.name || 'Unknown Business'}</div>
          <div class="text-emerald-300 text-sm">${c.business?.address || ''}</div>
        </div>
        <span class="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full font-bold">Pending</span>
      </div>
      <div class="bg-white/5 rounded-2xl p-4 mb-4 space-y-2">
        <p class="text-sm"><span class="text-white/50">Claimant:</span> <span class="font-semibold">${c.user?.name} (${c.user?.email})</span></p>
        <p class="text-sm"><span class="text-white/50">Owner Name:</span> ${c.verificationInfo?.ownerName || '—'}</p>
        <p class="text-sm"><span class="text-white/50">Phone:</span> ${c.verificationInfo?.phone || '—'}</p>
        <p class="text-sm"><span class="text-white/50">Address:</span> ${c.verificationInfo?.address || '—'}</p>
        ${c.verificationInfo?.message ? `<p class="text-sm"><span class="text-white/50">Note:</span> ${c.verificationInfo.message}</p>` : ''}
        <p class="text-xs text-white/40 mt-2">Submitted ${new Date(c.createdAt).toLocaleString()}</p>
      </div>
      <div class="flex gap-3">
        <button onclick="adminClaimDecision('${c._id}', 'approved')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-semibold transition">✅ Approve</button>
        <button onclick="adminClaimDecision('${c._id}', 'rejected')" class="flex-1 bg-red-500 hover:bg-red-600 py-4 rounded-3xl font-semibold transition">❌ Reject</button>
      </div>
    </div>`).join('');
}

window.adminClaimDecision = async function (claimId, decision) {
  const label = decision === 'approved' ? 'Approve' : 'Reject';
  if (!confirm(`${label} this claim?`)) return;
  const res = await apiPost(`/admin/claims/${claimId}/decision`, { decision });
  if (res.message) {
    showToast(decision === 'approved' ? '✅ Claim approved! User is now a verified business owner.' : '❌ Claim rejected.');
    const el = document.getElementById(`claim-${claimId}`);
    if (el) {
      el.style.opacity = '0.4';
      el.style.pointerEvents = 'none';
      el.querySelector('.flex.gap-3').innerHTML = `<div class="w-full text-center py-4 font-semibold text-white/60">${decision.toUpperCase()}</div>`;
    }
    loadAdminClaims();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

async function loadManageList() {
  const container = document.getElementById('manageList');
  if (!container) return;
  const data = await apiGet('/directory');
  let html = '';
  data.businesses.forEach(b => {
    html += `
      <div class="flex justify-between items-center bg-white/10 p-4 rounded-3xl mb-3">
        <div>
          <div class="font-semibold">${b.name}</div>
          <div class="text-xs text-white/60">${b.address || ''}</div>
        </div>
        <div class="flex gap-2">
          <button onclick="editBusiness('${b._id}')" class="px-4 py-2 bg-amber-500 text-white rounded-3xl text-sm">Edit</button>
          <button onclick="deleteBusiness('${b._id}')" class="px-4 py-2 bg-red-500 text-white rounded-3xl text-sm">Delete</button>
        </div>
      </div>`;
  });
  container.innerHTML = html || '<p class="text-white/60 text-center py-8">No businesses yet</p>';
}

async function saveBusiness() {
  const name = document.getElementById('adminName').value.trim();
  const address = document.getElementById('adminAddress').value.trim();
  const phone = document.getElementById('adminPhone').value.trim();
  const website = document.getElementById('adminWebsite').value.trim();
  const description = document.getElementById('adminDescription').value.trim();
  const categoryId = document.getElementById('adminCategory').value;

  if (!name || !address || !categoryId) {
    alert('Name, address, and category are required');
    return;
  }

  const isEdit = !!currentEditingBusiness;
  showConfirmation(isEdit ? `Save changes to "${name}"?` : `Add "${name}" to the directory?`, async () => {
    const url = currentEditingBusiness ? `/admin/business/${currentEditingBusiness._id}` : '/admin/business';
    const method = currentEditingBusiness ? 'PUT' : 'POST';
    const result = await apiPost(url, { name, address, phone, website, description, categoryId }, method);
    if (result.message && result.message.includes('success')) {
      showToast('✅ Saved successfully!');
      currentEditingBusiness = null;
      loadPage('admin');
    } else {
      alert('Error: ' + (result.message || 'Could not save'));
    }
  });
}

function showConfirmation(message, onConfirm) {
  const html = `
    <div id="confirmModal" class="fixed inset-0 bg-black/70 z-[13000] flex items-center justify-center">
      <div class="bg-white text-slate-900 rounded-3xl max-w-md w-full mx-4 p-8 text-center">
        <p class="text-xl mb-8">${message}</p>
        <div class="flex gap-4">
          <button onclick="confirmAction(true)" class="flex-1 bg-emerald-600 text-white py-5 rounded-3xl font-semibold">Yes</button>
          <button onclick="confirmAction(false)" class="flex-1 bg-gray-200 py-5 rounded-3xl font-semibold">Cancel</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  window.confirmAction = function (confirmed) {
    document.getElementById('confirmModal').remove();
    if (confirmed) onConfirm();
  };
}

window.editBusiness = async function (id) {
  const data = await apiGet('/directory');
  currentEditingBusiness = data.businesses.find(b => b._id === id);
  if (!currentEditingBusiness) return;
  switchAdminTab(0);
  document.getElementById('adminFormTitle').textContent = 'Edit Business';
  document.getElementById('saveBtn').textContent = 'Update Business';
  document.getElementById('adminName').value = currentEditingBusiness.name;
  document.getElementById('adminAddress').value = currentEditingBusiness.address || '';
  document.getElementById('adminPhone').value = currentEditingBusiness.phone || '';
  document.getElementById('adminWebsite').value = currentEditingBusiness.website || '';
  document.getElementById('adminDescription').value = currentEditingBusiness.description || '';
  document.getElementById('adminCategory').value = currentEditingBusiness.category?._id || '';
};

window.cancelEdit = function () {
  currentEditingBusiness = null;
  loadPage('admin');
};

window.deleteBusiness = async function (id) {
  if (!confirm('Delete this business permanently?')) return;
  await apiDelete(`/admin/business/${id}`);
  showToast('Business deleted');
  loadManageList();
};

// ─── MODERATION PANEL ─────────────────────────────────────────────────────────
let modState = {
  type: 'all',
  search: '',
  userFilter: '',
  rawData: { shoutouts: [], events: [], deals: [] }
};

async function loadModerationPanel() {
  const container = document.getElementById('moderationPanel');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5">
        <h3 class="font-bold text-lg mb-4">🛡️ Content Moderation</h3>
        <div class="flex flex-col gap-3">
          <input id="modSearch" type="text" placeholder="Search content or author name…"
                 class="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400 text-sm"
                 oninput="applyModFilters()">
          <input id="modUserFilter" type="text" placeholder="Filter by exact username or email…"
                 class="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400 text-sm"
                 oninput="applyModFilters()">
          <div class="flex gap-2 flex-wrap">
            ${['all','shoutouts','comments','events','deals'].map(t => `
              <button onclick="setModType('${t}')" id="modtype-${t}"
                      class="px-4 py-2 rounded-2xl text-sm font-semibold transition ${t === 'all' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}">
                ${{ all:'All', shoutouts:'💬 Shoutouts', comments:'🗨️ Comments', events:'📅 Events', deals:'🔥 Deals' }[t]}
              </button>`).join('')}
          </div>
        </div>
      </div>
      <div id="modResults" class="space-y-3">
        <div class="text-center py-12 text-white/40 animate-pulse">Loading content…</div>
      </div>
    </div>`;

  const [shoutouts, events, deals] = await Promise.all([
    apiGet('/shoutouts'),
    apiGet('/events'),
    apiGet('/deals')
  ]);

  modState.rawData = { shoutouts, events, deals };
  applyModFilters();
}

window.setModType = function (type) {
  modState.type = type;
  ['all','shoutouts','comments','events','deals'].forEach(t => {
    const btn = document.getElementById(`modtype-${t}`);
    if (!btn) return;
    if (t === type) {
      btn.className = 'px-4 py-2 rounded-2xl text-sm font-semibold transition bg-emerald-500 text-white';
    } else {
      btn.className = 'px-4 py-2 rounded-2xl text-sm font-semibold transition bg-white/10 text-white/70 hover:bg-white/20';
    }
  });
  applyModFilters();
};

window.applyModFilters = function () {
  const search = (document.getElementById('modSearch')?.value || '').toLowerCase();
  const userFilter = (document.getElementById('modUserFilter')?.value || '').toLowerCase();
  modState.search = search;
  modState.userFilter = userFilter;
  renderModResults();
};

function renderModResults() {
  const container = document.getElementById('modResults');
  if (!container) return;

  const { shoutouts, events, deals } = modState.rawData;
  const { type, search, userFilter } = modState;

  const matchesSearch = (text) => !search || (text || '').toLowerCase().includes(search);
  const matchesUser = (author, email) => {
    if (!userFilter) return true;
    return (author || '').toLowerCase().includes(userFilter) || (email || '').toLowerCase().includes(userFilter);
  };

  let items = [];

  if (type === 'all' || type === 'shoutouts') {
    shoutouts.forEach(s => {
      if (!matchesSearch(s.text) && !matchesSearch(s.author)) return;
      if (!matchesUser(s.author)) return;
      items.push({
        kind: 'shoutout', id: s._id, title: s.text, author: s.author || 'Unknown',
        authorId: s.authorId, date: s.createdAt,
        meta: `❤️ ${s.likes?.length || 0} likes · 💬 ${s.comments?.length || 0} comments`,
        deleteLabel: 'Delete Shoutout', deleteFn: `adminDeleteShoutout('${s._id}')`
      });
    });
  }

  if (type === 'all' || type === 'comments') {
    shoutouts.forEach(s => {
      (s.comments || []).forEach(c => {
        if (!matchesSearch(c.text) && !matchesSearch(c.author)) return;
        if (!matchesUser(c.author)) return;
        items.push({
          kind: 'comment', id: c._id, parentId: s._id, title: c.text,
          author: c.author || 'Unknown', authorId: c.authorId, date: c.createdAt,
          meta: `On shoutout by ${s.author} · ${c.replies?.length || 0} repl${c.replies?.length !== 1 ? 'ies' : 'y'}`,
          deleteLabel: 'Delete Comment', deleteFn: `adminDeleteComment('${s._id}','${c._id}')`
        });
        (c.replies || []).forEach(r => {
          if (!matchesSearch(r.text) && !matchesSearch(r.author)) return;
          if (!matchesUser(r.author)) return;
          items.push({
            kind: 'reply', id: r._id, parentId: s._id, commentId: c._id, title: r.text,
            author: r.author || 'Unknown', authorId: r.authorId, date: r.createdAt,
            meta: `Reply to ${c.author}'s comment on ${s.author}'s shoutout`,
            deleteLabel: 'Delete Reply', deleteFn: `adminDeleteReply('${s._id}','${c._id}','${r._id}')`
          });
        });
      });
    });
  }

  if (type === 'all' || type === 'events') {
    events.forEach(e => {
      if (!matchesSearch(e.title) && !matchesSearch(e.description) && !matchesSearch(e.location)) return;
      const ownerName = e.owner?.name || 'Unknown';
      const ownerEmail = e.owner?.email || '';
      if (!matchesUser(ownerName, ownerEmail)) return;
      items.push({
        kind: 'event', id: e._id, title: e.title, author: ownerName, authorEmail: ownerEmail,
        date: e.createdAt || e.date,
        meta: `📅 ${new Date(e.date).toLocaleDateString()}${e.location ? ' · 📍 ' + e.location : ''}`,
        description: e.description, deleteLabel: 'Delete Event', deleteFn: `adminDeleteEvent('${e._id}')`
      });
    });
  }

  if (type === 'all' || type === 'deals') {
    deals.forEach(d => {
      if (!matchesSearch(d.title) && !matchesSearch(d.description)) return;
      const ownerName = d.owner?.name || d.business?.name || 'Unknown';
      const ownerEmail = d.owner?.email || '';
      if (!matchesUser(ownerName, ownerEmail)) return;
      items.push({
        kind: 'deal', id: d._id, title: d.title, author: ownerName, authorEmail: ownerEmail,
        date: d.createdAt,
        meta: `${d.expires ? 'Expires ' + new Date(d.expires).toLocaleDateString() : 'No expiry'}${d.business?.name ? ' · ' + d.business.name : ''}`,
        description: d.description, deleteLabel: 'Delete Deal', deleteFn: `adminDeleteDeal('${d._id}')`
      });
    });
  }

  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!items.length) {
    container.innerHTML = `<div class="bg-white/10 border border-white/10 rounded-3xl p-8 text-center text-white/50">No content matches your filters.</div>`;
    return;
  }

  const kindColors = {
    shoutout: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    comment:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
    reply:    'bg-slate-500/20 text-slate-300 border-slate-500/30',
    event:    'bg-teal-500/20 text-teal-300 border-teal-500/30',
    deal:     'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  const kindLabels = { shoutout:'Shoutout', comment:'Comment', reply:'Reply', event:'Event', deal:'Deal' };

  container.innerHTML = items.map(item => `
    <div class="bg-white/10 border border-white/10 rounded-3xl p-5" id="mod-item-${item.kind}-${item.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 flex-1 min-w-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${kindColors[item.kind]}">${kindLabels[item.kind]}</span>
              <span class="text-xs text-white/50">${timeAgo(item.date)}</span>
            </div>
            <p class="text-sm text-white/90 leading-relaxed mb-1 break-words">${item.title}</p>
            ${item.description ? `<p class="text-xs text-white/50 mb-1 break-words">${item.description}</p>` : ''}
            <div class="flex items-center gap-2 flex-wrap mt-2">
              <div class="flex items-center gap-1.5">
                <div class="w-5 h-5 bg-emerald-600 rounded-lg flex items-center justify-center text-xs font-bold">${(item.author||'?')[0].toUpperCase()}</div>
                <span class="text-xs font-semibold text-white/70">${item.author}</span>
                ${item.authorEmail ? `<span class="text-xs text-white/30">${item.authorEmail}</span>` : ''}
              </div>
              <span class="text-xs text-white/30">·</span>
              <span class="text-xs text-white/40">${item.meta}</span>
            </div>
          </div>
        </div>
        <button onclick="${item.deleteFn}"
                class="flex-shrink-0 bg-red-500/20 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white px-3 py-1.5 rounded-2xl text-xs font-semibold transition whitespace-nowrap">
          🗑️ Delete
        </button>
      </div>
    </div>`).join('');
}

// ─── Admin moderation delete actions ─────────────────────────────────────────
window.adminDeleteShoutout = async function (id) {
  if (!confirm('Delete this shoutout and all its comments?')) return;
  const res = await apiDelete(`/shoutouts/${id}`);
  if (res.message) {
    showToast('Shoutout deleted');
    const idx = modState.rawData.shoutouts.findIndex(s => s._id === id);
    if (idx !== -1) modState.rawData.shoutouts.splice(idx, 1);
    renderModResults();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.adminDeleteComment = async function (shoutoutId, commentId) {
  if (!confirm('Delete this comment and its replies?')) return;
  const res = await apiDelete(`/shoutouts/${shoutoutId}/comments/${commentId}`);
  if (res.message === 'Deleted') {
    showToast('Comment deleted');
    const s = modState.rawData.shoutouts.find(s => s._id === shoutoutId);
    if (s) { const i = s.comments.findIndex(c => c._id === commentId); if (i !== -1) s.comments.splice(i, 1); }
    renderModResults();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.adminDeleteReply = async function (shoutoutId, commentId, replyId) {
  if (!confirm('Delete this reply?')) return;
  const res = await apiDelete(`/shoutouts/${shoutoutId}/comments/${commentId}/replies/${replyId}`);
  if (res.message === 'Deleted') {
    showToast('Reply deleted');
    const s = modState.rawData.shoutouts.find(s => s._id === shoutoutId);
    if (s) {
      const c = s.comments.find(c => c._id === commentId);
      if (c) { const i = c.replies.findIndex(r => r._id === replyId); if (i !== -1) c.replies.splice(i, 1); }
    }
    renderModResults();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.adminDeleteEvent = async function (id) {
  if (!confirm('Delete this event?')) return;
  const res = await apiDelete(`/admin/events/${id}`);
  if (res.message) {
    showToast('Event deleted');
    modState.rawData.events = modState.rawData.events.filter(e => e._id !== id);
    renderModResults();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.adminDeleteDeal = async function (id) {
  if (!confirm('Delete this deal?')) return;
  const res = await apiDelete(`/admin/deals/${id}`);
  if (res.message) {
    showToast('Deal deleted');
    modState.rawData.deals = modState.rawData.deals.filter(d => d._id !== id);
    renderModResults();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

async function postShoutout() {
  if (!requireAuth('Sign in to post shoutouts.')) return;
  const input = document.getElementById('shoutoutInput');
  if (!input || !input.value.trim()) return;
  await apiPost('/shoutouts', { text: input.value });
  input.value = '';
  loadPage('shoutouts');
}

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
  const items = await apiGet('/lostitems');
  const item = items.find(i => i._id === id);
  if (!item) return;

  const isOwner = item.owner && ((item.owner._id || item.owner).toString() === (currentUser?._id || '').toString());

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
};

window.hideLostDetailModal = function() {
  const modal = document.getElementById('lostDetailModal');
  if (modal) modal.remove();
};

window.postLostComment = async function() {
  const input = document.getElementById('lostCommentInput');
  if (!input.value.trim()) return;
  
  await apiPost(`/lostitems/${currentLostItemId}/comments`, { text: input.value });
  input.value = '';
  const items = await apiGet('/lostitems');
  const item = items.find(i => i._id === currentLostItemId);
  if (item) renderLostComments(item);
};

async function renderLostComments(item) {
  const container = document.getElementById('lostCommentsContainer');
  if (!container) return;
  
  let html = '';
  (item.comments || []).forEach(c => {
    const authorId = c.authorId?._id || c.authorId;
    html += `<div class="bg-slate-100 rounded-2xl p-4">
      <p onclick="event.stopImmediatePropagation(); showUserProfileModal('${authorId}')" class="font-medium cursor-pointer hover:underline">${c.author || 'Anonymous'}</p>
      <p class="text-slate-700">${c.text}</p>
    </div>`;
  });
  container.innerHTML = html || '<p class="text-slate-400 text-center py-4">No comments yet</p>';
}

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
    showToast('✅ Listing posted!');
  }
};

window.showMarketplaceDetail = async function(id) {
  currentMarketItemId = id;
  const items = await apiGet('/marketplace');
  const item = items.find(i => i._id === id);
  if (!item) return;

  const isSeller = item.seller && ((item.seller._id || item.seller).toString() === (currentUser?._id || '').toString());

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
          ${item.images && item.images.length ? `<div class="grid grid-cols-3 gap-3 mb-6">${item.images.map(src => `<img src="${src}" class="rounded-2xl aspect-square object-cover">`).join('')}</div>` : ''}
          <p class="text-slate-700">${item.description}</p>
          
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

  // This line was missing — now names appear and are clickable
  renderMarketComments(item);
};

window.hideMarketDetailModal = function() {
  const modal = document.getElementById('marketDetailModal');
  if (modal) modal.remove();
};

window.postMarketComment = async function() {
  const input = document.getElementById('marketCommentInput');
  if (!input.value.trim()) return;
  
  await apiPost(`/marketplace/${currentMarketItemId}/comments`, { text: input.value });
  input.value = '';
  const items = await apiGet('/marketplace');
  const item = items.find(i => i._id === currentMarketItemId);
};

window.markMarketSold = async function() {
  if (confirm('Mark this item as sold?')) {
    await apiPost(`/marketplace/${currentMarketItemId}/sold`, {});
    hideMarketDetailModal();
    loadPage('marketplace');
  }
};

// ====================== FULLY UPDATED LOST & FOUND PAGE ======================
async function loadLostFoundPage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">🔎 Lost & Found</h1>
        <button onclick="showPostLostItemModal()" class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">📤</span> Post Item
        </button>
      </div>
      <div id="lostItemsList">
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    </div>`;

  const items = await apiGet('/lostitems');
  const listHTML = items.map(item => `
    <div onclick="showLostItemDetail('${item._id}')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition">
      <div class="flex gap-4">
        ${item.images && item.images.length ? `<img src="${item.images[0]}" class="w-20 h-20 object-cover rounded-2xl flex-shrink-0" alt="">` : `<div class="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center text-4xl">🔎</div>`}
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <span class="px-3 py-1 text-xs font-bold rounded-full ${item.type === 'lost' ? 'bg-red-500' : 'bg-emerald-500'}">${item.type.toUpperCase()}</span>
            ${item.isPet ? `<span class="text-amber-400 text-sm">🐾 Lost Pet</span>` : ''}
          </div>
          <h3 class="font-semibold text-lg mt-2">${item.title}</h3>
          <p class="text-white/70 line-clamp-2">${item.description}</p>
          <div class="text-xs text-white/50 mt-3 flex items-center gap-2">
            <span>📍 ${item.location || 'Unknown'}</span>
            <span>·</span>
            ${renderClickableUser(item.owner, item.authorName || 'Anonymous')}
            <span>·</span>
            <span>${timeAgo(item.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>`).join('');

  document.getElementById('lostItemsList').innerHTML = listHTML || `<p class="text-white/40 text-center py-12">No items yet — be the first to post!</p>`;
}

async function loadMarketplacePage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">🛒 Marketplace</h1>
        <button onclick="showPostMarketplaceModal()" class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">📤</span> Sell Something
        </button>
      </div>
      <div id="marketItemsList">
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    </div>`;

  const items = await apiGet('/marketplace');

  const listHTML = items.map(item => {
    const sellerId = item.seller?._id || item.seller;
    return `
      <div onclick="showMarketplaceDetail('${item._id}')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition">
        <div class="flex gap-4">
          ${item.images && item.images.length ? 
            `<img src="${item.images[0]}" class="w-20 h-20 object-cover rounded-2xl flex-shrink-0" alt="">` : 
            `<div class="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center text-4xl">🛒</div>`}
          <div class="flex-1">
            <h3 class="font-semibold text-lg">${item.title}</h3>
            <p class="text-emerald-400 text-2xl font-bold">$${item.price}</p>
            <p class="text-white/70 line-clamp-2">${item.description}</p>
            <div class="text-xs text-white/50 mt-3 flex items-center gap-2">
              <span>${item.condition}</span>
              <span>·</span>
              ${renderClickableUser(item.seller, item.authorName)}
              <span>·</span>
              <span>${timeAgo(item.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  const container = document.getElementById('marketItemsList');
  if (container) {
    container.innerHTML = listHTML || `<p class="text-white/40 text-center py-12">No listings yet — post the first one!</p>`;
  }
}

async function renderMarketComments(item) {
  const container = document.getElementById('marketCommentsContainer');
  if (!container) return;

  let html = '';
  (item.comments || []).forEach(c => {
    const authorId = c.authorId?._id || c.authorId;
    html += `<div class="bg-slate-100 rounded-2xl p-4">
      <p onclick="showUserProfileModal('${authorId}')" class="font-medium cursor-pointer hover:underline">${c.author}</p>
      <p class="text-slate-700">${c.text}</p>
    </div>`;
  });
  container.innerHTML = html || '<p class="text-slate-400 text-center py-4">No messages yet</p>';
}

// ====================== MESSAGING SYSTEM ======================
async function loadMessagesPage(content) {
  if (!requireAuth('Sign in to access messages')) return;
  _setBadge(0);

  content.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">✉️ Messages</h1>
        <button onclick="showComposeMessageModal()" class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">✍️</span> New Message
        </button>
      </div>
      
      <div class="flex gap-2 mb-4 border-b border-white/20 pb-2">
        <button onclick="switchMessageTab(0)" id="msgTab0" class="flex-1 py-3 text-center font-semibold border-b-2 border-emerald-400">Inbox</button>
        <button onclick="switchMessageTab(1)" id="msgTab1" class="flex-1 py-3 text-center font-semibold">Sent</button>
      </div>
      
      <div id="messagesList" class="space-y-4"></div>
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
    html = `<p class="text-white/50 text-center py-8">No messages yet</p>`;
  } else {
    conversationArray.forEach(conv => {
      html += `
        <div onclick="openConversation('${conv.otherId}')" 
             data-other-id="${conv.otherId}"
             class="bg-white/10 hover:bg-white/15 rounded-3xl p-4 flex gap-4 cursor-pointer transition">
          <div class="flex-1">
            <div class="flex justify-between items-baseline">
              <p class="font-semibold">${conv.otherName}</p>
              ${conv.unread ? `<span class="msg-new-pill text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">new</span>` : ''}
            </div>
            <p class="text-white/70 text-sm line-clamp-1">${conv.lastMessage}</p>
            <p class="text-xs text-white/50">${timeAgo(conv.timestamp)}</p>
          </div>
        </div>`;
    });
  }

  container.innerHTML = html;
  return msgs;
}

// ====================== FIXED COMPOSE MODAL (high z-index + pre-fill) ======================
window.showComposeMessageModal = function(preSelectedUserId = null, preSelectedName = 'User') {
  hideUserProfileModal();
  hideMarketDetailModal();
  hideLostDetailModal();

  const modalHTML = `
    <div id="composeModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[20000]">
      <div onclick="if(event.target.id==='composeModal')hideComposeModal()" class="bg-white text-slate-900 w-full max-w-lg mx-4 rounded-3xl p-6">
        <h2 class="text-2xl font-bold mb-4">New Message</h2>
        
        ${preSelectedUserId ? `
        <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
          <p class="text-sm text-emerald-700">To: <strong>${preSelectedName}</strong></p>
          <input type="hidden" id="composeReceiverId" value="${preSelectedUserId}">
        </div>` : `
        <input id="composeRecipientId" type="text" placeholder="User ID" class="w-full px-4 py-3 rounded-2xl border mb-4">
        <p class="text-xs text-slate-500 mb-3">Tip: Click any username first</p>`}
        
        <textarea id="composeText" rows="4" class="w-full px-4 py-3 rounded-2xl border mb-6" placeholder="Write your message..."></textarea>
        
        <div class="flex gap-3">
          <button onclick="hideComposeModal()" class="flex-1 py-4 border rounded-3xl font-semibold">Cancel</button>
          <button onclick="sendComposedMessage()" class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-semibold">Send Message</button>
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
    tab0.classList.toggle('border-emerald-400', tab === 0);
    tab0.classList.toggle('border-transparent', tab !== 0);
  }
  if (tab1) {
    tab1.classList.toggle('border-emerald-400', tab === 1);
    tab1.classList.toggle('border-transparent', tab !== 1);
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
         class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[16000] p-4">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-slate-900 w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between bg-slate-800">
          <button onclick="hideConversationModal()" class="text-white/70 hover:text-white">← Back</button>
          <h3 class="font-semibold text-lg" id="chatWithName">Chat</h3>
          <div></div>
        </div>
        <div id="conversationThread" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900"></div>
        <div class="p-4 border-t bg-slate-800 flex gap-2">
          <input id="replyInput" type="text" placeholder="Type a reply..." 
                 class="flex-1 bg-white/10 border border-white/20 rounded-3xl px-5 py-3 text-white focus:outline-none">
          <button onclick="sendReply('${otherId}')" 
                  class="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-3xl text-white font-medium">Send</button>
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
        <div class="${isMine ? 'text-right' : 'text-left'}">
          <div class="inline-block max-w-[80%] px-4 py-3 rounded-3xl ${isMine ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white'}">
            <p>${m.text}</p>
            <p class="text-[10px] opacity-70 mt-1">${timeAgo(m.createdAt)}</p>
          </div>
        </div>`;
    });

    container.innerHTML = html || `<p class="text-white/50 text-center py-8">No messages yet</p>`;
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

// Global exports
window.showPostLostItemModal = window.showPostLostItemModal;
window.showLostItemDetail = window.showLostItemDetail;
window.showPostMarketplaceModal = window.showPostMarketplaceModal;
window.showMarketplaceDetail = window.showMarketplaceDetail;

// Call these from the router
window.loadLostFoundPage = loadLostFoundPage;
window.loadMarketplacePage = loadMarketplacePage;

// ─── Global exports ───────────────────────────────────────────────────────────
window.loadResourcesPage     = loadResourcesPage;
window.loadPage              = loadPage;
window.postShoutout          = postShoutoutWithPhoto;
window.navigate              = loadPage;
window.filterDirectory       = filterDirectory;
window.filterByCategory      = filterByCategory;
window.showBusinessDetail    = showBusinessDetail;
window.hideBusinessModal     = hideBusinessModal;
window.saveBusiness          = saveBusiness;
window.switchAdminTab        = switchAdminTab;
window.renderDirectory       = renderDirectory;
window.loadModerationPanel   = loadModerationPanel;
window.renderDealsFiltered   = renderDealsFiltered;
window.renderEventsFiltered  = renderEventsFiltered;
window.getDirections = function(address) {
  if (!address) {
    showToast('No address available for this business', 'error');
    return;
  }
  const encoded = encodeURIComponent(address);
  window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
};

// Live badge updates every 8 seconds
setInterval(() => {
  if (typeof currentUser !== 'undefined' && currentUser) {
    updateMessageBadge();
  }
}, 30000);