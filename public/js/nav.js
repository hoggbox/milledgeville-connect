const pages = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'directory', icon: '📍', label: 'Directory' },
  { id: 'community', icon: '💬', label: 'Community' },
  { id: 'events', icon: '📅', label: 'Events' },
  { id: 'deals', icon: '🔥', label: 'Deals' }
];

function renderNav() {
  // Desktop sidebar
  let desktopHTML = '';
  pages.forEach(page => {
    desktopHTML += `
      <button onclick="navigate('${page.id}')" 
              class="flex items-center gap-3 w-full text-left px-6 py-4 rounded-3xl hover:bg-white/10 transition text-white">
        <span class="text-3xl">${page.icon}</span>
        <span class="font-medium">${page.label}</span>
      </button>`;
  });
  document.getElementById('desktop-nav').innerHTML = desktopHTML;

  // Mobile bottom nav
  let mobileHTML = '';
  pages.forEach(page => {
    mobileHTML += `
      <button onclick="navigate('${page.id}')" class="flex flex-col items-center text-white/70 hover:text-white transition">
        <span class="text-3xl">${page.icon}</span>
        <span class="text-[10px]">${page.label}</span>
      </button>`;
  });
  document.getElementById('mobile-nav').innerHTML = mobileHTML;
}

window.navigate = loadPage; // defined in data.js