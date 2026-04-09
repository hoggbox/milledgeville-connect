// ===============================================
// data.js — Full featured: claim, submit new biz,
// admin pending panel, verified owner profile & editing
// ===============================================

window.currentUser = null;
let currentPage = 'home';
let allBusinesses = [];
let currentEditingBusiness = null;

// ====================== API HELPERS ======================
async function apiRequest(method, url, body = null) {
  const token = localStorage.getItem('token');
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}
async function apiGet(url)        { return apiRequest('GET',    url); }
async function apiPost(url, body) { return apiRequest('POST',   url, body); }
async function apiPut(url, body)  { return apiRequest('PUT',    url, body); }
async function apiDelete(url)     { return apiRequest('DELETE', url); }

// ====================== TOAST ======================
function showSuccessMessage(msg, color) {
  color = color || 'bg-emerald-600';
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 ' + color + ' text-white px-6 py-4 rounded-3xl shadow-2xl z-[99999] font-medium text-base max-w-xs';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3500);
}

// ====================== CONFIRM DIALOG ======================
function showConfirmation(message, onConfirm) {
  const div = document.createElement('div');
  div.id = 'confirmModal';
  div.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[99999] p-4';
  div.innerHTML =
    '<div class="bg-white text-slate-900 rounded-3xl max-w-sm w-full p-8 text-center shadow-2xl">' +
      '<p class="text-xl font-medium mb-8">' + message + '</p>' +
      '<div class="flex gap-4">' +
        '<button id="confirmNo"  class="flex-1 py-4 bg-gray-200 rounded-3xl font-semibold">Cancel</button>' +
        '<button id="confirmYes" class="flex-1 py-4 bg-emerald-600 text-white rounded-3xl font-semibold">Confirm</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);
  div.querySelector('#confirmYes').onclick = function() { div.remove(); onConfirm(true); };
  div.querySelector('#confirmNo').onclick  = function() { div.remove(); onConfirm(false); };
}

// ====================== SUCCESS OVERLAY ======================
// Shows a full-screen success message then calls the callback
function showSuccessOverlay(message, onDone) {
  const div = document.createElement('div');
  div.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] p-4';
  div.innerHTML =
    '<div class="bg-white text-slate-900 rounded-3xl max-w-sm w-full p-10 text-center shadow-2xl">' +
      '<div class="text-6xl mb-4">✅</div>' +
      '<p class="text-2xl font-bold mb-2">Done!</p>' +
      '<p class="text-slate-600 mb-8">' + message + '</p>' +
      '<button id="successOk" class="w-full py-4 bg-emerald-600 text-white rounded-3xl font-bold text-lg">View Changes</button>' +
    '</div>';
  document.body.appendChild(div);
  div.querySelector('#successOk').onclick = function() { div.remove(); if (onDone) onDone(); };
}

