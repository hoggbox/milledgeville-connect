// ─── HOME PAGE — CLEAN VERSION ───────────────────────────────────────────────
async function loadHomePage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-8">

      <!-- Today in Milledgeville -->
      <div class="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 rounded-3xl p-5 md:p-6 mb-8 text-white overflow-hidden relative">
        <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle at 80% 20%, white 1px, transparent 1px);background-size:24px 24px;"></div>
        
        <div class="relative grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
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

          <!-- Weather -->
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

        <div id="todayDigest" class="relative grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
      </div>

      <!-- Business Spotlight -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">⭐</span>
            <h2 class="text-lg font-bold">Business Spotlight</h2>
          </div>
          <button onclick="navigate('directory')" class="text-xs text-emerald-400 font-semibold flex items-center gap-1">See all →</button>
        </div>
        <div id="spotlightScroll" class="flex gap-4 overflow-x-auto pb-4 hide-scrollbar snap-x snap-mandatory"></div>
      </div>

      <!-- Hot Right Now -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">🔥</span>
            <h2 class="text-lg font-bold">Hot Right Now</h2>
          </div>
        </div>
        <div id="hotFeed" class="space-y-3"></div>
      </div>

      <!-- Community Stats -->
      <div id="communityStatsBar" class="mb-8"></div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-3 mb-8">
        <button onclick="navigate('shoutouts')" class="bg-white/10 hover:bg-white/20 rounded-3xl p-6 text-left">
          <span class="text-3xl">🚗</span>
          <p class="font-semibold mt-3">Post Traffic Alert</p>
        </button>
        <button onclick="navigate('events')" class="bg-white/10 hover:bg-white/20 rounded-3xl p-6 text-left">
          <span class="text-3xl">📅</span>
          <p class="font-semibold mt-3">See Events</p>
        </button>
      </div>
    </div>`;

  // Weather
  (async () => {
    try {
      const wRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=33.0801&longitude=-83.2321&current=temperature_2m,weathercode&daily=temperature_2m_max,weathercode&temperature_unit=fahrenheit&timezone=America%2FNew_York');
      const wData = await wRes.json();
      const curr = wData.current;
      const daily = wData.daily || {};

      function wmoCond(code) {
        if (code === 0) return { icon: '☀️', label: 'Sunny' };
        if ([1,2].includes(code)) return { icon: '⛅', label: 'Partly cloudy' };
        if (code === 3) return { icon: '☁️', label: 'Overcast' };
        return { icon: '🌤️', label: 'Mixed' };
      }

      const cond = wmoCond(curr.weathercode);
      const temp = Math.round(curr.temperature_2m);

      document.getElementById('weatherIcon').textContent = cond.icon;
      document.getElementById('weatherTemp').textContent = temp + '°F';
      document.getElementById('weatherDesc').textContent = cond.label;

    } catch (e) {
      console.warn('Weather failed');
      document.getElementById('weatherDesc').textContent = 'Weather unavailable';
    }
  })();

  // Hot Feed
  async function loadHotFeed() {
    try {
      const [shoutoutsRes, dealsRes, eventsRes] = await Promise.all([
        apiGet('/shoutouts?page=1&limit=6'),
        apiGet('/deals?page=1&limit=4'),
        apiGet('/events?page=1&limit=4')
      ]);

      let html = '';

      (shoutoutsRes.items || shoutoutsRes).slice(0, 3).forEach(s => {
        html += `
          <div onclick="navigate('shoutouts')" class="bg-white/10 backdrop-blur rounded-3xl p-4 cursor-pointer hover:bg-white/15 transition">
            <div class="flex justify-between text-xs mb-1.5">
              <span class="text-emerald-400">🚗 Traffic Alert</span>
              <span class="text-white/50">${timeAgo(s.createdAt)}</span>
            </div>
            <p class="text-white line-clamp-2">${s.text}</p>
          </div>`;
      });

      html += `<div class="grid grid-cols-2 gap-3 mt-4">`;

      (dealsRes.items || dealsRes).slice(0, 2).forEach(d => {
        html += `
          <div onclick="navigate('deals')" class="bg-white/10 backdrop-blur rounded-3xl p-4 cursor-pointer hover:bg-white/15 transition">
            <span class="text-amber-400 text-xs">🔥 Deal</span>
            <p class="font-semibold text-white text-sm mt-1 line-clamp-2">${d.title}</p>
          </div>`;
      });

      (eventsRes.items || eventsRes).slice(0, 2).forEach(e => {
        html += `
          <div onclick="navigate('events')" class="bg-white/10 backdrop-blur rounded-3xl p-4 cursor-pointer hover:bg-white/15 transition">
            <span class="text-sky-400 text-xs">📅 Event</span>
            <p class="font-semibold text-white text-sm mt-1 line-clamp-2">${e.title}</p>
          </div>`;
      });

      html += `</div>`;

      document.getElementById('hotFeed').innerHTML = html || '<p class="text-white/40 text-center py-8">Nothing hot right now...</p>';
    } catch (err) {
      console.error("Hot feed failed", err);
      const el = document.getElementById('hotFeed');
      if (el) el.innerHTML = `<p class="text-white/40 text-center py-8">Couldn't load hot feed</p>`;
    }
  }

  await loadHotFeed();

  // Spotlight in background
  if (allBusinesses.length === 0) {
    apiGet('/directory').then(d => {
      if (d?.businesses) {
        allBusinesses = d.businesses;
        _renderSpotlight(allBusinesses);
      }
    }).catch(() => _renderSpotlight([]));
  } else {
    _renderSpotlight(allBusinesses);
  }
}

// Spotlight helper (outside loadHomePage)
function _renderSpotlight(businesses) {
  const spotEl = document.getElementById('spotlightScroll');
  if (!spotEl) return;

  let sb = [...businesses]
    .filter(b => b.avgRating && b.avgRating > 0)
    .sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))
    .slice(0, 8);

  if (!sb.length) sb = [...businesses].slice(0, 8);

  spotEl.innerHTML = sb.length
    ? sb.map(b => `
      <div onclick="showBusinessDetail('${b._id}')" class="snap-center flex-shrink-0 w-56 bg-white/10 hover:bg-white/15 border border-white/10 rounded-3xl p-4 cursor-pointer transition">
        <div class="flex items-center gap-3 mb-3">
          ${b.logo ? `<img src="${b.logo}" class="w-10 h-10 object-cover rounded-2xl flex-shrink-0" alt="">` 
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