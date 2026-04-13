let currentPage = 'home';
let allBusinesses = [];
let currentEditingBusiness = null;

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

// ─── Page Router ──────────────────────────────────────────────────────────────
async function loadPage(page) {
  currentPage = page;
  const content = document.getElementById('content');

  if (page === 'admin')           { await loadAdminPage(content);        return; }
  if (page === 'owner-dashboard') { await loadOwnerDashboard(content);   return; }
  if (page === 'home')            { await loadHomePage(content);          return; }
  if (page === 'directory')       { await loadDirectoryPage(content);     return; }
  if (page === 'shoutouts')       { await loadShoutoutsPage(content);     return; }
  if (page === 'events')          { await loadItemsPage(content, 'events'); return; }
  if (page === 'deals')           { await loadItemsPage(content, 'deals');  return; }
  if (page === 'post-news')       { await loadPostNewsPage(content);      return; }
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
async function loadHomePage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-8">
      <div class="relative overflow-hidden rounded-3xl mb-6 mt-2" 
           style="background: linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%);">
        <div class="absolute inset-0 opacity-10" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.15) 20px, rgba(255,255,255,0.15) 21px);"></div>
        <div class="relative p-7 md:p-10">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl">🏠</div>
            <div>
              <h1 class="text-2xl md:text-3xl font-bold leading-tight">Milledgeville Connect</h1>
              <p class="text-emerald-200 text-sm">Your local community hub</p>
            </div>
          </div>
          <p class="text-white/80 text-sm leading-relaxed mb-6 max-w-sm">Everything happening in Milledgeville — businesses, events, deals, and community shoutouts.</p>
          <div class="flex flex-wrap gap-2">
            <button onclick="navigate('directory')" class="bg-white text-emerald-800 font-bold px-5 py-2.5 rounded-2xl text-sm transition hover:bg-emerald-50">📍 Directory</button>
            <button onclick="navigate('events')" class="bg-white/20 backdrop-blur-sm text-white font-semibold px-5 py-2.5 rounded-2xl text-sm transition hover:bg-white/30">📅 Events</button>
            <button onclick="navigate('deals')" class="bg-white/20 backdrop-blur-sm text-white font-semibold px-5 py-2.5 rounded-2xl text-sm transition hover:bg-white/30">🔥 Deals</button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-3 mb-8">
        <button onclick="navigate('directory')" class="flex flex-col items-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl p-3 transition">
          <span class="text-2xl mb-1">📍</span>
          <span class="text-xs font-medium text-white/80">Businesses</span>
        </button>
        <button onclick="navigate('shoutouts')" class="flex flex-col items-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl p-3 transition">
          <span class="text-2xl mb-1">💬</span>
          <span class="text-xs font-medium text-white/80">Shoutouts</span>
        </button>
        <button onclick="navigate('events')" class="flex flex-col items-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl p-3 transition">
          <span class="text-2xl mb-1">📅</span>
          <span class="text-xs font-medium text-white/80">Events</span>
        </button>
        <button onclick="navigate('deals')" class="flex flex-col items-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl p-3 transition">
          <span class="text-2xl mb-1">🔥</span>
          <span class="text-xs font-medium text-white/80">Deals</span>
        </button>
      </div>

      <div id="popularSection">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">🏆</span>
            <h2 class="text-lg font-bold">Popular This Week</h2>
          </div>
          <button onclick="navigate('directory')" class="text-emerald-400 text-xs font-semibold hover:text-emerald-300">See all →</button>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2 hide-scrollbar" style="-webkit-overflow-scrolling:touch;">
          ${[1,2,3].map(() => `
            <div class="flex-shrink-0 w-52 bg-white/10 rounded-3xl p-4 animate-pulse">
              <div class="w-10 h-10 bg-white/10 rounded-2xl mb-3"></div>
              <div class="h-4 bg-white/10 rounded-full mb-2 w-3/4"></div>
              <div class="h-3 bg-white/10 rounded-full w-1/2"></div>
            </div>`).join('')}
        </div>
      </div>

      <div id="newsSection" class="mt-8">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl">📰</span>
          <h2 class="text-lg font-bold">Local News & Updates</h2>
        </div>
        <div class="space-y-3">
          ${[1,2].map(() => `
            <div class="bg-white/10 rounded-3xl p-5 animate-pulse">
              <div class="h-4 bg-white/10 rounded-full mb-3 w-2/3"></div>
              <div class="h-3 bg-white/10 rounded-full w-full mb-2"></div>
              <div class="h-3 bg-white/10 rounded-full w-3/4"></div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  const [popularBiz, events, deals, shoutouts, newsArticles] = await Promise.all([
    apiGet('/popular'),
    apiGet('/events'),
    apiGet('/deals'),
    apiGet('/shoutouts'),
    apiGet('/news')
  ]);

  const popSection = document.getElementById('popularSection');
  if (popularBiz && popularBiz.length > 0) {
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    const cards = popularBiz.map((b, i) => {
      const avg = b.avgRating || 0;
      const count = b.ratings ? b.ratings.length : 0;
      const icon = b.category?.icon || '🏢';
      return `
        <div onclick="loadDirectoryAndOpen('${b._id}')" 
             class="flex-shrink-0 w-52 bg-white/10 hover:bg-white/20 border border-white/10 rounded-3xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-emerald-500/40">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-gradient-to-br from-emerald-500/30 to-teal-500/20 rounded-2xl flex items-center justify-center text-xl">${icon}</div>
            <span class="text-base">${medals[i]}</span>
          </div>
          <h3 class="font-bold text-sm leading-tight mb-1 line-clamp-2">${b.name}</h3>
          <div class="flex items-center gap-1 mt-2">
            ${[1,2,3,4,5].map(s => `<span style="color:${s<=Math.round(avg)?'#f59e0b':'#374151'};font-size:13px;">★</span>`).join('')}
            <span class="text-xs text-white/50 ml-1">${avg}</span>
          </div>
          <p class="text-xs text-white/40 mt-1">${count} rating${count !== 1 ? 's' : ''}</p>
        </div>`;
    }).join('');
    popSection.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">🏆</span>
          <h2 class="text-lg font-bold">Popular This Week</h2>
        </div>
        <button onclick="navigate('directory')" class="text-emerald-400 text-xs font-semibold hover:text-emerald-300">See all →</button>
      </div>
      <div class="flex gap-3 overflow-x-auto pb-3 hide-scrollbar" style="-webkit-overflow-scrolling:touch;">${cards}</div>`;
  } else {
    popSection.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">🏆</span>
        <h2 class="text-lg font-bold">Popular This Week</h2>
      </div>
      <div class="bg-white/10 border border-white/10 rounded-3xl p-6 text-center">
        <p class="text-white/50 text-sm">Rate some businesses to see what's trending!</p>
        <button onclick="navigate('directory')" class="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-2xl text-sm font-semibold transition">Browse Directory</button>
      </div>`;
  }

  // ── News section: real news articles first, then events/deals/shoutouts ──
  const newsSection = document.getElementById('newsSection');
  let newsCardsHTML = '';

  // Real news articles
  const recentNews = (newsArticles || []).slice(0, 3);
  recentNews.forEach(article => {
    newsCardsHTML += `
      <div onclick="openNewsArticle('${article._id}')"
           class="group bg-white/10 hover:bg-white/15 border border-white/10 hover:border-emerald-500/30 rounded-3xl p-5 cursor-pointer transition-all duration-200">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">📰</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">News</span>
              <span class="text-[10px] text-white/40">${timeAgo(article.createdAt)}</span>
            </div>
            <p class="font-semibold text-sm leading-snug mb-1 text-white">${article.title}</p>
            <p class="text-xs text-white/60 line-clamp-2">${article.summary}</p>
            <p class="text-xs text-emerald-400 mt-1">By ${article.authorName || 'Staff'}</p>
          </div>
          <span class="text-white/30 group-hover:text-white/60 transition flex-shrink-0 mt-1">›</span>
        </div>
      </div>`;
  });

  // Community items
  const upcomingEvents = events.filter(e => new Date(e.date) >= new Date()).slice(0, 1);
  upcomingEvents.forEach(e => {
    const dateStr = new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    newsCardsHTML += `
      <div onclick="navigate('events')"
           class="group bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-3xl p-5 cursor-pointer transition-all duration-200">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">📅</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-500/20 text-blue-300 border-blue-500/30">Event</span>
            </div>
            <p class="font-semibold text-sm leading-snug mb-1 text-white">${e.title}</p>
            <p class="text-xs text-emerald-300">${dateStr}${e.location ? ' · ' + e.location : ''}</p>
          </div>
          <span class="text-white/30 group-hover:text-white/60 transition flex-shrink-0 mt-1">›</span>
        </div>
      </div>`;
  });

  const activeDeals = deals.filter(d => !d.expires || new Date(d.expires) >= new Date()).slice(0, 1);
  activeDeals.forEach(d => {
    newsCardsHTML += `
      <div onclick="navigate('deals')"
           class="group bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-3xl p-5 cursor-pointer transition-all duration-200">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">🔥</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/30">Deal</span>
            </div>
            <p class="font-semibold text-sm leading-snug mb-1 text-white">${d.title}</p>
            <p class="text-xs text-emerald-300">${d.business?.name ? 'From ' + d.business.name : 'Local business deal'}</p>
          </div>
          <span class="text-white/30 group-hover:text-white/60 transition flex-shrink-0 mt-1">›</span>
        </div>
      </div>`;
  });

  if (!newsCardsHTML) {
    newsSection.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">📰</span>
        <h2 class="text-lg font-bold">Local News & Updates</h2>
      </div>
      <div class="bg-white/10 border border-white/10 rounded-3xl p-6 text-center">
        <p class="text-4xl mb-3">🌱</p>
        <p class="text-white/60 text-sm">Nothing posted yet — check back soon!</p>
      </div>`;
  } else {
    newsSection.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">📰</span>
          <h2 class="text-lg font-bold">Local News & Updates</h2>
        </div>
        <span class="text-xs text-white/40">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
      <div class="space-y-3">${newsCardsHTML}</div>`;
  }

  const pulse = document.createElement('div');
  pulse.className = 'mt-8 grid grid-cols-3 gap-3';
  pulse.innerHTML = `
    <div class="bg-gradient-to-br from-emerald-600/30 to-teal-600/20 border border-emerald-500/20 rounded-3xl p-4 text-center">
      <div class="text-2xl font-bold">${allBusinesses.length || '?'}</div>
      <div class="text-xs text-white/60 mt-1">Businesses</div>
    </div>
    <div class="bg-gradient-to-br from-blue-600/30 to-indigo-600/20 border border-blue-500/20 rounded-3xl p-4 text-center">
      <div class="text-2xl font-bold">${events.length}</div>
      <div class="text-xs text-white/60 mt-1">Events</div>
    </div>
    <div class="bg-gradient-to-br from-amber-600/30 to-orange-600/20 border border-amber-500/20 rounded-3xl p-4 text-center">
      <div class="text-2xl font-bold">${deals.length}</div>
      <div class="text-xs text-white/60 mt-1">Active Deals</div>
    </div>`;
  content.querySelector('.max-w-2xl').appendChild(pulse);
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

  // Store images on window for lightbox access
  window._newsArticleImages = article.images || [];
};

window.closeNewsArticle = function () {
  const el = document.getElementById('newsArticleModal');
  if (el) el.remove();
};

window.deleteNewsArticle = async function (id) {
  if (!confirm('Delete this article permanently?')) return;
  const res = await apiPost(`/news/${id}`, {}, 'DELETE');
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

        <!-- Photo upload -->
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

      <!-- Existing articles by this user / admin sees all -->
      <div>
        <h3 class="font-semibold text-lg mb-4">Published Articles</h3>
        <div id="myNewsList">
          ${!existingNews.length ? '<p class="text-white/50 text-center py-6">No articles yet.</p>' : ''}
        </div>
      </div>
    </div>`;

  // Render existing articles
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

  // Initialize pending images array
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

// ─── DIRECTORY ────────────────────────────────────────────────────────────────
async function loadDirectoryPage(content) {
  const data = await apiGet('/directory');
  allBusinesses = data.businesses;

  let html = `
    <h2 class="text-3xl md:text-4xl font-bold mb-5">Local Directory</h2>
    <div class="mb-4">
      <input id="directorySearch" type="text" placeholder="Search businesses or keywords..."
             style="box-sizing:border-box;width:100%;"
             class="w-full bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400 text-base"
             onkeyup="filterDirectory()">
    </div>
    <div class="flex gap-2 mb-5 overflow-x-auto pb-2 hide-scrollbar" style="-webkit-overflow-scrolling:touch;width:100%;">
      <button onclick="renderDirectory(allBusinesses)" 
              class="flex-shrink-0 bg-emerald-500/30 hover:bg-emerald-500/50 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition font-semibold">
        All
      </button>
      ${data.categories.map(cat => `
        <button onclick="filterByCategory('${cat._id}')"
                class="flex-shrink-0 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-3xl text-sm whitespace-nowrap transition flex items-center gap-1">
          <span>${cat.icon}</span><span>${cat.name}</span>
        </button>`).join('')}
    </div>
    <div id="directoryResults" style="width:100%;min-width:0;"></div>`;

  content.innerHTML = html;
  renderDirectory(allBusinesses);
}

function renderDirectory(businesses) {
  const container = document.getElementById('directoryResults');
  if (!businesses.length) {
    container.innerHTML = `<p class="text-center text-white/50 py-12">No results found</p>`;
    return;
  }

  let html = '<div style="display:grid;grid-template-columns:1fr;gap:12px;width:100%;min-width:0;">';
  businesses.forEach(b => {
    const avg = b.avgRating || 0;
    const count = b.ratings ? b.ratings.length : 0;
    const isOwned = b.owner !== null && b.owner !== undefined;
    const categoryIcon = b.category?.icon || '🏢';
    const categoryName = b.category?.name || 'Business';

    html += `
      <div onclick="showBusinessDetail('${b._id}')" 
           style="width:100%;min-width:0;box-sizing:border-box;"
           class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden cursor-pointer group transition-all duration-300">
        <div class="h-2 bg-gradient-to-r from-emerald-500 to-teal-400 ${b.isPremium ? '' : 'opacity-50'}"></div>
        <div class="p-4" style="box-sizing:border-box;">
          <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;">
            <div class="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center text-2xl" style="flex-shrink:0;">${categoryIcon}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;min-width:0;">
                <h3 class="font-bold text-base leading-tight group-hover:text-emerald-300 transition-colors" style="min-width:0;word-break:break-word;flex:1;">${b.name}</h3>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
                  ${isOwned ? `<span class="text-[10px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full" style="white-space:nowrap;">✓ Verified</span>` : ''}
                  ${b.isPremium ? `<span class="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full" style="white-space:nowrap;">⭐ Premium</span>` : ''}
                </div>
              </div>
              <span class="text-xs text-white/50">${categoryName}</span>
            </div>
          </div>
          <p class="text-emerald-300 text-sm mt-3 mb-2" style="display:flex;align-items:flex-start;gap:4px;min-width:0;">
            <span style="flex-shrink:0;">📍</span><span style="word-break:break-word;min-width:0;">${b.address || 'Milledgeville, GA'}</span>
          </p>
          ${b.description ? `<p class="text-sm text-white/70 mb-3 line-clamp-2" style="word-break:break-word;">${b.description}</p>` : ''}
          <div class="mt-3 pt-3 border-t border-white/10" style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;">
            <div id="card-stars-${b._id}" style="flex-shrink:0;">${renderStars(avg, count)}</div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              ${b.phone ? `<a href="tel:${b.phone}" onclick="event.stopPropagation()" class="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-full transition" style="white-space:nowrap;">📞 Call</a>` : ''}
              ${!isOwned && currentUser ? `<span class="text-xs bg-white/10 hover:bg-white/20 text-white/70 px-3 py-1.5 rounded-full transition cursor-pointer" style="white-space:nowrap;" onclick="event.stopPropagation();showClaimModal('${b._id}')">Claim</span>` : ''}
            </div>
          </div>
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

// ─── BUSINESS DETAIL MODAL ────────────────────────────────────────────────────
function showBusinessDetail(id) {
  const business = allBusinesses.find(b => b._id === id);
  if (!business) return;

  const avg = business.avgRating || 0;
  const count = business.ratings ? business.ratings.length : 0;
  const isOwned = !!business.owner;

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
          <div class="bg-gray-50 rounded-2xl p-4 mb-6">
            <p class="text-sm font-semibold text-gray-700 mb-2">Rate this business:</p>
            ${renderStars(avg, count, true, business._id)}
          </div>
          <div class="space-y-3 mb-6">
            ${business.phone ? `
              <a href="tel:${business.phone}" class="flex items-center gap-3 bg-emerald-50 hover:bg-emerald-100 transition p-4 rounded-2xl text-emerald-700 font-semibold">
                <span class="text-2xl">📞</span> ${business.phone}
              </a>` : ''}
            ${business.website ? `
              <a href="${business.website}" target="_blank" class="flex items-center gap-3 bg-blue-50 hover:bg-blue-100 transition p-4 rounded-2xl text-blue-700 font-semibold">
                <span class="text-2xl">🌐</span> Visit Website
              </a>` : ''}
          </div>
          ${business.description ? `<p class="text-gray-600 leading-relaxed mb-6">${business.description}</p>` : ''}
          <div class="space-y-3">
            ${!isOwned && currentUser ? `
              <button onclick="hideBusinessModal();showClaimModal('${business._id}')" 
                      class="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-3xl font-semibold transition">
                🏷️ Claim This Business
              </button>` : ''}
            <button onclick="hideBusinessModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">Close</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

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

  if (!ownerName || !phone || !address) {
    showToast('Please fill in your name, phone, and address.', 'error');
    return;
  }

  const res = await apiPost(`/claim/${businessId}`, { ownerName, phone, address, message });

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

// ─── SHOUTOUTS ────────────────────────────────────────────────────────────────
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
            <div class="flex justify-end mt-2">
              <button onclick="postShoutout()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-2xl text-sm font-semibold transition">Post Shoutout</button>
            </div>
          </div>
        </div>
      </div>`;
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
      ${likeCount > 0 ? `<div class="text-xs text-white/35 mb-1">❤️ ${likeCount}</div>` : ''}
      <div class="flex items-center gap-1 border-t border-white/10 pt-2">
        <button onclick="toggleLike('${s._id}')" id="like-btn-${s._id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white/50 hover:text-pink-400 hover:bg-white/5 transition font-medium text-sm">
          <span id="like-icon-${s._id}">${likeCount > 0 ? '❤️' : '🤍'}</span>
          <span id="like-label-${s._id}">Like</span>
        </button>
        <button onclick="toggleCommentSection('${s._id}')" id="comment-btn-${s._id}"
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
          </div>` : ''}
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
            </div>` : ''}
        </div>
      </div>
      ${repliesHtml}
    </div>`;
}

// ─── Shoutout interactions ────────────────────────────────────────────────────
window.toggleLike = async function (shoutoutId) {
  if (!currentUser) { showToast('Login to like shoutouts', 'error'); return; }
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
  const res = await apiPost(`/shoutouts/${shoutoutId}/comments/${commentId}`, {}, 'DELETE');
  if (res.message === 'Deleted') {
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.deleteShoutout = async function (shoutoutId) {
  if (!confirm('Delete this shoutout?')) return;
  const res = await apiPost(`/shoutouts/${shoutoutId}`, {}, 'DELETE');
  if (res.message) {
    showToast('Shoutout deleted');
    await loadShoutoutsPage(document.getElementById('content'));
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

// ─── EVENTS & DEALS ──────────────────────────────────────────────────────────
async function loadItemsPage(content, type) {
  const items = await apiGet(`/${type}`);
  let html = `<h2 class="text-3xl md:text-4xl font-bold mb-6 px-4">${type === 'events' ? 'Events' : 'Deals'}</h2>`;
  if (!items.length) {
    html += `<p class="text-center text-white/50 py-12">No ${type} yet</p>`;
  } else {
    html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">`;
    items.forEach(item => {
      html += `
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <div class="font-bold text-xl">${item.title}</div>
          ${type === 'events' ? `<div class="text-emerald-300 text-sm mt-1">${new Date(item.date).toLocaleDateString()}</div>` : ''}
          ${type === 'deals' && item.expires ? `<div class="text-amber-300 text-sm mt-1">Expires ${new Date(item.expires).toLocaleDateString()}</div>` : ''}
          ${item.description ? `<p class="text-white/70 mt-3">${item.description}</p>` : ''}
          ${item.location ? `<p class="text-xs text-white/50 mt-2">📍 ${item.location}</p>` : ''}
        </div>`;
    });
    html += `</div>`;
  }
  content.innerHTML = html;
}

// ─── OWNER DASHBOARD ──────────────────────────────────────────────────────────
async function loadOwnerDashboard(content) {
  content.innerHTML = `
    <div class="px-4">
      <h2 class="text-3xl font-bold mb-6">🏪 My Business Dashboard</h2>
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-8">
        <h3 class="font-semibold mb-4 text-lg">Update Business Listing</h3>
        <input id="ownerName" type="text" placeholder="Business Name" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
        <input id="ownerAddress" type="text" placeholder="Address" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
        <input id="ownerPhone" type="text" placeholder="Phone" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
        <input id="ownerWebsite" type="text" placeholder="Website (optional)" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
        <textarea id="ownerDescription" rows="3" placeholder="Description" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white"></textarea>
        <button onclick="saveOwnerListing()" class="w-full bg-emerald-600 hover:bg-emerald-700 py-5 rounded-3xl font-semibold">Save Changes</button>
      </div>
      <div class="flex border-b border-white/20 mb-6">
        <button onclick="switchOwnerTab(0)" id="otab0" class="flex-1 py-4 text-center font-semibold border-b-2 border-emerald-500 text-white">Deals</button>
        <button onclick="switchOwnerTab(1)" id="otab1" class="flex-1 py-4 text-center font-semibold text-white/70">Events</button>
      </div>
      <div id="otabContent0">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
          <h3 class="font-semibold mb-4">Add New Deal</h3>
          <input id="dealTitle" type="text" placeholder="Deal Title" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <textarea id="dealDesc" rows="2" placeholder="Deal description" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white"></textarea>
          <input id="dealExpires" type="date" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <button onclick="addOwnerDeal()" class="w-full bg-amber-500 hover:bg-amber-600 py-4 rounded-3xl font-semibold">🔥 Post Deal</button>
        </div>
        <div id="ownerDealsList"></div>
      </div>
      <div id="otabContent1" class="hidden">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4">
          <h3 class="font-semibold mb-4">Add New Event</h3>
          <input id="eventTitle" type="text" placeholder="Event Title" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <input id="eventDate" type="date" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <input id="eventLocation" type="text" placeholder="Location" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <textarea id="eventDesc" rows="2" placeholder="Event description" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white"></textarea>
          <button onclick="addOwnerEvent()" class="w-full bg-blue-500 hover:bg-blue-600 py-4 rounded-3xl font-semibold">📅 Post Event</button>
        </div>
        <div id="ownerEventsList"></div>
      </div>
    </div>`;

  loadOwnerDeals();
  loadOwnerEvents();

  if (currentUser && currentUser.verifiedBusiness) {
    const biz = currentUser.verifiedBusiness;
    document.getElementById('ownerName').value = biz.name || '';
    document.getElementById('ownerAddress').value = biz.address || '';
    document.getElementById('ownerPhone').value = biz.phone || '';
    document.getElementById('ownerWebsite').value = biz.website || '';
    document.getElementById('ownerDescription').value = biz.description || '';
  }
}

window.switchOwnerTab = function (tab) {
  [0, 1].forEach(i => {
    const tabBtn = document.getElementById(`otab${i}`);
    const tabContent = document.getElementById(`otabContent${i}`);
    if (!tabBtn || !tabContent) return;
    const active = i === tab;
    tabContent.classList.toggle('hidden', !active);
    tabBtn.classList.toggle('border-b-2', active);
    tabBtn.classList.toggle('border-emerald-500', active);
    tabBtn.classList.toggle('text-white', active);
    tabBtn.classList.toggle('text-white/70', !active);
  });
};

window.saveOwnerListing = async function () {
  const name = document.getElementById('ownerName').value.trim();
  const address = document.getElementById('ownerAddress').value.trim();
  const phone = document.getElementById('ownerPhone').value.trim();
  const website = document.getElementById('ownerWebsite').value.trim();
  const description = document.getElementById('ownerDescription').value.trim();
  const res = await apiPost('/owner/business', { name, address, phone, website, description }, 'PUT');
  if (res._id) {
    currentUser.verifiedBusiness = res;
    showToast('✅ Listing updated!');
  } else {
    showToast(res.message || 'Error saving', 'error');
  }
};

async function loadOwnerDeals() {
  const container = document.getElementById('ownerDealsList');
  if (!container) return;
  const deals = await apiGet('/owner/deals');
  if (!deals.length) {
    container.innerHTML = `<p class="text-white/50 text-center py-6">No deals yet.</p>`;
    return;
  }
  container.innerHTML = deals.map(d => `
    <div class="bg-white/10 border border-white/10 rounded-3xl p-5 mb-3">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-bold">${d.title}</div>
          ${d.expires ? `<div class="text-xs text-amber-300 mt-1">Expires ${new Date(d.expires).toLocaleDateString()}</div>` : ''}
          ${d.description ? `<div class="text-sm text-white/70 mt-2">${d.description}</div>` : ''}
        </div>
        <button onclick="deleteOwnerDeal('${d._id}')" class="text-red-400 hover:text-red-300 text-sm ml-3 flex-shrink-0">🗑️</button>
      </div>
    </div>`).join('');
}

async function loadOwnerEvents() {
  const container = document.getElementById('ownerEventsList');
  if (!container) return;
  const events = await apiGet('/owner/events');
  if (!events.length) {
    container.innerHTML = `<p class="text-white/50 text-center py-6">No events yet.</p>`;
    return;
  }
  container.innerHTML = events.map(e => `
    <div class="bg-white/10 border border-white/10 rounded-3xl p-5 mb-3">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-bold">${e.title}</div>
          <div class="text-xs text-emerald-300 mt-1">${new Date(e.date).toLocaleDateString()}</div>
          ${e.location ? `<div class="text-sm text-white/70 mt-1">📍 ${e.location}</div>` : ''}
          ${e.description ? `<div class="text-sm text-white/70 mt-2">${e.description}</div>` : ''}
        </div>
        <button onclick="deleteOwnerEvent('${e._id}')" class="text-red-400 hover:text-red-300 text-sm ml-3 flex-shrink-0">🗑️</button>
      </div>
    </div>`).join('');
}

window.addOwnerDeal = async function () {
  const title = document.getElementById('dealTitle').value.trim();
  const description = document.getElementById('dealDesc').value.trim();
  const expires = document.getElementById('dealExpires').value;
  if (!title) { showToast('Title is required', 'error'); return; }
  const res = await apiPost('/owner/deals', { title, description, expires });
  if (res._id) {
    document.getElementById('dealTitle').value = '';
    document.getElementById('dealDesc').value = '';
    document.getElementById('dealExpires').value = '';
    showToast('🔥 Deal posted!');
    loadOwnerDeals();
  } else {
    showToast(res.message || 'Error posting deal', 'error');
  }
};

window.deleteOwnerDeal = async function (id) {
  if (!confirm('Delete this deal?')) return;
  await apiPost(`/owner/deals/${id}`, {}, 'DELETE');
  showToast('Deal deleted');
  loadOwnerDeals();
};

window.addOwnerEvent = async function () {
  const title = document.getElementById('eventTitle').value.trim();
  const date = document.getElementById('eventDate').value;
  const location = document.getElementById('eventLocation').value.trim();
  const description = document.getElementById('eventDesc').value.trim();
  if (!title || !date) { showToast('Title and date are required', 'error'); return; }
  const res = await apiPost('/owner/events', { title, date, location, description });
  if (res._id) {
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventDesc').value = '';
    showToast('📅 Event posted!');
    loadOwnerEvents();
  } else {
    showToast(res.message || 'Error posting event', 'error');
  }
};

window.deleteOwnerEvent = async function (id) {
  if (!confirm('Delete this event?')) return;
  await apiPost(`/owner/events/${id}`, {}, 'DELETE');
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

      <!-- Tab 0: Add/Edit Business -->
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

      <!-- Tab 1: Manage Businesses -->
      <div id="adminTab1" class="hidden">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <div id="manageList"></div>
        </div>
      </div>

      <!-- Tab 2: Claims -->
      <div id="adminTab2" class="hidden">
        <div id="claimsList"></div>
      </div>

      <!-- Tab 3: Moderation -->
      <div id="adminTab3" class="hidden">
        <div id="moderationPanel"></div>
      </div>

      <!-- Tab 4: News Management -->
      <div id="adminTab4" class="hidden">
        <div id="adminNewsPanel"></div>
      </div>

      <!-- Tab 5: User Management -->
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
  const res = await apiPost(`/admin/news/${id}`, {}, 'DELETE');
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

        <!-- Actions row -->
        <div class="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <!-- News access toggle -->
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <span class="text-xs font-semibold text-white/70">📰 News Posting Access</span>
            <div class="relative">
              <input type="checkbox" id="newstoggle-${u._id}" ${u.canPostNews ? 'checked' : ''} ${isAdminUser ? 'disabled' : ''}
                     class="sr-only peer" onchange="toggleNewsAccess('${u._id}', this.checked)">
              <div class="w-10 h-5 bg-white/20 rounded-full peer peer-checked:bg-emerald-500 transition-colors peer-disabled:opacity-40"></div>
              <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
            </div>
          </label>

          <!-- Delete user -->
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
    // Update local data
    const idx = (window._adminUsersData || []).findIndex(u => u._id === userId);
    if (idx !== -1) window._adminUsersData[idx].canPostNews = allow;
    // Update nav if this is the current user
    if (currentUser && currentUser._id === userId) {
      currentUser.canPostNews = allow;
      renderNav();
    }
  } else {
    showToast(res.message || 'Error updating access', 'error');
    // Revert checkbox
    const cb = document.getElementById(`newstoggle-${userId}`);
    if (cb) cb.checked = !allow;
  }
};

window.adminDeleteUser = async function (userId, userName) {
  if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
  const res = await apiPost(`/admin/users/${userId}`, {}, 'DELETE');
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
  await apiPost(`/admin/business/${id}`, {}, 'DELETE');
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
  const res = await apiPost(`/shoutouts/${id}`, {}, 'DELETE');
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
  const res = await apiPost(`/shoutouts/${shoutoutId}/comments/${commentId}`, {}, 'DELETE');
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
  const res = await apiPost(`/shoutouts/${shoutoutId}/comments/${commentId}/replies/${replyId}`, {}, 'DELETE');
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
  const res = await apiPost(`/admin/events/${id}`, {}, 'DELETE');
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
  const res = await apiPost(`/admin/deals/${id}`, {}, 'DELETE');
  if (res.message) {
    showToast('Deal deleted');
    modState.rawData.deals = modState.rawData.deals.filter(d => d._id !== id);
    renderModResults();
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

async function postShoutout() {
  const input = document.getElementById('shoutoutInput');
  if (!input || !input.value.trim()) return;
  await apiPost('/shoutouts', { text: input.value });
  input.value = '';
  loadPage('shoutouts');
}

window.loadPage = loadPage;
window.postShoutout = postShoutout;
window.navigate = loadPage;
window.filterDirectory = filterDirectory;
window.filterByCategory = filterByCategory;
window.showBusinessDetail = showBusinessDetail;
window.hideBusinessModal = hideBusinessModal;
window.saveBusiness = saveBusiness;
window.switchAdminTab = switchAdminTab;
window.renderDirectory = renderDirectory;
window.loadModerationPanel = loadModerationPanel;