// ====================== ROUTER ======================
async function loadPage(page) {
  currentPage = page;
  var content = document.getElementById('content');

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (page === 'home') {
    content.innerHTML =
      '<div class="px-4 py-8 text-center">' +
        '<h1 class="text-5xl font-bold text-white mb-4">Milledgeville Connect</h1>' +
        '<p class="text-xl text-white/80">Your local hub for businesses, deals, events &amp; more.</p>' +
        '<div class="mt-12 grid grid-cols-2 gap-4">' +
          '<div onclick="navigate(\'directory\')" class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 cursor-pointer hover:bg-white/20 transition"><div class="text-6xl mb-4">📍</div><h3 class="font-bold text-2xl">Directory</h3><p class="text-white/70">Find local businesses</p></div>' +
          '<div onclick="navigate(\'shoutouts\')" class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 cursor-pointer hover:bg-white/20 transition"><div class="text-6xl mb-4">📣</div><h3 class="font-bold text-2xl">Shoutouts</h3><p class="text-white/70">Community updates</p></div>' +
          '<div onclick="navigate(\'events\')" class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 cursor-pointer hover:bg-white/20 transition"><div class="text-6xl mb-4">📅</div><h3 class="font-bold text-2xl">Events</h3><p class="text-white/70">What\'s happening</p></div>' +
          '<div onclick="navigate(\'deals\')" class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 cursor-pointer hover:bg-white/20 transition"><div class="text-6xl mb-4">🔥</div><h3 class="font-bold text-2xl">Deals</h3><p class="text-white/70">Local discounts</p></div>' +
        '</div>' +
      '</div>';
    return;
  }

  // ── DIRECTORY ─────────────────────────────────────────────────────────────
  if (page === 'directory') {
    content.innerHTML =
      '<div class="px-4 pt-4">' +
        '<input id="directorySearch" type="text" placeholder="Search businesses or keywords..." ' +
               'class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white text-base placeholder:text-white/40 focus:outline-none focus:border-emerald-400" ' +
               'onkeyup="filterDirectory()">' +
        '<div onclick="navigate(\'submit-new-business\')" ' +
             'class="mb-6 flex items-center gap-4 bg-amber-500/10 border border-amber-500/30 rounded-3xl px-6 py-5 cursor-pointer hover:bg-amber-500/20 transition">' +
          '<span class="text-3xl">🏗️</span>' +
          '<div class="flex-1">' +
            '<p class="font-semibold text-amber-300">Don\'t see your business listed?</p>' +
            '<p class="text-sm text-white/60">Click here to submit it — we\'ll add it &amp; verify you as the owner.</p>' +
          '</div>' +
          '<span class="text-white/40 text-xl">→</span>' +
        '</div>' +
        '<div id="directoryGrid" class="grid grid-cols-1 md:grid-cols-2 gap-6 pb-24"></div>' +
      '</div>';
    var businesses = await apiGet('/api/directory');
    allBusinesses = businesses;
    renderDirectory(allBusinesses);
    return;
  }

  // ── CLAIM EXISTING ────────────────────────────────────────────────────────
  if (page && page.indexOf('claim:') === 0) {
    var bizId = page.split(':')[1];
    var biz = allBusinesses.find(function(b) { return b._id === bizId; });
    content.innerHTML =
      '<div class="px-4 py-8 max-w-lg mx-auto">' +
        '<button onclick="navigate(\'directory\')" class="mb-6 text-white/60 hover:text-white flex items-center gap-2 transition">← Back to Directory</button>' +
        '<h2 class="text-3xl font-bold mb-2">Claim This Business</h2>' +
        '<p class="text-emerald-400 text-lg font-semibold mb-8">' + (biz ? biz.name : 'Business') + '</p>' +
        '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4">' +
          '<p class="text-white/70 text-sm mb-2">Fill in your details so we can verify you\'re the owner. The admin will review and approve your claim.</p>' +
          '<input id="claimPhone" type="tel" placeholder="Your phone number *" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<textarea id="claimMessage" placeholder="Tell us a little about your connection to this business (optional)..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-32 focus:outline-none focus:border-emerald-400 resize-none"></textarea>' +
          '<button onclick="submitClaim(\'' + bizId + '\')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition">Submit Claim Request</button>' +
        '</div>' +
      '</div>';
    return;
  }

  // ── SUBMIT NEW BUSINESS ───────────────────────────────────────────────────
  if (page === 'submit-new-business') {
    var cats = ["Insurance","Restaurants","Auto Repair","Shopping","Beauty","Pets","Entertainment","Plumbing","Real Estate","Home Services","Medical","Dentistry","Legal","Finance","Lawn Care","Electrician","Marinas","Hotels","Butcher","Bait & Tackle"];
    var catOptions = cats.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    content.innerHTML =
      '<div class="px-4 py-8 max-w-lg mx-auto">' +
        '<button onclick="navigate(\'directory\')" class="mb-6 text-white/60 hover:text-white flex items-center gap-2 transition">← Back to Directory</button>' +
        '<h2 class="text-3xl font-bold mb-2">Submit Your Business</h2>' +
        '<p class="text-white/60 mb-8">Not listed yet? Fill this out and the admin will add your business &amp; verify you as the owner.</p>' +
        '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4">' +
          '<input id="newBizName"        type="text" placeholder="Business Name *"          class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<input id="newBizAddress"     type="text" placeholder="Business Address *"       class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<input id="newBizPhone"       type="tel"  placeholder="Business Phone"           class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<input id="newBizWebsite"     type="url"  placeholder="Website (optional)"       class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<select id="newBizCategory" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400"><option value="">Select a Category</option>' + catOptions + '</select>' +
          '<textarea id="newBizDescription" placeholder="Business description..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-28 focus:outline-none focus:border-emerald-400 resize-none"></textarea>' +
          '<input id="newBizOwnerPhone" type="tel"  placeholder="Your personal phone number *" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<p class="text-white/40 text-xs">* Required fields</p>' +
          '<button onclick="submitNewBusiness()" class="w-full bg-amber-500 hover:bg-amber-400 text-white py-5 rounded-3xl font-bold text-lg transition">Submit for Review</button>' +
        '</div>' +
      '</div>';
    return;
  }

  // ── OWNER DASHBOARD ───────────────────────────────────────────────────────
  // FIX: always refresh currentUser from server before checking verifiedOwner
  if (page === 'owner-dashboard') {
    // Refresh user from server so we always have latest verified status
    try {
      const fresh = await apiGet('/api/auth/me');
      if (fresh && !fresh.message) window.currentUser = fresh;
    } catch(e) {}

    if (!window.currentUser || !window.currentUser.verifiedOwner) {
      showSuccessMessage('You need to be a verified business owner.', 'bg-red-600');
      navigate('directory');
      return;
    }

    var biz = window.currentUser.claimedBusiness || {};
    content.innerHTML =
      '<div class="px-4 py-8 max-w-lg mx-auto">' +
        '<h2 class="text-3xl font-bold mb-1">My Business Listing</h2>' +
        '<p class="text-emerald-400 font-semibold mb-6">' + (biz.name || '') + '</p>' +

        // Tab bar
        '<div class="flex border-b border-white/20 mb-6">' +
          '<button onclick="ownerTab(0)" id="oTab0" class="flex-1 py-3 font-semibold border-b-2 border-emerald-500 text-white text-sm">✏️ Listing</button>' +
          '<button onclick="ownerTab(1)" id="oTab1" class="flex-1 py-3 font-semibold text-white/50 text-sm">🔥 Deals</button>' +
          '<button onclick="ownerTab(2)" id="oTab2" class="flex-1 py-3 font-semibold text-white/50 text-sm">📅 Events</button>' +
        '</div>' +

        '<div id="oPanel0">' + buildListingEditForm(biz) + '</div>' +
        '<div id="oPanel1" class="hidden"></div>' +
        '<div id="oPanel2" class="hidden"></div>' +
      '</div>';

    // load deals + events panels
    loadOwnerDeals();
    loadOwnerEvents();
    return;
  }

  // ── POST DEAL ──────────────────────────────────────────────────────────────
  if (page === 'post-deal') {
    if (!window.currentUser || !window.currentUser.verifiedOwner) {
      showSuccessMessage('Verified business owners only.', 'bg-red-600');
      navigate('directory'); return;
    }
    content.innerHTML =
      '<div class="px-4 py-8 max-w-lg mx-auto">' +
        '<button onclick="navigate(\'owner-dashboard\')" class="mb-6 text-white/60 hover:text-white flex items-center gap-2 transition">← Back</button>' +
        '<h2 class="text-3xl font-bold mb-8">Post a Deal</h2>' +
        '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4">' +
          '<input id="dealTitle" type="text" placeholder="Deal title..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<textarea id="dealDescription" placeholder="Describe the deal..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-32 focus:outline-none focus:border-emerald-400 resize-none"></textarea>' +
          '<input id="dealExpires" type="date" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400">' +
          '<button onclick="postDeal()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition">🔥 Post Deal</button>' +
        '</div>' +
      '</div>';
    return;
  }

  // ── POST EVENT ─────────────────────────────────────────────────────────────
  if (page === 'post-event') {
    if (!window.currentUser || !window.currentUser.verifiedOwner) {
      showSuccessMessage('Verified business owners only.', 'bg-red-600');
      navigate('directory'); return;
    }
    content.innerHTML =
      '<div class="px-4 py-8 max-w-lg mx-auto">' +
        '<button onclick="navigate(\'owner-dashboard\')" class="mb-6 text-white/60 hover:text-white flex items-center gap-2 transition">← Back</button>' +
        '<h2 class="text-3xl font-bold mb-8">Post an Event</h2>' +
        '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4">' +
          '<input id="eventTitle" type="text" placeholder="Event name..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<input id="eventDate"  type="date" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400">' +
          '<input id="eventLocation" type="text" placeholder="Location (optional)" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
          '<textarea id="eventDescription" placeholder="Details about the event..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-32 focus:outline-none focus:border-emerald-400 resize-none"></textarea>' +
          '<button onclick="postEvent()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition">📅 Post Event</button>' +
        '</div>' +
      '</div>';
    return;
  }

  // ── SHOUTOUTS ─────────────────────────────────────────────────────────────
  if (page === 'shoutouts') {
    content.innerHTML = `<div class="px-4 py-8"><h2 class="text-3xl font-bold mb-6">📣 Community Shoutouts</h2><div id="shoutoutsList" class="space-y-6"></div></div>`;
    try {
      const shoutouts = await apiGet('/api/shoutouts');
      renderShoutouts(shoutouts);
    } catch(e) {
      document.getElementById('shoutoutsList').innerHTML = '<p class="text-white/60 text-center py-12">No shoutouts yet.</p>';
    }
    return;
  }

  // ── DEALS ─────────────────────────────────────────────────────────────────
  if (page === 'deals') {
    content.innerHTML = `<div class="px-4 py-8"><h2 class="text-3xl font-bold mb-6">🔥 Local Deals</h2><div id="dealsList" class="space-y-6"></div></div>`;
    try {
      const deals = await apiGet('/api/deals');
      renderDeals(deals);
    } catch(e) {
      document.getElementById('dealsList').innerHTML = '<p class="text-white/60 text-center py-12">No active deals yet.</p>';
    }
    return;
  }

  // ── EVENTS ────────────────────────────────────────────────────────────────
  if (page === 'events') {
    content.innerHTML = `<div class="px-4 py-8"><h2 class="text-3xl font-bold mb-6">📅 Local Events</h2><div id="eventsList" class="space-y-6"></div></div>`;
    try {
      const events = await apiGet('/api/events');
      renderEvents(events);
    } catch(e) {
      document.getElementById('eventsList').innerHTML = '<p class="text-white/60 text-center py-12">No upcoming events yet.</p>';
    }
    return;
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  if (page === 'admin') {
    content.innerHTML =
      '<div class="px-4">' +
        '<h2 class="text-3xl font-bold mb-6">🔧 Admin Panel</h2>' +
        '<div class="flex border-b border-white/20 mb-6 overflow-x-auto">' +
          '<button onclick="switchAdminTab(0)" id="tab0" class="flex-1 min-w-fit py-4 px-3 text-center font-semibold border-b-2 border-emerald-500 text-white whitespace-nowrap">Add / Edit</button>' +
          '<button onclick="switchAdminTab(1)" id="tab1" class="flex-1 min-w-fit py-4 px-3 text-center font-semibold text-white/70 whitespace-nowrap">Manage Businesses</button>' +
          '<button onclick="switchAdminTab(2)" id="tab2" class="flex-1 min-w-fit py-4 px-3 text-center font-semibold text-white/70 whitespace-nowrap relative">Pending Claims <span id="pendingBadge" class="hidden ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5"></span></button>' +
        '</div>' +
        '<div id="adminTab0"></div>' +
        '<div id="adminTab1" class="hidden"></div>' +
        '<div id="adminTab2" class="hidden"></div>' +
      '</div>';
    setTimeout(function() { loadAdminTab(0); loadAdminPendingCount(); }, 50);
    return;
  }
}

// ====================== OWNER DASHBOARD HELPERS ======================

function buildListingEditForm(biz) {
  return '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 space-y-4">' +
    '<h3 class="font-semibold text-lg">✏️ Edit Your Listing</h3>' +
    '<input id="ownerEditName"        type="text" placeholder="Business Name"   value="' + (biz.name        || '') + '" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<input id="ownerEditAddress"     type="text" placeholder="Address"         value="' + (biz.address     || '') + '" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<input id="ownerEditPhone"       type="tel"  placeholder="Phone"           value="' + (biz.phone       || '') + '" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<input id="ownerEditWebsite"     type="url"  placeholder="Website"         value="' + (biz.website     || '') + '" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<textarea id="ownerEditDescription" placeholder="Description" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-28 focus:outline-none focus:border-emerald-400 resize-none">' + (biz.description || '') + '</textarea>' +
    '<button onclick="saveMyListing()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-bold text-lg transition">💾 Save Changes</button>' +
  '</div>';
}

// Owner tab switcher
window.ownerTab = function(tab) {
  [0,1,2].forEach(function(i) {
    var btn   = document.getElementById('oTab'   + i);
    var panel = document.getElementById('oPanel' + i);
    if (!btn || !panel) return;
    if (i === tab) {
      btn.classList.add('border-b-2','border-emerald-500','text-white');
      btn.classList.remove('text-white/50');
      panel.classList.remove('hidden');
    } else {
      btn.classList.remove('border-b-2','border-emerald-500','text-white');
      btn.classList.add('text-white/50');
      panel.classList.add('hidden');
    }
  });
};

// Load owner's own deals into panel 1
async function loadOwnerDeals() {
  var panel = document.getElementById('oPanel1');
  if (!panel) return;
  panel.innerHTML =
    '<div class="mb-4">' +
      '<button onclick="navigate(\'post-deal\')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-3xl font-bold text-base transition">🔥 Post New Deal</button>' +
    '</div>' +
    '<div id="ownerDealsList" class="space-y-4 pb-24"><p class="text-white/40 text-center py-6">Loading...</p></div>';

  try {
    var deals = await apiGet('/api/my/deals');
    var list = document.getElementById('ownerDealsList');
    if (!list) return;
    if (!deals.length) {
      list.innerHTML = '<p class="text-white/40 text-center py-6">No deals posted yet.</p>';
      return;
    }
    list.innerHTML = deals.map(function(d) {
      return '<div class="bg-white/10 border border-white/10 rounded-3xl p-5">' +
        '<h4 class="font-bold text-lg">' + d.title + '</h4>' +
        '<p class="text-white/60 text-sm mt-1">' + (d.description || '') + '</p>' +
        (d.expires ? '<p class="text-amber-400 text-xs mt-2">Expires ' + new Date(d.expires).toLocaleDateString() + '</p>' : '') +
        '<div class="flex gap-3 mt-4">' +
          '<button onclick="editDeal(\'' + d._id + '\')" class="flex-1 py-3 bg-white/20 hover:bg-white/30 rounded-2xl text-sm font-semibold transition">✏️ Edit</button>' +
          '<button onclick="deleteDeal(\'' + d._id + '\')" class="flex-1 py-3 bg-red-500/70 hover:bg-red-500 rounded-2xl text-sm font-semibold transition">🗑️ Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    var list2 = document.getElementById('ownerDealsList');
    if (list2) list2.innerHTML = '<p class="text-red-400 text-center py-6">Could not load deals.</p>';
  }
}

// Load owner's own events into panel 2
async function loadOwnerEvents() {
  var panel = document.getElementById('oPanel2');
  if (!panel) return;
  panel.innerHTML =
    '<div class="mb-4">' +
      '<button onclick="navigate(\'post-event\')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-3xl font-bold text-base transition">📅 Post New Event</button>' +
    '</div>' +
    '<div id="ownerEventsList" class="space-y-4 pb-24"><p class="text-white/40 text-center py-6">Loading...</p></div>';

  try {
    var events = await apiGet('/api/my/events');
    var list = document.getElementById('ownerEventsList');
    if (!list) return;
    if (!events.length) {
      list.innerHTML = '<p class="text-white/40 text-center py-6">No events posted yet.</p>';
      return;
    }
    list.innerHTML = events.map(function(e) {
      return '<div class="bg-white/10 border border-white/10 rounded-3xl p-5">' +
        '<h4 class="font-bold text-lg">' + e.title + '</h4>' +
        '<p class="text-emerald-300 text-sm mt-1">' + new Date(e.date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}) + '</p>' +
        '<p class="text-white/60 text-sm mt-1">' + (e.description || '') + '</p>' +
        (e.location ? '<p class="text-white/40 text-xs mt-1">📍 ' + e.location + '</p>' : '') +
        '<div class="flex gap-3 mt-4">' +
          '<button onclick="editEvent(\'' + e._id + '\')" class="flex-1 py-3 bg-white/20 hover:bg-white/30 rounded-2xl text-sm font-semibold transition">✏️ Edit</button>' +
          '<button onclick="deleteEvent(\'' + e._id + '\')" class="flex-1 py-3 bg-red-500/70 hover:bg-red-500 rounded-2xl text-sm font-semibold transition">🗑️ Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    var list2 = document.getElementById('ownerEventsList');
    if (list2) list2.innerHTML = '<p class="text-red-400 text-center py-6">Could not load events.</p>';
  }
}

// ====================== RENDER FUNCTIONS ======================
function renderShoutouts(shoutouts) {
  const container = document.getElementById('shoutoutsList');
  if (!shoutouts || !shoutouts.length) {
    container.innerHTML = '<p class="text-white/60 text-center py-12">No shoutouts yet. Be the first!</p>';
    return;
  }
  container.innerHTML = shoutouts.map(s => `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
      <p class="text-white/90">${s.text}</p>
      <p class="text-xs text-white/40 mt-3">${s.author ? '— ' + s.author : ''} • ${new Date(s.createdAt).toLocaleDateString()}</p>
    </div>`).join('');
}

function renderDeals(deals) {
  const container = document.getElementById('dealsList');
  if (!deals || !deals.length) {
    container.innerHTML = '<p class="text-white/60 text-center py-12">No active deals yet.</p>';
    return;
  }
  container.innerHTML = deals.map(d => `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
      <h4 class="font-bold text-xl">${d.title}</h4>
      <p class="text-white/70 mt-2">${d.description || ''}</p>
      ${d.expires ? `<p class="text-amber-400 text-sm mt-3">Expires ${new Date(d.expires).toLocaleDateString()}</p>` : ''}
    </div>`).join('');
}

function renderEvents(events) {
  const container = document.getElementById('eventsList');
  if (!events || !events.length) {
    container.innerHTML = '<p class="text-white/60 text-center py-12">No upcoming events yet.</p>';
    return;
  }
  container.innerHTML = events.map(e => `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
      <h4 class="font-bold text-xl">${e.title}</h4>
      <p class="text-emerald-300">${new Date(e.date).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}</p>
      <p class="text-white/70 mt-2">${e.description || ''}</p>
      ${e.location ? `<p class="text-white/60 text-sm mt-1">📍 ${e.location}</p>` : ''}
    </div>`).join('');
}

// ====================== CLAIM / SUBMIT ======================
window.submitClaim = async function(bizId) {
  var phone   = (document.getElementById('claimPhone')   || {}).value || '';
  var message = (document.getElementById('claimMessage') || {}).value || '';
  phone = phone.trim();
  if (!phone) { showSuccessMessage('Please enter your phone number.', 'bg-red-600'); return; }
  try {
    await apiPost('/api/business/' + bizId + '/claim', { ownerPhone: phone, message: message });
    showSuccessMessage('✅ Claim submitted! Admin will review and verify you.');
    navigate('directory');
  } catch (err) {
    showSuccessMessage('Error: ' + err.message, 'bg-red-600');
  }
};

window.submitNewBusiness = async function() {
  var data = {
    businessName:    ((document.getElementById('newBizName')        || {}).value || '').trim(),
    businessAddress: ((document.getElementById('newBizAddress')     || {}).value || '').trim(),
    businessPhone:   ((document.getElementById('newBizPhone')       || {}).value || '').trim(),
    website:         ((document.getElementById('newBizWebsite')     || {}).value || '').trim(),
    category:         (document.getElementById('newBizCategory')    || {}).value || '',
    description:     ((document.getElementById('newBizDescription') || {}).value || '').trim(),
    ownerPhone:      ((document.getElementById('newBizOwnerPhone')  || {}).value || '').trim()
  };
  if (!data.businessName || !data.businessAddress || !data.ownerPhone) {
    showSuccessMessage('Please fill in the required fields.', 'bg-red-600'); return;
  }
  try {
    await apiPost('/api/business/submit-new', data);
    showSuccessMessage('✅ Submitted! Admin will add your business and verify you.');
    navigate('directory');
  } catch (err) {
    showSuccessMessage('Error: ' + err.message, 'bg-red-600');
  }
};

// ====================== SAVE MY LISTING (FIXED + CONFIRM FLOW) ======================
window.saveMyListing = async function() {
  var name        = ((document.getElementById('ownerEditName')        || {}).value || '').trim();
  var address     = ((document.getElementById('ownerEditAddress')     || {}).value || '').trim();
  var phone       = ((document.getElementById('ownerEditPhone')       || {}).value || '').trim();
  var website     = ((document.getElementById('ownerEditWebsite')     || {}).value || '').trim();
  var description = ((document.getElementById('ownerEditDescription') || {}).value || '').trim();

  if (!name || !address) {
    showSuccessMessage('Business name and address are required.', 'bg-red-600');
    return;
  }

  showConfirmation('Save changes to your listing?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiPut('/api/business/my-listing', { name, address, phone, website, description });
      // Refresh user so claimedBusiness reflects new data
      try {
        const fresh = await apiGet('/api/auth/me');
        if (fresh && !fresh.message) window.currentUser = fresh;
      } catch(e) {}
      showSuccessOverlay('Your listing has been updated!', function() {
        navigate('owner-dashboard');
      });
    } catch (err) {
      showSuccessMessage('Error: ' + err.message, 'bg-red-600');
    }
  });
};

// ====================== POST DEAL (CONFIRM FLOW) ======================
window.postDeal = async function() {
  var title       = ((document.getElementById('dealTitle')       || {}).value || '').trim();
  var description = ((document.getElementById('dealDescription') || {}).value || '').trim();
  var expires     =  (document.getElementById('dealExpires')     || {}).value || '';
  if (!title) { showSuccessMessage('Please enter a deal title.', 'bg-red-600'); return; }

  showConfirmation('Post this deal?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiPost('/api/deals', { title, description, expires: expires || undefined });
      showSuccessOverlay('Your deal has been posted!', function() {
        navigate('owner-dashboard');
        // After navigating to dashboard, switch to Deals tab
        setTimeout(function() { if (window.ownerTab) ownerTab(1); }, 200);
      });
    } catch(err) {
      showSuccessMessage('Error: ' + err.message, 'bg-red-600');
    }
  });
};

