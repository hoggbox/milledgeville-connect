let currentPage = 'home';
let allBusinesses = [];
let currentEditingBusiness = null;

async function loadPage(page) {
  currentPage = page;
  const content = document.getElementById('content');
  
  if (page === 'admin') {
    content.innerHTML = `
      <div class="px-4">
        <h2 class="text-3xl font-bold mb-6">🔧 Admin Panel</h2>
        
        <!-- Tabs -->
        <div class="flex border-b border-white/20 mb-6">
          <button onclick="switchAdminTab(0)" id="tab0" class="flex-1 py-4 text-center font-semibold border-b-2 border-emerald-500 text-white">Add / Edit</button>
          <button onclick="switchAdminTab(1)" id="tab1" class="flex-1 py-4 text-center font-semibold text-white/70">Manage Businesses</button>
        </div>

        <!-- Add / Edit Tab -->
        <div id="adminTab0">
          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
            <h3 id="adminFormTitle" class="font-semibold mb-4">Add New Business</h3>
            
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
    return;
  }

  if (page === 'home') {
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
        </div>
      </div>`;
  } 
  else if (page === 'directory') {
    const data = await apiGet('/directory');
    allBusinesses = data.businesses;

    let html = `
      <h2 class="text-3xl md:text-4xl font-bold mb-6 px-4">Local Directory</h2>
      <div class="px-4 mb-6">
        <input id="directorySearch" type="text" placeholder="Search businesses or keywords..." 
               class="w-full bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400 text-base"
               onkeyup="if(event.key==='Enter') filterDirectory()">
      </div>
      <div class="flex gap-2 mb-8 px-4 overflow-x-auto pb-3 hide-scrollbar">
        ${data.categories.map(cat => `
          <button onclick="filterByCategory('${cat._id}')" 
                  class="flex-shrink-0 bg-white/10 hover:bg-white/20 px-5 py-3 rounded-3xl text-sm whitespace-nowrap transition flex items-center gap-2">
            <span>${cat.icon}</span>
            <span>${cat.name}</span>
          </button>`).join('')}
      </div>`;
    html += `<div id="directoryResults" class="px-4"></div>`;
    content.innerHTML = html;
    renderDirectory(allBusinesses);
  } 
  else if (page === 'shoutouts') {
    const shoutouts = await apiGet('/shoutouts');
    let html = `<h2 class="text-3xl md:text-4xl font-bold mb-6 px-4">Community Shoutouts</h2>`;
    if (currentUser) {
      html += `<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-8 mx-4">
        <textarea id="shoutoutInput" rows="3" class="w-full bg-transparent border border-white/30 rounded-3xl p-4 text-white placeholder:text-white/50 focus:outline-none" placeholder="What's happening in Milledgeville?"></textarea>
        <button onclick="postShoutout()" class="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-semibold">Post Shoutout</button>
      </div>`;
    }
    shoutouts.forEach(s => {
      html += `<div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4 mx-4">
        <p class="text-lg">${s.text}</p>
        <p class="text-xs text-white/50 mt-4">${s.author} • ${new Date(s.createdAt).toLocaleDateString()}</p>
      </div>`;
    });
    content.innerHTML = html;
  } 
  else if (page === 'events' || page === 'deals') {
    const items = await apiGet(page === 'events' ? '/events' : '/deals');
    let html = `<h2 class="text-3xl md:text-4xl font-bold mb-6 px-4">${page === 'events' ? 'Upcoming Events' : 'Hot Deals'}</h2>`;
    items.forEach(item => {
      html += `<div class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4 mx-4">
        <div class="font-bold text-xl">${item.title || item.name}</div>
        ${page === 'events' ? `<div class="text-emerald-300">${new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>` : ''}
        <div class="text-sm text-white/80 mt-2">${item.description || item.location || ''}</div>
      </div>`;
    });
    content.innerHTML = html;
  }
}

function switchAdminTab(tab) {
  document.getElementById('adminTab0').classList.toggle('hidden', tab !== 0);
  document.getElementById('adminTab1').classList.toggle('hidden', tab !== 1);
  
  document.getElementById('tab0').classList.toggle('border-b-2', tab === 0);
  document.getElementById('tab0').classList.toggle('border-emerald-500', tab === 0);
  document.getElementById('tab0').classList.toggle('text-white/70', tab !== 0);
  
  document.getElementById('tab1').classList.toggle('border-b-2', tab === 1);
  document.getElementById('tab1').classList.toggle('border-emerald-500', tab === 1);
  document.getElementById('tab1').classList.toggle('text-white/70', tab !== 1);
}

async function loadManageList() {
  const data = await apiGet('/directory');
  const container = document.getElementById('manageList');
  let html = '';
  data.businesses.forEach(b => {
    html += `
      <div class="flex justify-between items-center bg-white/10 p-4 rounded-3xl mb-3">
        <div>
          <div class="font-semibold">${b.name}</div>
          <div class="text-xs text-white/60">${b.address}</div>
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
  const message = isEdit ? `Save changes to "${name}"?` : `Add "${name}" to the directory?`;

  showConfirmation(message, async () => {
    const url = currentEditingBusiness ? `/admin/business/${currentEditingBusiness._id}` : '/admin/business';
    const method = currentEditingBusiness ? 'PUT' : 'POST';

    const result = await apiPost(url, { name, address, phone, website, description, categoryId }, method);

    if (result.message && result.message.includes('success')) {
      alert('✅ Saved successfully!');
      currentEditingBusiness = null;
      loadPage('admin');   // returns to Manage tab
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
  
  window.confirmAction = function(confirmed) {
    document.getElementById('confirmModal').remove();
    if (confirmed) onConfirm();
  };
}

window.editBusiness = async function(id) {
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

window.cancelEdit = function() {
  currentEditingBusiness = null;
  loadPage('admin');
};

window.deleteBusiness = async function(id) {
  if (!confirm('Delete this business permanently?')) return;
  await apiPost(`/admin/business/${id}`, {}, 'DELETE');
  alert('Business deleted');
  loadManageList();
}

function renderDirectory(businesses) {
  const container = document.getElementById('directoryResults');
  let html = '';
  businesses.forEach(b => {
    html += `
      <div onclick="showBusinessDetail('${b._id}')" class="card-hover bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-5 mb-4 cursor-pointer">
        <div class="font-bold text-xl">${b.name}</div>
        <div class="text-emerald-300 text-sm">${b.address || 'Milledgeville, GA'}</div>
        <div class="text-sm mt-2 text-white/80">${b.description || ''}</div>
      </div>`;
  });
  container.innerHTML = html || `<p class="text-center text-white/50 py-12">No results found</p>`;
}

function filterDirectory() {
  const searchTerm = (document.getElementById('directorySearch').value || '').toLowerCase();
  const filtered = allBusinesses.filter(b => 
    b.name.toLowerCase().includes(searchTerm) || 
    (b.description && b.description.toLowerCase().includes(searchTerm))
  );
  renderDirectory(filtered);
}

async function filterByCategory(catId) {
  const filtered = allBusinesses.filter(b => b.category && b.category._id === catId);
  renderDirectory(filtered);
}

function showBusinessDetail(id) {
  const business = allBusinesses.find(b => b._id === id);
  if (!business) return;

  const modalHTML = `
    <div onclick="if(event.target.id==='businessModal')hideBusinessModal()" id="businessModal" class="fixed inset-0 bg-black/70 z-[12000] flex items-end">
      <div onclick="event.stopImmediatePropagation()" class="bg-white text-slate-900 w-full rounded-t-3xl max-h-[85vh] overflow-auto">
        <div class="sticky top-0 bg-white pt-4 pb-2 flex justify-center border-b">
          <div class="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>
        <div class="p-6">
          <h1 class="text-3xl font-bold">${business.name}</h1>
          <p class="text-emerald-600 mt-1">${business.address}</p>
          ${business.phone ? `<a href="tel:${business.phone}" class="block mt-6 text-xl font-semibold text-emerald-600 flex items-center gap-3"><span>📞</span> ${business.phone}</a>` : ''}
          ${business.website ? `<a href="${business.website}" target="_blank" class="block mt-4 text-xl font-semibold text-emerald-600 flex items-center gap-3"><span>🌐</span> Visit Website</a>` : ''}
          <p class="mt-8 text-gray-600">${business.description || 'No description available.'}</p>
          <button onclick="hideBusinessModal()" class="mt-10 w-full bg-gray-200 py-5 rounded-3xl font-semibold">Close</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function hideBusinessModal() {
  const modal = document.getElementById('businessModal');
  if (modal) modal.remove();
}

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
window.saveBusiness = saveBusiness;
window.switchAdminTab = switchAdminTab;
window.editBusiness = editBusiness;
window.cancelEdit = cancelEdit;
window.deleteBusiness = deleteBusiness;