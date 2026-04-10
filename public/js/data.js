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
    // Update star display in detail modal
    const starsEl = document.getElementById(`stars-${businessId}`);
    if (starsEl) {
      starsEl.querySelectorAll('.star-btn').forEach(btn => {
        btn.style.color = parseInt(btn.dataset.val) <= score ? '#f59e0b' : '#d1d5db';
      });
      const countEl = starsEl.nextElementSibling;
      if (countEl) countEl.textContent = `${res.count} rating${res.count !== 1 ? 's' : ''} · avg ${res.avg}`;
    }
    // Update card in directory list
    const cardStars = document.getElementById(`card-stars-${businessId}`);
    if (cardStars) {
      cardStars.innerHTML = renderStars(res.avg, res.count);
    }
  }
};

// ─── Page Router ──────────────────────────────────────────────────────────────
async function loadPage(page) {
  currentPage = page;
  const content = document.getElementById('content');

  if (page === 'admin') { await loadAdminPage(content); return; }
  if (page === 'owner-dashboard') { await loadOwnerDashboard(content); return; }
  if (page === 'home') { loadHomePage(content); return; }
  if (page === 'directory') { await loadDirectoryPage(content); return; }
  if (page === 'shoutouts') { await loadShoutoutsPage(content); return; }
  if (page === 'events') { await loadItemsPage(content, 'events'); return; }
  if (page === 'deals') { await loadItemsPage(content, 'deals'); return; }
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function loadHomePage(content) {
  content.innerHTML = `
    <div class="text-center py-12 px-4">
      <h1 class="text-5xl md:text-6xl font-bold tracking-tighter">Milledgeville Connect</h1>
      <p class="text-2xl text-emerald-300 mt-3">Milledgeville's Local Hub</p>
      <p class="mt-6 max-w-md mx-auto text-white/80">Business directory • Events • Shoutouts • Deals — all in one beautiful place.</p>
      <div class="mt-10 grid grid-cols-2 gap-6 max-w-2xl mx-auto">
        <div onclick="navigate('directory')" class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left cursor-pointer">
          <div class="text-5xl mb-4">📍</div>
          <h3 class="text-2xl font-semibold">Directory</h3>
          <p class="text-white/70">Find local businesses fast</p>
        </div>
        <div onclick="navigate('shoutouts')" class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left cursor-pointer">
          <div class="text-5xl mb-4">💬</div>
          <h3 class="text-2xl font-semibold">Shoutouts</h3>
          <p class="text-white/70">Community board</p>
        </div>
        <div onclick="navigate('events')" class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left cursor-pointer">
          <div class="text-5xl mb-4">📅</div>
          <h3 class="text-2xl font-semibold">Events</h3>
          <p class="text-white/70">What's happening</p>
        </div>
        <div onclick="navigate('deals')" class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left cursor-pointer">
          <div class="text-5xl mb-4">🔥</div>
          <h3 class="text-2xl font-semibold">Deals</h3>
          <p class="text-white/70">Local discounts</p>
        </div>
      </div>
    </div>`;
}

// ─── DIRECTORY (FULLY MOBILE-OPTIMIZED) ───────────────────────────────────────
async function loadDirectoryPage(content) {
  const data = await apiGet('/directory');
  allBusinesses = data.businesses;

  let html = `
    <h2 class="text-3xl md:text-4xl font-bold mb-6 px-4">Local Directory</h2>
    <div class="px-4 mb-6">
      <input id="directorySearch" type="text" placeholder="Search businesses or keywords..."
             class="w-full bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400 text-base"
             onkeyup="filterDirectory()">
    </div>
    <div class="flex gap-2 mb-8 px-4 overflow-x-auto pb-3 hide-scrollbar">
      <button onclick="renderDirectory(allBusinesses)" 
              class="flex-shrink-0 bg-emerald-500/30 hover:bg-emerald-500/50 px-5 py-3 rounded-3xl text-sm whitespace-nowrap transition font-semibold">
        All
      </button>
      ${data.categories.map(cat => `
        <button onclick="filterByCategory('${cat._id}')"
                class="flex-shrink-0 bg-white/10 hover:bg-white/20 px-5 py-3 rounded-3xl text-sm whitespace-nowrap transition flex items-center gap-2">
          <span>${cat.icon}</span><span>${cat.name}</span>
        </button>`).join('')}
    </div>
    <div id="directoryResults" class="px-4"></div>`;

  content.innerHTML = html;
  renderDirectory(allBusinesses);
}

function renderDirectory(businesses) {
  const container = document.getElementById('directoryResults');
  if (!businesses.length) {
    container.innerHTML = `<p class="text-center text-white/50 py-12">No results found</p>`;
    return;
  }

  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  businesses.forEach(b => {
    const avg = b.avgRating || 0;
    const count = b.ratings ? b.ratings.length : 0;
    const isOwned = b.owner !== null && b.owner !== undefined;
    const categoryIcon = b.category?.icon || '🏢';
    const categoryName = b.category?.name || 'Business';

    html += `
      <div onclick="showBusinessDetail('${b._id}')" 
           class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden cursor-pointer group transition-all duration-300 w-full">
        <!-- Color band header -->
        <div class="h-2 bg-gradient-to-r from-emerald-500 to-teal-400 ${b.isPremium ? '' : 'opacity-50'}"></div>
        <div class="p-5">
          <!-- Top row: icon + name + badges -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div class="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
                ${categoryIcon}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold text-lg leading-tight group-hover:text-emerald-300 transition-colors truncate">${b.name}</h3>
                <span class="text-xs text-white/50">${categoryName}</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 flex-shrink-0">
              ${isOwned ? `<span class="text-[10px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">✓ Verified</span>` : ''}
              ${b.isPremium ? `<span class="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">⭐ Premium</span>` : ''}
            </div>
          </div>

          <!-- Address -->
          <p class="text-emerald-300 text-sm mt-3 mb-2 flex items-center gap-1">
            <span>📍</span> ${b.address || 'Milledgeville, GA'}
          </p>

          <!-- Description -->
          ${b.description ? `<p class="text-sm text-white/70 mb-4 line-clamp-2">${b.description}</p>` : ''}

          <!-- Stars + quick actions -->
          <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
            <div id="card-stars-${b._id}" class="flex items-center gap-1">
              ${renderStars(avg, count)}
            </div>
            <div class="flex gap-2">
              ${b.phone ? `<a href="tel:${b.phone}" onclick="event.stopPropagation()" class="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-full transition">📞 Call</a>` : ''}
              ${!isOwned && currentUser ? `<span class="text-xs bg-white/10 hover:bg-white/20 text-white/70 px-3 py-1.5 rounded-full transition cursor-pointer" onclick="event.stopPropagation();showClaimModal('${b._id}')">Claim</span>` : ''}
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
  const isMyBusiness = currentUser && business.owner &&
    ((business.owner._id || business.owner) === (currentUser.id || currentUser._id));

  const modalHTML = `
    <div onclick="if(event.target.id==='businessModal')hideBusinessModal()" id="businessModal" 
         class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[12000] flex items-end md:items-center md:justify-center">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        <!-- Drag handle / header bar -->
        <div class="sticky top-0 bg-white pt-4 pb-3 flex justify-center border-b border-gray-100">
          <div class="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>

        <!-- Colored stripe -->
        <div class="h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>

        <div class="p-6">
          <!-- Title row -->
          <div class="flex items-start justify-between mb-1">
            <h1 class="text-3xl font-bold leading-tight">${business.name}</h1>
            ${isOwned ? `<span class="text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full mt-1">✓ Verified Owner</span>` : ''}
          </div>
          <p class="text-emerald-600 text-sm mb-1">${business.category?.name || ''}</p>
          <p class="text-gray-500 mb-4 flex items-center gap-1"><span>📍</span> ${business.address || 'Milledgeville, GA'}</p>

          <!-- Rating section -->
          <div class="bg-gray-50 rounded-2xl p-4 mb-6">
            <p class="text-sm font-semibold text-gray-700 mb-2">Rate this business:</p>
            ${renderStars(avg, count, true, business._id)}
          </div>

          <!-- Contact -->
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

          <!-- Actions -->
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
    // Start polling for approval
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
  let html = `<h2 class="text-3xl md:text-4xl font-bold mb-6 px-4">Community Shoutouts</h2>`;
  if (currentUser) {
    html += `
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-8 mx-4">
        <textarea id="shoutoutInput" rows="3" class="w-full bg-transparent border border-white/30 rounded-3xl p-4 text-white placeholder:text-white/50 focus:outline-none" placeholder="What's happening in Milledgeville?"></textarea>
        <button onclick="postShoutout()" class="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-semibold">Post Shoutout</button>
      </div>`;
  }
  if (!shoutouts.length) {
    html += `<p class="text-center text-white/50 py-12">No shoutouts yet — be the first!</p>`;
  }
  shoutouts.forEach(s => {
    html += `
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mx-4 mb-4">
        <p class="text-white/80">${s.text}</p>
        <p class="text-xs text-white/40 mt-3">${s.author} • ${new Date(s.createdAt).toLocaleDateString()}</p>
      </div>`;
  });
  content.innerHTML = html;
}

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

      <!-- Tabs -->
      <div class="flex border-b border-white/20 mb-6">
        <button onclick="switchOwnerTab(0)" id="otab0" class="flex-1 py-4 text-center font-semibold border-b-2 border-emerald-500 text-white">Deals</button>
        <button onclick="switchOwnerTab(1)" id="otab1" class="flex-1 py-4 text-center font-semibold text-white/70">Events</button>
      </div>

      <!-- Deals Tab -->
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

      <!-- Events Tab -->
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
    <div class="px-4">
      <h2 class="text-3xl font-bold mb-6">🔧 Admin Panel</h2>

      <!-- Tabs -->
      <div class="flex border-b border-white/20 mb-6 overflow-x-auto">
        <button onclick="switchAdminTab(0)" id="tab0" class="flex-shrink-0 flex-1 py-4 text-center font-semibold border-b-2 border-emerald-500 text-white">Add / Edit</button>
        <button onclick="switchAdminTab(1)" id="tab1" class="flex-shrink-0 flex-1 py-4 text-center font-semibold text-white/70">Manage</button>
        <button onclick="switchAdminTab(2)" id="tab2" class="flex-shrink-0 flex-1 py-4 text-center font-semibold text-white/70">
          Claims <span id="claimBadge" class="hidden ml-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full"></span>
        </button>
      </div>

      <!-- Add / Edit Tab -->
      <div id="adminTab0">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <h3 id="adminFormTitle" class="font-semibold mb-4 text-lg">Add New Business</h3>
          <input id="adminName" type="text" placeholder="Business Name" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <input id="adminAddress" type="text" placeholder="Address" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <input id="adminPhone" type="text" placeholder="Phone" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <input id="adminWebsite" type="text" placeholder="Website (optional)" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <textarea id="adminDescription" rows="3" placeholder="Short description" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white"></textarea>
          <select id="adminCategory" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-slate-800 text-white">
            <option value="">Select Category</option>
          </select>
          <div class="flex gap-3">
            <button onclick="saveBusiness()" id="saveBtn" class="flex-1 bg-emerald-600 hover:bg-emerald-700 py-5 rounded-3xl font-semibold text-xl">Save Business</button>
            <button onclick="cancelEdit()" class="flex-1 bg-gray-600 hover:bg-gray-700 py-5 rounded-3xl font-semibold text-xl" id="cancelBtn">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Manage Tab -->
      <div id="adminTab1" class="hidden">
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <div id="manageList"></div>
        </div>
      </div>

      <!-- Claims Tab -->
      <div id="adminTab2" class="hidden">
        <div id="claimsList"></div>
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
}

window.switchAdminTab = function (tab) {
  [0, 1, 2].forEach(i => {
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

async function loadAdminClaims() {
  const container = document.getElementById('claimsList');
  if (!container) return;
  const claims = await apiGet('/admin/claims');

  // Update badge
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
    loadAdminClaims(); // refresh count badge
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