// ====================== POST EVENT (CONFIRM FLOW) ======================
window.postEvent = async function() {
  var title       = ((document.getElementById('eventTitle')       || {}).value || '').trim();
  var date        =  (document.getElementById('eventDate')        || {}).value || '';
  var location    = ((document.getElementById('eventLocation')    || {}).value || '').trim();
  var description = ((document.getElementById('eventDescription') || {}).value || '').trim();
  if (!title) { showSuccessMessage('Please enter an event name.', 'bg-red-600'); return; }

  showConfirmation('Post this event?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiPost('/api/events', { title, date, location, description });
      showSuccessOverlay('Your event has been posted!', function() {
        navigate('owner-dashboard');
        setTimeout(function() { if (window.ownerTab) ownerTab(2); }, 200);
      });
    } catch(err) {
      showSuccessMessage('Error: ' + err.message, 'bg-red-600');
    }
  });
};

// ====================== EDIT DEAL ======================
window.editDeal = async function(dealId) {
  var deals = [];
  try { deals = await apiGet('/api/my/deals'); } catch(e) {}
  var deal = deals.find(function(d) { return d._id === dealId; });
  if (!deal) { showSuccessMessage('Deal not found.', 'bg-red-600'); return; }

  var div = document.createElement('div');
  div.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] p-4';
  div.innerHTML =
    '<div class="bg-slate-900 text-white rounded-3xl max-w-md w-full p-8 space-y-4 border border-white/10">' +
      '<h3 class="text-2xl font-bold mb-2">✏️ Edit Deal</h3>' +
      '<input id="editDealTitle" type="text" value="' + (deal.title || '') + '" placeholder="Deal title..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
      '<textarea id="editDealDesc" placeholder="Description..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-28 resize-none focus:outline-none focus:border-emerald-400">' + (deal.description || '') + '</textarea>' +
      '<input id="editDealExpires" type="date" value="' + (deal.expires ? deal.expires.slice(0,10) : '') + '" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400">' +
      '<div class="flex gap-3 pt-2">' +
        '<button id="editDealCancel" class="flex-1 py-4 bg-white/10 rounded-3xl font-semibold">Cancel</button>' +
        '<button id="editDealSave"   class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-3xl font-semibold">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);

  div.querySelector('#editDealCancel').onclick = function() { div.remove(); };
  div.querySelector('#editDealSave').onclick = function() {
    var newTitle = (document.getElementById('editDealTitle').value || '').trim();
    var newDesc  = (document.getElementById('editDealDesc').value  || '').trim();
    var newExp   =  document.getElementById('editDealExpires').value || '';
    if (!newTitle) { showSuccessMessage('Title required.', 'bg-red-600'); return; }
    showConfirmation('Save changes to this deal?', async function(confirmed) {
      if (!confirmed) return;
      div.remove();
      try {
        await apiPut('/api/my/deals/' + dealId, { title: newTitle, description: newDesc, expires: newExp || undefined });
        showSuccessOverlay('Deal updated!', function() {
          navigate('owner-dashboard');
          setTimeout(function() { if (window.ownerTab) ownerTab(1); }, 200);
        });
      } catch(err) {
        showSuccessMessage('Error: ' + err.message, 'bg-red-600');
      }
    });
  };
};

