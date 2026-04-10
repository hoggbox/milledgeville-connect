window.currentUser = null;
let currentPage = 'home';
let allBusinesses = [];
let allCategories = [];

async function apiRequest(method, url, body = null) {
  const token = localStorage.getItem('token');
  const options = { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiGet(url) { return apiRequest('GET', url); }
async function apiPost(url, body) { return apiRequest('POST', url, body); }
async function apiPut(url, body) { return apiRequest('PUT', url, body); }

function showSuccessMessage(msg, color = 'bg-emerald-600') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 right-6 ${color} text-white px-6 py-4 rounded-3xl shadow-2xl z-[99999] font-medium text-base`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showConfirmation(message, onConfirm) {
  const div = document.createElement('div');
  div.id = 'confirmModal';
  div.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[99999] p-4';
  div.innerHTML = `<div class="bg-white text-slate-900 rounded-3xl max-w-sm w-full p-8 text-center shadow-2xl"><p class="text-xl font-medium mb-8">${message}</p><div class="flex gap-4"><button id="confirmNo" class="flex-1 py-4 bg-gray-200 rounded-3xl font-semibold">Cancel</button><button id="confirmYes" class="flex-1 py-4 bg-emerald-600 text-white rounded-3xl font-semibold">Confirm</button></div></div>`;
  document.body.appendChild(div);
  div.querySelector('#confirmYes').onclick = () => { div.remove(); onConfirm(true); };
  div.querySelector('#confirmNo').onclick = () => { div.remove(); onConfirm(false); };
}

async function loadPage(page) {
  currentPage = page;
  const content = document.getElementById('content');

  if (page === 'home') {
    content.innerHTML = `
      <div class="px-4 py-8 text-center">
        <h1 class="text-5xl font-bold text-white mb-4">Milledgeville Connect</h1>
        <p class="text-xl text-white/80">Your local hub for businesses, deals, events & more.</p>
        <div class="mt-12">
          <h2 class="text-2xl font-semibold text-white mb-4 text-left">Popular Right Now</h2>
          <div id="popularGrid" class="grid grid-cols-2 gap-4"></div>
        </div>
        <div class="mt-12">
          <h2 class="text-2xl font-semibold text-white mb-4 text-left">Local News & Buzz</h2>
          <div id="newsFeed" class="space-y-4"></div>
        </div>
      </div>`;
    loadPopularAndNews();
    return;
  }

  if (page === 'directory') {
    content.innerHTML = `
      <div class="px-4 pt-4">
        <input id="directorySearch" type="text" placeholder="What are you looking for in Milledgeville?" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white text-base placeholder:text-white/40 focus:outline-none focus:border-emerald-400" onkeyup="filterDirectory()">
        <div id="categoryTabs" class="flex gap-2 overflow-x-auto pb-4 mb-6"></div>
        <div onclick="navigate('submit-new-business')" class="mb-6 flex items-center gap-4 bg-amber-500/10 border border-amber-500/30 rounded-3xl px-6 py-5 cursor-pointer hover:bg-amber-500/20 transition">
          <span class="text-3xl">🏗️</span>
          <div class="flex-1"><p class="font-semibold text-amber-300">Don’t see your business listed?</p><p class="text-sm text-white/60">Click here to submit it — we’ll add it & verify you as the owner.</p></div>
          <span class="text-white/40 text-xl">→</span>
        </div>
        <div id="directoryGrid" class="grid grid-cols-1 md:grid-cols-2 gap-6 pb-24"></div>
      </div>`;
    const [businesses, cats] = await Promise.all([apiGet('/api/directory'), apiGet('/api/categories')]);
    allBusinesses = businesses;
    allCategories = cats;
    renderCategoryTabs();
    renderDirectory(allBusinesses);
    return;
  }

  if (page === 'owner-dashboard') {
    const fresh = await apiGet('/api/auth/me');
    if (fresh && !fresh.message) window.currentUser = fresh;
    if (!window.currentUser || !window.currentUser.verifiedOwner) {
      showSuccessMessage('You need to be a verified business owner.', 'bg-red-600');
      navigate('directory');
      return;
    }
    const biz = window.currentUser.claimedBusiness || {};
    const isRestaurant = biz.category && (biz.category.name || biz.category) === 'Restaurants';
    content.innerHTML = `
      <div class="px-4 py-8 max-w-lg mx-auto">
        <h2 class="text-3xl font-bold mb-1">My Business Listing</h2>
        <p class="text-emerald-400 font-semibold mb-6">${biz.name || ''}</p>
        <div class="flex border-b border-white/20 mb-6">
          <button onclick="ownerTab(0)" id="oTab0" class="flex-1 py-3 font-semibold border-b-2 border-emerald-500 text-white text-sm">✏️ Listing</button>
          <button onclick="ownerTab(1)" id="oTab1" class="flex-1 py-3 font-semibold text-white/50 text-sm">🔥 Deals</button>
          <button onclick="ownerTab(2)" id="oTab2" class="flex-1 py-3 font-semibold text-white/50 text-sm">📅 Events</button>
          ${isRestaurant ? `<button onclick="ownerTab(3)" id="oTab3" class="flex-1 py-3 font-semibold text-white/50 text-sm">📋 Menu</button>` : ''}
        </div>
        <div id="oPanel0">${buildListingEditForm(biz)}</div>
        <div id="oPanel1" class="hidden"></div>
        <div id="oPanel2" class="hidden"></div>
        ${isRestaurant ? `<div id="oPanel3" class="hidden"></div>` : ''}
      </div>`;
    loadOwnerDeals();
    loadOwnerEvents();
    if (isRestaurant) loadOwnerMenu();
    return;
  }

  if (page === 'post-deal') {
    if (!window.currentUser || !window.currentUser.verifiedOwner) { showSuccessMessage('Verified business owners only.', 'bg-red-600'); navigate('directory'); return; }
    content.innerHTML = `
      <div class="px-4 py-8 max-w-lg mx-auto">
        <button onclick="navigate('owner-dashboard')" class="mb-6 text-white/60 hover:text-white flex items-center gap-2 transition">← Back</button>
        <h2 class="text-3xl font-bold mb-8">Post a Deal</h2>
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4">
          <input id="dealTitle" type="text" placeholder="Deal title..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">
          <textarea id="dealDescription" placeholder="Describe the deal..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-32 focus:outline-none focus:border-emerald-400 resize-none"></textarea>
          <button onclick="postDeal()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition">🔥 Post New Deal</button>
        </div>
      </div>`;
    return;
  }

  if (page === 'post-event') {
    if (!window.currentUser || !window.currentUser.verifiedOwner) { showSuccessMessage('Verified business owners only.', 'bg-red-600'); navigate('directory'); return; }
    content.innerHTML = `
      <div class="px-4 py-8 max-w-lg mx-auto">
        <button onclick="navigate('owner-dashboard')" class="mb-6 text-white/60 hover:text-white flex items-center gap-2 transition">← Back</button>
        <h2 class="text-3xl font-bold mb-8">Post an Event</h2>
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4">
          <input id="eventTitle" type="text" placeholder="Event name..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">
          <input id="eventDate" type="date" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400">
          <textarea id="eventDescription" placeholder="Details about the event..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-32 focus:outline-none focus:border-emerald-400 resize-none"></textarea>
          <button onclick="postEvent()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition">📅 Post New Event</button>
        </div>
      </div>`;
    return;
  }

  if (page === 'community') {
    content.innerHTML = `
      <div class="px-4 py-8">
        <h2 class="text-3xl font-bold mb-6">Ask Milledgeville</h2>
        <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-8">
          <select id="postType" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white mb-4">
            <option value="shoutout">Shoutout</option>
            <option value="question">Question</option>
            <option value="recommendation">Recommendation</option>
            <option value="lost_found">Lost & Found</option>
          </select>
          <textarea id="postText" placeholder="What do you want to share with the community?" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white h-32 focus:outline-none focus:border-emerald-400 resize-none"></textarea>
          <button onclick="submitCommunityPost()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition mt-4">Post to Community</button>
        </div>
        <div id="communityPosts" class="space-y-6"></div>
      </div>`;
    loadCommunityPosts();
    return;
  }

  if (page === 'deals') {
    content.innerHTML = `<div class="px-4 py-8"><h2 class="text-3xl font-bold mb-6">🔥 Local Deals</h2><div id="dealsList" class="space-y-6"></div></div>`;
    const deals = await apiGet('/api/deals');
    renderDeals(deals);
    return;
  }

  if (page === 'events') {
    content.innerHTML = `<div class="px-4 py-8"><h2 class="text-3xl font-bold mb-6">📅 Local Events</h2><div id="eventsList" class="space-y-6"></div></div>`;
    const events = await apiGet('/api/events');
    renderEvents(events);
    return;
  }

  if (page === 'admin') {
    content.innerHTML = `
      <div class="px-4">
        <h2 class="text-3xl font-bold mb-6">🔧 Admin Panel</h2>
        <button onclick="switchAdminTab(0)" id="tab0" class="px-6 py-3 border-b-2 border-emerald-500 font-semibold">Pending Claims</button>
        <button onclick="switchAdminTab(3)" id="tab3" class="px-6 py-3 text-white/70">Pending Community Posts</button>
        <div id="adminContent" class="mt-8"></div>
      </div>`;
    loadAdminTab(0);
    return;
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('categoryTabs');
  let html = `<button onclick="filterByCategory(null)" class="px-6 py-2 bg-emerald-500 text-white rounded-3xl text-sm font-medium">All</button>`;
  allCategories.forEach(cat => {
    html += `<button onclick="filterByCategory('${cat._id}')" class="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-3xl text-sm font-medium">${cat.name}</button>`;
  });
  container.innerHTML = html;
}

window.filterByCategory = function(catId) {
  const filtered = catId ? allBusinesses.filter(b => b.category && (b.category._id || b.category) === catId) : allBusinesses;
  renderDirectory(filtered);
};

function renderDirectory(businesses) {
  const grid = document.getElementById('directoryGrid');
  grid.innerHTML = businesses.map(biz => {
    const catName = biz.category && biz.category.name ? biz.category.name : '';
    const avg = biz.reviews && biz.reviews.length ? (biz.reviews.reduce((a, r) => a + r.rating, 0) / biz.reviews.length).toFixed(1) : '—';
    return `
      <div onclick="showBusinessDetail('${biz._id}')" class="group bg-white/5 hover:bg-white/12 rounded-3xl p-6 cursor-pointer transition-all">
        ${catName ? `<div class="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full inline-block mb-3">${catName}</div>` : ''}
        <h4 class="font-bold text-xl">${biz.name}</h4>
        <p class="text-white/50 text-sm">${biz.address}</p>
        ${biz.phone ? `<p class="text-white/40 text-sm mt-1">📞 ${biz.phone}</p>` : ''}
        <div class="flex items-center gap-1 mt-3 text-amber-400">★ ${avg}</div>
      </div>`;
  }).join('');
}

async function showBusinessDetail(id) {
  const biz = allBusinesses.find(b => b._id === id);
  if (!biz) return;
  const avg = biz.reviews && biz.reviews.length ? (biz.reviews.reduce((a, r) => a + r.rating, 0) / biz.reviews.length).toFixed(1) : null;
  let html = `
    <div id="businessModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onclick="if(event.target.id==='businessModal')hideBusinessModal()">
      <div class="bg-slate-900 text-white rounded-3xl max-w-md w-full mx-4 p-8 max-h-[90vh] overflow-auto">
        <h2 class="text-3xl font-bold">${biz.name}</h2>
        ${biz.photos && biz.photos.length ? `<div class="flex gap-2 mt-4">${biz.photos.map(p => `<img src="${p}" class="w-24 h-24 object-cover rounded-2xl">`).join('')}</div>` : ''}
        <p class="mt-4 text-white/70">${biz.description || ''}</p>
        ${biz.phone ? `<p class="mt-4">📞 ${biz.phone}</p>` : ''}
        ${biz.hours && Object.keys(biz.hours).length ? `<p class="mt-4">Hours: ${JSON.stringify(Object.fromEntries(biz.hours))}</p>` : ''}
        ${biz.menu && biz.menu.length ? `<h3 class="mt-8 font-semibold">Menu</h3><div class="space-y-3">${biz.menu.map(m => `<div class="flex justify-between"><span>${m.name}</span><span>$${m.price}</span></div>`).join('')}</div>` : ''}
        ${avg ? `<div class="mt-8">Average rating: ${avg} (${biz.reviews.length} reviews)</div>` : ''}
        <div class="mt-8">
          <p class="font-medium mb-3">Leave a review</p>
          <input id="reviewRating" type="number" min="1" max="5" placeholder="Rating 1-5" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white">
          <textarea id="reviewText" placeholder="Your review..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white mt-3 h-28"></textarea>
          <button onclick="submitReview('${id}')" class="w-full bg-emerald-600 text-white py-4 rounded-3xl mt-4">Submit Review</button>
        </div>
        <button onclick="hideBusinessModal()" class="mt-8 w-full py-4 bg-white/10 rounded-3xl">Close</button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

window.submitReview = async function(id) {
  const rating = parseInt(document.getElementById('reviewRating').value);
  const text = document.getElementById('reviewText').value;
  await apiPost(`/api/business/${id}/review`, { rating, text });
  hideBusinessModal();
  showSuccessMessage('Review submitted!');
  const list = await apiGet('/api/directory');
  allBusinesses = list;
  renderDirectory(allBusinesses);
};

function hideBusinessModal() {
  const modal = document.getElementById('businessModal');
  if (modal) modal.remove();
}

async function loadPopularAndNews() {
  const businesses = await apiGet('/api/directory');
  const popular = businesses.slice(0, 4);
  document.getElementById('popularGrid').innerHTML = popular.map(b => `
    <div onclick="showBusinessDetail('${b._id}')" class="bg-white/10 rounded-3xl p-5 cursor-pointer hover:bg-white/20">
      <h4 class="font-bold text-lg">${b.name}</h4>
      <p class="text-emerald-300 text-sm">${b.address}</p>
    </div>`).join('');
  const posts = await apiGet('/api/posts');
  document.getElementById('newsFeed').innerHTML = posts.slice(0, 3).map(p => `
    <div class="bg-white/10 rounded-3xl p-5">
      <p class="text-white">${p.text}</p>
      <p class="text-xs text-white/50 mt-2">— ${p.author?.name}</p>
    </div>`).join('');
}

async function loadCommunityPosts() {
  const posts = await apiGet('/api/posts');
  const container = document.getElementById('communityPosts');
  container.innerHTML = posts.map(p => `
    <div class="bg-white/10 rounded-3xl p-6">
      <p class="text-white">${p.text}</p>
      <div class="flex gap-2 mt-4">
        <button onclick="replyToPost('${p._id}')" class="text-xs bg-white/10 px-4 py-2 rounded-2xl">Reply</button>
      </div>
      ${p.replies ? p.replies.map(r => `<div class="mt-4 pl-4 border-l border-white/20 text-white/70">${r.text}</div>`).join('') : ''}
    </div>`).join('');
}

window.submitCommunityPost = async function() {
  const text = document.getElementById('postText').value;
  const type = document.getElementById('postType').value;
  await apiPost('/api/posts', { text, type });
  showSuccessMessage('Post submitted for admin review!');
  loadCommunityPosts();
};

window.replyToPost = async function(id) {
  const text = prompt('Your reply:');
  if (text) {
    await apiPost(`/api/posts/${id}/reply`, { text });
    loadCommunityPosts();
  }
};

function loadOwnerDeals() { /* your original */ }
function loadOwnerEvents() { /* your original */ }
function loadOwnerMenu() { /* your original */ }
window.addMenuItem = async function() { /* your original */ };
function ownerTab(tab) { /* your original tab switching */ };

function renderDeals(deals) { /* your original */ }
function renderEvents(events) { /* your original */ }

async function submitClaim(bizId) { /* your original */ }
async function submitNewBusiness() { /* your original */ }
async function postDeal() { /* your original */ }
async function postEvent() { /* your original */ }

window.loadPage = loadPage;
window.navigate = loadPage;
window.showBusinessDetail = showBusinessDetail;
window.hideBusinessModal = hideBusinessModal;
window.submitReview = submitReview;
window.submitCommunityPost = submitCommunityPost;
window.replyToPost = replyToPost;
window.filterByCategory = filterByCategory;
window.filterDirectory = filterDirectory;