// ====================== DELETE DEAL ======================
window.deleteDeal = async function(dealId) {
  showConfirmation('Permanently delete this deal?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiDelete('/api/my/deals/' + dealId);
      showSuccessMessage('Deal deleted.');
      loadOwnerDeals();
    } catch(err) {
      showSuccessMessage('Error: ' + err.message, 'bg-red-600');
    }
  });
};

// ====================== EDIT EVENT ======================
window.editEvent = async function(eventId) {
  var events = [];
  try { events = await apiGet('/api/my/events'); } catch(e) {}
  var ev = events.find(function(e) { return e._id === eventId; });
  if (!ev) { showSuccessMessage('Event not found.', 'bg-red-600'); return; }

  var div = document.createElement('div');
  div.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] p-4';
  div.innerHTML =
    '<div class="bg-slate-900 text-white rounded-3xl max-w-md w-full p-8 space-y-4 border border-white/10">' +
      '<h3 class="text-2xl font-bold mb-2">✏️ Edit Event</h3>' +
      '<input id="editEvTitle"    type="text" value="' + (ev.title    || '') + '" placeholder="Event name..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
      '<input id="editEvDate"     type="date" value="' + (ev.date ? ev.date.slice(0,10) : '') + '" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400">' +
      '<input id="editEvLocation" type="text" value="' + (ev.location || '') + '" placeholder="Location (optional)" class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
      '<textarea id="editEvDesc" placeholder="Description..." class="w-full px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-28 resize-none focus:outline-none focus:border-emerald-400">' + (ev.description || '') + '</textarea>' +
      '<div class="flex gap-3 pt-2">' +
        '<button id="editEvCancel" class="flex-1 py-4 bg-white/10 rounded-3xl font-semibold">Cancel</button>' +
        '<button id="editEvSave"   class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-3xl font-semibold">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);

  div.querySelector('#editEvCancel').onclick = function() { div.remove(); };
  div.querySelector('#editEvSave').onclick = function() {
    var newTitle    = (document.getElementById('editEvTitle').value    || '').trim();
    var newDate     =  document.getElementById('editEvDate').value     || '';
    var newLocation = (document.getElementById('editEvLocation').value || '').trim();
    var newDesc     = (document.getElementById('editEvDesc').value     || '').trim();
    if (!newTitle) { showSuccessMessage('Title required.', 'bg-red-600'); return; }
    showConfirmation('Save changes to this event?', async function(confirmed) {
      if (!confirmed) return;
      div.remove();
      try {
        await apiPut('/api/my/events/' + eventId, { title: newTitle, date: newDate, location: newLocation, description: newDesc });
        showSuccessOverlay('Event updated!', function() {
          navigate('owner-dashboard');
          setTimeout(function() { if (window.ownerTab) ownerTab(2); }, 200);
        });
      } catch(err) {
        showSuccessMessage('Error: ' + err.message, 'bg-red-600');
      }
    });
  };
};

// ====================== DELETE EVENT ======================
window.deleteEvent = async function(eventId) {
  showConfirmation('Permanently delete this event?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiDelete('/api/my/events/' + eventId);
      showSuccessMessage('Event deleted.');
      loadOwnerEvents();
    } catch(err) {
      showSuccessMessage('Error: ' + err.message, 'bg-red-600');
    }
  });
};

// ====================== ADMIN FUNCTIONS ======================
async function loadAdminTab(tab) {
  ['tab0','tab1','tab2'].forEach(function(id, i) {
    var el = document.getElementById(id);
    if (!el) return;
    if (i === tab) {
      el.classList.add('border-b-2','border-emerald-500','text-white');
      el.classList.remove('text-white/70');
    } else {
      el.classList.remove('border-b-2','border-emerald-500','text-white');
      el.classList.add('text-white/70');
    }
  });
  ['adminTab0','adminTab1','adminTab2'].forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', i !== tab);
  });

  if (tab === 0) {
    currentEditingBusiness = null;
    document.getElementById('adminTab0').innerHTML = buildAdminForm();
    populateCategoryDropdown('adminCategory');
  }
  if (tab === 1) {
    document.getElementById('adminTab1').innerHTML = '<div id="manageList" class="space-y-4 pb-24"></div>';
    await loadManageList();
  }
  if (tab === 2) {
    document.getElementById('adminTab2').innerHTML = '<div id="pendingList" class="space-y-5 pb-24"></div>';
    await loadPendingClaims();
  }
}

function buildAdminForm() {
  return '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">' +
    '<h3 id="adminFormTitle" class="font-semibold text-lg mb-4">➕ Add New Business</h3>' +
    '<input id="adminName"     type="text" placeholder="Business Name *"    class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<input id="adminAddress"  type="text" placeholder="Address *"          class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<input id="adminPhone"    type="text" placeholder="Phone"              class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<input id="adminWebsite"  type="text" placeholder="Website (optional)" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<textarea id="adminDescription" placeholder="Description" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 h-28 resize-none focus:outline-none focus:border-emerald-400"></textarea>' +
    '<select id="adminCategory" class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-zinc-800 text-white focus:outline-none focus:border-emerald-400"></select>' +
    '<input id="adminKeywords" type="text" placeholder="Keywords (comma separated)" class="w-full mb-6 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">' +
    '<button onclick="saveBusiness()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-semibold text-lg transition">💾 Save Business</button>' +
  '</div>';
}

function populateCategoryDropdown(id) {
  var select = document.getElementById(id);
  if (!select) return;
  var cats = ["Insurance","Restaurants","Auto Repair","Shopping","Beauty","Pets","Entertainment","Plumbing","Real Estate","Home Services","Medical","Dentistry","Legal","Finance","Lawn Care","Electrician","Marinas","Hotels","Butcher","Bait & Tackle"];
  select.innerHTML = '<option value="" class="bg-zinc-800">Select Category *</option>' +
    cats.map(function(c) { return '<option value="' + c + '" class="bg-zinc-800">' + c + '</option>'; }).join('');
}

window.saveBusiness = async function() {
  var name        = ((document.getElementById('adminName')        || {}).value || '').trim();
  var address     = ((document.getElementById('adminAddress')     || {}).value || '').trim();
  var phone       = ((document.getElementById('adminPhone')       || {}).value || '').trim();
  var website     = ((document.getElementById('adminWebsite')     || {}).value || '').trim();
  var description = ((document.getElementById('adminDescription') || {}).value || '').trim();
  var category    =  (document.getElementById('adminCategory')    || {}).value || '';
  var kw          = ((document.getElementById('adminKeywords')    || {}).value || '');
  var keywords    = kw.split(',').map(function(k) { return k.trim(); }).filter(Boolean);
  if (!name || !address || !category) { showSuccessMessage('Name, Address, and Category required.', 'bg-red-600'); return; }
  var isEditing = !!currentEditingBusiness;
  showConfirmation(isEditing ? 'Save changes to this business?' : 'Add this business to the directory?', async function(confirmed) {
    if (!confirmed) return;
    var data = { name, address, phone, website, description, category, keywords, isPremium: false };
    try {
      if (isEditing) {
        await apiPut('/api/admin/business/' + currentEditingBusiness, data);
        currentEditingBusiness = null;
        showSuccessMessage('✅ Business updated!');
      } else {
        await apiPost('/api/admin/business', data);
        showSuccessMessage('✅ Business added to directory!');
      }
      switchAdminTab(1);
    } catch (err) {
      showSuccessMessage('Error: ' + err.message, 'bg-red-600');
    }
  });
};

async function loadManageList() {
  var businesses = await apiGet('/api/directory');
  allBusinesses = businesses;
  var container = document.getElementById('manageList');
  if (!container) return;
  if (!businesses.length) { container.innerHTML = '<p class="text-white/50 text-center py-8">No businesses yet.</p>'; return; }
  container.innerHTML = businesses.map(function(biz) {
    var catName = (biz.category && biz.category.name) ? biz.category.name : (biz.category || '');
    return '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex justify-between items-center gap-3">' +
      '<div class="min-w-0">' +
        '<h4 class="font-bold text-base truncate">' + biz.name + '</h4>' +
        '<p class="text-sm text-white/50 truncate">' + biz.address + '</p>' +
        '<div class="flex gap-2 mt-1 flex-wrap">' +
          (catName ? '<span class="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">' + catName + '</span>' : '') +
          (biz.verified ? '<span class="text-xs text-emerald-400">✅ Verified</span>' : '<span class="text-xs text-amber-400">⏳ Unverified</span>') +
        '</div>' +
      '</div>' +
      '<div class="flex gap-2 shrink-0">' +
        '<button onclick="editBusiness(\'' + biz._id + '\')" class="px-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-2xl text-sm font-medium transition">✏️</button>' +
        '<button onclick="deleteBusiness(\'' + biz._id + '\')" class="px-4 py-2.5 bg-red-500/80 hover:bg-red-500 rounded-2xl text-sm font-medium transition">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.editBusiness = async function(id) {
  currentEditingBusiness = id;
  var biz = allBusinesses.find(function(b) { return b._id === id; });
  if (!biz) {
    var list = await apiGet('/api/directory');
    allBusinesses = list;
    biz = list.find(function(b) { return b._id === id; });
  }
  if (!biz) { showSuccessMessage('Business not found.', 'bg-red-600'); return; }
  await loadAdminTab(0);
  document.getElementById('adminFormTitle').textContent = '✏️ Editing: ' + biz.name;
  document.getElementById('adminName').value        = biz.name        || '';
  document.getElementById('adminAddress').value     = biz.address     || '';
  document.getElementById('adminPhone').value       = biz.phone       || '';
  document.getElementById('adminWebsite').value     = biz.website     || '';
  document.getElementById('adminDescription').value = biz.description || '';
  document.getElementById('adminKeywords').value    = (biz.keywords   || []).join(', ');
  var catName = (biz.category && biz.category.name) ? biz.category.name : (biz.category || '');
  var sel = document.getElementById('adminCategory');
  var opt = Array.from(sel.options).find(function(o) { return o.value === catName; });
  if (opt) opt.selected = true;
  showSuccessMessage('📝 Edit mode — update and hit Save');
};

window.deleteBusiness = async function(id) {
  showConfirmation('Permanently delete this business?', async function(confirmed) {
    if (!confirmed) return;
    await apiDelete('/api/admin/business/' + id);
    showSuccessMessage('Business deleted.');
    loadManageList();
  });
};

async function loadAdminPendingCount() {
  try {
    var users = await apiGet('/api/admin/pending-claims');
    var badge = document.getElementById('pendingBadge');
    if (badge && users.length > 0) {
      badge.textContent = users.length;
      badge.classList.remove('hidden');
    }
  } catch(e) {}
}

async function loadPendingClaims() {
  var container = document.getElementById('pendingList');
  if (!container) return;
  var users = [];
  try { users = await apiGet('/api/admin/pending-claims'); }
  catch(e) { container.innerHTML = '<p class="text-red-400">Could not load pending claims.</p>'; return; }
  if (!users.length) { container.innerHTML = '<p class="text-white/50 text-center py-8">No pending claims right now. 🎉</p>'; return; }

  container.innerHTML = users.map(function(user) {
    var hasClaim = user.pendingClaim && user.pendingClaim.businessName;
    var typeLabel = hasClaim ? '📋 Existing Business Claim' : '🆕 New Business Submission';
    var typeColor = hasClaim ? 'text-blue-400 bg-blue-400/10 border-blue-400/30' : 'text-amber-400 bg-amber-400/10 border-amber-400/30';
    var bizName   = hasClaim ? user.pendingClaim.businessName    : user.pendingNewBusiness.businessName;
    var bizAddr   = hasClaim ? ((user.pendingClaim.businessId && user.pendingClaim.businessId.address) || '—') : user.pendingNewBusiness.businessAddress;
    var ownerPh   = hasClaim ? user.pendingClaim.ownerPhone      : user.pendingNewBusiness.ownerPhone;
    var extra = hasClaim
      ? (user.pendingClaim.message ? '<p class="text-sm text-white/60 mt-1">💬 "' + user.pendingClaim.message + '"</p>' : '')
      : '<p class="text-sm text-white/60 mt-1">📞 Biz phone: ' + (user.pendingNewBusiness.businessPhone || '—') + '</p>' +
        (user.pendingNewBusiness.website     ? '<p class="text-sm text-white/60">🌐 ' + user.pendingNewBusiness.website  + '</p>' : '') +
        (user.pendingNewBusiness.category    ? '<p class="text-sm text-white/60">📂 ' + user.pendingNewBusiness.category + '</p>' : '') +
        (user.pendingNewBusiness.description ? '<p class="text-sm text-white/60 mt-1 italic">"' + user.pendingNewBusiness.description + '"</p>' : '');
    var submitDate = hasClaim
      ? new Date(user.pendingClaim.submittedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
      : new Date(user.pendingNewBusiness.submittedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var approveBtn = hasClaim
      ? '<button onclick="adminVerifyClaim(\'' + user._id + '\')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-semibold text-sm transition">✅ Verify Owner</button>'
      : '<button onclick="adminApproveNewBusiness(\'' + user._id + '\')" class="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl font-semibold text-sm transition">✅ Add &amp; Verify</button>';

    return '<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">' +
      '<span class="text-xs font-semibold px-3 py-1 rounded-full border ' + typeColor + '">' + typeLabel + '</span>' +
      '<div class="flex items-center gap-3 mt-4">' +
        '<div class="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0">' + user.name[0].toUpperCase() + '</div>' +
        '<div class="min-w-0">' +
          '<p class="font-semibold">' + user.name + '</p>' +
          '<p class="text-sm text-white/60 truncate">' + user.email + '</p>' +
        '</div>' +
        '<span class="ml-auto text-xs text-white/40 shrink-0">' + submitDate + '</span>' +
      '</div>' +
      '<div class="mt-4 bg-white/5 rounded-2xl p-4">' +
        '<p class="font-bold text-lg">' + bizName + '</p>' +
        '<p class="text-sm text-white/60">📍 ' + bizAddr + '</p>' +
        '<p class="text-sm text-white/60">📱 Owner phone: ' + (ownerPh || '—') + '</p>' +
        extra +
      '</div>' +
      '<div class="flex gap-3 mt-5">' +
        approveBtn +
        '<button onclick="adminRejectClaim(\'' + user._id + '\')" class="flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-2xl font-semibold text-sm transition">❌ Reject</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.adminVerifyClaim = async function(userId) {
  showConfirmation('Verify this user as the business owner?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiPut('/api/admin/verify-claim/' + userId, {});
      showSuccessMessage('✅ Owner verified!');
      loadPendingClaims(); loadAdminPendingCount();
    } catch(err) { showSuccessMessage('Error: ' + err.message, 'bg-red-600'); }
  });
};

window.adminApproveNewBusiness = async function(userId) {
  showConfirmation('Add this business and verify the owner?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiPost('/api/admin/approve-new-business/' + userId, {});
      showSuccessMessage('✅ Business added and owner verified!');
      loadPendingClaims(); loadAdminPendingCount();
    } catch(err) { showSuccessMessage('Error: ' + err.message, 'bg-red-600'); }
  });
};

window.adminRejectClaim = async function(userId) {
  showConfirmation('Reject and clear this claim?', async function(confirmed) {
    if (!confirmed) return;
    try {
      await apiDelete('/api/admin/verify-claim/' + userId);
      showSuccessMessage('Claim rejected.');
      loadPendingClaims(); loadAdminPendingCount();
    } catch(err) { showSuccessMessage('Error: ' + err.message, 'bg-red-600'); }
  });
};

// ====================== DIRECTORY CARDS ======================
function renderDirectory(businesses) {
  var grid = document.getElementById('directoryGrid');
  if (!grid) return;
  if (!businesses.length) {
    grid.innerHTML = '<p class="text-white/50 text-center col-span-2 py-12">No businesses found.</p>';
    return;
  }

  grid.innerHTML = businesses.map(function(biz) {
    var total = (biz.ratings || []).length;
    var avg   = total > 0 ? biz.ratings.reduce(function(a,r){return a+r.rating;},0) / total : 0;
    var avgStr = total > 0 ? avg.toFixed(1) : null;
    var stars = Array(5).fill(0).map(function(_,i) {
      return '<span style="color:' + (i < Math.floor(avg) ? '#f59e0b' : '#4b5563') + ';font-size:1rem;">' + (i < Math.floor(avg) ? '★' : '☆') + '</span>';
    }).join('');

    var catName = (biz.category && biz.category.name) ? biz.category.name : (biz.category || '');
    var isClaimed = biz.verified && biz.verifiedOwner;

    var claimButton = !isClaimed
      ? `<button onclick="event.stopImmediatePropagation(); navigate('claim:${biz._id}');"
                 class="mt-4 w-full text-xs bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-2xl font-medium transition shadow-inner">
           🏷️ Claim this business
         </button>`
      : '';

    return '<div onclick="showBusinessDetail(\'' + biz._id + '\')" ' +
           'class="group relative bg-white/5 hover:bg-white/12 backdrop-blur-xl border border-white/10 hover:border-emerald-500/40 rounded-3xl p-6 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-900/30">' +
      (catName ? '<div class="absolute top-4 right-4"><span class="text-xs bg-white/10 text-white/60 px-3 py-1 rounded-full">' + catName + '</span></div>' : '') +
      '<div class="pr-20">' +
        '<h4 class="font-bold text-xl text-white group-hover:text-emerald-300 transition-colors leading-tight">' + biz.name + '</h4>' +
        '<p class="text-white/50 text-sm mt-1">📍 ' + biz.address + '</p>' +
        (biz.phone ? '<p class="text-white/40 text-sm mt-0.5">📞 ' + biz.phone + '</p>' : '') +
      '</div>' +
      (biz.description ? '<p class="text-white/55 text-sm mt-3 leading-snug">' + biz.description.slice(0,90) + (biz.description.length>90?'…':'') + '</p>' : '') +
      '<div class="flex items-center gap-2 mt-3">' + stars + '<span class="text-sm text-white/60">' + (avgStr ? avgStr + ' (' + total + ')' : 'No ratings') + '</span></div>' +
      '<div class="flex gap-2 mt-4 flex-wrap">' +
        (biz.verified  ? '<span class="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full">✅ Verified</span>' : '') +
        (biz.isPremium ? '<span class="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full">⭐ Premium</span>' : '') +
      '</div>' +
      claimButton +
      '<div class="absolute bottom-4 right-5 text-white/20 text-xs group-hover:text-white/40 transition-colors">Tap for details →</div>' +
    '</div>';
  }).join('');
}

function filterDirectory() {
  var term = ((document.getElementById('directorySearch') || {}).value || '').toLowerCase();
  var filtered = allBusinesses.filter(function(b) {
    return b.name.toLowerCase().includes(term) ||
      (b.keywords || []).some(function(k){return k.toLowerCase().includes(term);}) ||
      (b.address || '').toLowerCase().includes(term);
  });
  renderDirectory(filtered);
}

// ====================== BUSINESS DETAIL MODAL ======================
window.showBusinessDetail = async function(id) {
  var biz = allBusinesses.find(function(b) { return b._id === id; });
  if (!biz) return;
  var total  = (biz.ratings || []).length;
  var avg    = total > 0 ? (biz.ratings.reduce(function(a,r){return a+r.rating;},0)/total).toFixed(1) : null;
  var catName = (biz.category && biz.category.name) ? biz.category.name : (biz.category || '');
  var user   = window.currentUser;

  var isVerifiedOwner = user && user.verifiedOwner &&
    user.claimedBusiness &&
    ((user.claimedBusiness._id || user.claimedBusiness).toString() === id);
  var hasPendingClaim = user && user.pendingClaim && user.pendingClaim.businessId &&
    user.pendingClaim.businessId.toString() === id;
  var alreadyClaimed  = !!biz.verifiedOwner;

  var claimSection = '';
  if (isVerifiedOwner) {
    claimSection =
      '<div class="mt-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4 text-center">' +
        '<p class="text-emerald-400 font-semibold">✅ You own this listing</p>' +
        '<button onclick="hideBusinessModal(); navigate(\'owner-dashboard\')" class="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-2xl font-semibold transition">Manage My Listing</button>' +
      '</div>';
  } else if (hasPendingClaim) {
    claimSection =
      '<div class="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 text-center">' +
        '<p class="text-amber-400 font-semibold">⏳ Your claim is pending admin review</p>' +
      '</div>';
  } else if (alreadyClaimed) {
    claimSection =
      '<div class="mt-6 bg-white/5 rounded-2xl px-5 py-3 text-center">' +
        '<p class="text-white/40 text-sm">This business has a verified owner.</p>' +
      '</div>';
  } else if (user) {
    claimSection =
      '<button onclick="hideBusinessModal(); navigate(\'claim:' + id + '\')" ' +
              'class="mt-6 w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-emerald-600 border border-white/20 hover:border-emerald-500 text-white py-4 rounded-2xl font-semibold transition">' +
        '🏢 I own this business — Claim it' +
      '</button>';
  }

  var stars = Array(5).fill(0).map(function(_,i) {
    return '<button data-index="' + i + '" onmouseover="hoverStars(' + (i+1) + ')" onmouseout="resetStars()" onclick="submitRating(\'' + id + '\',' + (i+1) + ')" class="star-btn text-4xl transition-transform hover:scale-110" style="color:#4b5563;background:none;border:none;cursor:pointer;padding:0;">☆</button>';
  }).join('');

  document.body.insertAdjacentHTML('beforeend',
    '<div id="businessModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4" onclick="if(event.target.id===\'businessModal\') hideBusinessModal()">' +
      '<div class="bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-t-3xl md:rounded-3xl max-w-md w-full mx-auto p-8 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">' +
        '<div class="flex items-start justify-between">' +
          '<div class="flex-1 pr-4">' +
            '<h2 class="text-3xl font-bold">' + biz.name + '</h2>' +
            (catName ? '<span class="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full inline-block mt-2">' + catName + '</span>' : '') +
          '</div>' +
          (biz.verified ? '<div class="text-2xl">✅</div>' : '') +
        '</div>' +
        '<p class="text-white/60 mt-3">📍 ' + biz.address + '</p>' +
        (biz.phone   ? '<a href="tel:' + biz.phone + '" class="mt-4 flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-5 py-4 transition"><span class="text-2xl">📞</span><span class="font-semibold text-lg">' + biz.phone + '</span></a>' : '') +
        (biz.website ? '<a href="' + biz.website + '" target="_blank" class="mt-3 flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-5 py-4 transition"><span class="text-2xl">🌐</span><span class="font-semibold text-lg">Visit Website</span></a>' : '') +
        (biz.description ? '<p class="mt-5 text-white/70 leading-relaxed">' + biz.description + '</p>' : '') +
        (avg ? '<div class="mt-5 bg-white/5 rounded-2xl px-5 py-3 flex items-center gap-3"><span class="text-amber-400 text-2xl">★</span><span class="text-xl font-bold">' + avg + '</span><span class="text-white/50 text-sm">from ' + total + ' rating' + (total!==1?'s':'') + '</span></div>' : '') +
        claimSection +
        '<div class="mt-8">' +
          '<p class="text-sm text-white/60 mb-3 font-medium">Rate this business</p>' +
          '<div id="starContainer" class="flex gap-2">' + stars + '</div>' +
          '<p id="starLabel" class="text-xs text-white/40 mt-2 h-4"></p>' +
        '</div>' +
        '<button onclick="hideBusinessModal()" class="mt-8 w-full bg-white/10 hover:bg-white/20 py-5 rounded-3xl font-semibold transition">Close</button>' +
      '</div>' +
    '</div>'
  );
};

var starLabels = ['','Poor','Fair','Good','Great','Excellent'];
window.hoverStars = function(count) {
  var c = document.getElementById('starContainer');
  if (c) c.querySelectorAll('.star-btn').forEach(function(btn,i) { btn.textContent = i<count?'★':'☆'; btn.style.color = i<count?'#f59e0b':'#4b5563'; });
  var l = document.getElementById('starLabel');
  if (l) l.textContent = starLabels[count] || '';
};
window.resetStars = function() {
  var c = document.getElementById('starContainer');
  if (c) c.querySelectorAll('.star-btn').forEach(function(btn) { btn.textContent='☆'; btn.style.color='#4b5563'; });
  var l = document.getElementById('starLabel');
  if (l) l.textContent = '';
};
window.fillStars  = function(count) { hoverStars(count); };
window.hideBusinessModal = function() { var m = document.getElementById('businessModal'); if (m) m.remove(); };
window.submitRating = async function(bizId, rating) {
  try {
    await apiPost('/api/business/' + bizId + '/rate', { rating: rating });
    hideBusinessModal();
    var list = await apiGet('/api/directory');
    allBusinesses = list;
    renderDirectory(allBusinesses);
    showSuccessMessage('⭐ Rating submitted!');
  } catch(e) { showSuccessMessage('Could not submit — are you logged in?', 'bg-red-600'); }
};

// ====================== PROFILE SHEET ======================
async function showProfileSheet() {
  if (!window.currentUser) return;

  try {
    const fresh = await apiGet('/api/auth/me');
    if (fresh && !fresh.message) window.currentUser = fresh;
  } catch(e) {}

  var user    = window.currentUser;
  var sheet   = document.getElementById('profileSheet');
  var content = document.getElementById('sheet-content');
  var isAdmin = user.email === 'imhoggbox@gmail.com';
  var avatarLetter = user.name[0].toUpperCase();
  var lastLogin = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
    : 'Just now';

  var statusBadge  = '';
  var ownerActions = '';

  if (user.verifiedOwner && user.claimedBusiness) {
    var bizName = (user.claimedBusiness.name || 'Your Business');
    statusBadge =
      '<div class="mt-6 px-8 py-6 bg-emerald-600 text-white rounded-3xl text-center shadow-inner">' +
        '<div class="text-5xl mb-3">✅</div>' +
        '<p class="font-bold text-2xl">Verified Business Owner</p>' +
        '<p class="text-white/90 mt-1">' + bizName + '</p>' +
      '</div>';
    ownerActions =
      '<button onclick="hideProfileSheet(); navigate(\'owner-dashboard\')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-semibold text-lg transition">🏬 Manage My Listing</button>' +
      '<button onclick="hideProfileSheet(); navigate(\'post-deal\')"       class="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 py-5 rounded-3xl font-semibold text-lg transition mt-3">🔥 Post New Deal</button>' +
      '<button onclick="hideProfileSheet(); navigate(\'post-event\')"      class="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 py-5 rounded-3xl font-semibold text-lg transition mt-3">📅 Post New Event</button>';
  } else if (user.pendingClaim && user.pendingClaim.businessName) {
    statusBadge =
      '<div class="mt-4 inline-flex items-center gap-2 bg-amber-500/15 text-amber-500 border border-amber-400/30 px-5 py-2 rounded-full text-sm font-semibold">⏳ Claim Pending Review</div>' +
      '<p class="text-gray-500 text-sm mt-1">' + user.pendingClaim.businessName + '</p>';
  } else if (user.pendingNewBusiness && user.pendingNewBusiness.businessName) {
    statusBadge =
      '<div class="mt-4 inline-flex items-center gap-2 bg-amber-500/15 text-amber-500 border border-amber-400/30 px-5 py-2 rounded-full text-sm font-semibold">⏳ New Business Pending</div>' +
      '<p class="text-gray-500 text-sm mt-1">' + user.pendingNewBusiness.businessName + '</p>';
  } else {
    statusBadge = '<div class="mt-4 inline-flex items-center gap-2 bg-gray-100 text-gray-500 px-5 py-2 rounded-full text-sm">👤 Local Resident</div>';
  }

  content.innerHTML =
    '<div class="flex justify-center mb-6">' +
      '<div class="w-24 h-24 bg-emerald-600 rounded-3xl flex items-center justify-center text-6xl font-bold text-white shadow-lg">' + avatarLetter + '</div>' +
    '</div>' +
    '<h2 class="text-3xl font-bold text-slate-900">' + user.name + '</h2>' +
    '<p class="text-emerald-600">' + user.email + '</p>' +
    '<p class="text-gray-400 text-sm mt-1">Last login: ' + lastLogin + '</p>' +
    statusBadge +
    '<div class="mt-8 space-y-3">' +
      ownerActions +
      (isAdmin ? '<button onclick="hideProfileSheet(); navigate(\'admin\')" class="w-full bg-amber-500 hover:bg-amber-400 text-white py-5 rounded-3xl font-semibold text-lg transition">🔧 Admin Panel</button>' : '') +
      '<button onclick="logout()" class="w-full bg-red-500 hover:bg-red-400 text-white py-5 rounded-3xl font-semibold text-lg transition">Log Out</button>' +
      '<button onclick="hideProfileSheet()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-5 rounded-3xl font-semibold text-lg transition">Close</button>' +
    '</div>';

  sheet.classList.remove('hidden');
  setTimeout(function() { var d = sheet.querySelector('div'); if(d) d.classList.remove('translate-y-full'); }, 10);
}

function hideProfileSheet() {
  var sheet = document.getElementById('profileSheet');
  var inner = sheet && sheet.querySelector('div');
  if (inner) inner.classList.add('translate-y-full');
  setTimeout(function() { if(sheet) sheet.classList.add('hidden'); }, 300);
}

function updateUserUI() {
  if (!window.currentUser) return;
  var letter = window.currentUser.name[0].toUpperCase();
  var s = document.getElementById('sidebar-avatar');
  var m = document.getElementById('mobile-avatar');
  if (s) s.innerHTML = letter;
  if (m) m.innerHTML = letter;
}

window.logout = function() { localStorage.removeItem('token'); window.currentUser = null; location.reload(); };
function navigate(page) { loadPage(page); }
window.switchAdminTab = function(tab) { loadAdminTab(tab); };

// ====================== GLOBAL EXPOSE ======================
window.loadPage                = loadPage;
window.navigate                = navigate;
window.renderDirectory         = renderDirectory;
window.filterDirectory         = filterDirectory;
window.showBusinessDetail      = showBusinessDetail;
window.hideBusinessModal       = hideBusinessModal;
window.showProfileSheet        = showProfileSheet;
window.hideProfileSheet        = hideProfileSheet;
window.updateUserUI            = updateUserUI;
window.showConfirmation        = showConfirmation;
window.showSuccessMessage      = showSuccessMessage;
window.saveBusiness            = saveBusiness;
window.editBusiness            = editBusiness;
window.deleteBusiness          = deleteBusiness;
window.submitClaim             = window.submitClaim;
window.submitNewBusiness       = window.submitNewBusiness;
window.saveMyListing           = window.saveMyListing;
window.postDeal                = window.postDeal;
window.postEvent               = window.postEvent;
window.editDeal                = window.editDeal;
window.deleteDeal              = window.deleteDeal;
window.editEvent               = window.editEvent;
window.deleteEvent             = window.deleteEvent;
window.adminVerifyClaim        = window.adminVerifyClaim;
window.adminApproveNewBusiness = window.adminApproveNewBusiness;
window.adminRejectClaim        = window.adminRejectClaim;
window.hoverStars              = window.hoverStars;
window.resetStars              = window.resetStars;
window.fillStars               = window.fillStars;
window.submitRating            = window.submitRating;
window.ownerTab                = window.ownerTab;
window.loadOwnerDeals          = loadOwnerDeals;
window.loadOwnerEvents         = loadOwnerEvents;