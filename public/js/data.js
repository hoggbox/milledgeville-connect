let currentPage = 'home';
let allBusinesses = [];
let currentEditingBusiness = null;
let currentMessageReceiver = null; // for compose modal
let allMarketplaceItems = [];
let lastBroadcastTime = 0;
// ─── PAGE-LEVEL CACHES ────────────────────────────────────────────────────────
let _allDeals = [];
let _allNews = [];
let _allResources = [];
let _resourceCategories = [];
// ─── DIRECTORY PAGINATION STATE ─────────────────────────────────────────────
let directoryCurrentPage = 1;
const DIRECTORY_PAGE_SIZE = 8;
let currentDirectoryBusinesses = [];
// ─── MARKETPLACE PAGINATION STATE ───────────────────────────────────────────
let marketplaceCurrentPage = 1;
const MARKETPLACE_PAGE_SIZE = 8;
let currentMarketplaceItems = [];
// ─── RESOURCES PAGINATION STATE ─────────────────────────────────────────────
let resourcesCurrentPage = 1;
const RESOURCES_PAGE_SIZE = 8;

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

// ─── Rich-text HTML sanitizer (for news article viewer) ──────────────────────
// Allows a safe subset of formatting tags from the RTE; strips everything else.
function sanitizeNewsHtml(html) {
  if (!html) return '';
  const ALLOWED_TAGS = new Set(['b','strong','i','em','u','br','p','h2','h3','ul','ol','li','blockquote','a','span']);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          // replace with its text content
          const text = document.createTextNode(child.textContent);
          child.replaceWith(text);
          return;
        }
        // Strip all attributes except href on <a>
        [...child.attributes].forEach(attr => {
          if (tag === 'a' && attr.name === 'href') {
            const href = attr.value;
            if (!/^https?:\/\//i.test(href)) child.removeAttribute('href');
            else {
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            }
          } else {
            child.removeAttribute(attr.name);
          }
        });
        clean(child);
      } else {
        child.remove();
      }
    });
  }
  clean(tmp);
  return tmp.innerHTML;
}

// ─── Basic client-side sketchy input / XSS guard (for comments) ─────────────
window.checkForSketchyInput = function(text, type = 'comment') {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;

  // Obvious script / event handler / data URL injection attempts
  if (/<script|javascript:|on\w+\s*=|data:text\/html/i.test(t)) {
    showToast('Please don\'t include scripts or code in comments.', 'error');
    return true;
  }

  // Extremely long single token (spam / link obfuscation)
  if (/\S{55,}/.test(t)) {
    showToast('That looks like spam. Please break it up.', 'error');
    return true;
  }

  // Too many raw URLs in one comment
  const urlCount = (t.match(/https?:\/\//gi) || []).length;
  if (urlCount > 2) {
    showToast('Too many links in one comment.', 'error');
    return true;
  }

  return false; // passes basic checks
};

// ─── RTE helpers ─────────────────────────────────────────────────────────────
window.rteFormat = function(cmd, val) {
  document.getElementById('newsRTE')?.focus();
  document.execCommand(cmd, false, val || null);
  updateRteToolbarState();
};

window.rteInsertLink = function() {
  const url = prompt('Enter URL (must start with https://):');
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) { showToast('URL must start with https://', 'error'); return; }
  const text = window.getSelection()?.toString() || url;
  document.getElementById('newsRTE')?.focus();
  document.execCommand('insertHTML', false, `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`);
};

function updateRteToolbarState() {
  const cmds = ['bold','italic','underline'];
  cmds.forEach(cmd => {
    const btn = document.querySelector(`.rte-btn[title="${cmd.charAt(0).toUpperCase()+cmd.slice(1)}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────
const EMOJI_DATA = {
  '😊 Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱'],
  '👍 People': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🖐','🤷','🙋','🤦','🧍','💁','🧑','👩','👨'],
  '❤️ Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','🕎','🔯','♾️','⚜️','🔰','♻️','✅','❎','💯','❗','‼️','⁉️','❓'],
  '🌟 Symbols': ['⭐','🌟','✨','💫','🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉','🎖️','🏅','🎗️','🎀','🎫','🎟️','🎪','🎭','🎨','🎬','🎤','🎧','📰','📢','📣','🔔','🔕','🔇','🔈','🔉','🔊','📡'],
  '🌍 Nature': ['☀️','🌤','⛅','🌥','☁️','🌦','🌧','⛈','🌩','🌨','❄️','☃️','⛄','🌬','💨','💧','💦','🌊','🌀','🌈','⚡','🔥','🌱','🌿','🍀','🌲','🌳','🌴','🌵','🌾','🍁','🍂','🍃','🌻','🌹','🌷','🌸','🏔','🌋','🏕','🌅','🌄','🌃','🌆','🌇','🌉'],
  '🍕 Food': ['🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥖','🫓','🥨','🧀','🥗','🥙','🌮','🌯','🫔','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','☕','🧋','🥤','🍺','🎉'],
  '✈️ Travel': ['✈️','🚀','🛸','🚁','🛺','🚗','🚕','🚙','🚌','🚎','🚐','🚑','🚒','🚓','🚔','🚖','🚘','🚍','🚛','🚚','🚜','🏎','🏍','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣','🛤','⛽','🛞','🚨','🚥','🚦','🛑','🚧'],
};

let _emojiSavedRange = null;

window.toggleEmojiPicker = function(e) {
  e.stopPropagation();
  const panel = document.getElementById('emojiPickerPanel');
  if (!panel) return;
  const rte = document.getElementById('newsRTE');
  // Save caret position before panel opens
  const sel = window.getSelection();
  if (sel && sel.rangeCount) _emojiSavedRange = sel.getRangeAt(0).cloneRange();
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  if (!isOpen) {
    initEmojiPicker();
    document.getElementById('emojiPickerPanel')?.querySelector('.emoji-search')?.focus();
  }
};

function initEmojiPicker() {
  const catsEl = document.getElementById('emojiCats');
  const gridEl = document.getElementById('emojiGrid');
  if (!catsEl || !gridEl || catsEl.children.length) return; // already init'd
  const cats = Object.keys(EMOJI_DATA);
  catsEl.innerHTML = cats.map((cat, i) =>
    `<button class="emoji-cat-btn${i===0?' active':''}" onclick="showEmojiCat(this,'${CSS.escape(cat)}')">${cat.split(' ')[0]}</button>`
  ).join('');
  renderEmojiGrid(EMOJI_DATA[cats[0]]);
}

window.showEmojiCat = function(btn, catKey) {
  document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const key = Object.keys(EMOJI_DATA).find(k => CSS.escape(k) === catKey);
  if (key) renderEmojiGrid(EMOJI_DATA[key]);
};

function renderEmojiGrid(emojis) {
  const gridEl = document.getElementById('emojiGrid');
  if (!gridEl) return;
  gridEl.innerHTML = emojis.map(e =>
    `<button class="emoji-item" onclick="insertEmoji('${e}')">${e}</button>`
  ).join('');
}

window.filterEmojis = function(query) {
  if (!query) {
    // show active category
    const activeBtn = document.querySelector('.emoji-cat-btn.active');
    if (activeBtn) activeBtn.click();
    return;
  }
  const all = Object.values(EMOJI_DATA).flat();
  renderEmojiGrid(all); // show all and let browser filter visually isn't ideal; just show all
};

window.insertEmoji = function(emoji) {
  const rte = document.getElementById('newsRTE');
  if (!rte) return;
  rte.focus();
  const sel = window.getSelection();
  if (_emojiSavedRange) {
    sel.removeAllRanges();
    sel.addRange(_emojiSavedRange);
  }
  document.execCommand('insertText', false, emoji);
  _emojiSavedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  // keep picker open for multiple emoji
};

// Close emoji picker when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.getElementById('emojiPickerPanel');
  if (panel && !panel.contains(e.target) && e.target.id !== 'emojiToggleBtn') {
    panel.classList.remove('open');
  }
});

/** Returns true if the currently logged-in user is a site admin. */
function isAdmin() {
  return !!(currentUser && currentUser.isAdmin === true);
}

// ─── Star Rating Helper ────────────────────────────────────────────────────────
function renderStars(avg, count, interactive = false, businessId = '') {
  const full = Math.floor(avg);
  if (interactive) {
    let html = `<div class="flex items-center gap-1" id="stars-${businessId}">`;
    for (let i = 1; i <= 5; i++) {
      html += `<button onclick="submitRating('${businessId}', ${i})" 
                       class="text-2xl transition hover:scale-125 star-btn" 
                       data-val="${i}"
                       aria-label="${i} star${i !== 1 ? 's' : ''}"
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

const _ratingInFlight = new Set();

window.submitRating = async function (businessId, score) {
  if (!requireAuth('sign in to rate businesses.')) return;
  if (_ratingInFlight.has(businessId)) return;
  _ratingInFlight.add(businessId);
  try {
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
  } finally {
    _ratingInFlight.delete(businessId);
  }
};


// ─── HANDLE PUSH NOTIFICATION DEEP LINK (ALL TYPES) ─────────────────────────
window.handlePushNotificationClick = async function(data) {
  if (!data?.page) {
    navigate('home');
    return;
  }

  const { page, id } = data;

if (page === 'shoutouts' || page === 'shoutout') {
  navigate('shoutouts');

  if (id) {
    const tryScrollAndHighlight = (attempt = 1) => {
      const el = document.getElementById(`shoutout-${id}`);

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Green highlight
        el.classList.add('!bg-emerald-500/30', 'ring-2', 'ring-emerald-400', 'transition-all');

        setTimeout(() => {
          el.classList.remove('!bg-emerald-500/30', 'ring-2', 'ring-emerald-400');
        }, 2800);
      } 
      else if (attempt < 6) {
        // Retry up to 6 times (every 450ms)
        setTimeout(() => tryScrollAndHighlight(attempt + 1), 450);
      }
    };

    setTimeout(() => tryScrollAndHighlight(), 600);
  }
}
  else if (page === 'marketplace' || page === 'market') {
    await navigate('marketplace');
    if (id) showMarketplaceDetail(id);
  } 
  else if (page === 'lostfound' || page === 'lost') {
    await navigate('lostfound');
    if (id) showLostDetail(id);
  } 
  else if (page === 'events' || page === 'event') {
    await navigate('events');
    if (id) setTimeout(() => showEventDetail(id), 300);
  } 
  else if (page === 'deals' || page === 'deal') {
    await navigate('deals');
    if (id) setTimeout(() => showDealDetail(id), 300);
  } 
  else if (page === 'news') {
    await navigate('news');
    if (id) openNewsArticle(id);
  } 
  else if (page === 'messages') {
    navigate('messages');
    if (id) setTimeout(() => openConversation(id), 800);
  } 
  else if (page === 'business-post') {
    if (id) {
      // Step 1: kick off the home page load in the background (don't await it)
      // Step 2: open the modal immediately — it appends to document.body so
      //         loadPage's modal-killer never touches it, and loadHomePage
      //         renders into #content which is a separate DOM node.
      const contentEl = document.getElementById('content');
      if (contentEl) loadHomePage(contentEl); // fire and forget — don't .then()
      // Small tick to let the home page shell paint before modal opens
      setTimeout(() => window.showBusinessPostModal(id), 100);
    } else {
      navigate('home');
    }
  }
  else if (page === 'directory' || page === 'business') {
    if (id) {
      loadDirectoryAndOpen(id);
    } else {
      navigate('directory');
    }
  }
  else {
    navigate(page);
  }
};

// ─── Service Worker → App message bridge ────────────────────────────────────
// When the SW receives a notification click and the app is already open,
// it posts a message instead of doing a hard navigate so we can deep-link in-place.
// ─── Service Worker → App message bridge ────────────────────────────────────
// When the SW receives a notification click and the app is already open,
// it posts a message instead of doing a hard navigate so we can deep-link in-place.
// OLD (working):
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_NOTIFICATION_CLICK') {
      window.handlePushNotificationClick(event.data.data);
    }
  });
}

// ─── COLD LAUNCH DEEP LINK HANDLER ──────────────────────────────────────────
// Handles when app is opened from a closed state via notification
(function handleColdLaunchDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('notif_page');
    const id   = params.get('notif_id');
    if (page) {
      window.history.replaceState({}, document.title, window.location.pathname);
      // Wait for auth + initial render before firing deep-link
      setTimeout(() => {
        if (typeof window.handlePushNotificationClick === 'function') {
          window.handlePushNotificationClick({ page, id });
        }
      }, 2500);
    }
  } catch (e) {
    console.warn('Cold launch deep-link handler failed:', e);
  }
})();

// developer badge check
function isDeveloper(user) {
  if (!user) return false;
  const email = user.email || '';
  return email.toLowerCase() === 'imhoggbox@gmail.com';
}

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
  if (seconds <= 0) return 'just now';
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

// ─── Share Content Helper ─────────────────────────────────────────────────────
window.shareContent = async function(type, title, extra = '') {
  const appName = 'Milledgeville Connect';
  const labels = {
    shoutout:    '🚦 Traffic Alert',
    market:      '🛒 Marketplace',
    lost:        '🔎 Lost & Found',
    event:       '📅 Event',
    deal:        '🔥 Deal',
    news:        '📰 News',
  };
  const label = labels[type] || appName;
  const shareText = `${label}: ${title}${extra ? '\n' + extra : ''}\n\nPosted on ${appName}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `${label} — ${appName}`, text: shareText });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled — do nothing
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(shareText);
    showToast('📋 Copied to clipboard!', 'success');
  } catch (e) {
    showToast('Could not share — try copying manually', 'error');
  }
};


// ─── SAFE Clickable User Helper (Clean Rep Badge) ─────────────────────────────
function renderClickableUser(userData, fallbackName = 'Anonymous') {
  if (!userData) return fallbackName;

  let userId = null;
  let displayName = fallbackName;
  let reputation = 0;
  let email = '';

  if (typeof userData === 'object' && userData !== null) {
    userId = userData._id || userData.id;
    displayName = userData.name || userData.authorName || userData.author || fallbackName;
    reputation = userData.reputation || 0;
    email = userData.email || '';
  } else if (typeof userData === 'string' && userData.length > 10) {
    userId = userData;
  }

  if (!userId) return displayName;

  const repHTML = reputation >= 10 
    ? `<span class="ml-1.5 inline-flex items-center gap-0.5 bg-gradient-to-r from-amber-400 to-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">⭐${reputation}</span>`
    : '';

  // === DEVELOPER BADGE (only for you) ===
  const devBadge = (email.toLowerCase() === 'imhoggbox@gmail.com')
    ? `<span class="ml-1.5 inline-flex items-center gap-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">👨‍💻 Dev</span>`
    : '';

  return `<span onclick="event.stopImmediatePropagation(); showUserProfileModal('${userId}')" 
                class="cursor-pointer hover:underline text-emerald-400 inline-flex items-center">
            ${displayName}${repHTML}${devBadge}
          </span>`;
}

// ─── User Profile Modal Z-Index Fix ──────────────────────────────────────────
// Ensures the user profile modal always stacks above detail modals (z-[14000]+)
// by elevating it to z-[20000] immediately after showUserProfileModal opens it.
(function patchUserProfileModalZIndex() {
  const PROFILE_MODAL_ID = 'userProfileModal';
  const TARGET_Z = '20000';

  // MutationObserver watching for the modal being added to body
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Direct match or contains the modal
        const modal = node.id === PROFILE_MODAL_ID ? node : node.querySelector?.(`#${PROFILE_MODAL_ID}`);
        if (modal) {
          modal.style.zIndex = TARGET_Z;
          // Also apply Tailwind-style class if used
          modal.classList.forEach(cls => {
            if (/^z-\[/.test(cls)) modal.classList.remove(cls);
          });
          modal.classList.add(`z-[${TARGET_Z}]`);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: false });
})();

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
  // ⚠️ Play Store policy: updates must go through the Play Store, not a direct APK link.
  // Replace PLAY_STORE_URL below with your actual app listing URL.
  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.milledgevilleconnect.app';
  apiPost('/analytics/update-clicked', { version: CURRENT_APP_VERSION }).catch(() => {});
  window.open(PLAY_STORE_URL, '_blank');
  dismissUpdateBanner();
  showToast("✅ Opening Play Store...", "success");
};

async function checkForAppUpdate() {
  try {
    const data = await apiGet('/app/version');
    if (data && data.latest && data.latest !== CURRENT_APP_VERSION) {
      setTimeout(() => showUpdateBanner(data.latest), 1500);
    }
  } catch (e) {
    // Update check is non-critical — fail silently
  }
}

// ─── IMAGE COMPRESSION HELPER ─────────────────────────────────────────────
async function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          const isPng = file.type === 'image/png';
          const outputType = isPng ? 'image/png' : 'image/jpeg';
          resolve(new File([blob], file.name, { type: outputType }));
        }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', file.type === 'image/png' ? undefined : quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
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

  try {
    await apiPost('/messages/mark-as-read', { otherId });
  } catch (e) {
    console.warn('⚠️ Backend mark-as-read failed (endpoint missing?) — badge may be stale');
  }

  // Re-fetch the true unread count so other unread threads stay reflected in the badge
  updateMessageBadge();
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
  const PERMANENT_MODALS = new Set(['authModal', 'profileSheet', 'userProfileModal', 'bizPostDetailModal']);
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
  if (page === 'news')            { await loadNewsPage(content);          return; }
  if (page === 'post-news')       { await loadPostNewsPage(content);      return; }
  if (page === 'resources')       { await loadResourcesPage(content);     return; }
}

window.navigate = loadPage;

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
        resultsContainer.innerHTML = `<div class="p-4 text-white/60 text-sm">No results found for "${esc(q)}"</div>`;
        resultsContainer.classList.remove('hidden');
        return;
      }

let html = '';
res.results.forEach(item => {
  html += `
    <div onclick="handleSearchResultClick('${item.type}', '${item.id}')" 
         class="flex items-center gap-3 px-4 py-3 hover:bg-white/10 cursor-pointer border-b border-white/10 last:border-none">
      <span class="text-2xl">${esc(item.icon || '')}</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-white text-sm leading-tight">${esc(item.title || '')}</p>
        <p class="text-white/60 text-xs line-clamp-1">${esc(item.subtitle || '')}</p>
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
  if (resultsContainer) resultsContainer.classList.add('hidden');
  const input = document.getElementById('globalSearchInput');
  if (input) input.value = '';

  if (type === 'business') {
    loadDirectoryAndOpen(id);
  } else if (type === 'event') {
    navigate('events');
    setTimeout(() => showEventDetail(id), 600);
  } else if (type === 'deal') {
    navigate('deals');
    setTimeout(() => showDealDetail(id), 600);
  } else if (type === 'news') {
    openNewsArticle(id);
  } else if (type === 'shoutout') {
    navigate('shoutouts');
    setTimeout(() => {
      const el = document.getElementById(`shoutout-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
  } else if (type === 'market') {
    navigate('marketplace');
    setTimeout(() => showMarketplaceDetail(id), 600);
  } else if (type === 'lost') {
    navigate('lostfound');
    setTimeout(() => showLostDetail(id), 600);
  }
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

  // === ONBOARDING TOUR FOR FIRST-TIME USERS ===
  if (!localStorage.getItem('onboardingCompleted')) {
    setTimeout(() => {
      showOnboardingTour();
    }, 1200);   // Slight delay so the page feels loaded first
  }

// ─── HOME PAGE — WITH BUSINESS SPOTLIGHT + FILTERS + TODAY DIGEST ─────
async function loadHomePage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-8">

      <!-- Today in Milledgeville (Compact) -->
      <div class="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 rounded-3xl p-5 md:p-6 mb-8 text-white overflow-hidden relative">
        <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle at 80% 20%, white 1px, transparent 1px);background-size:24px 24px;"></div>
        
        <div class="relative grid grid-cols-1 md:grid-cols-2 gap-5 mb-2">
          
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

        <!-- Ad Spot -->
        <div id="todayDigest" class="w-full"></div>
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
// ─── SPOTLIGHT (Home Page) ───────────────────────────────────────────────────
function _renderSpotlight(businesses) {
  const spotEl = document.getElementById('spotlightScroll');
  if (!spotEl) return;

  let sb = [...businesses]
    .filter(b => b.avgRating && b.avgRating > 0)
    .sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))
    .slice(0, 8);

  if (!sb.length) sb = [...businesses].slice(0, 8);

  spotEl.innerHTML = sb.map(b => {
    return `
      <div onclick="showBusinessDetail('${b._id}')"
           class="snap-center flex-shrink-0 w-56 bg-white/10 hover:bg-white/15 border border-white/10 rounded-3xl p-4 cursor-pointer transition relative">

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
      </div>`;
  }).join('');
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
  apiGet('/events?limit=200').catch(() => ({ events: [] })),
  apiGet('/deals').catch(() => ({ deals: [] })),
  apiGet('/news').catch(() => []),
  apiGet('/shoutouts').catch(() => ({ shoutouts: [] }))
]);

const eventsData = eventsRes.events || [];
const dealsData  = dealsRes.deals || [];
const shoutoutsData = shoutoutsRes.shoutouts || [];

  // Ad Spotlight — full-width strip, same height as weather widget
  let spotlightAdData = null;
  try { spotlightAdData = await apiGet('/admin/spotlight-ad'); } catch(e) {}

  const digestHTML = spotlightAdData && spotlightAdData.image
    ? `<div class="relative w-full overflow-hidden rounded-2xl cursor-pointer"
            style="height:72px;"
            onclick="${spotlightAdData.link ? `window.open('${spotlightAdData.link}','_blank')` : ''}">
         <div class="absolute top-1.5 left-1.5 z-10">
           <span class="text-[8px] uppercase tracking-widest font-bold bg-amber-400 text-black px-1.5 py-0.5 rounded-full">Ad</span>
         </div>
         <img src="${spotlightAdData.image}" alt="${spotlightAdData.businessName || 'Sponsored'}"
              class="w-full h-full object-cover" style="display:block;">
         ${spotlightAdData.businessName ? `<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-1.5 pt-4 rounded-b-2xl">
           <p class="text-white text-[11px] font-semibold leading-tight truncate">${spotlightAdData.businessName}</p>
         </div>` : ''}
       </div>`
    : `<div class="w-full bg-white/5 border border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-3" style="height:72px;">
         <span class="text-xl">📣</span>
         <div class="text-center">
           <p class="text-[10px] text-white/40 font-semibold uppercase tracking-wide">Ad Spotlight</p>
           <p class="text-[9px] text-white/25 mt-0.5">Your business here — contact admin</p>
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
    const newsThumb = n.images && n.images[0] ? n.images[0] : null;
    html += `
      <div onclick="openNewsArticle('${n._id}')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        ${newsThumb ? `<img src="${newsThumb}" class="w-20 h-20 object-cover rounded-2xl flex-shrink-0 self-start" loading="lazy" alt="" onerror="this.style.display='none'">` : ''}
        <div class="flex-1 min-w-0">
          <span class="text-xs bg-blue-500 px-3 py-1 rounded-full">📰 NEWS</span>
          <h4 class="font-semibold text-lg mt-2">${esc(n.title)}</h4>
          <p class="text-white/70 line-clamp-2">${esc(n.summary || '')}</p>
          <div class="text-xs text-white/50 mt-3">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
  } else if (item.type === 'event') {
    const e = item.data;
    html += `
      <div onclick="navigate('events')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-amber-500 px-3 py-1 rounded-full">📅 EVENT</span>
          <h4 class="font-semibold text-lg mt-2">${esc(e.title)}</h4>
          <p class="text-white/70">${esc(e.description || '')}</p>
          <div class="text-xs text-white/50 mt-3">${formatDate(e.date)}</div>
        </div>
      </div>`;
  } else if (item.type === 'deal') {
    const d = item.data;
    html += `
      <div onclick="navigate('deals')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-red-500 px-3 py-1 rounded-full">🔥 DEAL</span>
          <h4 class="font-semibold text-lg mt-2">${esc(d.title)}</h4>
          <p class="text-white/70">${esc(d.description || '')}</p>
          <div class="text-xs text-white/50 mt-3">${timeAgo(d.createdAt)}</div>
        </div>
      </div>`;
  } else if (item.type === 'shoutout') {
    const s = item.data;
    html += `
      <div onclick="navigate('shoutouts')" class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        <div class="flex-1">
          <span class="text-xs bg-orange-500 px-3 py-1 rounded-full">🚦 TRAFFIC ALERT</span>
          <h4 class="font-semibold text-lg mt-2 line-clamp-2">${esc(s.text)}</h4>
          <div class="text-xs text-white/50 mt-3">by ${esc(s.author || s.authorName || 'Community')} · ${timeAgo(s.createdAt)}</div>
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
  if (!article || article.message) { 
    showToast('Could not load article', 'error'); 
    return; 
  }

  const userIsAdmin = isAdmin();
  const isAuthor = currentUser && article.author && 
    (article.author === currentUser._id || article.author === currentUser.id);
  const canDelete = userIsAdmin || isAuthor;

  const imagesHTML = (article.images || []).length > 0
    ? `<div class="mt-6 grid grid-cols-2 gap-3">
        ${article.images.map((src, i) => `
          <div onclick="openImageViewer('${articleId}', ${i})"
               class="rounded-2xl overflow-hidden cursor-pointer hover:opacity-90 transition aspect-video bg-white/5">
            <img src="${src}" alt="Photo ${i+1}" class="w-full h-full object-cover" loading="lazy">
          </div>`).join('')}
       </div>` : '';

  const modalHTML = `
    <style>
      .news-article-body h2 { font-size:1.35em; font-weight:700; margin:0.8em 0 0.3em; }
      .news-article-body h3 { font-size:1.1em; font-weight:600; margin:0.7em 0 0.3em; }
      .news-article-body ul,.news-article-body ol { padding-left:1.4em; margin:0.4em 0; }
      .news-article-body li { margin-bottom:0.25em; }
      .news-article-body blockquote { border-left:3px solid #34d399; padding-left:14px; color:rgba(255,255,255,0.65); margin:0.6em 0; font-style:italic; }
      .news-article-body a { color:#34d399; text-decoration:underline; }
      .news-article-body p { margin-bottom:0.6em; }
    </style>
    <div onclick="if(event.target.id==='newsArticleModal') closeNewsArticle()" id="newsArticleModal"
         class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[12000] flex items-end md:items-center md:justify-center overflow-y-auto">
      
      <div onclick="event.stopImmediatePropagation()"
           class="bg-[#0f172a] text-white w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl border border-white/10">

        <div class="sticky top-0 bg-[#0f172a] pt-4 pb-3 px-6 border-b border-white/10 flex justify-between items-center z-10 rounded-t-3xl">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">📰 News</span>
          </div>
          <button onclick="closeNewsArticle()" class="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div class="p-6">
          <h1 class="text-2xl md:text-3xl font-bold leading-tight mb-3">${esc(article.title)}</h1>
          <p class="text-emerald-400 font-medium text-sm mb-6">${esc(article.summary)}</p>

          <div class="flex items-center gap-3 mb-6 pb-6 border-b border-white/10">
            <div class="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              ${(article.authorName || 'S')[0].toUpperCase()}
            </div>
            <div>
              <p class="text-sm font-semibold">${article.authorName || 'Staff'}</p>
              <p class="text-xs text-white/40">${formatDateTime(article.createdAt)}</p>
            </div>
          </div>

          <div class="prose prose-invert max-w-none text-white/90 leading-relaxed text-[15px] news-article-body">
            ${sanitizeNewsHtml(article.content)}
          </div>

          ${imagesHTML}

          <!-- ── COMMENT SECTION ── -->
          <div style="margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;">
            <div style="display:flex;align-items:center;gap:2px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
              <button onclick="setNewsCommentSort('${article._id}','relevant')" id="ncsort-relevant-${article._id}"
                      style="font-size:11px;border:none;border-radius:10px;padding:4px 10px;cursor:pointer;font-weight:700;background:rgba(52,211,153,0.18);color:#34d399;">Relevant</button>
              <button onclick="setNewsCommentSort('${article._id}','newest')" id="ncsort-newest-${article._id}"
                      style="font-size:11px;border:none;border-radius:10px;padding:4px 10px;cursor:pointer;font-weight:600;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);">Newest</button>
              <button onclick="setNewsCommentSort('${article._id}','all')" id="ncsort-all-${article._id}"
                      style="font-size:11px;border:none;border-radius:10px;padding:4px 10px;cursor:pointer;font-weight:600;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);">All</button>
              <span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.35);">💬 <span id="news-comment-count-${article._id}">${(article.comments||[]).length}</span></span>
            </div>
            <div id="news-comment-list-${article._id}" style="padding:4px 0 0;"></div>
            <div id="news-comment-more-${article._id}" style="display:none;padding:4px 0 8px;">
              <button onclick="expandNewsComments('${article._id}')"
                      style="background:none;border:none;color:rgba(52,211,153,0.8);font-size:12px;cursor:pointer;padding:0;font-weight:600;"></button>
            </div>
            ${currentUser ? `
            <div style="display:flex;align-items:center;gap-8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:8px 12px;margin-top:8px;gap:8px;">
              <div style="width:28px;height:28px;background:#475569;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${currentUser.name[0].toUpperCase()}</div>
              <input id="news-commentinput-${article._id}" type="text" placeholder="Write a comment…"
                     style="flex:1;background:transparent;border:none;color:white;font-size:13px;outline:none;"
                     onkeydown="if(event.key==='Enter'){event.preventDefault();submitNewsComment('${article._id}');}">
              <button type="button" onclick="toggleNewsCommentEmoji('${article._id}',event)"
                      style="background:none;border:none;cursor:pointer;font-size:16px;padding:0;line-height:1;" title="Emoji">😊</button>
              <div id="news-comment-img-preview-${article._id}" style="display:none;position:relative;align-items:center;">
                <img id="news-comment-img-thumb-${article._id}" style="height:28px;width:28px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.2);">
                <button onclick="clearNewsCommentImage('${article._id}')"
                        style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;background:#ef4444;border:none;border-radius:50%;color:white;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
              </div>
              <button onclick="submitNewsComment('${article._id}')"
                      style="background:#34d399;border:none;border-radius:12px;color:#0f172a;font-size:12px;font-weight:700;padding:5px 12px;cursor:pointer;">Post</button>
            </div>
            <div id="news-comment-emoji-panel-${article._id}" style="display:none;padding-left:38px;margin-top:6px;">
              <div style="background:rgba(15,23,42,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:8px;">
                <input type="text" placeholder="Search emoji…" oninput="filterNewsCommentEmoji('${article._id}',this.value)"
                       style="width:100%;background:rgba(255,255,255,0.06);border:none;border-radius:8px;padding:5px 8px;color:white;font-size:11px;outline:none;margin-bottom:6px;box-sizing:border-box;">
                <div id="news-comment-emoji-cats-${article._id}" style="display:flex;gap:4px;margin-bottom:6px;overflow-x:auto;padding-bottom:2px;"></div>
                <div id="news-comment-emoji-grid-${article._id}" style="display:grid;grid-template-columns:repeat(auto-fill,28px);gap:2px;max-height:100px;overflow-y:auto;"></div>
              </div>
            </div>` : `
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.4);"><button onclick="showAuthModal()" style="background:none;border:none;color:#34d399;cursor:pointer;font-weight:700;padding:0;">Sign in</button> to comment</p>`}
          </div>

          <div class="mt-8 space-y-3">
            ${canDelete ? `
              <button onclick="deleteNewsArticle('${article._id}')" 
                      class="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 py-3.5 rounded-3xl font-semibold transition">
                🗑️ Delete Article
              </button>` : ''}

            <button onclick="closeNewsArticle()" 
                    class="w-full bg-white/10 hover:bg-white/20 py-4 rounded-3xl font-semibold transition">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  window._newsArticleImages = article.images || [];

  // Seed comment cache and render
  if (!window._newsCommentSortState) window._newsCommentSortState = {};
  if (!window._newsCommentDataCache) window._newsCommentDataCache = {};
  window._newsCommentSortState[article._id] = 'relevant';
  window._newsCommentDataCache[article._id] = article.comments || [];
  _renderNewsCommentList(article._id);
  setNewsCommentSort(article._id, 'relevant');
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

// ─── NEWS COMMENTS ────────────────────────────────────────────────────────────
if (!window._newsCommentSortState) window._newsCommentSortState = {};
if (!window._newsCommentDataCache) window._newsCommentDataCache = {};
if (!window._newsCommentImages)    window._newsCommentImages    = {};
const NEWS_COMMENT_PREVIEW = 3;

function renderNewsCommentRow(c, articleId) {
  const cLetter = c.author ? c.author[0].toUpperCase() : '?';
  const replies  = c.replies || [];
  const userIsAdmin = isAdmin();
  const isCommentAuthor = currentUser && (c.authorId === currentUser._id || c.authorId === currentUser.id);

  let repliesHtml = '';
  if (replies.length) {
    repliesHtml = `<div class="ml-9 mt-1 space-y-1">`;
    replies.forEach(r => {
      const rLetter = r.author ? r.author[0].toUpperCase() : '?';
      repliesHtml += `
        <div class="flex items-start gap-2" id="news-reply-${r._id}">
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
    <div class="comment-block" id="news-comment-${c._id}">
      <div class="flex items-start gap-2">
        <div class="w-7 h-7 bg-slate-600 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">${cLetter}</div>
        <div class="flex-1 min-w-0">
          <div class="bg-white/5 rounded-2xl px-3 py-2 inline-block max-w-full">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-semibold text-white/80">${c.author}</span>
              <span class="text-[10px] text-white/30">${timeAgo(c.createdAt)}</span>
              ${isCommentAuthor || userIsAdmin ? `
                <button onclick="deleteNewsComment('${articleId}','${c._id}')"
                        class="text-[10px] text-red-400/50 hover:text-red-400 transition ml-1">✕ delete</button>` : ''}
            </div>
            ${c.text ? `<p class="text-sm text-white/80 mt-0.5">${esc(c.text)}</p>` : ''}
            ${c.image ? `
              <img src="${c.image}" alt="comment image"
                   onclick="openCommentImageLightbox('${c.image}')"
                   style="margin-top:6px;max-width:180px;max-height:160px;object-fit:cover;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.15);">` : ''}
          </div>
          ${currentUser ? `
            <div class="flex items-center gap-3 mt-1 ml-2">
              <button id="news-comment-like-btn-${c._id}" onclick="likeNewsComment('${articleId}','${c._id}')"
                      class="flex items-center gap-1 text-[11px] text-white/40 hover:text-pink-400 transition font-semibold">
                <span id="news-comment-like-icon-${c._id}">${(c.likes||[]).includes(currentUser?._id||currentUser?.id) ? '\u2764\uFE0F' : '\uD83E\uDD0D'}</span>
                <span id="news-comment-like-count-${c._id}">${(c.likes||[]).length || ''}</span>
              </button>
              <button onclick="toggleNewsReplyBox('${articleId}','${c._id}')"
                      class="text-[11px] text-white/40 hover:text-emerald-400 transition font-semibold">Reply</button>
            </div>
            <div id="news-replybox-${c._id}" style="display:none;" class="mt-2 flex items-start gap-2">
              <div class="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">${currentUser.name[0].toUpperCase()}</div>
              <div class="flex-1 flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl px-3 py-1.5">
                <input id="news-replyinput-${c._id}" type="text"
                  class="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none text-sm"
                  placeholder="Reply to ${esc(c.author)}…"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();submitNewsReply('${articleId}','${c._id}');}">
                <button onclick="submitNewsReply('${articleId}','${c._id}')"
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

function _renderNewsCommentList(articleId) {
  const listEl = document.getElementById(`news-comment-list-${articleId}`);
  const moreEl = document.getElementById(`news-comment-more-${articleId}`);
  if (!listEl) return;

  const allComments = window._newsCommentDataCache[articleId] || [];
  const sort = window._newsCommentSortState[articleId] || 'relevant';

  let sorted = [...allComments];
  if (sort === 'relevant') {
    sorted.sort((a, b) => ((b.likes||[]).length - (a.likes||[]).length) || (new Date(b.createdAt) - new Date(a.createdAt)));
  } else if (sort === 'newest') {
    sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const expanded = listEl.dataset.expanded === '1';
  const visible  = expanded ? sorted : sorted.slice(0, NEWS_COMMENT_PREVIEW);
  const hidden   = sorted.length - visible.length;

  listEl.innerHTML = visible.map(c => renderNewsCommentRow(c, articleId)).join('');

  if (moreEl) {
    if (hidden > 0) {
      moreEl.style.display = 'block';
      const btn = moreEl.querySelector('button');
      if (btn) btn.textContent = `▾ View ${hidden} more comment${hidden !== 1 ? 's' : ''}`;
    } else {
      moreEl.style.display = 'none';
    }
  }
}

window.setNewsCommentSort = function(articleId, sort) {
  window._newsCommentSortState[articleId] = sort;
  ['relevant','newest','all'].forEach(s => {
    const btn = document.getElementById(`ncsort-${s}-${articleId}`);
    if (!btn) return;
    const active = s === sort;
    btn.style.background = active ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)';
    btn.style.color      = active ? '#34d399' : 'rgba(255,255,255,0.5)';
    btn.style.fontWeight = active ? '700' : '600';
  });
  _renderNewsCommentList(articleId);
};

window.expandNewsComments = function(articleId) {
  const listEl = document.getElementById(`news-comment-list-${articleId}`);
  if (listEl) listEl.dataset.expanded = '1';
  _renderNewsCommentList(articleId);
};

window.submitNewsComment = async function(articleId) {
  if (!requireAuth('Sign in to comment.')) return;
  const input = document.getElementById(`news-commentinput-${articleId}`);
  const text  = input ? input.value.trim() : '';
  const image = window._newsCommentImages?.[articleId] || null;
  if (!text && !image) return;
  if (text && checkForSketchyInput(text, 'comment')) { if (input) input.value = text; return; }

  if (input) input.value = '';
  clearNewsCommentImage(articleId);
  const ep = document.getElementById(`news-comment-emoji-panel-${articleId}`);
  if (ep) ep.style.display = 'none';

  const res = await apiPost(`/news/${articleId}/comments`, { text, image });
  if (res._id) {
    const newComment = {
      _id:       res._id,
      author:    res.author    || currentUser?.name || '',
      authorId:  res.authorId  || currentUser?._id  || currentUser?.id || '',
      text:      res.text      || text,
      image:     res.image     || image || null,
      likes:     res.likes     || [],
      replies:   res.replies   || [],
      createdAt: res.createdAt || new Date().toISOString(),
    };
    if (!window._newsCommentDataCache[articleId]) window._newsCommentDataCache[articleId] = [];
    window._newsCommentDataCache[articleId].push(newComment);
    const listEl = document.getElementById(`news-comment-list-${articleId}`);
    if (listEl) listEl.dataset.expanded = '1';
    _renderNewsCommentList(articleId);

    const countEl = document.getElementById(`news-comment-count-${articleId}`);
    if (countEl) countEl.textContent = (window._newsCommentDataCache[articleId] || []).length;

    const newInput = document.getElementById(`news-commentinput-${articleId}`);
    if (newInput) setTimeout(() => newInput.focus(), 50);
  } else {
    showToast(res.message || 'Error posting comment', 'error');
  }
};

window.deleteNewsComment = async function(articleId, commentId) {
  if (!confirm('Delete this comment?')) return;
  const res = await apiDelete(`/news/${articleId}/comments/${commentId}`);
  if (res.message === 'Deleted') {
    if (window._newsCommentDataCache[articleId]) {
      window._newsCommentDataCache[articleId] = window._newsCommentDataCache[articleId].filter(c => c._id !== commentId);
    }
    _renderNewsCommentList(articleId);
    const countEl = document.getElementById(`news-comment-count-${articleId}`);
    if (countEl) countEl.textContent = (window._newsCommentDataCache[articleId] || []).length;
  } else {
    showToast(res.message || 'Error', 'error');
  }
};

window.likeNewsComment = async function(articleId, commentId) {
  if (!requireAuth('Sign in to like comments.')) return;
  const res = await apiPost(`/news/${articleId}/comments/${commentId}/like`, {});
  if (res.likes !== undefined) {
    const icon  = document.getElementById(`news-comment-like-icon-${commentId}`);
    const count = document.getElementById(`news-comment-like-count-${commentId}`);
    if (icon)  icon.textContent  = res.liked ? '\u2764\uFE0F' : '\uD83E\uDD0D';
    if (count) count.textContent = res.likes || '';
  }
};

window.toggleNewsReplyBox = function(articleId, commentId) {
  const box = document.getElementById(`news-replybox-${commentId}`);
  if (!box) return;
  const isHidden = box.style.display === 'none' || box.style.display === '';
  box.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) { const inp = document.getElementById(`news-replyinput-${commentId}`); if (inp) inp.focus(); }
};

window.submitNewsReply = async function(articleId, commentId) {
  if (!requireAuth('Sign in to reply.')) return;
  const input = document.getElementById(`news-replyinput-${commentId}`);
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  const res = await apiPost(`/news/${articleId}/comments/${commentId}/replies`, { text });
  if (res._id) {
    const cache = window._newsCommentDataCache[articleId] || [];
    const comment = cache.find(c => c._id === commentId);
    if (comment) {
      comment.replies = comment.replies || [];
      comment.replies.push({ _id: res._id, author: res.author || currentUser?.name, text, createdAt: new Date().toISOString() });
    }
    _renderNewsCommentList(articleId);
  } else {
    showToast(res.message || 'Error posting reply', 'error');
  }
};

// ── News comment emoji panel ──────────────────────────────────────────────────
window.toggleNewsCommentEmoji = function(articleId, e) {
  e.stopPropagation();
  const ep = document.getElementById(`news-comment-emoji-panel-${articleId}`);
  if (!ep) return;
  const opening = ep.style.display === 'none' || ep.style.display === '';
  ep.style.display = opening ? 'block' : 'none';
  if (opening) initNewsCommentEmojiPanel(articleId);
};

function initNewsCommentEmojiPanel(articleId) {
  const catsEl = document.getElementById(`news-comment-emoji-cats-${articleId}`);
  const gridEl = document.getElementById(`news-comment-emoji-grid-${articleId}`);
  if (!catsEl || !gridEl || catsEl.children.length) return;
  const cats = Object.keys(EMOJI_DATA);
  catsEl.innerHTML = cats.map((cat, i) =>
    `<button onclick="showNewsCommentEmojiCat('${articleId}','${CSS.escape(cat)}')"
             style="background:${i===0?'rgba(52,211,153,0.2)':'rgba(255,255,255,0.06)'};border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:14px;white-space:nowrap;flex-shrink:0;"
             data-ncat-btn-${articleId}="${CSS.escape(cat)}">${cat.split(' ')[0]}</button>`
  ).join('');
  renderNewsCommentEmojiGrid(articleId, EMOJI_DATA[cats[0]]);
}

window.showNewsCommentEmojiCat = function(articleId, catKey) {
  const catsEl = document.getElementById(`news-comment-emoji-cats-${articleId}`);
  if (catsEl) [...catsEl.children].forEach(b => b.style.background = 'rgba(255,255,255,0.06)');
  const activeBtn = catsEl?.querySelector(`[data-ncat-btn-${articleId}="${catKey}"]`);
  if (activeBtn) activeBtn.style.background = 'rgba(52,211,153,0.2)';
  const key = Object.keys(EMOJI_DATA).find(k => CSS.escape(k) === catKey);
  if (key) renderNewsCommentEmojiGrid(articleId, EMOJI_DATA[key]);
};

function renderNewsCommentEmojiGrid(articleId, emojis) {
  const gridEl = document.getElementById(`news-comment-emoji-grid-${articleId}`);
  if (!gridEl) return;
  gridEl.innerHTML = emojis.map(em =>
    `<button onclick="insertNewsCommentEmoji('${articleId}','${em}')"
             style="background:none;border:none;cursor:pointer;font-size:18px;padding:2px;border-radius:6px;line-height:1;"
             onmouseover="this.style.background='rgba(255,255,255,0.1)'"
             onmouseout="this.style.background='none'">${em}</button>`
  ).join('');
}

window.filterNewsCommentEmoji = function(articleId, query) {
  renderNewsCommentEmojiGrid(articleId, Object.values(EMOJI_DATA).flat());
};

window.insertNewsCommentEmoji = function(articleId, emoji) {
  const input = document.getElementById(`news-commentinput-${articleId}`);
  if (!input) return;
  const pos = input.selectionStart || input.value.length;
  input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
  input.focus();
  input.selectionStart = input.selectionEnd = pos + emoji.length;
};

window.clearNewsCommentImage = function(articleId) {
  if (window._newsCommentImages) delete window._newsCommentImages[articleId];
  const preview = document.getElementById(`news-comment-img-preview-${articleId}`);
  if (preview) preview.style.display = 'none';
  const thumb = document.getElementById(`news-comment-img-thumb-${articleId}`);
  if (thumb) thumb.src = '';
};

// Close news comment emoji panels when clicking outside
document.addEventListener('click', function(e) {
  document.querySelectorAll('[id^="news-comment-emoji-panel-"]').forEach(panel => {
    if (!panel.contains(e.target) && !e.target.closest('[onclick*="toggleNewsCommentEmoji"]')) {
      panel.style.display = 'none';
    }
  });
});

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


// ─── NEWS PAGE ────────────────────────────────────────────────────────────────
async function loadNewsPage(content) {
  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2 pb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-3xl md:text-4xl font-bold">📰 News</h2>
        ${isAdmin() || (currentUser && currentUser.canPostNews)
          ? `<button onclick="navigate('post-news')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-2xl text-sm font-semibold transition">+ Post Article</button>`
          : ''}
      </div>
      <div id="newsFeedList" class="space-y-4">
        ${[1,2,3].map(() => `<div class="bg-white/5 rounded-3xl p-5 animate-pulse h-28"></div>`).join('')}
      </div>
    </div>`;

  try {
    // Render from cache immediately if available
    if (window._allNews && window._allNews.length) renderArticles(window._allNews);

    const articles = await apiGet('/news');
    const container = document.getElementById('newsFeedList');
    if (!container) return;

    if (!articles || articles.length === 0) {
      if (!window._allNews || !window._allNews.length)
        container.innerHTML = `<p class="text-white/40 text-center py-16">No news articles yet.</p>`;
      return;
    }

    window._allNews = articles;
    renderArticles(articles);
  } catch (err) {
    const container = document.getElementById('newsFeedList');
    if (container && !window._allNews) container.innerHTML = `<p class="text-white/40 text-center py-12">Failed to load news.</p>`;
  }

  function renderArticles(articles) {
    const container = document.getElementById('newsFeedList');
    if (!container) return;
    container.innerHTML = articles.map(n => `
      <div onclick="openNewsArticle('${n._id}')"
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition flex gap-4">
        ${n.images?.[0]
          ? `<img src="${n.images[0]}" class="w-24 h-24 object-cover rounded-2xl flex-shrink-0" loading="lazy" alt="">`
          : `<div class="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0">📰</div>`}
        <div class="flex-1 min-w-0">
          <p class="font-semibold leading-tight line-clamp-2">${esc(n.title)}</p>
          <p class="text-white/60 text-sm mt-1 line-clamp-2">${esc(n.summary || '')}</p>
          <div class="flex items-center gap-2 mt-3 text-xs text-white/40">
            <span>${n.authorName || 'Staff'}</span>
            <span>·</span>
            <span>${timeAgo(n.createdAt)}</span>
          </div>
        </div>
      </div>`).join('');
  }
}

// ─── POST NEWS PAGE ───────────────────────────────────────────────────────────
async function loadPostNewsPage(content) {
  const userIsAdmin   = isAdmin();
  const canPost   = currentUser && (currentUser.canPostNews || userIsAdmin);
  if (!canPost) {
    content.innerHTML = `<div class="max-w-2xl mx-auto px-4 py-12 text-center">
      <p class="text-4xl mb-4">🚫</p>
      <p class="text-white/60">You don't have permission to post news.</p>
    </div>`;
    return;
  }

  const existingNews = await apiGet('/news');

  content.innerHTML = `
    <style>
      /* ── RTE toolbar ── */
      .rte-toolbar { display:flex; flex-wrap:wrap; gap:4px; padding:10px 12px; background:rgba(255,255,255,0.06); border-bottom:1px solid rgba(255,255,255,0.1); border-radius:20px 20px 0 0; }
      .rte-btn { background:rgba(255,255,255,0.08); border:none; color:rgba(255,255,255,0.8); border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center; transition:background 0.15s, color 0.15s; }
      .rte-btn:hover { background:rgba(52,211,153,0.25); color:#fff; }
      .rte-btn.active { background:rgba(52,211,153,0.35); color:#34d399; }
      .rte-sep { width:1px; background:rgba(255,255,255,0.15); margin:4px 2px; align-self:stretch; }
      .rte-select { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.8); border-radius:8px; padding:4px 8px; font-size:12px; cursor:pointer; height:34px; outline:none; }
      .rte-select option { background:#1e293b; color:#fff; }
      #newsRTE { min-height:200px; padding:18px 20px; outline:none; color:#fff; font-size:15px; line-height:1.7; background:rgba(255,255,255,0.03); border-radius:0 0 20px 20px; }
      #newsRTE:empty:before { content:attr(data-placeholder); color:rgba(255,255,255,0.3); pointer-events:none; display:block; }
      #newsRTE h2 { font-size:1.4em; font-weight:700; margin:0.5em 0 0.3em; }
      #newsRTE h3 { font-size:1.15em; font-weight:600; margin:0.5em 0 0.3em; }
      #newsRTE ul,#newsRTE ol { padding-left:1.5em; margin:0.4em 0; }
      #newsRTE blockquote { border-left:3px solid #34d399; padding-left:14px; color:rgba(255,255,255,0.65); margin:0.6em 0; font-style:italic; }
      #newsRTE a { color:#34d399; text-decoration:underline; }
      #newsRTE b,#newsRTE strong { font-weight:700; }
      #newsRTE i,#newsRTE em { font-style:italic; }
      #newsRTE u { text-decoration:underline; }
      /* ── Emoji picker ── */
      #emojiPickerPanel { position:absolute; z-index:9999; background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:16px; padding:12px; width:280px; box-shadow:0 12px 40px rgba(0,0,0,0.5); display:none; }
      #emojiPickerPanel.open { display:block; }
      .emoji-search { width:100%; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:10px; padding:7px 12px; font-size:13px; outline:none; margin-bottom:8px; box-sizing:border-box; }
      .emoji-categories { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; }
      .emoji-cat-btn { background:rgba(255,255,255,0.08); border:none; border-radius:8px; padding:4px 8px; font-size:12px; color:rgba(255,255,255,0.7); cursor:pointer; transition:background 0.15s; }
      .emoji-cat-btn.active,.emoji-cat-btn:hover { background:rgba(52,211,153,0.25); color:#34d399; }
      .emoji-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; max-height:180px; overflow-y:auto; }
      .emoji-grid::-webkit-scrollbar { width:4px; } .emoji-grid::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.2); border-radius:2px; }
      .emoji-item { background:none; border:none; border-radius:8px; font-size:20px; cursor:pointer; width:36px; height:36px; display:flex; align-items:center; justify-content:center; transition:background 0.1s; }
      .emoji-item:hover { background:rgba(255,255,255,0.12); }
    </style>

    <div class="max-w-2xl mx-auto px-2 pb-10">
      <h2 class="text-3xl font-bold mb-6">📰 Post News</h2>

      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-8">
        <h3 class="font-semibold text-lg mb-5">Write a News Article</h3>
        <input id="newsTitle" type="text" placeholder="Headline / Title *"
               class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">
        <input id="newsSummary" type="text" placeholder="Short summary (shown on home page) *"
               class="w-full mb-3 px-5 py-4 rounded-3xl border border-white/30 bg-transparent text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-400">

        <!-- ── Rich Text Editor ── -->
        <div class="border border-white/30 rounded-[20px] mb-4 focus-within:border-emerald-400 transition overflow-visible" style="position:relative">
          <div class="rte-toolbar" id="rteToolbar">
            <select class="rte-select" onchange="rteFormat('formatBlock',this.value); this.value=''">
              <option value="">Paragraph</option>
              <option value="h2">Heading</option>
              <option value="h3">Subheading</option>
            </select>
            <div class="rte-sep"></div>
            <button type="button" class="rte-btn" title="Bold" onclick="rteFormat('bold')"><b>B</b></button>
            <button type="button" class="rte-btn" title="Italic" onclick="rteFormat('italic')"><i>I</i></button>
            <button type="button" class="rte-btn" title="Underline" onclick="rteFormat('underline')"><u>U</u></button>
            <div class="rte-sep"></div>
            <button type="button" class="rte-btn" title="Bullet list" onclick="rteFormat('insertUnorderedList')">≡</button>
            <button type="button" class="rte-btn" title="Numbered list" onclick="rteFormat('insertOrderedList')">①</button>
            <button type="button" class="rte-btn" title="Blockquote" onclick="rteFormat('formatBlock','blockquote')" style="font-size:13px">"&nbsp;"</button>
            <div class="rte-sep"></div>
            <button type="button" class="rte-btn" title="Insert link" onclick="rteInsertLink()">🔗</button>
            <button type="button" class="rte-btn" title="Emoji" id="emojiToggleBtn" onclick="toggleEmojiPicker(event)">😊</button>
            <div class="rte-sep"></div>
            <button type="button" class="rte-btn" title="Clear formatting" onclick="rteFormat('removeFormat')" style="font-size:11px;width:auto;padding:0 8px">Aa✕</button>
          </div>
          <div id="newsRTE" contenteditable="true" data-placeholder="Full article content *"></div>

          <!-- Emoji picker panel (positioned inside the RTE wrapper so it stays in flow) -->
          <div id="emojiPickerPanel">
            <input class="emoji-search" type="text" placeholder="Search emoji…" oninput="filterEmojis(this.value)">
            <div class="emoji-categories" id="emojiCats"></div>
            <div class="emoji-grid" id="emojiGrid"></div>
          </div>
        </div>

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
  const rteEl   = document.getElementById('newsRTE');
  const content = rteEl ? rteEl.innerHTML.trim() : '';
  if (!title || !summary || !content || content === '') { showToast('Title, summary, and content are required', 'error'); return; }

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
  const content = document.getElementById('content');

  if (content) {
    await loadDirectoryPage(content);
  } else {
    navigate('directory');
  }

  // Wait until businesses are actually loaded (handles the async race)
  if (!allBusinesses || allBusinesses.length === 0) {
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (allBusinesses && allBusinesses.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 120);

      // Safety timeout after 6 seconds
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 6000);
    });
  }

  // Now open the specific business card
  if (typeof showBusinessDetail === 'function') {
    showBusinessDetail(businessId);
  } else {
    console.warn('showBusinessDetail not found');
  }
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
      <button onclick="directoryCurrentPage=1; renderDirectory(allBusinesses)"
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

async function loadDirectoryAndOpen(businessId) {
  console.log('🔗 loadDirectoryAndOpen called with:', businessId);   // ← ADD THIS LINE
  // Make sure we're on the directory page
  const content = document.getElementById('content');
  if (content) {
    await loadDirectoryPage(content);
  } else {
    navigate('directory');
  }

  // Give the directory a moment to render, then open the specific business
  setTimeout(() => {
    if (typeof showBusinessDetail === 'function') {
      showBusinessDetail(businessId);
    }
  }, 650);
}

// Make sure it's globally available for the push handler
window.loadDirectoryAndOpen = loadDirectoryAndOpen;

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

function goToDirectoryPage(page) {
  const totalPages = Math.ceil(currentDirectoryBusinesses.length / DIRECTORY_PAGE_SIZE);
  if (page < 1 || page > totalPages) return;

  directoryCurrentPage = page;
  renderDirectory(currentDirectoryBusinesses);
}

// Make sure the function is globally available
window.goToDirectoryPage = goToDirectoryPage;

function renderDirectory(businesses) {
  const container = document.getElementById('directoryResults');
  if (!container) return;

  currentDirectoryBusinesses = businesses || [];

  if (currentDirectoryBusinesses.length === 0) {
    container.innerHTML = `<p class="text-center text-white/50 py-12">No businesses found</p>`;
    return;
  }

  const totalPages = Math.ceil(currentDirectoryBusinesses.length / DIRECTORY_PAGE_SIZE);
  directoryCurrentPage = Math.min(directoryCurrentPage, totalPages);

  const start = (directoryCurrentPage - 1) * DIRECTORY_PAGE_SIZE;
  const pageBusinesses = currentDirectoryBusinesses.slice(start, start + DIRECTORY_PAGE_SIZE);

  let html = '<div class="space-y-3">';

  pageBusinesses.forEach(b => {
    html += `
      <div onclick="showBusinessDetail('${b._id}')" 
           class="bg-[#0f172a] border border-white/10 hover:border-white/20 rounded-3xl p-5 cursor-pointer transition flex items-center gap-4 relative">
        ${b.logo 
          ? `<img src="${b.logo}" class="w-12 h-12 rounded-2xl object-cover flex-shrink-0 border border-white/10" alt="">` 
          : `<div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">${b.category?.icon || '🏪'}</div>`}
        
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-lg leading-tight text-white">${esc(b.name)}</h3>
          </div>
          <p class="text-white/60 text-sm mt-0.5">${esc(b.address || 'Milledgeville, GA')}</p>
          
          ${b.phone ? `<p class="text-emerald-400 text-xs mt-1">📞 ${b.phone}</p>` : ''}
          ${b.hours ? `<p class="text-white/40 text-xs mt-0.5">${b.hours}</p>` : ''}
        </div>
      </div>`;
  });

  html += '</div>';

  // Pagination
  if (totalPages > 1) {
    html += `
      <div class="flex items-center justify-between mt-6 px-1">
        <button onclick="goToDirectoryPage(${directoryCurrentPage - 1})" 
                ${directoryCurrentPage === 1 ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          ← Previous
        </button>

        <div class="text-sm text-white/50">
          Page <span class="font-semibold text-white">${directoryCurrentPage}</span> of ${totalPages}
        </div>

        <button onclick="goToDirectoryPage(${directoryCurrentPage + 1})" 
                ${directoryCurrentPage === totalPages ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          Next →
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

function filterDirectory() {
  const searchTerm = (document.getElementById('directorySearch')?.value || '').toLowerCase();
  const filtered = allBusinesses.filter(b =>
    b.name.toLowerCase().includes(searchTerm) ||
    (b.description && b.description.toLowerCase().includes(searchTerm)) ||
    (b.keywords && b.keywords.some(k => k.toLowerCase().includes(searchTerm)))
  );

  directoryCurrentPage = 1;           // ← Reset to first page
  renderDirectory(filtered);
}

async function filterByCategory(catId) {
  const filtered = allBusinesses.filter(b => b.category && b.category._id === catId);

  directoryCurrentPage = 1;           // ← Reset to first page
  renderDirectory(filtered);
}

// ─── BUSINESS DETAIL MODAL (DARK THEME) ───────────────────────────────────────
async function showBusinessDetail(id) {
  const business = allBusinesses.find(b => b._id === id);
  if (!business) return;

  const avg     = business.avgRating || 0;
  const count   = business.ratings ? business.ratings.length : 0;
  const isOwned = !!business.owner;

  // Use cached reviews if available; otherwise render modal immediately and load async
  const cachedReviews = window._bizReviewsCache?.[id];
  const preview = (cachedReviews || []).slice(0, 3);

  const isFollowing = currentUser && business.followers && business.followers.includes(currentUser._id);
  const openStatus  = getOpenStatus(business.hours);

  const enrichedInfoSection = `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 space-y-3">

      ${business.logo ? `
        <div class="flex items-center gap-3 pb-3 border-b border-white/10">
          <img src="${business.logo}" alt="${business.name} logo"
               class="w-14 h-14 rounded-2xl object-cover border border-white/10 flex-shrink-0">
          <div>
            <p class="font-bold text-white text-base leading-tight">${business.name}</p>
            ${business.priceRange ? `<span class="text-xs font-semibold text-white/60">${business.priceRange} · ${business.category?.name || ''}</span>` : `<span class="text-xs text-white/60">${business.category?.name || ''}</span>`}
          </div>
        </div>` : ''}

      ${business.hours ? `
        <div class="flex items-start gap-2">
          <span class="text-base flex-shrink-0 mt-0.5">🕐</span>
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm text-white/80">${business.hours}</span>
              ${openStatus ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${openStatus.open ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">${openStatus.label}</span>` : ''}
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
          ${business.tags.map(tag => `<span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/80">${tag}</span>`).join('')}
        </div>` : ''}
    </div>`;

  const modalHTML = `
    <div onclick="if(event.target.id==='businessModal')hideBusinessModal()" id="businessModal"
         class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[12000] flex items-end md:items-center md:justify-center p-4">
      <div onclick="event.stopImmediatePropagation()"
           class="bg-[#0f172a] text-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl border border-white/10">
        
        <!-- Header -->
        <div class="sticky top-0 bg-[#0f172a] pt-4 pb-3 flex justify-center border-b border-white/10 rounded-t-3xl">
          <div class="w-12 h-1.5 bg-white/20 rounded-full"></div>
        </div>

        <div class="p-6">
          <div class="flex items-start justify-between mb-1">
            <h1 class="text-3xl font-bold leading-tight">${esc(business.name)}</h1>
            ${isOwned ? `<span class="text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full mt-1">✓ Verified Owner</span>` : ''}
          </div>
          <p class="text-emerald-400 text-sm mb-1">${business.category?.name || ''}</p>
          <p class="text-white/60 mb-4 flex items-center gap-1"><span>📍</span> ${business.address || 'Milledgeville, GA'}</p>

          ${enrichedInfoSection}

          <!-- FOLLOW BUTTON -->
          ${currentUser ? `
            <button onclick="toggleFollow('${id}')" id="follow-btn-${id}"
                    class="w-full mb-4 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-3xl font-semibold transition">
              ${isFollowing ? '❤️ Following this business' : '🔖 Follow this business'}
            </button>` : ''}

          ${business.menu ? `
            <button onclick="showMenuViewer('${id}')"
                    class="w-full flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 font-semibold py-3 rounded-2xl mb-4 transition">
              🍽️ View Menu
            </button>` : ''}

          <!-- Contact -->
          <div class="space-y-3 mb-5">
            ${business.phone ? `
              <a href="tel:${business.phone}" class="flex items-center gap-3 bg-emerald-500/10 hover:bg-emerald-500/20 transition p-4 rounded-2xl text-emerald-400 font-semibold">
                <span class="text-2xl">📞</span> ${business.phone}
              </a>` : ''}

            ${business.website ? `
              <a href="${business.website}" target="_blank" class="flex items-center gap-3 bg-blue-500/10 hover:bg-blue-500/20 transition p-4 rounded-2xl text-blue-400 font-semibold">
                <span class="text-2xl">🌐</span> Visit Website
              </a>` : ''}

            ${business.address ? `
              <button onclick="getDirections('${business.address}')" 
                      class="flex items-center gap-3 bg-blue-500/10 hover:bg-blue-500/20 transition p-4 rounded-2xl text-blue-400 font-semibold w-full text-left">
                <span class="text-2xl">🗺️</span> Get Directions
              </button>` : ''}
          </div>

          ${business.description ? `<p class="text-white/70 leading-relaxed mb-5">${esc(business.description)}</p>` : ''}

          <!-- Photo Gallery -->
          ${(() => {
            const isOwner = currentUser && currentUser.verifiedBusiness &&
              (String(currentUser.verifiedBusiness._id || currentUser.verifiedBusiness) === String(id));
            const hasPhotos = business.photos && business.photos.length > 0;
            if (!hasPhotos && !isOwner) return '';
            const canAddMore = isOwner && (business.photos || []).length < 5;
            return `
              <div class="border-t border-white/10 pt-5 mb-5">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-bold text-lg">📷 Photos</h3>
                  ${canAddMore ? `
                    <button onclick="document.getElementById('bizPhotoInput-${id}').click()"
                            class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-2xl font-semibold transition">
                      + Add Photos
                    </button>
                    <input id="bizPhotoInput-${id}" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden"
                           onchange="handleBizPhotoUpload('${id}', this)">` : ''}
                </div>
                ${hasPhotos ? `
                  <div class="grid grid-cols-3 gap-2">
                    ${business.photos.map((src, i) => `
                      <div class="relative aspect-square rounded-2xl overflow-hidden bg-white/5 group cursor-pointer border border-white/10"
                           onclick="openBizPhotoLightbox('${id}', ${i})">
                        <img src="${src}" class="w-full h-full object-cover hover:opacity-90 transition" loading="lazy">
                        ${isOwner ? `
                          <button onclick="event.stopPropagation(); deleteBizPhoto('${id}', ${i})"
                                  class="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs transition opacity-0 group-hover:opacity-100">✕</button>` : ''}
                      </div>`).join('')}
                  </div>` : `<p class="text-white/40 text-sm text-center py-4">No photos yet.</p>`}
              </div>`;
          })()}

          <!-- Reviews Section -->
          <div class="border-t border-white/10 pt-5 mb-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-lg" id="biz-reviews-hdr-${id}">⭐ Reviews <span class="text-sm font-normal text-white/50">(${cachedReviews ? cachedReviews.length : (preview.length + (preview.length >= 3 ? '+' : ''))})</span></h3>
              ${cachedReviews && cachedReviews.length > 3 ? `
                <button onclick="showAllReviews('${id}')" class="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition">
                  See all →
                </button>` : ''}
            </div>

            ${cachedReviews && cachedReviews.length > 0 ? renderReviewSummary(cachedReviews) : ''}

            <!-- Write a review -->
            ${currentUser ? `
              <div id="writeReviewBox" class="mb-4">
                <button onclick="toggleWriteReview('${id}')"
                        class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-2xl transition text-sm">
                  ✏️ Write a Review
                </button>
                <div id="reviewForm-${id}" class="hidden mt-3 bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div>
                    <p class="text-xs font-semibold text-white/60 mb-2">Your Rating *</p>
                    <div class="flex gap-1" id="reviewStarPicker-${id}">
                      ${[1,2,3,4,5].map(s => `
                        <button onclick="setReviewStar('${id}',${s})" data-star="${s}"
                                class="text-3xl transition hover:scale-110 review-star-btn" style="color:#64748b;">★</button>`).join('')}
                    </div>
                  </div>
                  <input id="reviewTitle-${id}" type="text" placeholder="Headline (optional)" maxlength="100"
                         class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-sm text-white placeholder:text-white/40">
                  <textarea id="reviewBody-${id}" rows="3" placeholder="Share your experience…" maxlength="1000"
                            class="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none text-sm text-white placeholder:text-white/40 resize-none"></textarea>
                  <div class="flex gap-2">
                    <button onclick="submitReview('${id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-2xl font-semibold text-sm transition">
                      Submit Review
                    </button>
                    <button onclick="toggleWriteReview('${id}')" class="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-sm transition">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>` : `
              <div class="mb-4">
                <button onclick="hideBusinessModal();showAuthModal({message:'Sign in to leave a review.'})"
                        class="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-2xl transition text-sm">
                  ✏️ Sign in to Review
                </button>
              </div>`}

            <!-- Review cards -->
            <div id="reviewCards-${id}" class="space-y-3">
              ${preview.length ? preview.map(r => renderReviewCard(r, id)).join('') : cachedReviews ? `
                <div class="text-center py-6 text-white/40 text-sm">
                  <p class="text-3xl mb-2">💬</p>
                  No reviews yet — be the first!
                </div>` : `
                <div class="space-y-3">
                  ${[1,2].map(() => `<div class="bg-white/5 rounded-2xl p-4 animate-pulse h-16"></div>`).join('')}
                </div>`}
            </div>
          </div>

          <!-- Actions -->
          <div class="space-y-3">
            ${!isOwned && currentUser ? `
              <button onclick="hideBusinessModal();showClaimModal('${business._id}')"
                      class="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-3xl font-semibold transition">
                🏷️ Claim This Business
              </button>` : ''}
            ${!isOwned && !currentUser ? `
              <button onclick="hideBusinessModal();showAuthModal({message:'Sign in to claim your business listing.'})"
                      class="w-full bg-amber-600/80 hover:bg-amber-600 text-white py-4 rounded-3xl font-semibold transition">
                🏷️ Own This Business? Sign In to Claim
              </button>` : ''}
            <button onclick="hideBusinessModal()" class="w-full bg-white/10 hover:bg-white/20 text-white py-4 rounded-3xl font-semibold transition">Close</button>
          </div>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  window._currentBizReviews = cachedReviews || [];
  window._currentBizId = id;

  // If no cached reviews, load them in the background and inject when ready
  if (!cachedReviews) {
    apiGet(`/business/${id}/reviews`).then(reviews => {
      if (!reviews) return;
      if (!window._bizReviewsCache) window._bizReviewsCache = {};
      window._bizReviewsCache[id] = reviews;
      window._currentBizReviews = reviews;

      const cards = document.getElementById(`reviewCards-${id}`);
      if (cards) {
        cards.innerHTML = reviews.length
          ? reviews.slice(0, 3).map(r => renderReviewCard(r, id)).join('')
          : `<div class="text-center py-6 text-white/40 text-sm"><p class="text-3xl mb-2">💬</p>No reviews yet — be the first!</div>`;
      }
      const hdr = document.getElementById(`biz-reviews-hdr-${id}`);
      if (hdr) hdr.innerHTML = `⭐ Reviews <span class="text-sm font-normal text-white/50">(${reviews.length})</span>`;
      if (reviews.length > 0) {
        const summaryAnchor = cards?.previousElementSibling;
        if (summaryAnchor && summaryAnchor.classList.contains('biz-review-summary')) {
          summaryAnchor.outerHTML = renderReviewSummary(reviews);
        }
      }
    }).catch(() => {});
  }
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
    <div class="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
      <div class="flex items-center gap-5">
        <div class="text-center flex-shrink-0">
          <div class="text-5xl font-black text-white">${avgR}</div>
          <div class="flex gap-0.5 justify-center mt-1">
            ${[1,2,3,4,5].map(s => `<span style="color:${s<=Math.round(avgR)?'#f59e0b':'#64748b'};font-size:16px;">★</span>`).join('')}
          </div>
          <div class="text-xs text-white/50 mt-1">${reviews.length} review${reviews.length!==1?'s':''}</div>
        </div>
        <div class="flex-1 space-y-1.5">
          ${dist.map(d => {
            const pct = reviews.length ? Math.round((d.count / reviews.length) * 100) : 0;
            return `
              <div class="flex items-center gap-2 text-xs">
                <span class="text-white/60 w-3 text-right flex-shrink-0">${d.star}</span>
                <span class="text-amber-400 flex-shrink-0">★</span>
                <div class="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-amber-400 h-full rounded-full" style="width:${pct}%"></div>
                </div>
                <span class="text-white/50 w-5 flex-shrink-0">${d.count}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function renderReviewCard(r, bizId) {
  const stars = [1,2,3,4,5].map(s => `<span style="color:${s<=r.rating?'#f59e0b':'#64748b'};font-size:13px;">★</span>`).join('');
  const userIsAdmin  = isAdmin();
  const isAuthor = currentUser && (r.user === currentUser._id || r.user === currentUser.id);
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-4" id="review-card-${r._id}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            ${(r.authorName||'?')[0].toUpperCase()}
          </div>
          <div>
            <p class="font-semibold text-sm">${esc(r.authorName || 'Anonymous')}</p>
            <div class="flex items-center gap-1">${stars}<span class="text-xs text-white/40 ml-1">${timeAgo(r.createdAt)}</span></div>
          </div>
        </div>
        ${isAuthor || userIsAdmin ? `
          <button onclick="deleteReview('${bizId}','${r._id}')"
                  class="text-xs text-red-400 hover:text-red-500 transition font-semibold flex-shrink-0">Delete</button>` : ''}
      </div>
      ${r.title ? `<p class="font-semibold text-sm mb-1">${esc(r.title)}</p>` : ''}
      ${r.body  ? `<p class="text-sm text-white/70 leading-relaxed">${esc(r.body)}</p>` : ''}
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

        <!-- Step 1: Info form -->
        <div id="claimStep1" class="p-6">
          <div class="text-center mb-6">
            <div class="text-5xl mb-3">🏷️</div>
            <h2 class="text-2xl font-bold">Claim "${esc(business.name)}"</h2>
            <p class="text-gray-500 text-sm mt-2 leading-relaxed">
              We'll match your info against our records. High-confidence matches are approved <strong>instantly</strong> — no waiting.
            </p>
          </div>

          <!-- Confidence signals hint -->
          <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5 text-sm text-emerald-800 space-y-1.5">
            <p class="font-semibold text-emerald-700 mb-2">✅ For the fastest approval, make sure:</p>
            <div class="flex items-start gap-2"><span>📞</span><span>Your phone number matches the one on your listing</span></div>
            <div class="flex items-start gap-2"><span>📍</span><span>Your address matches the business address exactly</span></div>
            <div class="flex items-start gap-2"><span>✉️</span><span>Your email domain matches your business website (optional)</span></div>
          </div>

          <div class="space-y-3">
            <input id="claimOwnerName" type="text" placeholder="Your full name (owner) *"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <input id="claimPhone" type="tel" placeholder="Business phone number *"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <input id="claimAddress" type="text" placeholder="Business address *"
                   value="${esc(business.address || '')}"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <input id="claimEmail" type="email" placeholder="Business email (optional — helps verify)"
                   class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50">
            <textarea id="claimMessage" rows="2" placeholder="Anything else? (optional)"
                      class="w-full px-5 py-4 rounded-3xl border border-gray-200 focus:border-emerald-500 outline-none bg-gray-50 resize-none"></textarea>

            <label class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 cursor-pointer select-none">
              <div class="relative flex-shrink-0 mt-0.5">
                <input type="checkbox" id="claimIsRestaurant" class="sr-only peer">
                <div class="w-5 h-5 rounded-md border-2 border-amber-300 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-colors">
                </div>
              </div>
              <div>
                <p class="font-semibold text-amber-800 text-sm">🍽️ Food or Restaurant Business</p>
                <p class="text-amber-600 text-xs mt-0.5">Enables menu uploads on your listing.</p>
              </div>
            </label>
          </div>

          <div class="space-y-3 mt-6">
            <button onclick="submitClaim('${businessId}')" id="claimSubmitBtn"
                    class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition">
              Verify &amp; Claim →
            </button>
            <button onclick="closeClaimModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">
              Cancel
            </button>
          </div>
        </div>

        <!-- Step 2a: Success (auto-approved) -->
        <div id="claimStep2Success" class="hidden p-6 text-center">
          <div class="text-6xl mb-4">🎉</div>
          <h2 class="text-2xl font-bold text-emerald-600 mb-2">Verified!</h2>
          <p class="text-gray-600 mb-6" id="claimSuccessMsg">Your business is now linked to your account.</p>
          <div id="claimConfidenceBreakdown" class="bg-gray-50 rounded-2xl p-4 mb-6 text-left text-sm space-y-2"></div>
          <button onclick="closeClaimModal(); navigate('owner-dashboard')"
                  class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition">
            Open My Dashboard →
          </button>
        </div>

        <!-- Step 2b: PIN entry -->
        <div id="claimStep2Pin" class="hidden p-6">
          <div class="text-center mb-6">
            <div class="text-5xl mb-3">📱</div>
            <h2 class="text-2xl font-bold mb-2">Enter Your Verification Code</h2>
            <p class="text-gray-500 text-sm" id="claimPinMsg">A 6-digit code was sent to the phone number you provided.</p>
          </div>
          <div id="claimPinSignals" class="mb-5"></div>
          <input id="claimPinInput" type="number" inputmode="numeric" placeholder="6-digit code"
                 class="w-full text-center text-3xl font-bold tracking-widest px-5 py-5 rounded-3xl border-2 border-gray-200 focus:border-emerald-500 outline-none bg-gray-50 mb-4">
          <button onclick="submitClaimPin('${businessId}')"
                  class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold text-lg transition mb-3">
            Confirm Code
          </button>
          <button onclick="submitClaim('${businessId}', true)"
                  class="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition">
            Resend Code
          </button>
        </div>

        <!-- Step 2c: Fast-track pending -->
        <div id="claimStep2FastTrack" class="hidden p-6 text-center">
          <div class="text-6xl mb-4">⚡</div>
          <h2 class="text-2xl font-bold text-amber-600 mb-2">Fast-Track Review</h2>
          <p class="text-gray-600 mb-4" id="claimFastTrackMsg">Your claim looks good — you'll hear back shortly.</p>
          <div id="claimFtSignals" class="bg-gray-50 rounded-2xl p-4 mb-6 text-left text-sm space-y-2"></div>
          <button onclick="closeClaimModal()"
                  class="w-full bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold transition">
            Close — I'll wait for the email
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
};

// Render confidence signals as a checklist
function _renderSignals(signals = []) {
  if (!signals.length) return '';
  return signals.map(s => `
    <div class="flex items-center gap-2">
      <span class="${s.passed ? 'text-emerald-500' : 'text-gray-300'} text-base">${s.passed ? '✓' : '✗'}</span>
      <span class="${s.passed ? 'text-gray-800' : 'text-gray-400'} flex-1">${s.label}</span>
      ${s.passed ? `<span class="text-emerald-500 font-semibold text-xs">+${s.points}</span>` : ''}
    </div>`).join('');
}

function _showClaimStep(stepId) {
  ['claimStep1', 'claimStep2Success', 'claimStep2Pin', 'claimStep2FastTrack']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== stepId);
    });
}

window.submitClaim = async function (businessId, resend = false) {
  const ownerName    = document.getElementById('claimOwnerName').value.trim();
  const phone        = document.getElementById('claimPhone').value.trim();
  const address      = document.getElementById('claimAddress').value.trim();
  const email        = document.getElementById('claimEmail').value.trim();
  const message      = document.getElementById('claimMessage').value.trim();
  const isRestaurant = document.getElementById('claimIsRestaurant')?.checked || false;

  if (!ownerName || !phone || !address) {
    showToast('Please fill in your name, phone, and address.', 'error');
    return;
  }

  const btn = document.getElementById('claimSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  const res = await apiPost(`/claim/${businessId}`, { ownerName, phone, address, email, message, isRestaurant });

  if (btn) { btn.disabled = false; btn.textContent = 'Verify & Claim →'; }

  if (!res || res.error) {
    showToast(res?.message || 'Something went wrong', 'error');
    return;
  }

  // ── Auto-approved ─────────────────────────────────────────────────────────
  if (res.status === 'approved' && res.autoApproved) {
    _showClaimStep('claimStep2Success');
    const msgEl = document.getElementById('claimSuccessMsg');
    if (msgEl) msgEl.textContent = res.message;
    const bdEl = document.getElementById('claimConfidenceBreakdown');
    if (bdEl) bdEl.innerHTML = `
      <p class="font-semibold text-gray-700 mb-2">Confidence score: <span class="text-emerald-600">${res.score}/100</span></p>
      ${_renderSignals(res.signals)}`;

    // Reload user so verifiedBusiness is populated without a full page reload
    try {
      const userData = await apiGet('/auth/me');
      if (userData?.user) currentUser = userData.user;
    } catch (_) {}
    return;
  }

  // ── PIN required ──────────────────────────────────────────────────────────
  if (res.needsPin) {
    _showClaimStep('claimStep2Pin');
    const msgEl = document.getElementById('claimPinMsg');
    if (msgEl) msgEl.textContent = resend ? '✅ New code sent! Check your phone.' : res.message;
    const sigEl = document.getElementById('claimPinSignals');
    if (sigEl) sigEl.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm mb-1">
        <p class="font-semibold text-red-700 mb-2">Confidence score: ${res.score}/100 — extra verification needed</p>
        ${_renderSignals(res.signals)}
      </div>`;
    return;
  }

  // ── Fast-track ────────────────────────────────────────────────────────────
  if (res.fastTrack) {
    _showClaimStep('claimStep2FastTrack');
    const msgEl = document.getElementById('claimFastTrackMsg');
    if (msgEl) msgEl.textContent = res.message;
    const sigEl = document.getElementById('claimFtSignals');
    if (sigEl) sigEl.innerHTML = `
      <p class="font-semibold text-gray-700 mb-2">Confidence score: <span class="text-amber-600">${res.score}/100</span></p>
      ${_renderSignals(res.signals)}`;
    return;
  }

  // Fallback — some other message
  showToast(res.message || 'Claim submitted', 'success');
};

window.submitClaimPin = async function (businessId) {
  const pin = document.getElementById('claimPinInput')?.value.trim();
  const isRestaurant = document.getElementById('claimIsRestaurant')?.checked || false;

  if (!pin || pin.length < 6) {
    showToast('Please enter the 6-digit code', 'error');
    return;
  }

  const res = await apiPost(`/claim/${businessId}/verify-pin`, { pin, isRestaurant });

  if (res.status === 'approved') {
    _showClaimStep('claimStep2Success');
    const msgEl = document.getElementById('claimSuccessMsg');
    if (msgEl) msgEl.textContent = res.message;
    const bdEl = document.getElementById('claimConfidenceBreakdown');
    if (bdEl) bdEl.innerHTML = `<div class="flex items-center gap-2 text-emerald-600 font-semibold"><span>✓</span> Phone number verified via PIN</div>`;

    try {
      const userData = await apiGet('/auth/me');
      if (userData?.user) currentUser = userData.user;
    } catch (_) {}
  } else {
    showToast(res.message || 'Incorrect code — try again', 'error');
  }
};

window.closeClaimModal = function () {
  const el = document.getElementById('claimModalBg');
  if (el) el.remove();
};

// startVerificationPoll is no longer needed — outcomes are synchronous now
function startVerificationPoll() {}


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

// ─── SHOUTOUT IMAGE LIGHTBOX (Fixed) ─────────────────────────────────────────
window.openShoutoutImageViewer = function (shoutoutId, startIndex) {
  const card = document.getElementById(`shoutout-${shoutoutId}`);
  if (!card) return;

  // Fixed selector — use the actual container class from renderShoutoutCard
  const imgs = Array.from(card.querySelectorAll('.sc-images img')).map(img => img.src);
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

window.handleShoutoutImages = async function (input) {
  const files = Array.from(input.files);
  if (!_pendingShoutoutImages) _pendingShoutoutImages = [];

  for (let file of files) {
    if (file.size > 8 * 1024 * 1024) {
      showToast(`${file.name} is too large (max 8MB)`, 'error');
      continue;
    }

    try {
      showToast('Compressing image...', 'success');
      const compressed = await compressImage(file, 1100, 0.72);
      const reader = new FileReader();
      reader.onload = e => {
        _pendingShoutoutImages.push(e.target.result);
        renderShoutoutImagePreviews();
      };
      reader.readAsDataURL(compressed);
    } catch (e) {
      console.error(e);
    }
  }
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
  const isAuthor = currentUser && (s.authorId === currentUser._id || s.authorId === currentUser.id);
  const stillThereVoters = s.stillThereVoters || [];
  const myId = currentUser?._id || currentUser?.id || '';
  const hasVotedStillThere = stillThereVoters.some(v => (v?._id || v)?.toString() === myId?.toString());
  const hasLiked = (s.likes || []).some(v => (v?._id || v)?.toString() === myId?.toString());
  const locationTag = s.location?.label
    ? `<div class="sc-location">\u{1F4CD} ${esc(s.location.label)}</div>`
    : '';

  return `
<div id="shoutout-${s._id}" class="sc" data-comments="${esc(JSON.stringify(s.comments||[]))}">
  <div class="sc-body">
    <div class="sc-header">
      <div class="sc-author">
        <div class="sc-avatar">${authorLetter}</div>
        <div>
          <div class="sc-name">${renderClickableUser(s.authorId || s.author)}</div>
          <div class="sc-time">${timeAgo(s.createdAt)}</div>
        </div>
      </div>
      ${isAuthor
        ? `<span class="sc-yours">Yours</span>`
        : `<button onclick="event.stopImmediatePropagation(); reportContent('shoutout','${s._id}','${esc(s.text||'').substring(0,80)}...')" class="sc-flag-btn" title="Report">\u{1F6A9}</button>`}
    </div>
    ${locationTag}
    <p class="sc-text">${esc(s.text)}</p>
  </div>
  ${s.images && s.images.length ? `
    <div class="sc-images">
      ${s.images.map((src, i) => `<img src="${src}" onclick="openShoutoutImageViewer('${s._id}',${i})" loading="lazy" alt="">`).join('')}
    </div>` : ''}
  <div class="sc-divider"></div>
  <div class="sc-actions">
    <button onclick="event.stopImmediatePropagation(); stillThere('${s._id}',this)" class="sc-pill${hasVotedStillThere ? ' active' : ''}">
      \u{1F440} Still There <span class="sc-pill-count">${stillThereVoters.length}</span>
    </button>
    ${s.cleared
      ? `<div class="sc-pill sc-cleared-badge">\u2705 Cleared</div>`
      : `<button onclick="event.stopImmediatePropagation(); clearShoutout('${s._id}',this)" class="sc-pill">\u2705 Mark Cleared</button>`}
    <div class="sc-reactions">
      <button onclick="likeShoutout('${s._id}')" class="sc-react${hasLiked ? ' liked' : ''}">
        <span class="sc-react-icon">\u2665</span><span id="like-count-${s._id}">${likeCount}</span>
      </button>
      <button onclick="toggleCommentSection('${s._id}')" class="sc-react">
        <span class="sc-react-icon">\u{1F4AC}</span><span>${commentCount}</span>
      </button>
      <button onclick="event.stopImmediatePropagation(); shareContent('shoutout',${JSON.stringify(esc(s.text||'').substring(0,120))})" class="sc-react sc-share">
        <span class="sc-react-icon">\u{1F517}</span>
      </button>
    </div>
  </div>
  <div id="comment-section-${s._id}" class="hidden" style="border-top:1px solid rgba(255,255,255,0.07);padding-top:0;">
    <!-- Sort tabs -->
    <div id="comment-tabs-${s._id}" style="display:flex;align-items:center;gap:2px;padding:8px 12px 4px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-right:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Sort:</span>
      <button onclick="setCommentSort('${s._id}','relevant')" id="csort-relevant-${s._id}"
              style="background:rgba(52,211,153,0.18);border:none;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#34d399;cursor:pointer;">Top</button>
      <button onclick="setCommentSort('${s._id}','newest')" id="csort-newest-${s._id}"
              style="background:rgba(255,255,255,0.06);border:none;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);cursor:pointer;">Newest</button>
      <button onclick="setCommentSort('${s._id}','all')" id="csort-all-${s._id}"
              style="background:rgba(255,255,255,0.06);border:none;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);cursor:pointer;">All</button>
    </div>
    <!-- Comment list -->
    <div id="comment-list-${s._id}" style="padding:4px 0 0;"></div>
    <!-- View more button (shown when collapsed) -->
    <div id="comment-more-${s._id}" style="display:none;padding:4px 14px 8px;">
      <button onclick="expandComments('${s._id}')"
              style="background:none;border:none;color:#34d399;font-size:13px;font-weight:700;cursor:pointer;padding:4px 0;">
        ▾ View more comments
      </button>
    </div>
    <!-- Compose -->
    ${currentUser ? `
      <div style="display:flex;flex-direction:column;gap:6px;padding:8px 12px 10px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <div style="width:30px;height:30px;background:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;margin-top:2px;">${currentUser.name[0].toUpperCase()}</div>
          <div style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:8px 12px;transition:border-color 0.2s;"
               onfocus="this.style.borderColor='rgba(52,211,153,0.5)'" onblur="this.style.borderColor='rgba(255,255,255,0.12)'">
            <input id="commentinput-${s._id}" type="text" placeholder="Write a comment…"
                   style="width:100%;background:none;border:none;color:#fff;font-size:14px;outline:none;display:block;"
                   onkeydown="if(event.key==='Enter'){event.preventDefault();submitComment('${s._id}');}">
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
              <button type="button" onclick="toggleCommentEmoji('${s._id}',event)"
                      style="background:none;border:none;font-size:18px;cursor:pointer;padding:0;line-height:1;opacity:0.7;" title="Emoji">😊</button>
              <button type="button" onclick="toggleCommentGif('${s._id}',event)"
                      style="background:rgba(255,255,255,0.1);border:none;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;color:#34d399;cursor:pointer;letter-spacing:.5px;">GIF</button>
              <label style="cursor:pointer;font-size:16px;opacity:0.7;" title="Photo">
                📷<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;" onchange="handleCommentImage('${s._id}',this)">
              </label>
              <div id="comment-img-preview-${s._id}" style="display:none;position:relative;">
                <img id="comment-img-thumb-${s._id}" style="height:28px;width:28px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.2);">
                <button onclick="clearCommentImage('${s._id}')"
                        style="position:absolute;top:-5px;right:-5px;background:#ef4444;border:none;border-radius:50%;width:14px;height:14px;font-size:8px;color:#fff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;">✕</button>
              </div>
              <div style="flex:1;"></div>
              <button onclick="submitComment('${s._id}')"
                      style="background:#059669;border:none;border-radius:14px;padding:4px 14px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Post</button>
            </div>
          </div>
        </div>
        <div id="comment-emoji-panel-${s._id}" style="display:none;padding-left:38px;">
          <div style="background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:8px;max-height:180px;overflow:hidden;">
            <input type="text" placeholder="Search emoji…" oninput="filterCommentEmoji('${s._id}',this.value)"
                   style="width:100%;background:rgba(255,255,255,0.08);border:none;border-radius:8px;padding:5px 8px;color:#fff;font-size:12px;margin-bottom:6px;box-sizing:border-box;outline:none;">
            <div id="comment-emoji-cats-${s._id}" style="display:flex;gap:4px;margin-bottom:6px;overflow-x:auto;padding-bottom:2px;"></div>
            <div id="comment-emoji-grid-${s._id}" style="display:grid;grid-template-columns:repeat(auto-fill,28px);gap:2px;max-height:100px;overflow-y:auto;"></div>
          </div>
        </div>
        <div id="comment-gif-panel-${s._id}" style="display:none;padding-left:38px;">
          <div style="background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:8px;">
            <input type="text" placeholder="Search GIFs…" oninput="searchCommentGif('${s._id}',this.value)"
                   style="width:100%;background:rgba(255,255,255,0.08);border:none;border-radius:8px;padding:5px 8px;color:#fff;font-size:12px;margin-bottom:6px;box-sizing:border-box;outline:none;">
            <div id="comment-gif-grid-${s._id}" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;max-height:160px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>` : `
      <div style="padding:10px 14px;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);"><button onclick="showAuthModal()" style="background:none;border:none;color:#34d399;cursor:pointer;font-weight:700;padding:0;">Sign in</button> to comment</p>
      </div>`}
  </div>
</div>`;
}

function renderCommentRow(c, shoutoutId) {
  const cLetter = c.author ? c.author[0].toUpperCase() : '?';
  const replies = c.replies || [];
  const replyCount = replies.length;
  const userIsAdmin = isAdmin();
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
              ${isCommentAuthor || userIsAdmin ? `
                <button onclick="deleteComment('${shoutoutId}','${c._id}')" 
                        class="text-[10px] text-red-400/50 hover:text-red-400 transition ml-1">✕ delete</button>` : ''}
            </div>
            ${c.text ? `<p class="text-sm text-white/80 mt-0.5">${c.text}</p>` : ''}
            ${c.image ? `
              <img src="${c.image}" alt="comment image"
                   onclick="openCommentImageLightbox('${c.image}')"
                   style="margin-top:6px;max-width:180px;max-height:160px;object-fit:cover;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.15);">` : ''}
          </div>
          ${currentUser ? `
            <div class="flex items-center gap-3 mt-1 ml-2">
              <button id="comment-like-btn-${c._id}" onclick="likeComment('${shoutoutId}','${c._id}')" 
                      class="flex items-center gap-1 text-[11px] text-white/40 hover:text-pink-400 transition font-semibold">
                <span id="comment-like-icon-${c._id}">${(c.likes||[]).includes(currentUser?._id||currentUser?.id) ? '\u2764\uFE0F' : '\uD83E\uDD0D'}</span>
                <span id="comment-like-count-${c._id}">${(c.likes||[]).length || ''}</span>
              </button>
              <button onclick="toggleReplyBox('${shoutoutId}','${c._id}')" 
                      class="text-[11px] text-white/40 hover:text-emerald-400 transition font-semibold">Reply</button>
            </div>
            <div id="replybox-${c._id}" style="display:none;" class="mt-2 flex items-start gap-2">
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

window.likeComment = async function(shoutoutId, commentId) {
  if (!requireAuth('Sign in to like comments.')) return;
  const res = await apiPost(`/shoutouts/${shoutoutId}/comments/${commentId}/like`, {});
  if (res.likes !== undefined) {
    const icon  = document.getElementById(`comment-like-icon-${commentId}`);
    const count = document.getElementById(`comment-like-count-${commentId}`);
    if (icon)  icon.textContent  = res.liked ? '\u2764\uFE0F' : '\uD83E\uDD0D';
    if (count) count.textContent = res.likes || '';
  }
};

// ─── Comment sort state ───────────────────────────────────────────────────────
if (!window._commentSortState) window._commentSortState = {};   // shoutoutId → 'relevant'|'newest'|'all'
if (!window._commentDataCache) window._commentDataCache = {};   // shoutoutId → comments array
const COMMENT_PREVIEW = 3; // rows shown before "View more"

function _renderCommentList(shoutoutId) {
  const listEl = document.getElementById(`comment-list-${shoutoutId}`);
  const moreEl = document.getElementById(`comment-more-${shoutoutId}`);
  if (!listEl) return;

  const allComments = window._commentDataCache[shoutoutId] || [];
  const sort = window._commentSortState[shoutoutId] || 'relevant';

  let sorted = [...allComments];
  if (sort === 'relevant') {
    sorted.sort((a, b) => ((b.likes||[]).length - (a.likes||[]).length) || (new Date(b.createdAt) - new Date(a.createdAt)));
  } else if (sort === 'newest') {
    sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  // 'all' = insertion order (as-is from server)

  const expanded = listEl.dataset.expanded === '1';
  const visible = expanded ? sorted : sorted.slice(0, COMMENT_PREVIEW);
  const hidden  = sorted.length - visible.length;

  listEl.innerHTML = visible.map(c => renderCommentRow(c, shoutoutId)).join('');

  if (moreEl) {
    if (hidden > 0) {
      moreEl.style.display = 'block';
      const btn = moreEl.querySelector('button');
      if (btn) btn.textContent = `▾ View ${hidden} more comment${hidden !== 1 ? 's' : ''}`;
    } else {
      moreEl.style.display = 'none';
    }
  }
}

window.setCommentSort = function(shoutoutId, sort) {
  window._commentSortState[shoutoutId] = sort;
  // Update tab styles
  ['relevant','newest','all'].forEach(s => {
    const btn = document.getElementById(`csort-${s}-${shoutoutId}`);
    if (!btn) return;
    const active = s === sort;
    btn.style.background   = active ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)';
    btn.style.color        = active ? '#34d399' : 'rgba(255,255,255,0.5)';
    btn.style.fontWeight   = active ? '700' : '600';
  });
  _renderCommentList(shoutoutId);
};

window.expandComments = function(shoutoutId) {
  const listEl = document.getElementById(`comment-list-${shoutoutId}`);
  if (listEl) listEl.dataset.expanded = '1';
  _renderCommentList(shoutoutId);
};

window.toggleCommentSection = function (shoutoutId) {
  const section = document.getElementById(`comment-section-${shoutoutId}`);
  if (!section) return;
  const isHidden = section.classList.contains('hidden');
  section.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    // Seed sort state default if not yet set
    if (!window._commentSortState[shoutoutId]) window._commentSortState[shoutoutId] = 'relevant';
    // Pull comments from the card's data attribute if we haven't cached them yet
    if (!window._commentDataCache[shoutoutId]) {
      const card = document.getElementById(`shoutout-${shoutoutId}`);
      if (card && card.dataset.comments) {
        try { window._commentDataCache[shoutoutId] = JSON.parse(card.dataset.comments); } catch(e) {}
      }
    }
    _renderCommentList(shoutoutId);
    // Set active tab visual
    window.setCommentSort(shoutoutId, window._commentSortState[shoutoutId]);
    const input = document.getElementById(`commentinput-${shoutoutId}`);
    if (input) setTimeout(() => { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }
};

window.submitComment = async function(contentTypeOrShoutoutId, contentId) {
  // Called as submitComment('market', itemId) or submitComment('lost', itemId)
  // OR as submitComment(shoutoutId) from shoutout cards
  
  const isShoutout = !contentId; // shoutouts pass only one arg
  
  if (isShoutout) {
    const shoutoutId = contentTypeOrShoutoutId;
    if (!requireAuth('Sign in to comment.')) return;
const input = document.getElementById(`commentinput-${shoutoutId}`);
const text = input ? input.value.trim() : '';
const image = window._commentImages?.[shoutoutId] || null;   // ← Capture image FIRST

if (!text && !image) return;

// === XSS PROTECTION ===
if (text && checkForSketchyInput(text, 'comment')) {
  if (input) input.value = text;
  return;
}

// Clear input + image data AFTER capturing
if (input) input.value = '';
clearCommentImage(shoutoutId);

// Close emoji/gif panels
const ep = document.getElementById(`comment-emoji-panel-${shoutoutId}`);
const gp = document.getElementById(`comment-gif-panel-${shoutoutId}`);
if (ep) ep.style.display = 'none';
if (gp) gp.style.display = 'none';

const res = await apiPost(`/shoutouts/${shoutoutId}/comments`, { text, image });
    if (res._id) {
      // Build a synthetic comment object from the API response and append it
      // to the DOM without reloading the whole page (which would collapse comments).
      const newComment = {
        _id:       res._id       || ('tmp_' + Date.now()),
        author:    res.author    || currentUser?.name || '',
        authorId:  res.authorId  || currentUser?._id  || currentUser?.id || '',
        text:      res.text      || text,
        image:     res.image     || image || null,
        likes:     res.likes     || [],
        replies:   res.replies   || [],
        createdAt: res.createdAt || new Date().toISOString(),
      };

      // Push into cache and re-render the comment list
      if (!window._commentDataCache[shoutoutId]) window._commentDataCache[shoutoutId] = [];
      window._commentDataCache[shoutoutId].push(newComment);
      // Expand so the new comment is always visible
      const listEl = document.getElementById(`comment-list-${shoutoutId}`);
      if (listEl) listEl.dataset.expanded = '1';
      _renderCommentList(shoutoutId);

      // Update the comment count badge on the toggle button
      const countBadge = document.querySelector(`#shoutout-${shoutoutId} .sc-react span:last-child`);
      if (countBadge) {
        const prev = parseInt(countBadge.textContent, 10) || 0;
        countBadge.textContent = prev + 1;
      }

      // Keep the comment section visible and scroll the new comment into view
      const section = document.getElementById(`comment-section-${shoutoutId}`);
      if (section) section.classList.remove('hidden');

      // Re-focus the input for quick follow-up comments
      const newInput = document.getElementById(`commentinput-${shoutoutId}`);
      if (newInput) setTimeout(() => newInput.focus(), 50);
    } else {
      showToast(res.message || 'Error posting comment', 'error');
    }
    return;
  }

  // Marketplace or Lost+Found
  const contentType = contentTypeOrShoutoutId;
  const input = document.getElementById(`comment-input-${contentId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!requireAuth('Sign in to comment')) return;

  let endpoint = '';
  if (contentType === 'market') endpoint = `/marketplace/${contentId}/comments`;
  else if (contentType === 'lost') endpoint = `/lostitems/${contentId}/comments`;
  if (!endpoint) return;

  try {
    await apiPost(endpoint, { text });
    input.value = '';
    showToast('Comment posted!', 'success');
    if (contentType === 'market') {
      const modal = document.getElementById('marketDetailModal');
      if (modal) modal.remove();
      showMarketplaceDetail(contentId);
    } else if (contentType === 'lost') {
      const modal = document.getElementById('lostDetailModal');
      if (modal) modal.remove();
      showLostDetail(contentId);
    }
  } catch (e) {
    showToast('Failed to post comment', 'error');
  }
};

// ─── Comment Rich Composer Helpers ───────────────────────────────────────────

// Per-comment stored images (GIF URL or compressed base64)
if (!window._commentImages) window._commentImages = {};

// ── Emoji ────────────────────────────────────────────────────────────────────
window.toggleCommentEmoji = function(shoutoutId, e) {
  e.stopPropagation();
  const ep = document.getElementById(`comment-emoji-panel-${shoutoutId}`);
  const gp = document.getElementById(`comment-gif-panel-${shoutoutId}`);
  if (!ep) return;
  const opening = ep.style.display === 'none';
  ep.style.display = opening ? 'block' : 'none';
  if (gp) gp.style.display = 'none';
  if (opening) initCommentEmojiPanel(shoutoutId);
};

function initCommentEmojiPanel(shoutoutId) {
  const catsEl = document.getElementById(`comment-emoji-cats-${shoutoutId}`);
  const gridEl = document.getElementById(`comment-emoji-grid-${shoutoutId}`);
  if (!catsEl || !gridEl) return;
  if (catsEl.children.length) return; // already init'd
  const cats = Object.keys(EMOJI_DATA);
  catsEl.innerHTML = cats.map((cat, i) =>
    `<button onclick="showCommentEmojiCat('${shoutoutId}','${CSS.escape(cat)}')"
             style="background:${i===0?'rgba(52,211,153,0.2)':'rgba(255,255,255,0.06)'};border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:14px;white-space:nowrap;flex-shrink:0;"
             data-cat-btn-${shoutoutId}="${CSS.escape(cat)}">${cat.split(' ')[0]}</button>`
  ).join('');
  renderCommentEmojiGrid(shoutoutId, EMOJI_DATA[cats[0]]);
}

window.showCommentEmojiCat = function(shoutoutId, catKey) {
  const catsEl = document.getElementById(`comment-emoji-cats-${shoutoutId}`);
  if (catsEl) [...catsEl.children].forEach(b => b.style.background = 'rgba(255,255,255,0.06)');
  const activeBtn = catsEl?.querySelector(`[data-cat-btn-${shoutoutId}="${catKey}"]`);
  if (activeBtn) activeBtn.style.background = 'rgba(52,211,153,0.2)';
  const key = Object.keys(EMOJI_DATA).find(k => CSS.escape(k) === catKey);
  if (key) renderCommentEmojiGrid(shoutoutId, EMOJI_DATA[key]);
};

function renderCommentEmojiGrid(shoutoutId, emojis) {
  const gridEl = document.getElementById(`comment-emoji-grid-${shoutoutId}`);
  if (!gridEl) return;
  gridEl.innerHTML = emojis.map(em =>
    `<button onclick="insertCommentEmoji('${shoutoutId}','${em}')"
             style="background:none;border:none;cursor:pointer;font-size:18px;padding:2px;border-radius:6px;line-height:1;"
             onmouseover="this.style.background='rgba(255,255,255,0.1)'"
             onmouseout="this.style.background='none'">${em}</button>`
  ).join('');
}

window.filterCommentEmoji = function(shoutoutId, query) {
  const all = Object.values(EMOJI_DATA).flat();
  renderCommentEmojiGrid(shoutoutId, all);
};

window.insertCommentEmoji = function(shoutoutId, emoji) {
  const input = document.getElementById(`commentinput-${shoutoutId}`);
  if (!input) return;
  const pos = input.selectionStart || input.value.length;
  input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
  input.focus();
  input.selectionStart = input.selectionEnd = pos + emoji.length;
};

// ── GIF (Tenor) ──────────────────────────────────────────────────────────────
const GIPHY_KEY = 'IkfP6Kz9uXuy1enByh5hpf2VjG2EUIIr'; // Get free key at developers.giphy.com
let _gifSearchTimer = null;

window.toggleCommentGif = function(shoutoutId, e) {
  e.stopPropagation();
  const gp = document.getElementById(`comment-gif-panel-${shoutoutId}`);
  const ep = document.getElementById(`comment-emoji-panel-${shoutoutId}`);
  if (!gp) return;
  const opening = gp.style.display === 'none';
  gp.style.display = opening ? 'block' : 'none';
  if (ep) ep.style.display = 'none';
  if (opening) searchCommentGif(shoutoutId, '');
};

window.searchCommentGif = function(shoutoutId, query) {
  clearTimeout(_gifSearchTimer);
  _gifSearchTimer = setTimeout(async () => {
    const grid = document.getElementById(`comment-gif-grid-${shoutoutId}`);
    if (!grid) return;
    grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:11px;text-align:center;padding:8px;">Loading…</p>';
    try {
      const endpoint = !query
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=pg`
        : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=12&rating=pg`;
      const res = await fetch(endpoint);
      const data = await res.json();
      const results = data.data || [];
      if (!results.length) { grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:11px;text-align:center;padding:8px;">No results</p>'; return; }
      grid.innerHTML = results.map(r => {
        const url = r.images?.original?.url || '';
        const preview = r.images?.fixed_height_small?.url || url;
        return `<img src="${preview}" alt="gif" loading="lazy"
                     onclick="pickCommentGif('${shoutoutId}','${url}')"
                     style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;">`;
      }).join('');
    } catch(err) {
      grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:11px;text-align:center;padding:8px;">Could not load GIFs</p>';
    }
  }, 400);
};

window.pickCommentGif = function(shoutoutId, gifUrl) {
  // Store GIF URL as the comment image
  if (!window._commentImages) window._commentImages = {};
  window._commentImages[shoutoutId] = gifUrl;
  // Show preview
  const preview = document.getElementById(`comment-img-preview-${shoutoutId}`);
  const thumb = document.getElementById(`comment-img-thumb-${shoutoutId}`);
  if (preview && thumb) { thumb.src = gifUrl; preview.style.display = 'flex'; }
  // Close GIF panel
  const gp = document.getElementById(`comment-gif-panel-${shoutoutId}`);
  if (gp) gp.style.display = 'none';
};

// ── Photo upload ─────────────────────────────────────────────────────────────
window.handleCommentImage = async function(shoutoutId, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { showToast('Image too large (max 8MB)', 'error'); return; }
  showToast('Compressing…', 'success');
  try {
    const compressed = await compressImage(file, 900, 0.70);
    const base64 = await new Promise(resolve => {
      const r = new FileReader(); r.onload = e => resolve(e.target.result); r.readAsDataURL(compressed);
    });
    if (!window._commentImages) window._commentImages = {};
    window._commentImages[shoutoutId] = base64;
    const preview = document.getElementById(`comment-img-preview-${shoutoutId}`);
    const thumb = document.getElementById(`comment-img-thumb-${shoutoutId}`);
    if (preview && thumb) { thumb.src = base64; preview.style.display = 'flex'; }
  } catch(err) { showToast('Could not process image', 'error'); }
};

window.clearCommentImage = function(shoutoutId) {
  if (window._commentImages) delete window._commentImages[shoutoutId];
  const preview = document.getElementById(`comment-img-preview-${shoutoutId}`);
  if (preview) preview.style.display = 'none';
  const thumb = document.getElementById(`comment-img-thumb-${shoutoutId}`);
  if (thumb) thumb.src = '';
};

// ── Thumbnail viewer for marketplace / lost & found list cards ────────────────
// -- Lost & Found image preview handler --------------------------------------
window.handleLostImages = function(input) {
  const container = document.getElementById('lostImagePreviews');
  if (!container) return;
  const files = Array.from(input.files);
  if (!files.length) { container.innerHTML = ''; return; }

  container.innerHTML = '';
  files.forEach((file, i) => {
    if (file.size > 8 * 1024 * 1024) {
      showToast(file.name + ' is too large (max 8MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      const div = document.createElement('div');
      div.className = 'relative w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0';
      div.innerHTML = '<img src="' + e.target.result + '" class="w-full h-full object-cover">';
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
};

window.openThumbViewer = function(evt, src) {
  evt.stopImmediatePropagation();
  evt.preventDefault();
  const existing = document.getElementById('_thumbViewer');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = '_thumbViewer';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  el.innerHTML = `
    <button onclick="document.getElementById('_thumbViewer').remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    <img src="${src}" style="max-width:90vw;max-height:88vh;object-fit:contain;border-radius:12px;box-shadow:0 0 40px rgba(0,0,0,0.8);">`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
};

// ── Full-image viewer used in lost & found and marketplace detail modals ──────
// Delegated handler — works for any .lost-viewer-img added dynamically to DOM
document.addEventListener('click', function(e) {
  const img = e.target.closest('.lost-viewer-img');
  if (!img) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  openImageViewerForLost(img.dataset.src || img.src);
});

window.openImageViewerForLost = function(src) {
  const existing = document.getElementById('_imgViewerForLost');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = '_imgViewerForLost';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  el.innerHTML = `
    <button onclick="document.getElementById('_imgViewerForLost').remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    <img src="${src}" style="max-width:90vw;max-height:88vh;object-fit:contain;border-radius:12px;box-shadow:0 0 40px rgba(0,0,0,0.8);">`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
};

// ── Show/hide home-specific fields in the marketplace post form ───────────────
window.toggleMarketHomeFields = function() {
  const cat = document.getElementById('marketCategory')?.value;
  const fields = document.getElementById('marketHomeFields');
  if (!fields) return;
  if (cat === 'Homes') {
    fields.classList.remove('hidden');
  } else {
    fields.classList.add('hidden');
  }
};

// ── Comment image lightbox ────────────────────────────────────────────────────
window.openCommentImageLightbox = function(src) {
  const existing = document.getElementById('commentImgLightbox');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'commentImgLightbox';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;';
  el.innerHTML = `
    <button onclick="document.getElementById('commentImgLightbox').remove()"
            style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    <img src="${src}" style="max-width:90vw;max-height:88vh;object-fit:contain;border-radius:12px;box-shadow:0 0 40px rgba(0,0,0,0.8);">`;
  el.onclick = (e) => { if (e.target === el) el.remove(); };
  document.body.appendChild(el);
};

// Close emoji/gif panels when clicking outside
document.addEventListener('click', function(e) {
  document.querySelectorAll('[id^="comment-emoji-panel-"]').forEach(panel => {
    if (!panel.contains(e.target) && !e.target.closest('[onclick*="toggleCommentEmoji"]')) {
      panel.style.display = 'none';
    }
  });
  document.querySelectorAll('[id^="comment-gif-panel-"]').forEach(panel => {
    if (!panel.contains(e.target) && !e.target.closest('[onclick*="toggleCommentGif"]')) {
      panel.style.display = 'none';
    }
  });
});

window.toggleReplyBox = function (shoutoutId, commentId) {
  const box = document.getElementById(`replybox-${commentId}`);
  if (!box) return;
  const isHidden = box.style.display === 'none' || box.style.display === '';
  box.style.display = isHidden ? 'flex' : 'none';
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
    // Update the reply in the cache
    const cache = window._commentDataCache[shoutoutId] || [];
    const comment = cache.find(c => c._id === commentId);
    if (comment) {
      comment.replies = comment.replies || [];
      comment.replies.push({ _id: res._id, author: res.author || currentUser?.name, text, createdAt: new Date().toISOString() });
    }
    _renderCommentList(shoutoutId);
  } else {
    showToast(res.message || 'Error posting reply', 'error');
  }
};

window.deleteComment = async function (shoutoutId, commentId) {
  if (!confirm('Delete this comment?')) return;
  const res = await apiDelete(`/shoutouts/${shoutoutId}/comments/${commentId}`);
  if (res.message === 'Deleted') {
    // Remove from cache
    if (window._commentDataCache[shoutoutId]) {
      window._commentDataCache[shoutoutId] = window._commentDataCache[shoutoutId].filter(c => c._id !== commentId);
    }
    _renderCommentList(shoutoutId);
    // Decrement the comment count badge
    const countBadge = document.querySelector(`#shoutout-${shoutoutId} .sc-react span:last-child`);
    if (countBadge) {
      const prev = parseInt(countBadge.textContent, 10) || 1;
      countBadge.textContent = Math.max(0, prev - 1);
    }
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

  // Render from cache instantly if available, then refresh in background
  if (_allDeals && _allDeals.length) renderDealsPage();
  await renderDealsPage();
}

async function renderDealsPage() {
  const container = document.getElementById('dealsList');
  if (!container) return;

  // Render from cache immediately if available
  if (_allDeals && _allDeals.length) {
    _renderDealsHTML(_allDeals, container);
  }

  const res = await apiGet(`/deals?page=${window.currentDealsPage}&limit=8`);
  const deals = res.deals || [];
  const pagination = res.pagination || {};

  _allDeals = deals;
  if (document.getElementById('dealsList')) {
    _renderDealsHTML(deals, document.getElementById('dealsList'));
    renderDealsPagination(pagination);
  }
}

function _renderDealsHTML(deals, container) {
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
  const [eventsRes] = await Promise.all([apiGet('/events?limit=200'), ensureDirCategories()]);
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
               oninput="window._eventSearch=this.value; renderEventsFiltered(true)">
        <select id="eventTimeSelect" onchange="window._eventTime=this.value; renderEventsFiltered(true)"
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

window.renderEventsFiltered = function (resetPage = false) {
  if (resetPage) window._eventsPage = 1;
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
      <button onclick="window._eventFilter='All'; renderEventsFiltered(true)"
              class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${currentFilter === 'All' ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
        All
      </button>
      ${activeCats.map(cat => {
        const safe = cat.name.replace(/'/g, "\\'");
        return `
        <button onclick="window._eventFilter='${safe}'; renderEventsFiltered(true)"
                class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${currentFilter === cat.name ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}">
          <span>${cat.icon}</span><span>${cat.name}</span>
        </button>`;
      }).join('')}`;
  }

let events = allEvents.filter(e => {
  const eDate = new Date(e.date);

  // Only hide very old events when viewing "Upcoming"
  if (time === 'upcoming') {
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    if (eDate < threeDaysAgo) return false;
    if (eDate < now) return false; // still hide past events in upcoming mode
  }

  if (time === 'past' && eDate >= now) return false;

  if (currentFilter !== 'All' && e.category !== currentFilter) return false;

  if (search && 
      !e.title.toLowerCase().includes(search) &&
      !(e.description || '').toLowerCase().includes(search) &&
      !(e.location || '').toLowerCase().includes(search)) {
    return false;
  }

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
        ${currentFilter !== 'All' ? `<button onclick="window._eventFilter='All';renderEventsFiltered(true)" class="mt-3 text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition">Clear filter</button>` : ''}
      </div>`;
    return;
  }

  // ── Pagination ──
  const EVENTS_PAGE_SIZE = 8;
  if (window._eventsPage === undefined) window._eventsPage = 1;
  const totalEventPages = Math.ceil(events.length / EVENTS_PAGE_SIZE);
  window._eventsPage = Math.min(window._eventsPage, Math.max(1, totalEventPages));
  const pagedEvents = events.slice((window._eventsPage - 1) * EVENTS_PAGE_SIZE, window._eventsPage * EVENTS_PAGE_SIZE);

  if (time !== 'past') {
    const grouped = {};
    pagedEvents.forEach(e => {
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
    container.innerHTML = `<div class="space-y-3">${pagedEvents.map(e => renderEventCard(e, now)).join('')}</div>`;
  }

  if (totalEventPages > 1) {
    const paginationHTML = `
      <div class="flex items-center justify-between mt-6 px-1">
        <button onclick="window._eventsPage = Math.max(1, window._eventsPage - 1); renderEventsFiltered()"
                ${window._eventsPage === 1 ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          ← Previous
        </button>
        <div class="text-sm text-white/50">
          Page <span class="font-semibold text-white">${window._eventsPage}</span> of ${totalEventPages}
        </div>
        <button onclick="window._eventsPage = Math.min(${totalEventPages}, window._eventsPage + 1); renderEventsFiltered()"
                ${window._eventsPage === totalEventPages ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          Next →
        </button>
      </div>`;
    container.innerHTML += paginationHTML;
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

  // Render from cache immediately if available
  if (_allResources && _allResources.length) {
    _renderResourcesContent(content, _allResources, _resourceCategories || []);
  }

  try {
    const data = await apiGet('/resources');

    if (!data || data.message) {
      if (!_allResources || !_allResources.length) {
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
      return;
    }

    _allResources = data.businesses || [];
    _resourceCategories = data.categories || [];

    _allResources = data.businesses || [];
    _resourceCategories = data.categories || [];
    if (!document.getElementById('content')) return;
    _renderResourcesContent(content, _allResources, _resourceCategories);

  } catch (err) {
    if (!_allResources || !_allResources.length) {
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
}

function _renderResourcesContent(content, resources, categories) {
  const RESOURCE_CATS = [
    { name: 'Churches',           icon: '⛪' },
    { name: 'Recycling Centers',  icon: '♻️' },
    { name: 'Fishing Spots',      icon: '🎣' },
    { name: 'Parks & Recreation', icon: '🌳' },
    { name: 'Libraries',          icon: '📚' },
  ];

  const presentCatNames = new Set(resources.map(b => b.category?.name).filter(Boolean));
  const visibleCats = RESOURCE_CATS.filter(c => presentCatNames.has(c.name));

  content.innerHTML = `
      <div class="max-w-2xl mx-auto px-2 pb-10">
      
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-3xl md:text-4xl font-bold">🌍 Community Resources</h2>
          <span class="text-sm text-white/40">${resources.length} listed</span>
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

  _allResources = resources;
  window._activeResourceFilter = 'All';
  renderResourcesList(resources);
}

window.filterResources = function (categoryName) {
  window._activeResourceFilter = categoryName;
  resourcesCurrentPage = 1;

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

  // === PAGINATION LOGIC ===
  const totalPages = Math.ceil(items.length / RESOURCES_PAGE_SIZE);
  resourcesCurrentPage = Math.min(resourcesCurrentPage, totalPages);

  const start = (resourcesCurrentPage - 1) * RESOURCES_PAGE_SIZE;
  const pageItems = items.slice(start, start + RESOURCES_PAGE_SIZE);

  // Group only the current page's items
  const grouped = {};
  pageItems.forEach(item => {
    const catName = item.category?.name || 'Other';
    const catIcon = item.category?.icon || '📍';
    if (!grouped[catName]) grouped[catName] = { icon: catIcon, items: [] };
    grouped[catName].items.push(item);
  });

  let html = Object.entries(grouped).map(([catName, group]) => `
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

  // === PAGINATION CONTROLS ===
  if (totalPages > 1) {
    html += `
      <div class="flex items-center justify-between mt-6 px-1">
        <button onclick="goToResourcesPage(${resourcesCurrentPage - 1})"
                ${resourcesCurrentPage === 1 ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          ← Previous
        </button>
        <div class="text-sm text-white/50">
          Page <span class="font-semibold text-white">${resourcesCurrentPage}</span> of ${totalPages}
        </div>
        <button onclick="goToResourcesPage(${resourcesCurrentPage + 1})"
                ${resourcesCurrentPage === totalPages ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          Next →
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
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

window.goToResourcesPage = function(page) {
  resourcesCurrentPage = page;

  const search = (document.getElementById('resourceSearch')?.value || '').toLowerCase();
  const filter = window._activeResourceFilter || 'All';

  const filtered = _allResources.filter(b => {
    const catMatch = filter === 'All' || b.category?.name === filter;
    const searchMatch = !search ||
      b.name.toLowerCase().includes(search) ||
      (b.description || '').toLowerCase().includes(search) ||
      (b.address || '').toLowerCase().includes(search);
    return catMatch && searchMatch;
  });

  renderResourcesList(filtered);
};

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
    <div onclick="if(event.target.id==='resourceModal') closeResourceDetail()" id="resourceModal"
         class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[14000] flex items-end md:items-center justify-center p-4">
      
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-[#0f172a] text-white w-full max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl border border-white/10">

        <!-- Header -->
        <div class="sticky top-0 bg-[#0f172a] px-6 py-4 border-b border-white/10 flex justify-between items-center rounded-t-3xl">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
              ${icon}
            </div>
            <div>
              <h2 class="text-xl font-bold">${esc(item.name)}</h2>
              <p class="text-emerald-400 text-sm">${catName}</p>
            </div>
          </div>
          <button onclick="closeResourceDetail()" class="text-white/50 hover:text-white text-3xl leading-none">×</button>
        </div>

        <div class="p-6 space-y-5">

          <!-- Address -->
          ${item.address ? `
            <div class="flex items-start gap-3 bg-white/5 rounded-2xl p-4">
              <span class="text-xl mt-0.5">📍</span>
              <div>
                <p class="text-xs text-white/50 font-semibold mb-0.5">ADDRESS</p>
                <p class="text-white">${esc(item.address)}</p>
              </div>
            </div>` : ''}

          <!-- Phone -->
          ${item.phone ? `
            <a href="tel:${item.phone}" class="flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-2xl p-4 transition">
              <span class="text-xl">📞</span>
              <div>
                <p class="text-xs text-white/50 font-semibold">PHONE</p>
                <p class="text-emerald-400 font-semibold">${item.phone}</p>
              </div>
            </a>` : ''}

          <!-- Hours -->
          ${hoursLine ? `
            <div class="flex items-start gap-3 bg-white/5 rounded-2xl p-4">
              <span class="text-xl mt-0.5">🕒</span>
              <div>
                <p class="text-xs text-white/50 font-semibold mb-0.5">HOURS</p>
                <p class="text-amber-300">${hoursLine}</p>
              </div>
            </div>` : ''}

          <!-- Website -->
          ${item.website ? `
            <a href="${item.website.startsWith('http') ? item.website : 'https://' + item.website}" target="_blank"
               class="flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-2xl p-4 transition">
              <span class="text-xl">🌐</span>
              <div>
                <p class="text-xs text-white/50 font-semibold">WEBSITE</p>
                <p class="text-blue-400">${item.website.replace(/^https?:\/\//, '')}</p>
              </div>
            </a>` : ''}

          <!-- Description -->
          ${description ? `
            <div>
              <p class="text-xs font-semibold text-white/50 mb-2">ABOUT</p>
              <p class="text-white/80 leading-relaxed">${esc(description)}</p>
            </div>` : ''}

        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-white/10 flex gap-3">
          <button onclick="closeResourceDetail()" 
                  class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-3xl font-semibold transition">
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

// ─── OWNER DASHBOARD (with Business Pro Tier) ─────────────────────────────────
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

  // Build tab list
const tabs = [
  { id: 'listing',       label: 'Listing',       icon: '📋' },
  { id: 'photos',        label: 'Photos',         icon: '📷' },
  ...(biz && biz.isRestaurant ? [{ id: 'menu', label: 'Menu', icon: '🍽️' }] : []),
  { id: 'deals',         label: 'Deals',          icon: '🔥' },
  { id: 'events',        label: 'Events',         icon: '📅' },
  { id: 'homes',         label: 'Marketplace Items', icon: '🛒' },

  // ─── REMOVED: Notifications & Analytics tabs (credit/pro system disabled) ───
  // { id: 'notifications', label: 'Notifications',  icon: '📢' },
  // { id: 'analytics',     label: 'Analytics',      icon: '📊' },
];

  // Credits/Pro system removed — no subscription fetch needed

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

        <!-- ═══ TAB: Listing ═══════════════════════════════════════════════ -->
        <div id="dtabContent-listing" class="tab-content">
          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 space-y-6">

            <!-- Business Info -->
            <div>
              <label class="block text-xs font-semibold text-white/50 mb-1">Business Name</label>
              <input id="ownerBizName" value="${biz.name || ''}" 
                     class="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-white/50 mb-1">Phone</label>
                <input id="ownerBizPhone" value="${biz.phone || ''}" 
                       class="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
              </div>
              <div>
                <label class="block text-xs font-semibold text-white/50 mb-1">Email</label>
                <input id="ownerBizEmail" value="${biz.email || ''}" 
                       class="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-white/50 mb-1">Address</label>
              <input id="ownerBizAddress" value="${biz.address || ''}" 
                     class="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
            </div>

            <div>
              <label class="block text-xs font-semibold text-white/50 mb-1">Description</label>
              <textarea id="ownerBizDescription" rows="3" 
                        class="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400 resize-none">${biz.description || ''}</textarea>
            </div>

<!-- Logo Upload -->
<div class="pt-4 border-t border-white/10">
  <h3 class="font-bold text-lg mb-4 flex items-center gap-2">🏷️ Business Logo</h3>
  
  <div class="flex flex-col items-center gap-4">
    
    <!-- Square Logo Preview -->
    <div id="ownerLogoPreview" 
         class="w-28 h-28 rounded-3xl overflow-hidden border-4 border-white/20 shadow-xl bg-white/10 flex items-center justify-center text-6xl">
      
      ${biz.logo 
        ? `<img src="${biz.logo}" class="w-full h-full object-cover">` 
        : `<span>${biz.category?.icon || '🏪'}</span>`}
    </div>

    <button onclick="document.getElementById('ownerLogoUpload').click()" 
            class="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-8 py-3 rounded-2xl font-semibold flex items-center gap-2 transition">
      📸 Upload New Logo
    </button>

    <input id="ownerLogoUpload" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"
           onchange="handleOwnerLogoUpload(this)">

    <button id="ownerLogoSaveBtn" onclick="saveOwnerBusinessLogo()"
            class="hidden w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-8 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition">
      💾 Save Logo
    </button>
    
    <p class="text-xs text-white/40 text-center">Recommended: Square image • Max 5MB</p>
  </div>
</div>

            <!-- Business Hours -->
            <div>
              <label class="block text-xs font-semibold text-white/50 mb-1">Business Hours</label>
              <p class="text-white/35 text-xs mb-2">Format: <span class="font-mono text-white/50">Mon-Fri 9am-5pm • Sat 10am-3pm • Sun Closed</span></p>
              <input id="ownerHours" type="text"
                     placeholder="e.g. Mon-Fri 9am-5pm • Sat 10am-3pm"
                     value="${biz.hours || ''}"
                     class="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
              <p class="text-white/30 text-xs mt-1 px-1">Drives the live Open/Closed badge on your business card.</p>
            </div>

            <button onclick="saveOwnerBusinessChanges()" 
                    class="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold">
              💾 Save All Changes
            </button>
          </div>
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

                <!-- ═══ TAB: Marketplace Items ════════════════════════════════════════════ -->
        <div id="dtabContent-homes" class="hidden">
          <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-4 space-y-4">

            <div class="flex items-center justify-between mb-1">
              <h3 class="font-bold text-base flex items-center gap-2"><span>🛒</span> Post Marketplace Item</h3>
              <span class="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full">as ${biz?.name || 'Your Business'}</span>
            </div>

            <!-- Category -->
            <div>
              <label class="text-xs text-white/50 block mb-1.5">Category</label>
              <select id="homeCategory" class="${selectClass}" style="${selectStyle}" onchange="toggleHomeExtraFields()">
                <option value="">Select category...</option>
                <option value="Homes">🏠 Homes (Rent / Sale)</option>
                <option value="Cars">🚗 Cars & Vehicles</option>
                <option value="Furniture">🪑 Furniture</option>
                <option value="Electronics">📱 Electronics</option>
                <option value="General">📦 General / Other</option>
              </select>
            </div>

            <!-- Title -->
            <input id="homeTitle" type="text" placeholder="Title *" class="${inputClass}">

            <!-- Price + Condition -->
            <div class="grid grid-cols-2 gap-3">
              <input id="homePrice" type="text" placeholder="Price ($)" class="${inputClass}">
              <select id="homeCondition" class="${selectClass}" style="${selectStyle}">
                <option value="used">Used / Good</option>
                <option value="like-new">Like New</option>
                <option value="new">New</option>
                <option value="fair">Fair</option>
              </select>
            </div>

            <!-- Description -->
            <textarea id="homeDesc" rows="3" placeholder="Description" class="${inputClass} resize-none"></textarea>

            <!-- ═══ HOME EXTRA FIELDS (only visible when Homes is selected) ═══ -->
            <div id="homeExtraFields" class="hidden space-y-3 border border-white/10 rounded-2xl p-4 bg-white/5">
              <div class="text-xs font-semibold text-emerald-400 mb-1">Home Details</div>

              <div class="grid grid-cols-2 gap-3">
                <select id="homeType" class="${selectClass}" style="${selectStyle}">
                  <option value="">Listing Type</option>
                  <option value="rent">For Rent</option>
                  <option value="sale">For Sale</option>
                </select>
                <input id="homeSqft" type="number" placeholder="Sq Ft" class="${inputClass}">
              </div>

              <div class="grid grid-cols-2 gap-3">
                <input id="homeBeds" type="number" min="0" placeholder="Bedrooms" class="${inputClass}">
                <input id="homeBaths" type="number" min="0" step="0.5" placeholder="Bathrooms" class="${inputClass}">
              </div>

              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-sm text-white/80 cursor-pointer flex-1">
                  <input type="checkbox" id="homePetFriendly" class="w-5 h-5 accent-emerald-500"> Pet Friendly
                </label>
                <input id="homeAddress" type="text" placeholder="Address / Neighborhood" class="${inputClass} flex-1">
              </div>
            </div>

            <!-- Photos -->
            <div>
              <label class="text-xs text-white/40 uppercase tracking-widest block mb-2">Photos (up to 10)</label>
              <div id="homeImagePreviews" class="flex flex-wrap gap-2 mb-2"></div>
              <label class="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white/70 transition w-full">
                <span>📷</span>
                <span id="homePhotoLabel">Add photos…</span>
                <input type="file" accept="image/*" multiple onchange="handleHomeImages(this)" class="hidden">
              </label>
            </div>
            <button onclick="postHomeListing()" class="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 py-4 rounded-3xl font-semibold transition-all">
              🛒 Post to Marketplace
            </button>
          </div>

          <!-- Your listings -->
          <p class="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-1">Your Marketplace Listings</p>
          <div id="ownerHomesList"><div class="text-white/30 text-center py-8 text-sm">Loading…</div></div>
        </div>

<!-- ═══ TAB: Analytics ════════════════════════════════════════════════════════ -->
<div id="dtabContent-analytics" class="hidden">
  <div id="analyticsContent">
    <div class="text-white/30 text-center py-12 text-sm">Loading analytics…</div>
  </div>
</div>

<!-- ═══ TAB: Notifications ════════════════════════════════════════════════════ -->
<div id="dtabContent-notifications" class="hidden">
  <div id="notificationsContent">
    <div class="text-white/30 text-center py-12 text-sm">Loading notification center…</div>
  </div>
</div>

      </div>
    </div>`;

}

window.switchDashTab = function (tabId) {
  const allIds = ['listing', 'photos', 'menu', 'deals', 'events', 'homes', 'notifications', 'analytics'];
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
  if (tabId === 'deals')         loadOwnerDeals();
  if (tabId === 'events')        loadOwnerEvents();
  if (tabId === 'photos')        renderOwnerPhotoGrid();
  if (tabId === 'notifications') loadNotificationsTab();
  if (tabId === 'homes')         loadOwnerHomes();
  if (tabId === 'analytics')     loadOwnerAnalytics();
};

// ─── NOTIFICATIONS TAB LOADER ────────────────────────────────────────────────

// Templates stored in JS so onclick never needs JSON.stringify inside attributes
// ─── BUSINESS PHOTO POST HELPERS ─────────────────────────────────────────────

let _bizPostPendingImage = null; // base64 data URL

window.handleBizPostImageSelect = async function(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    showToast('Image must be under 4 MB', 'error');
    input.value = '';
    return;
  }

  try {
    const compressed = await compressImage(file, 1200, 0.80);
    const reader = new FileReader();
    reader.onload = e => {
      _bizPostPendingImage = e.target.result;
      const preview = document.getElementById('bizPostImagePreview');
      const clearBtn = document.getElementById('bizPostImageClear');
      if (preview) {
        preview.innerHTML = `<img src="${_bizPostPendingImage}" class="w-full h-full object-cover rounded-2xl">`;
        preview.classList.remove('border-dashed', 'border-white/20');
        preview.classList.add('border-emerald-400/40');
        preview.onclick = null; // disable re-pick tap on the preview image itself
      }
      if (clearBtn) clearBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(compressed);
  } catch (e) {
    showToast('Failed to process image', 'error');
  }
};

window.clearBizPostImage = function() {
  _bizPostPendingImage = null;
  const preview  = document.getElementById('bizPostImagePreview');
  const clearBtn = document.getElementById('bizPostImageClear');
  const input    = document.getElementById('bizPostImageInput');
  if (input)    input.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  if (preview) {
    preview.innerHTML = `
      <span class="text-3xl">📷</span>
      <span class="text-sm text-white/50">Tap to add photo</span>
      <span class="text-xs text-white/30">JPEG · PNG · WebP · max 4 MB</span>`;
    preview.classList.add('border-dashed', 'border-white/20');
    preview.classList.remove('border-emerald-400/40');
    preview.onclick = () => document.getElementById('bizPostImageInput').click();
  }
};

window.submitBizPhotoPost = async function() {
  if (!_bizPostPendingImage) {
    showToast('Please select a photo first', 'error');
    return;
  }

  const caption    = document.getElementById('bizPostCaption')?.value.trim() || '';
  const sendNotify = document.getElementById('bizPostNotify')?.checked ?? true;

  if (sendNotify && !(await checkNotificationCredits(2))) return;

  const btn = document.querySelector('#notificationsContent button[onclick="submitBizPhotoPost()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  try {
    const res = await apiPost('/owner/business-posts', {
      image: _bizPostPendingImage,
      caption,
      sendNotify
    });

    if (res._id) {
      showToast(sendNotify ? '📸 Photo posted & notification sent!' : '📸 Photo posted!', 'success');
      // Reset form
      clearBizPostImage();
      const captionEl = document.getElementById('bizPostCaption');
      if (captionEl) captionEl.value = '';
      // Refresh post history
      loadBizPostHistory();
    } else {
      showToast(res.message || 'Failed to post', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Failed to post photo update', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📸 Post Photo Update'; }
  }
};

async function loadBizPostHistory() {
  const el = document.getElementById('bizPostHistory');
  if (!el) return;

  try {
    const posts = await apiGet('/owner/business-posts');
    if (!posts.length) {
      el.innerHTML = `<p class="text-white/30 text-xs text-center py-3">No photo posts yet.</p>`;
      return;
    }
    el.innerHTML = posts.map(p => `
      <div class="flex gap-3 items-start bg-white/5 border border-white/10 rounded-2xl p-3">
        <img src="${p.image}" class="w-16 h-16 object-cover rounded-xl flex-shrink-0 cursor-pointer"
             onclick="showBusinessPostModal('${p._id}')">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-white/80 leading-snug line-clamp-2">${esc(p.caption) || '<span class="text-white/30 italic">No caption</span>'}</p>
          <p class="text-[10px] text-white/30 mt-1">${timeAgo(p.createdAt)}</p>
        </div>
        <button onclick="deleteBizPost('${p._id}')" class="text-red-400 hover:text-red-300 text-lg flex-shrink-0 ml-1">🗑️</button>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<p class="text-red-400 text-xs text-center py-3">Failed to load posts</p>`;
  }
}

window.deleteBizPost = async function(id) {
  if (!confirm('Delete this photo post?')) return;
  try {
    await apiDelete(`/owner/business-posts/${id}`);
    showToast('Post deleted', 'success');
    loadBizPostHistory();
  } catch (e) {
    showToast('Failed to delete post', 'error');
  }
};

// ─── BUSINESS POST DETAIL MODAL (deep-link target) ───────────────────────────
window.showBusinessPostModal = async function(postId) {
  // Remove any existing instance
  const existing = document.getElementById('bizPostDetailModal');
  if (existing) existing.remove();

  // Show a quick loading shell
  document.body.insertAdjacentHTML('beforeend', `
    <div id="bizPostDetailModal"
         onclick="if(event.target.id==='bizPostDetailModal') document.getElementById('bizPostDetailModal').remove()"
         class="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center z-[20000] p-0 sm:p-4">
      <div onclick="event.stopPropagation()"
           class="bg-[#0f172a] border border-white/10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[95vh] flex flex-col">
        <div class="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div class="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2 top-2 sm:hidden"></div>
          <span class="text-sm font-semibold text-white/70">Business Update</span>
          <button onclick="document.getElementById('bizPostDetailModal').remove()" class="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div id="bizPostDetailBody" class="flex-1 overflow-y-auto flex items-center justify-center py-16">
          <div class="w-8 h-8 border-4 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
        </div>
      </div>
    </div>`);

  try {
    const post = await apiGet(`/business-posts/post/${postId}`);

    document.getElementById('bizPostDetailBody').innerHTML = `
      <!-- Full image -->
      <div class="w-full bg-black flex items-center justify-center">
        <img src="${post.image}" class="w-full max-h-[60vh] object-contain" alt="Business photo update">
      </div>

      <!-- Meta -->
      <div class="p-5 space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center text-lg flex-shrink-0">📸</div>
          <div>
            <p class="font-bold text-white leading-tight">${esc(post.bizName)}</p>
            <p class="text-xs text-white/40">${timeAgo(post.createdAt)}</p>
          </div>
        </div>

        ${post.caption ? `
        <p class="text-white/90 text-sm leading-relaxed">${esc(post.caption)}</p>` : ''}

        <div class="flex gap-3 pt-2">
          <button onclick="document.getElementById('bizPostDetailModal').remove(); if(typeof loadDirectoryAndOpen==='function'){ loadDirectoryAndOpen('${post.business}') } else { navigate('directory'); }"
                  class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-2xl text-sm font-semibold transition">
            🏪 View ${esc(post.bizName)}
          </button>
          <button onclick="shareContent('business-post', '${esc(post.bizName)}', '${esc(post.caption || '')}')"
                  class="py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-sm font-semibold transition">
            🔗
          </button>
          <button onclick="document.getElementById('bizPostDetailModal').remove()"
                  class="py-3 px-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-2xl text-sm font-semibold transition">
            ✕
          </button>
        </div>
      </div>`;
  } catch (e) {
    document.getElementById('bizPostDetailBody').innerHTML = `
      <div class="p-8 text-center text-white/40">
        <p class="text-4xl mb-3">😕</p>
        <p class="text-sm">This post could not be loaded.</p>
      </div>`;
  }
};

window.applyNotifTemplate = function() {}; // no-op stub — templates removed

// ── Unicode bold/italic helpers (push notifications are plain text,
//    so we use Unicode Mathematical Sans-Serif chars for styling) ──────────────
function _toBoldUnicode(text) {
  return [...text].map(c => {
    const n = c.codePointAt(0);
    if (n >= 65  && n <= 90)  return String.fromCodePoint(0x1D5D4 + n - 65);  // A-Z
    if (n >= 97  && n <= 122) return String.fromCodePoint(0x1D5EE + n - 97);  // a-z
    if (n >= 48  && n <= 57)  return String.fromCodePoint(0x1D7EC + n - 48);  // 0-9
    return c;
  }).join('');
}

function _toItalicUnicode(text) {
  return [...text].map(c => {
    const n = c.codePointAt(0);
    if (n >= 65  && n <= 90)  return String.fromCodePoint(0x1D608 + n - 65);  // A-Z
    if (n >= 97  && n <= 122) return String.fromCodePoint(0x1D622 + n - 97);  // a-z
    return c;
  }).join('');
}

// Strips any existing bold/italic Unicode back to plain ASCII so you can re-apply
function _toPlainUnicode(text) {
  return [...text].map(c => {
    const n = c.codePointAt(0);
    // Bold A-Z / a-z / 0-9
    if (n >= 0x1D5D4 && n <= 0x1D5ED) return String.fromCharCode(n - 0x1D5D4 + 65);
    if (n >= 0x1D5EE && n <= 0x1D607) return String.fromCharCode(n - 0x1D5EE + 97);
    if (n >= 0x1D7EC && n <= 0x1D7F5) return String.fromCharCode(n - 0x1D7EC + 48);
    // Italic A-Z / a-z
    if (n >= 0x1D608 && n <= 0x1D621) return String.fromCharCode(n - 0x1D608 + 65);
    if (n >= 0x1D622 && n <= 0x1D63B) return String.fromCharCode(n - 0x1D622 + 97);
    return c;
  }).join('');
}

window.applyNotifFormat = function(format) {
  const ta = document.getElementById('customBody');
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  if (start === end) { showToast('Select some text first, then tap B or I', 'error'); return; }

  const selected = ta.value.substring(start, end);
  // Strip existing formatting first so you don't double-encode
  const plain = _toPlainUnicode(selected);
  const styled = format === 'bold' ? _toBoldUnicode(plain) : _toItalicUnicode(plain);

  ta.value = ta.value.substring(0, start) + styled + ta.value.substring(end);
  ta.focus();
  ta.setSelectionRange(start, start + styled.length);
  ta.dispatchEvent(new Event('input'));
};

window.insertNotifEmoji = function(emoji) {
  const ta = document.getElementById('customBody');
  if (!ta) return;
  const pos = ta.selectionStart ?? ta.value.length;
  ta.value = ta.value.substring(0, pos) + emoji + ta.value.substring(pos);
  ta.focus();
  ta.setSelectionRange(pos + emoji.length, pos + emoji.length);
  ta.dispatchEvent(new Event('input'));
};

async function loadNotificationsTab() {
  const el = document.getElementById('notificationsContent');
  if (!el) return;

  el.innerHTML = `<div class="text-white/30 text-center py-12 text-sm">Loading notification center…</div>`;

  // Credits/Pro system removed — all verified owners can send notifications
  const bizName = currentUser?.verifiedBusiness?.name || currentUser?.name || 'Your Business';

  el.innerHTML = `
    <div class="space-y-5 p-4">

      <!-- ── Unified notification form ── -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div>
          <h4 class="font-bold text-white">📢 Send Notification</h4>
          <p class="text-xs text-white/50 mt-0.5">Broadcast to all users. Add a photo to make it visual.</p>
        </div>

        <!-- From badge -->
        <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <span class="text-xs text-white/40">From:</span>
          <span class="text-sm font-semibold text-emerald-400">${bizName}</span>
          <span class="text-xs text-white/30 ml-auto">shown to all recipients</span>
        </div>

        <!-- Title input -->
        <input id="customTitle"
               placeholder="Notification title (e.g. Big Sale Today!)"
               class="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-emerald-500" />

        <!-- ── Mini rich-text toolbar + body ── -->
        <div>
          <div class="flex items-center gap-1 bg-white/5 border border-white/10 rounded-t-xl px-3 py-2 border-b-0">
            <span class="text-xs text-white/30 mr-1">Format:</span>
            <button onclick="applyNotifFormat('bold')" title="Bold — select text first"
                    class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-black text-sm transition flex items-center justify-center">B</button>
            <button onclick="applyNotifFormat('italic')" title="Italic — select text first"
                    class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white italic font-semibold text-sm transition flex items-center justify-center">I</button>
            <div class="w-px h-5 bg-white/10 mx-1"></div>
            <span class="text-xs text-white/30 mr-1">Add:</span>
            ${['🔥','🎉','⏰','🏷️','📍','✅','💥','👋'].map(e =>
              `<button onclick="insertNotifEmoji('${e}')"
                      class="w-8 h-8 rounded-lg hover:bg-white/10 text-base transition flex items-center justify-center">${e}</button>`
            ).join('')}
            <div class="ml-auto text-xs text-white/20 hidden sm:block">Select text → tap B or I</div>
          </div>
          <textarea id="customBody" rows="3"
                    placeholder="Message body — select any text then tap B or I to style it…"
                    class="w-full bg-white/10 border border-white/10 rounded-b-xl rounded-t-none px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-emerald-500 resize-none font-mono"></textarea>
        </div>

        <!-- ── Optional photo add-on (collapsed) ── -->
        <div>
          <button onclick="toggleUnifiedPhotoPanel()"
                  id="unifiedPhotoToggle"
                  class="w-full flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition text-sm">
            <span class="flex items-center gap-2 text-white/70">
              <span>📷</span>
              <span>Add a photo <span class="text-white/30 font-normal">(optional)</span></span>
            </span>
            <span id="unifiedPhotoChevron" class="text-white/30 text-xs">▼ expand</span>
          </button>

          <div id="unifiedPhotoPanel" class="hidden mt-3 space-y-3">
            <div id="bizPostImageWrap" class="relative">
              <div id="bizPostImagePreview"
                   class="w-full aspect-video bg-white/5 border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-400/50 hover:bg-white/10 transition-all overflow-hidden"
                   onclick="document.getElementById('bizPostImageInput').click()">
                <span class="text-3xl">📷</span>
                <span class="text-sm text-white/50">Tap to add photo</span>
                <span class="text-xs text-white/30">JPEG · PNG · WebP · max 4 MB</span>
              </div>
              <input id="bizPostImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"
                     onchange="handleBizPostImageSelect(this)">
              <button id="bizPostImageClear" onclick="clearBizPostImage()"
                      class="hidden absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white text-lg flex items-center justify-center hover:bg-red-600 transition">×</button>
            </div>
            <p class="text-[11px] text-white/30 text-center">When a photo is attached the notification opens a full-image view, then links to your directory card.</p>
          </div>
        </div>

        <!-- Live device preview -->
        <div class="bg-black/40 border border-white/10 rounded-xl p-3 space-y-1">
          <div class="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Preview on device</div>
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">MC</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold text-white leading-snug" id="previewTitle">Your title here</div>
              <div class="text-xs text-white/55 leading-snug mt-0.5" id="previewBody">${bizName} · Your message here</div>
            </div>
          </div>
        </div>

        <!-- Send button -->
        <button onclick="sendUnifiedNotification()"
                id="unifiedSendBtn"
                class="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg">
          📢 Send to All Users
        </button>
      </div>

      <!-- ── Past photo posts ── -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h4 class="font-bold text-white text-sm">Your Photo Posts</h4>
        <div id="bizPostHistory" class="space-y-3">
          <div class="text-white/30 text-xs text-center py-4">Loading…</div>
        </div>
      </div>

    </div>`;

  // Wire up live preview
  const titleInput   = document.getElementById('customTitle');
  const bodyInput    = document.getElementById('customBody');
  const previewTitle = document.getElementById('previewTitle');
  const previewBody  = document.getElementById('previewBody');

  function updatePreview() {
    if (previewTitle) previewTitle.textContent = titleInput?.value.trim() || 'Your title here';
    if (previewBody)  previewBody.textContent  = `${bizName} · ${bodyInput?.value.trim() || 'Your message here'}`;
  }

  titleInput?.addEventListener('input', updatePreview);
  bodyInput?.addEventListener('input',  updatePreview);

  // Load past photo posts
  loadBizPostHistory();
}

// ── Toggle the optional photo panel ──────────────────────────────────────────
window.toggleUnifiedPhotoPanel = function() {
  const panel   = document.getElementById('unifiedPhotoPanel');
  const chevron = document.getElementById('unifiedPhotoChevron');
  const note    = document.getElementById('unifiedCostNote');
  if (!panel) return;
  const nowHidden = panel.classList.toggle('hidden');
  if (chevron) chevron.textContent = nowHidden ? '▼ expand' : '▲ collapse';
  if (note)    note.textContent    = nowHidden ? 'text-only broadcast' : 'photo + text broadcast';
};

// ── Unified send: handles both text-only and photo+text in one call ───────────
window.sendUnifiedNotification = async function() {
  const title = document.getElementById('customTitle')?.value.trim();
  const body  = document.getElementById('customBody')?.value.trim();

  if (!title || !body) {
    showToast('Title and message are required', 'error');
    return;
  }

  const hasPhoto = !!_bizPostPendingImage;

  const btn = document.getElementById('unifiedSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }

  try {
    let res;

    if (hasPhoto) {
      // Photo path — POST /owner/business-posts with sendNotify: true
      res = await apiPost('/owner/business-posts', {
        image:      _bizPostPendingImage,
        caption:    body,
        notifTitle: title,
        sendNotify: true,
      });

      if (res._id) {
        showToast('\uD83D\uDCF8 Photo posted & notification sent!', 'success');
        clearBizPostImage();
        // Collapse photo panel
        const panel   = document.getElementById('unifiedPhotoPanel');
        const chevron = document.getElementById('unifiedPhotoChevron');
        const note    = document.getElementById('unifiedCostNote');
        if (panel && !panel.classList.contains('hidden')) {
          panel.classList.add('hidden');
          if (chevron) chevron.textContent = '\u25BC expand';
          if (note)    note.textContent    = 'text-only broadcast';
        }
        loadBizPostHistory();
      } else {
        showToast(res.message || 'Failed to post', 'error');
        return;
      }
    } else {
      // Text-only path — POST /owner/custom-notification
      res = await apiPost('/owner/custom-notification', { title, body });

      if (res.success) {
        showToast('\u2705 Notification sent to all users!', 'success');
      } else {
        showToast(res.message || 'Failed to send notification', 'error');
        return;
      }
    }

    // Clear text fields
    const titleEl = document.getElementById('customTitle');
    const bodyEl  = document.getElementById('customBody');
    if (titleEl) { titleEl.value = ''; titleEl.dispatchEvent(new Event('input')); }
    if (bodyEl)  { bodyEl.value  = ''; bodyEl.dispatchEvent(new Event('input')); }

  } catch (e) {
    console.error(e);
    showToast('Failed to send \u2014 please try again', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCE2 Send to All Users'; }
  }
};

window.saveOwnerBusinessChanges = async function () {
  const name        = document.getElementById('ownerBizName')?.value.trim()        || '';
  const phone       = document.getElementById('ownerBizPhone')?.value.trim()       || '';
  const email       = document.getElementById('ownerBizEmail')?.value.trim()       || '';
  const address     = document.getElementById('ownerBizAddress')?.value.trim()     || '';
  const description = document.getElementById('ownerBizDescription')?.value.trim() || '';
  const hours       = document.getElementById('ownerHours')?.value.trim()          || '';

  const res = await apiPost('/owner/business', { name, phone, email, address, description, hours }, 'PUT');
  if (res._id) {
    currentUser.verifiedBusiness = res;
    showToast('✅ Listing saved!');
  } else {
    showToast(res.message || 'Error saving', 'error');
  }
};

// Keep saveOwnerHours as a standalone in case it's called elsewhere
window.saveOwnerHours = async function () {
  const hours = document.getElementById('ownerHours')?.value.trim() || '';
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

window.addOwnerDeal = async function() {
  const title = document.getElementById('dealTitle').value.trim();
  const desc = document.getElementById('dealDesc').value.trim();
  const expires = document.getElementById('dealExpires').value;
  const category = document.getElementById('dealCategory').value;

  if (!title) return showToast('Deal title required', 'error');

  try {
    const res = await apiPost('/owner/deals', {
      title, description: desc, expires, category
    });

    if (res._id) {
      showToast('🔥 Deal posted!', 'success');
      document.getElementById('dealTitle').value = '';
      document.getElementById('dealDesc').value = '';
      loadOwnerDashboard(document.getElementById('content'));
    }
  } catch (e) {
    showToast('Failed to post deal', 'error');
  }
};

window.deleteOwnerDeal = async function (id) {
  if (!confirm('Delete this deal?')) return;
  await apiDelete(`/owner/deals/${id}`);
  showToast('Deal deleted');
  loadOwnerDeals();
};

window.addOwnerEvent = async function() {
  const title = document.getElementById('eventTitle').value.trim();
  const date = document.getElementById('eventDate').value;
  const location = document.getElementById('eventLocation').value.trim();
  const desc = document.getElementById('eventDesc').value.trim();
  const category = document.getElementById('eventCategory').value;

  if (!title || !date) return showToast('Title and date required', 'error');

  try {
    const res = await apiPost('/owner/events', {
      title, date, location, description: desc, category
    });

    if (res._id) {
      showToast('📅 Event posted!', 'success');
      document.getElementById('eventTitle').value = '';
      document.getElementById('eventDate').value = '';
      document.getElementById('eventDesc').value = '';
      loadOwnerDashboard(document.getElementById('content'));
    }
  } catch (e) {
    showToast('Failed to post event', 'error');
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
          {id:7, label:'Reports',   icon:'🚩'},
          {id:8, label:'Ad Spotlight', icon:'📣'}
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
            <button onclick="switchAdminTab(8)" id="adminTab8" class="admin-tab w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-3 font-semibold hover:bg-white/10">📣 Ad Spotlight</button>
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
          claims.map(c => {
            const score = c.confidenceScore ?? 0;
            const scoreColor = score >= 70 ? 'emerald' : score >= 40 ? 'amber' : 'red';
            const scoreLabel = score >= 70 ? 'High Confidence' : score >= 40 ? 'Medium — Fast Track' : 'Low Confidence';
            const signals = c.signals || [];
            return `
            <div class="bg-white/10 rounded-3xl p-5 space-y-3 ${c.fastTrack ? 'ring-2 ring-amber-400/50' : ''}">
              <div class="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p class="text-white font-semibold text-lg">${c.business?.name || 'Unknown Business'}</p>
                  <p class="text-white/60 text-sm">${c.business?.address || ''}</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  ${c.fastTrack ? `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold">⚡ Fast Track</span>` : ''}
                  <span class="bg-${scoreColor}-500/20 text-${scoreColor}-300 border border-${scoreColor}-500/30 px-3 py-1 rounded-full text-xs font-bold">
                    ${score}/100 — ${scoreLabel}
                  </span>
                </div>
              </div>

              <!-- Confidence signals -->
              ${signals.length ? `
              <div class="bg-black/20 rounded-2xl p-3 grid grid-cols-2 gap-2">
                ${signals.map(s => `
                  <div class="flex items-center gap-2 text-xs">
                    <span class="${s.passed ? 'text-emerald-400' : 'text-white/30'}">${s.passed ? '✓' : '✗'}</span>
                    <span class="${s.passed ? 'text-white/80' : 'text-white/30'}">${s.label}</span>
                    ${s.passed ? `<span class="text-emerald-400/60 ml-auto">+${s.points}</span>` : ''}
                  </div>`).join('')}
              </div>` : ''}

              <div class="bg-black/20 rounded-2xl p-4 text-sm space-y-1">
                <p class="text-white/80"><span class="text-white/40">Claimant:</span> ${c.user?.name} (${c.user?.email})</p>
                <p class="text-white/80"><span class="text-white/40">Owner Name:</span> ${c.verificationInfo?.ownerName || '—'}</p>
                <p class="text-white/80"><span class="text-white/40">Phone:</span> ${c.verificationInfo?.phone || '—'}</p>
                <p class="text-white/80"><span class="text-white/40">Address:</span> ${c.verificationInfo?.address || '—'}</p>
                ${c.verificationInfo?.email ? `<p class="text-white/80"><span class="text-white/40">Email:</span> ${c.verificationInfo.email}</p>` : ''}
                ${c.verificationInfo?.message ? `<p class="text-white/80"><span class="text-white/40">Note:</span> ${c.verificationInfo.message}</p>` : ''}
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
            </div>`;
          }).join('')}
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
    else if (tab === 8) await renderAdminAdSpotlight(); // ← AD SPOTLIGHT
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
    <div onclick="if(event.target.id==='lostItemModal')hideLostItemModal()" 
         class="bg-slate-900 text-white w-full max-w-lg mx-4 rounded-3xl overflow-hidden border border-white/10">

      <div class="px-6 pt-6 pb-2">
        <h2 class="text-2xl font-bold mb-5">Post Lost or Found Item</h2>
        
        <div class="space-y-4">

          <!-- Lost / Found Toggle -->
          <div>
            <label class="block text-xs font-semibold mb-1.5 text-white/60">Type</label>
            <div class="flex gap-3">
              <button onclick="selectLostType(this, 'lost')" 
                      class="flex-1 py-3.5 rounded-2xl border border-white/20 font-semibold active-type bg-emerald-600 text-white">
                Lost
              </button>
              <button onclick="selectLostType(this, 'found')" 
                      class="flex-1 py-3.5 rounded-2xl border border-white/20 font-semibold text-white/70">
                Found
              </button>
            </div>
            <input type="hidden" id="lostType" value="lost">
          </div>

          <!-- Title -->
          <div>
            <label class="block text-xs font-semibold mb-1.5 text-white/60">Title</label>
            <input id="lostTitle" type="text" placeholder="e.g. Lost Black Wallet or Found iPhone" 
                   class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none">
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-semibold mb-1.5 text-white/60">Description</label>
            <textarea id="lostDesc" rows="3" placeholder="Describe the item or where you found it..." 
                      class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none resize-none"></textarea>
          </div>

          <!-- Location + Date -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1.5 text-white/60">Location</label>
              <input id="lostLocation" type="text" placeholder="Milledgeville, GA" 
                     class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1.5 text-white/60">Date</label>
              <input id="lostDate" type="date" 
                     class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none">
            </div>
          </div>

          <!-- Pet Checkbox -->
          <label class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 cursor-pointer">
            <input type="checkbox" id="isPet" class="w-5 h-5 accent-emerald-500">
            <span class="font-medium">This is a lost pet 🐾</span>
          </label>

          <!-- Photos -->
          <div>
            <label class="block text-xs font-semibold mb-2 text-white/60">Photos (optional)</label>
            <input type="file" id="lostImages" multiple accept="image/*" 
                   class="block w-full text-sm text-white/60 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500"
                   onchange="handleLostImages(this)">
            <div id="lostImagePreviews" class="flex flex-wrap gap-2 mt-3"></div>
          </div>

        </div>
      </div>

      <div class="p-6 border-t border-white/10 flex gap-3">
        <button onclick="hideLostItemModal()" 
                class="flex-1 py-4 rounded-3xl border border-white/20 font-semibold hover:bg-white/5 transition">
          Cancel
        </button>
        <button onclick="postLostItem()" 
                class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-semibold transition">
          Post Item
        </button>
      </div>
    </div>`;
  
  modal.style.display = 'flex';
};

window.selectLostType = function(button, type) {
  // Reset all buttons
  document.querySelectorAll('#lostItemModal button').forEach(btn => {
    btn.classList.remove('bg-emerald-600', 'text-white');
    btn.classList.add('text-white/70');
  });
  
  // Activate selected
  button.classList.add('bg-emerald-600', 'text-white');
  button.classList.remove('text-white/70');
  
  document.getElementById('lostType').value = type;
};

window.hideLostItemModal = function() {
  const modal = document.getElementById('lostItemModal');
  if (modal) modal.remove();
};

window.postLostItem = async function() {
  const title = document.getElementById('lostTitle').value.trim();
  const description = document.getElementById('lostDesc').value.trim();
  if (!title || !description) {
    showToast("Title and description required", 'error');
    return;
  }

  const files = document.getElementById('lostImages').files;
  let images = [];

  if (files.length) {
    showToast('Compressing images...', 'success');
    for (let file of files) {
      if (file.size > 8 * 1024 * 1024) {
        showToast(`${file.name} is too large`, 'error');
        continue;
      }
      try {
        const compressed = await compressImage(file, 1100, 0.72);
        const base64 = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result);
          r.readAsDataURL(compressed);
        });
        images.push(base64);
      } catch (e) {
        console.error(e);
      }
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
    showToast(res.message || 'Error posting item', 'error');
  }
};

// ─── IMPROVED LOST & FOUND DETAIL MODAL ─────────────────────────────────────
window.showLostItemDetail = async function(id) {
  currentLostItemId = id;
  
  try {
    let item = (_allLostItems || []).find(i => String(i._id) === String(id));
    if (!item) item = await apiGet(`/lostitems/${id}`);

    if (!item) {
      showToast('Item not found', 'error');
      return;
    }

    const isOwner = currentUser && item.owner && 
      String(item.owner._id || item.owner) === String(currentUser._id);

    const html = `
      <div id="lostDetailModal" onclick="if(event.target.id==='lostDetailModal') hideLostDetailModal()" 
           class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[14000] flex items-end md:items-center justify-center p-4">
        <div onclick="event.stopImmediatePropagation()" 
             class="bg-white text-slate-900 w-full max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl">

          <div class="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between">
            <div>
              <span class="inline-block px-3 py-1 text-xs font-bold rounded-full ${item.type === 'lost' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
                ${item.type.toUpperCase()}
              </span>
              ${item.isPet ? `<span class="ml-2 text-amber-600">🐾 Lost Pet</span>` : ''}
            </div>
            <button onclick="hideLostDetailModal()" class="text-3xl leading-none text-gray-400 hover:text-gray-600">×</button>
          </div>

          <div class="p-6">
            <h1 class="text-2xl font-bold mb-1">${esc(item.title)}</h1>
            <p class="text-slate-500 text-sm">${item.location ? '📍 ' + esc(item.location) : ''} • ${timeAgo(item.createdAt)}</p>

            ${item.images && item.images.length ? `
              ${(() => { window._lostItemModalImages = item.images; })() || ''}
              <div class="grid grid-cols-2 gap-3 my-6">
                ${item.images.map((src, i) => `
                  <img src="${src}" class="rounded-2xl aspect-video object-cover cursor-pointer" 
                       onclick="event.stopImmediatePropagation(); openImageViewerForLost(window._lostItemModalImages[${i}])">
                `).join('')}
              </div>` : ''}

            <div class="prose prose-slate text-slate-700 leading-relaxed">
              ${esc(item.description || 'No description provided.')}
            </div>

            <div class="mt-10">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-lg">💬 Comments</h3>
                ${!isOwner && item.owner ? `
                  <button onclick="showComposeMessageModal('${item.owner._id || item.owner}', '${esc(item.owner.name || 'Owner')}')" 
                          class="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-2xl font-medium">
                    ✉️ Message Owner
                  </button>` : ''}
              </div>
              <div id="lostCommentsContainer" class="space-y-4"></div>
            </div>
          </div>

          <div class="p-6 border-t bg-slate-50 flex gap-3">
            ${isOwner ? `
              <button onclick="markLostResolved()" 
                      class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-3xl font-semibold">
                ✅ Mark as Resolved
              </button>` : ''}
            <button onclick="shareContent('lost', '${esc(item.title)}', '${esc(item.location || '')}')" 
                    class="flex-1 bg-sky-50 hover:bg-sky-100 text-sky-700 py-4 rounded-3xl font-semibold transition">
              🔗 Share
            </button>
            <button onclick="hideLostDetailModal()" 
                    class="flex-1 bg-gray-100 hover:bg-gray-200 text-slate-900 py-4 rounded-3xl font-semibold">
              Close
            </button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    renderComments(item.comments || [], 'lostCommentsContainer', 'lost', item._id);

  } catch (e) {
    console.error(e);
    showToast('Failed to load item', 'error');
  }
};

window.hideLostDetailModal = function() {
  const modal = document.getElementById('lostDetailModal');
  if (modal) modal.remove();
};

async function renderLostComments(item) {
  const container = document.getElementById('lostCommentsContainer');
  if (!container) return;

  const comments = item.comments || [];
  if (!comments.length) {
    container.innerHTML = `<p class="text-slate-400 text-center py-8">No comments yet — be the first!</p>`;
    return;
  }

  let html = '';
  comments.forEach(c => {
    const authorId = c.authorId?._id || c.authorId;
    html += `
      <div class="bg-slate-100 rounded-2xl p-4">
        <p onclick="event.stopImmediatePropagation(); showUserProfileModal('${authorId}')" 
           class="font-medium cursor-pointer hover:underline">${esc(c.author || 'Anonymous')}</p>
        <p class="text-slate-700 mt-1">${esc(c.text || '')}</p>
      </div>`;
  });
  container.innerHTML = html;
}

window.markLostResolved = async function() {
  if (!currentLostItemId) return;
  if (!confirm('Mark this item as resolved?')) return;
  try {
    await apiPost(`/lostitems/${currentLostItemId}/resolve`, {});
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
    <div onclick="if(event.target.id==='marketModal')hideMarketModal()" 
         class="bg-slate-900 text-white w-full max-w-lg mx-4 rounded-3xl overflow-hidden border border-white/10">

      <div class="px-6 pt-6 pb-2">
        <h2 class="text-2xl font-bold mb-5">Post Marketplace Listing</h2>

        <!-- Category -->
        <div class="mb-4">
          <label class="block text-xs font-semibold mb-1.5 text-white/60">Category</label>
          <select id="marketCategory" 
                  class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none text-white"
                  onchange="toggleMarketHomeFields()">
            <option value="">Select category...</option>
            <option value="Homes">🏠 Homes (Rent / Sale)</option>
            <option value="Cars">🚗 Cars & Vehicles</option>
            <option value="Furniture">🪑 Furniture</option>
            <option value="Electronics">📱 Electronics</option>
            <option value="General">📦 General / Other</option>
          </select>
        </div>

        <!-- Title -->
        <div class="mb-4">
          <label class="block text-xs font-semibold mb-1.5 text-white/60">Title</label>
          <input id="marketTitle" type="text" placeholder="Item title *" 
                 class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none">
        </div>

        <!-- Price + Condition -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs font-semibold mb-1.5 text-white/60">Price ($)</label>
            <input id="marketPrice" type="number" placeholder="25" 
                   class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1.5 text-white/60">Condition</label>
            <select id="marketCondition" 
                    class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none">
              <option value="used">Used</option>
              <option value="like-new">Like New</option>
              <option value="new">New</option>
              <option value="fair">Fair</option>
            </select>
          </div>
        </div>

        <!-- Description -->
        <div class="mb-4">
          <label class="block text-xs font-semibold mb-1.5 text-white/60">Description</label>
          <textarea id="marketDesc" rows="3" placeholder="Description (optional)" 
                    class="w-full bg-white/5 border border-white/20 px-4 py-4 rounded-2xl focus:border-emerald-400 outline-none resize-none"></textarea>
        </div>

        <!-- ═══ HOME FIELDS (only shown when Homes is selected) ═══ -->
        <div id="marketHomeFields" class="hidden mb-4 space-y-3 border border-white/10 rounded-2xl p-4 bg-white/5">
          <div class="text-xs font-semibold text-emerald-400 mb-2">Home Listing Details</div>

          <div class="grid grid-cols-2 gap-3">
            <select id="marketHomeType" class="w-full bg-white/5 border border-white/20 px-4 py-3 rounded-2xl focus:border-emerald-400 outline-none">
              <option value="">Listing Type</option>
              <option value="rent">For Rent</option>
              <option value="sale">For Sale</option>
            </select>
            <input id="marketHomeSqft" type="number" placeholder="Sq Ft" 
                   class="w-full bg-white/5 border border-white/20 px-4 py-3 rounded-2xl focus:border-emerald-400 outline-none">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <input id="marketHomeBeds" type="number" min="0" placeholder="Bedrooms" 
                   class="w-full bg-white/5 border border-white/20 px-4 py-3 rounded-2xl focus:border-emerald-400 outline-none">
            <input id="marketHomeBaths" type="number" min="0" step="0.5" placeholder="Bathrooms" 
                   class="w-full bg-white/5 border border-white/20 px-4 py-3 rounded-2xl focus:border-emerald-400 outline-none">
          </div>

          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-white/80 cursor-pointer flex-1">
              <input type="checkbox" id="marketHomePetFriendly" class="w-5 h-5 accent-emerald-500"> Pet Friendly
            </label>
            <input id="marketHomeAddress" type="text" placeholder="Address / Neighborhood" 
                   class="flex-1 bg-white/5 border border-white/20 px-4 py-3 rounded-2xl focus:border-emerald-400 outline-none">
          </div>
        </div>

        <!-- Photos -->
        <div class="mb-2">
          <label class="block text-xs font-semibold mb-2 text-white/60">Photos</label>
          <input type="file" id="marketImages" multiple accept="image/*" 
                 class="block w-full text-sm text-white/60 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500"
                 onchange="handleMarketImages(this)">
          <div id="marketImagePreviews" class="flex flex-wrap gap-2 mt-3"></div>
        </div>
      <div class="p-6 border-t border-white/10 flex gap-3">
        <button onclick="hideMarketModal()" 
                class="flex-1 py-4 rounded-3xl border border-white/20 font-semibold hover:bg-white/5 transition">
          Cancel
        </button>
        <button onclick="postMarketplaceItem()" 
                class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-semibold transition">
          Post Listing
        </button>
      </div>
    </div>`;
  
  modal.style.display = 'flex';
};

window.hideMarketModal = function() {
  const modal = document.getElementById('marketModal');
  if (modal) modal.remove();
};

window.postMarketplaceComment = async function(itemId) {
  const input = document.getElementById('marketCommentInput');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  if (!requireAuth('Sign in to comment')) return;

  try {
    await apiPost(`/marketplace/${itemId}/comments`, { text });
    input.value = '';
    showToast('Comment posted');

    // Refresh comments
    const res = await apiGet(`/marketplace/${itemId}`);
    const container = document.getElementById('marketCommentsContainer');
    if (container && res.comments) {
      renderComments(res.comments, 'marketCommentsContainer', 'market', itemId);
    }
  } catch (e) {
    showToast('Failed to post comment', 'error');
  }
};

window.postMarketplaceItem = async function() {
  const category  = document.getElementById('marketCategory')?.value;
  const title     = document.getElementById('marketTitle')?.value.trim();
  const price     = parseFloat(document.getElementById('marketPrice')?.value);
  const condition = document.getElementById('marketCondition')?.value || 'used';
  const desc      = document.getElementById('marketDesc')?.value.trim();

  if (!title || !category) {
    showToast('Title and Category are required', 'error');
    return;
  }

  const btn = document.querySelector('#marketModal button[onclick="postMarketplaceItem()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  try {
    let finalDescription = desc || '';

    // If Homes category → build rich description with extra fields
    if (category === 'Homes') {
      const type    = document.getElementById('marketHomeType')?.value;
      const beds    = document.getElementById('marketHomeBeds')?.value.trim();
      const baths   = document.getElementById('marketHomeBaths')?.value.trim();
      const pet     = document.getElementById('marketHomePetFriendly')?.checked;
      const sqft    = document.getElementById('marketHomeSqft')?.value.trim();
      const address = document.getElementById('marketHomeAddress')?.value.trim();

      const homeDetails = [
        type ? (type === 'rent' ? 'For Rent' : 'For Sale') : '',
        beds   ? `${beds} bed${beds !== '1' ? 's' : ''}` : '',
        baths  ? `${baths} bath${baths !== '1' ? 's' : ''}` : '',
        sqft   ? `${sqft} sq ft` : '',
        pet    ? '🐾 Pet Friendly' : '',
        address ? `📍 ${address}` : ''
      ].filter(Boolean).join(' · ');

      if (homeDetails) {
        finalDescription = homeDetails + (desc ? '\n\n' + desc : '');
      }
    }

    const images = window._marketImages || [];

    // Notify checkbox — only rendered for verified business owners
    const notifyChecked = document.getElementById('marketNotifyCommunity')?.checked ?? false;

    // Build rich home details for the notification body if this is a Homes listing
    let homeNotifDetails = null;
    if (category === 'Homes') {
      const type    = document.getElementById('marketHomeType')?.value;
      const beds    = document.getElementById('marketHomeBeds')?.value.trim();
      const baths   = document.getElementById('marketHomeBaths')?.value.trim();
      const address = document.getElementById('marketHomeAddress')?.value.trim();
      homeNotifDetails = { type, beds, baths, address };
    }

    const res = await apiPost('/marketplace', {
      title,
      description: finalDescription,
      price: isNaN(price) ? 0 : price,
      images,
      category,
      condition,
      notifyCommunity: notifyChecked,
      homeNotifDetails
    });

    if (res && res._id) {
      showToast('🛒 Marketplace item posted!', 'success');
      hideMarketModal();

      // Clear form state
      window._marketImages = [];
      const preview = document.getElementById('marketImagePreviews');
      if (preview) preview.innerHTML = '';

      // Refresh marketplace page
      navigate('marketplace');
    } else {
      showToast(res?.message || 'Failed to post', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Network error — try again', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Post Listing'; }
  }
};

// ─── IMPROVED MARKETPLACE DETAIL MODAL ───────────────────────────────────────
window.showMarketplaceDetail = async function(id) {
  try {
    // Always fetch full item by ID — list cache has images stripped
    let item = await apiGet(`/marketplace/${id}`);
    if (!item || !item._id) {
      // Fallback to cache if fetch fails (no images but at least shows metadata)
      item = (allMarketplaceItems || []).find(i => String(i._id) === String(id));
    }

    if (!item || !item._id) {
      showToast('Item not found', 'error');
      return;
    }

    const isSeller = currentUser && item.seller && 
      String(item.seller._id || item.seller) === String(currentUser._id);

    const html = `
      <div id="marketDetailModal" onclick="if(event.target.id==='marketDetailModal') hideMarketDetailModal()" 
           class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[14000] flex items-end md:items-center justify-center p-4">
        
        <div onclick="event.stopImmediatePropagation()" 
             class="bg-[#0f172a] text-white w-full max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl border border-white/10">

          <!-- Header -->
          <div class="sticky top-0 bg-[#0f172a] px-6 py-4 border-b border-white/10 flex justify-between items-center rounded-t-3xl">
            <div>
              <h2 class="text-2xl font-bold">${esc(item.title)}</h2>
              <p class="text-3xl font-bold text-emerald-400 mt-1">
                $${Number(item.price || 0).toLocaleString()}
              </p>
            </div>
            <button onclick="hideMarketDetailModal()" class="text-3xl leading-none text-white/50 hover:text-white">×</button>
          </div>

          <div class="p-6">
            <!-- Images -->
            ${item.images && item.images.length ? `
              ${(() => { window._marketModalImages = item.images; })() || ''}
              <div class="grid grid-cols-2 gap-3 mb-6">
                ${item.images.map((src, i) => `
                  <img src="${src}" class="rounded-2xl aspect-video object-cover cursor-pointer border border-white/10" 
                       onclick="event.stopImmediatePropagation(); openImageViewerForLost(window._marketModalImages[${i}])">
                `).join('')}
              </div>` : ''}

            <!-- Description -->
            <p class="text-white/90 leading-relaxed">${esc(item.description || '')}</p>

            <!-- Meta -->
            <div class="mt-6 flex items-center gap-2 text-sm">
              <span class="px-3 py-1 bg-white/10 rounded-full text-xs">${item.condition || 'Used'}</span>
              <span class="text-white/40">${timeAgo(item.createdAt)}</span>
            </div>

            <!-- Comments Section -->
            <div class="mt-8">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-lg">💬 Comments</h3>
              </div>

              <!-- Comment Input -->
              <div class="flex gap-2 mb-4">
                <input id="marketCommentInput" type="text" placeholder="Write a comment..." 
                       class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500"
                       onkeypress="if(event.key === 'Enter') postMarketplaceComment('${item._id}')">
                <button onclick="postMarketplaceComment('${item._id}')" 
                        class="bg-emerald-600 hover:bg-emerald-700 px-6 rounded-2xl text-sm font-semibold transition">
                  Post
                </button>
              </div>

              <div id="marketCommentsContainer" class="space-y-4"></div>
            </div>
          </div>

          <!-- Seller Actions -->
          ${isSeller ? `
            <div class="p-6 border-t border-white/10 bg-white/5 flex justify-end">
              <button onclick="markMarketSold()" 
                      class="bg-amber-600 hover:bg-amber-700 text-white px-8 py-3.5 rounded-3xl font-semibold">
                Mark as Sold ✅
              </button>
            </div>` : ''}

          <!-- Footer Buttons -->
          <div class="p-6 border-t border-white/10 flex gap-3">
            <button onclick="shareContent('market', '${esc(item.title)}', '$${item.price}')" 
                    class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-3xl font-semibold transition">
              🔗 Share
            </button>
            <button onclick="hideMarketDetailModal()" 
                    class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-3xl font-semibold transition">
              Close
            </button>
          </div>

        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    renderComments(item.comments || [], 'marketCommentsContainer', 'market', item._id);

  } catch (e) {
    console.error(e);
    showToast('Failed to load item', 'error');
  }
};

window.hideMarketDetailModal = function() {
  const modal = document.getElementById('marketDetailModal');
  if (modal) modal.remove();
};

window.deleteMyMarketItem = async function(id) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;
  try {
    await apiDelete(`/marketplace/${id}`);
    showToast('Listing deleted', 'success');
    hideMarketDetailModal();
    allMarketplaceItems = allMarketplaceItems.filter(i => String(i._id) !== String(id));
    navigate('marketplace');
  } catch (e) {
    showToast('Failed to delete listing', 'error');
  }
};

function renderMarketComments(item) {
  const container = document.getElementById('marketCommentsContainer');
  if (!container) return;

  const comments = item.comments || [];
  if (!comments.length) {
    container.innerHTML = `<p class="text-slate-400 text-center py-8">No comments yet — be the first!</p>`;
    return;
  }

  container.innerHTML = comments.map(c => {
    const authorId = c.authorId?._id || c.authorId;
    return `
      <div class="bg-slate-100 rounded-2xl p-4">
        <p onclick="event.stopImmediatePropagation(); showUserProfileModal('${authorId}')" 
           class="font-medium cursor-pointer hover:underline">${esc(c.author || 'Anonymous')}</p>
        <p class="text-slate-700 mt-1">${esc(c.text || '')}</p>
      </div>`;
  }).join('');
}

window.postMarketplaceComment = async function(itemId) {
  const input = document.getElementById('marketCommentInput');
  if (!input) {
    showToast('Comment input not found', 'error');
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  if (!requireAuth('Sign in to comment')) return;

  try {
    await apiPost(`/marketplace/${itemId}/comments`, { text });
    input.value = '';
    showToast('Comment posted!', 'success');

    // Refresh just the comments section
    const res = await apiGet(`/marketplace/${itemId}`);
    const container = document.getElementById('marketCommentsContainer');
    if (container && res.comments) {
      renderComments(res.comments, 'marketCommentsContainer', 'market', itemId);
    }
  } catch (e) {
    console.error(e);
    showToast('Failed to post comment', 'error');
  }
};

window.handleMarketImages = function(input) {
  const files = Array.from(input.files);
  if (!window._marketImages) window._marketImages = [];

  const remaining = 6 - window._marketImages.length; // limit to 6 photos
  if (remaining <= 0) {
    showToast('Maximum 6 photos allowed', 'error');
    return;
  }

  const toProcess = files.slice(0, remaining);

  toProcess.forEach(file => {
    if (file.size > 8 * 1024 * 1024) {
      showToast(`${file.name} is too large (max 8MB)`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      window._marketImages.push(e.target.result);
      renderMarketImagePreviews();
    };
    reader.readAsDataURL(file);
  });
};

function renderMarketImagePreviews() {
  const container = document.getElementById('marketImagePreviews');
  if (!container || !window._marketImages) return;

  container.innerHTML = window._marketImages.map((src, i) => `
    <div class="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
      <img src="${src}" class="w-full h-full object-cover">
      <button onclick="removeMarketImage(${i})" 
              class="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs flex items-center justify-center">✕</button>
    </div>
  `).join('');
}

window.removeMarketImage = function(index) {
  if (!window._marketImages) return;
  window._marketImages.splice(index, 1);
  renderMarketImagePreviews();
};

window.markMarketSold = async function() {
  if (confirm('Mark this item as sold?')) {
    await apiPost(`/marketplace/${currentMarketItemId}/sold`, {});
    hideMarketDetailModal();
    loadPage('marketplace');
  }
};

// In-memory cache for lost & found items (avoids re-fetching on every search/filter)
let _allLostItems = [];

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

      <div id="lostItemsList" class="space-y-4">
        ${[1,2,3,4].map(() => `<div class="bg-white/5 rounded-3xl p-5 animate-pulse h-28"></div>`).join('')}
      </div>
      <div id="lostPagination" class="flex justify-center gap-3 mt-8"></div>
    </div>`;

  window.currentLostPage = 1;
  window.currentLostSearch = '';
  window.currentLostFilter = 'all';

  // Fetch fresh data every visit
  try {
    const res = await apiGet('/lostitems?page=1&limit=30');
    _allLostItems = res.items || [];
  } catch (e) {
    console.error('Lost & Found fetch failed', e);
  }

  // Live search — no network call, just re-filter the cache
  document.getElementById('lostSearchInput').addEventListener('input', debounce(() => {
    window.currentLostSearch = document.getElementById('lostSearchInput').value.trim().toLowerCase();
    window.currentLostPage = 1;
    renderLostItemsPage();
  }, 200));

  renderLostItemsPage();
}

function renderLostItemsPage() {
  const container = document.getElementById('lostItemsList');
  if (!container) return;

  // Filter entirely in memory — no network request
  let filtered = _allLostItems.filter(item => {
    const matchesSearch = !window.currentLostSearch || 
      (item.title || '').toLowerCase().includes(window.currentLostSearch) ||
      (item.description || '').toLowerCase().includes(window.currentLostSearch);
    
    const matchesFilter = window.currentLostFilter === 'all' || 
      item.type === window.currentLostFilter;
    
    return matchesSearch && matchesFilter;
  });

  // Client-side pagination
  const PAGE_SIZE = 8;
  const page = window.currentLostPage || 1;
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let html = '';
  if (paginated.length === 0) {
    html = `<p class="text-white/40 text-center py-16">No items found.</p>`;
  } else {
    html = paginated.map(item => `
      <div id="lost-${item._id}" onclick="showLostDetail('${item._id}')" 
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition">
        <div class="flex gap-4">
          <div class="w-24 h-24 flex-shrink-0 relative">
            <img src="https://www.milledgevilleconnect.com/api/lostitem-thumb/${item._id}" 
                 class="w-24 h-24 object-cover rounded-2xl cursor-zoom-in" 
                 loading="lazy" alt=""
                 onclick="openThumbViewer(event,'https://www.milledgevilleconnect.com/api/lostitem-thumb/${item._id}')"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="w-24 h-24 bg-white/10 rounded-2xl items-center justify-center text-5xl hidden" style="display:none">🔎</div>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <span class="px-3 py-1 text-xs font-bold rounded-full ${item.type === 'lost' ? 'bg-red-500' : 'bg-emerald-500'}">
                ${item.type.toUpperCase()}
              </span>
              ${item.isPet ? `<span class="text-amber-400 text-sm">🐾 Lost Pet</span>` : ''}
            </div>
            
            <h3 class="font-semibold text-lg mt-2">${esc(item.title)}</h3>
            <p class="text-white/70 line-clamp-2">${esc(item.description)}</p>
            
            <div class="flex items-center gap-2 mt-4 text-xs text-white/50">
              <span>📍 ${item.location || 'Unknown'}</span>
              <span>·</span>
              ${renderClickableUser(item.owner, item.authorName || 'Anonymous')}
              <span>·</span>
              <span>${timeAgo(item.createdAt)}</span>
            </div>

            <!-- Report Button -->
            <div class="mt-3 flex justify-end gap-3">
              <button onclick="event.stopImmediatePropagation(); shareContent('lost', '${esc(item.title)}', '${esc(item.location || '')}')" 
                      class="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition">
                🔗 Share
              </button>
              <button onclick="event.stopImmediatePropagation(); reportContent('lost', '${item._id}', '${esc(item.title)}')" 
                      class="text-xs text-red-400 hover:text-red-500 flex items-center gap-1 transition">
                🚩 Report
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
  renderLostPagination({ currentPage: page, totalPages, totalItems, hasPrev: page > 1, hasNext: page < totalPages });
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

  // Fix select dropdown visibility in dark mode
  const style = document.createElement('style');
  style.textContent = `
    select {
      color: white !important;
      background-color: #1e293b !important; /* slate-800 */
    }
    select option {
      background-color: #1e293b;
      color: white;
    }
  `;
  document.head.appendChild(style);

  content.innerHTML = `
    <div class="max-w-2xl mx-auto px-2">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">🛒 Marketplace</h1>
        <button onclick="showPostMarketplaceModal()" 
                class="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-3xl font-semibold flex items-center gap-2">
          <span class="text-xl">📤</span> Sell Something
        </button>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <input id="marketSearchInput" type="text" placeholder="Search items..." 
               class="flex-1 bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400">
        
        <!-- Condition Filter -->
        <select id="marketConditionFilter" onchange="filterAndRenderMarketplace()"
        class="bg-slate-800 border border-white/30 rounded-3xl px-5 py-4 text-white focus:outline-none focus:border-emerald-400">
          <option value="all">All Conditions</option>
          <option value="new">New</option>
          <option value="like-new">Like New</option>
          <option value="used">Used</option>
          <option value="fair">Fair</option>
        </select>
      </div>

      <!-- Category Filter Chips -->
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4 hide-scrollbar">
        <button onclick="setMarketCategoryFilter('all')" id="cat-all"
                class="px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-emerald-600 text-white">All</button>
        <button onclick="setMarketCategoryFilter('Homes')" id="cat-Homes"
                class="px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white">🏠 Homes</button>
        <button onclick="setMarketCategoryFilter('Cars')" id="cat-Cars"
                class="px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white">🚗 Cars</button>
        <button onclick="setMarketCategoryFilter('Furniture')" id="cat-Furniture"
                class="px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white">🪑 Furniture</button>
        <button onclick="setMarketCategoryFilter('Electronics')" id="cat-Electronics"
                class="px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white">📱 Electronics</button>
        <button onclick="setMarketCategoryFilter('General')" id="cat-General"
                class="px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white">📦 General</button>
      </div>
      <div id="marketItemsList" class="space-y-4 min-h-[400px]">
        ${[1,2,3,4].map(() => `<div class="bg-white/5 rounded-3xl p-5 animate-pulse h-28"></div>`).join('')}
      </div>
    </div>`;

  // Always fetch fresh so new listings appear immediately
  try {
    const res = await apiGet('/marketplace?limit=30');
    allMarketplaceItems = res.items || res || [];
  } catch (e) {
    console.error(e);
  }

  window.currentMarketSearch = '';
  window.currentMarketFilter = 'all';
  window.currentMarketCategoryFilter = 'all';
  marketplaceCurrentPage = 1;

  const searchInput = document.getElementById('marketSearchInput');
  searchInput.addEventListener('input', debounce(() => {
    window.currentMarketSearch = searchInput.value.trim().toLowerCase();
    marketplaceCurrentPage = 1;
    renderMarketplacePage();
  }, 250));

  renderMarketplacePage();
}

// Set active category filter
window.setMarketCategoryFilter = function(category) {
  window.currentMarketCategoryFilter = category;

  // Update active button styles
  document.querySelectorAll('[id^="cat-"]').forEach(btn => {
    if (btn.id === `cat-${category}` || (category === 'all' && btn.id === 'cat-all')) {
      btn.className = 'px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-emerald-600 text-white';
    } else {
      btn.className = 'px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white';
    }
  });

  renderMarketplacePage();
};

// Improved filter + render function (replaces old filterAndRenderMarketplace if it exists)
window.filterAndRenderMarketplace = function() {
  const conditionSelect = document.getElementById('marketConditionFilter');
  if (conditionSelect) window.currentMarketFilter = conditionSelect.value;
  marketplaceCurrentPage = 1;
  renderMarketplacePage();
};

window.setMarketCategoryFilter = function(category) {
  window.currentMarketCategoryFilter = category;
  marketplaceCurrentPage = 1;

  // Update active button styles...
  document.querySelectorAll('[id^="cat-"]').forEach(btn => {
    if (btn.id === `cat-${category}` || (category === 'all' && btn.id === 'cat-all')) {
      btn.className = 'px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-emerald-600 text-white';
    } else {
      btn.className = 'px-4 py-1.5 rounded-2xl text-sm font-medium whitespace-nowrap bg-white/10 hover:bg-white/20 text-white';
    }
  });

  renderMarketplacePage();
};

async function renderMarketplacePage() {
  const container = document.getElementById('marketItemsList');
  if (!container) return;

  let filtered = allMarketplaceItems || [];

  // Apply search filter
  if (window.currentMarketSearch) {
    filtered = filtered.filter(item =>
      (item.title || '').toLowerCase().includes(window.currentMarketSearch) ||
      (item.description || '').toLowerCase().includes(window.currentMarketSearch)
    );
  }

  // Apply condition filter
  if (window.currentMarketFilter && window.currentMarketFilter !== 'all') {
    filtered = filtered.filter(item => item.condition === window.currentMarketFilter);
  }

  // Apply category filter
  if (window.currentMarketCategoryFilter && window.currentMarketCategoryFilter !== 'all') {
    filtered = filtered.filter(item => item.category === window.currentMarketCategoryFilter);
  }

  // Sort by most recent first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  currentMarketplaceItems = filtered;

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-white/40 text-center py-20">No listings found.</p>`;
    return;
  }

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / MARKETPLACE_PAGE_SIZE);
  marketplaceCurrentPage = Math.min(marketplaceCurrentPage, totalPages);

  const start = (marketplaceCurrentPage - 1) * MARKETPLACE_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + MARKETPLACE_PAGE_SIZE);

  let html = '<div class="space-y-4">';

  pageItems.forEach(item => {
    html += `
      <div onclick="showMarketplaceDetail('${item._id}')" 
           class="bg-white/10 hover:bg-white/15 rounded-3xl p-5 cursor-pointer transition active:scale-[0.98]">
        <div class="flex gap-4">
          <div class="w-24 h-24 flex-shrink-0 relative">
            <img src="https://www.milledgevilleconnect.com/api/marketplace-thumb/${item._id}" 
                 class="w-24 h-24 object-cover rounded-2xl cursor-zoom-in" 
                 loading="lazy" alt=""
                 onclick="openThumbViewer(event,'https://www.milledgevilleconnect.com/api/marketplace-thumb/${item._id}')"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="w-24 h-24 bg-white/10 rounded-2xl items-center justify-center text-5xl hidden" style="display:none">🛒</div>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start">
              <h3 class="font-semibold text-lg leading-tight pr-2">${esc(item.title)}</h3>
              <p class="text-2xl font-bold text-emerald-400 whitespace-nowrap">$${item.price}</p>
            </div>
            <p class="text-white/70 line-clamp-2 mt-1">${esc(item.description || '')}</p>
            
            <div class="flex items-center gap-2 mt-4 text-xs text-white/60">
              <span class="px-3 py-1 bg-white/10 rounded-full">${item.condition}</span>
              <span>${timeAgo(item.createdAt)}</span>
              <span class="text-white/40">•</span>
              ${renderClickableUser(item.seller)}
            </div>
          </div>
        </div>
      </div>`;
  });

  html += '</div>';

  // Pagination controls
  if (totalPages > 1) {
    html += `
      <div class="flex items-center justify-between mt-6 px-1">
        <button onclick="goToMarketplacePage(${marketplaceCurrentPage - 1})" 
                ${marketplaceCurrentPage === 1 ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          ← Previous
        </button>

        <div class="text-sm text-white/60">
          Page <span class="font-semibold text-white">${marketplaceCurrentPage}</span> of ${totalPages}
        </div>

        <button onclick="goToMarketplacePage(${marketplaceCurrentPage + 1})" 
                ${marketplaceCurrentPage === totalPages ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          Next →
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

function goToMarketplacePage(page) {
  const totalPages = Math.ceil(currentMarketplaceItems.length / MARKETPLACE_PAGE_SIZE);
  if (page < 1 || page > totalPages) return;

  marketplaceCurrentPage = page;
  renderMarketplacePage();
}

window.goToMarketplacePage = goToMarketplacePage;

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
window.goToDirectoryPage   = goToDirectoryPage;
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
  let event = (window._allEvents || []).find(e => e._id === eventId || String(e._id) === String(eventId));
  if (!event) {
    // Not in cache — fetch directly
    try { event = await apiGet(`/events/${eventId}`); } catch(e) {}
  }
  if (!event) {
    // Last resort: full fetch
    const events = await apiGet('/events?limit=200');
    event = (Array.isArray(events) ? events : (events?.events || [])).find(e => String(e._id) === String(eventId));
  }
  if (!event) return;

  const isPast = new Date(event.date) < new Date();
  const rsvpCount = event.rsvps ? event.rsvps.length : 0;
  const isGoing = currentUser && event.rsvps && event.rsvps.includes(currentUser._id);

  const modalHTML = `
    <div onclick="if(event.target.id==='eventDetailModal') document.getElementById('eventDetailModal').remove()" 
         id="eventDetailModal" class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[15000]">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        
        <div class="sticky top-0 bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
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

        <div class="p-6 border-t flex gap-3">
          <button onclick="shareContent('event', '${esc(event.title)}', '${esc(event.location || '')}')" 
                  class="flex-1 py-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-3xl font-semibold transition">
            🔗 Share
          </button>
          <button onclick="document.getElementById('eventDetailModal').remove()" 
                  class="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-3xl font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

window.showDealDetail = async function(dealId) {
  let deal = (_allDeals || []).find(d => String(d._id) === String(dealId));
  if (!deal) {
    try { deal = await apiGet(`/deals/${dealId}`); } catch(e) {}
  }
  if (!deal) {
    try {
      const res = await apiGet('/deals?limit=200');
      deal = (res.deals || res || []).find(d => String(d._id) === String(dealId));
    } catch(e) {}
  }
  if (!deal) return;

  const modalHTML = `
    <div onclick="if(event.target.id==='dealDetailModal') document.getElementById('dealDetailModal').remove()" 
         id="dealDetailModal" class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[15000]">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-white text-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-auto shadow-2xl">
        
        <div class="sticky top-0 bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
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

        <div class="p-6 border-t flex gap-3">
          <button onclick="shareContent('deal', '${esc(deal.title)}', '${deal.business?.name ? 'From: ' + esc(deal.business.name) : ''}')" 
                  class="flex-1 py-4 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-3xl font-semibold transition">
            🔗 Share
          </button>
          <button onclick="document.getElementById('dealDetailModal').remove()" 
                  class="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-3xl font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// ─── LOST & FOUND DETAIL ─────────────────────────────────────────────────────
window.showLostDetail = async function(id) {
  try {
    // Always fetch full item by ID — list cache has images stripped
    let item = await apiGet(`/lostitems/${id}`);
    if (!item || !item._id) {
      // Fallback to cache if fetch fails (no images but at least shows metadata)
      item = (_allLostItems || []).find(i => String(i._id) === String(id));
    }

    if (!item || !item._id) {
      showToast('Item not found', 'error');
      return;
    }

    const isOwner = currentUser && item.owner && 
      String(item.owner._id || item.owner) === String(currentUser._id);

    const html = `
<div id="lostDetailModal" onclick="if(event.target.id==='lostDetailModal') hideLostDetailModal()" 
     class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[14000] flex items-end md:items-center justify-center p-4">
  
  <div onclick="event.stopImmediatePropagation()" 
       class="bg-slate-900 text-white w-full max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-auto shadow-2xl border border-white/10">

    <!-- Header -->
    <div class="sticky top-0 bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 text-xs font-bold rounded-full ${item.type === 'lost' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}">
            ${item.type === 'lost' ? '🔎 LOST' : '✅ FOUND'}
          </span>
          ${item.isPet ? `<span class="px-3 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-400">🐾 PET</span>` : ''}
        </div>
        <h2 class="text-2xl font-bold mt-1">${esc(item.title)}</h2>
      </div>
      <button onclick="hideLostDetailModal()" class="text-3xl leading-none text-white/40 hover:text-white">×</button>
    </div>

    <div class="p-6">
      <!-- Photos -->
      ${item.images && item.images.length ? `
        <div class="grid grid-cols-2 gap-3 mb-6">
          ${item.images.map((src, index) => `
            <img src="${src}" class="rounded-2xl aspect-video object-cover cursor-pointer border border-white/10" 
                 onclick="event.stopImmediatePropagation(); openImageViewerForLost(window._lostModalImages[${index}])">
          `).join('')}
        </div>` : ''}

      <p class="text-white/90 leading-relaxed">${esc(item.description || '')}</p>

      <div class="mt-6 grid grid-cols-2 gap-4 text-sm">
        ${item.location ? `
        <div class="bg-white/5 rounded-2xl p-4">
          <div class="text-white/50 text-xs mb-1">LOCATION</div>
          <div>${esc(item.location)}</div>
        </div>` : ''}
        
        <div class="bg-white/5 rounded-2xl p-4">
          <div class="text-white/50 text-xs mb-1">POSTED</div>
          <div>${timeAgo(item.createdAt)}</div>
        </div>
      </div>

      <!-- Comments Section -->
      <div class="mt-10">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-lg">💬 Comments</h3>
        </div>

        <!-- Comment Input -->
        <div class="flex gap-2 mb-4">
          <input id="lostCommentInput" type="text" placeholder="Write a comment..." 
                 class="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400"
                 onkeypress="if(event.key === 'Enter') postLostComment('${item._id}')">
          <button onclick="postLostComment('${item._id}')" 
                  class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 rounded-2xl text-sm font-semibold transition">
            Post
          </button>
        </div>

        <div id="lostCommentsContainer" class="space-y-4"></div>
      </div>
    </div>

    <!-- Owner Actions -->
    ${isOwner ? `
      <div class="p-6 border-t border-white/10 flex justify-end">
        <button onclick="resolveLostItem('${item._id}')" 
                class="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3.5 rounded-3xl font-semibold">
          Mark as Resolved ✅
        </button>
      </div>` : ''}

    <!-- Footer -->
    <div class="p-6 border-t border-white/10 flex gap-3">
  <button onclick="shareContent('lost', '${esc(item.title)}')" 
          class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-3xl font-semibold transition">
    🔗 Share
  </button>
  <button onclick="hideLostDetailModal()" 
          class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-3xl font-semibold transition">
    Close
  </button>
</div>

  </div>
</div>`;

    window._lostModalImages = item.images || [];
    document.body.insertAdjacentHTML('beforeend', html);

    // Load comments
    const container = document.getElementById('lostCommentsContainer');
    if (container && item.comments) {
      renderComments(item.comments, 'lostCommentsContainer', 'lost', item._id);
    }

  } catch (e) {
    console.error(e);
    showToast('Could not load item', 'error');
  }
};

window.hideLostDetailModal = function() {
  const modal = document.getElementById('lostDetailModal');
  if (modal) modal.remove();
};

// Lost & Found modal image viewer
// Images stored in window._lostModalImages when modal opens.
// Thumbnails use data-index so no URLs ever touch an onclick attribute.
document.addEventListener('click', function(e) {
  const img = e.target.closest('.lost-modal-img');
  if (!img) return;
  e.stopImmediatePropagation();
  const index = parseInt(img.dataset.index, 10) || 0;
  const src = (window._lostModalImages || [])[index] || img.src;
  openImageViewerForLost(src);
});

window.postLostComment = async function(itemId) {
  const input = document.getElementById('lostCommentInput');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  if (!requireAuth('Sign in to comment')) return;

  try {
    await apiPost(`/lostitems/${itemId}/comments`, { text });
    input.value = '';
    showToast('Comment posted!', 'success');

    // Refresh the modal comments — fetch by ID directly
    const updated = await apiGet(`/lostitems/${itemId}`);

    const container = document.getElementById('lostCommentsContainer');
    if (container && updated?.comments) {
      renderComments(updated.comments, 'lostCommentsContainer', 'lost', itemId);
    }
  } catch (e) {
    showToast('Failed to post comment', 'error');
  }
};

window.resolveLostItem = async function(itemId) {
  if (!confirm('Mark this item as resolved?')) return;

  try {
    await apiPost(`/lostitems/${itemId}/resolve`, {});
    showToast('Item marked as resolved!', 'success');
    hideLostDetailModal();
    loadLostFoundPage(document.getElementById('content')); // refresh list
  } catch (e) {
    showToast('Failed to resolve item', 'error');
  }
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
const ADMIN_USERS_PAGE_SIZE = 15;
window._adminUsersPage = 1;

async function renderAdminUsers() {
  const container = document.getElementById('adminMainContent');
  
  try {
    window._adminUsersData = await apiGet('/admin/users');
    
    if (!Array.isArray(window._adminUsersData)) {
      throw new Error('Invalid users data');
    }

    window._adminUsersPage = 1;
    window._adminUsersFiltered = window._adminUsersData;

    container.innerHTML = `
      <div class="mb-4 flex items-center gap-3">
        <input type="text" id="userSearch" placeholder="🔍 Search by name or email…" 
               class="flex-1 bg-white/10 border border-white/20 rounded-3xl px-5 py-4 text-white placeholder:text-white/50 text-base">
        <span id="userCount" class="text-sm text-white/40 flex-shrink-0">${window._adminUsersData.length} users</span>
      </div>
      <div id="usersCardList" class="space-y-3"></div>
      <div id="adminUsersPagination" class="flex items-center justify-between mt-6 px-1"></div>`;

    renderUsersTable(window._adminUsersFiltered);

    document.getElementById('userSearch').addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      window._adminUsersFiltered = window._adminUsersData.filter(u => 
        (u.name || '').toLowerCase().includes(term) || 
        (u.email || '').toLowerCase().includes(term)
      );
      window._adminUsersPage = 1;
      const countEl = document.getElementById('userCount');
      if (countEl) countEl.textContent = window._adminUsersFiltered.length + ' users';
      renderUsersTable(window._adminUsersFiltered);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="p-8 text-red-400">Failed to load users. Backend may be restarting.</div>`;
  }
}

window.adminUsersPageNav = function(dir) {
  const total = Math.ceil((window._adminUsersFiltered || []).length / ADMIN_USERS_PAGE_SIZE);
  window._adminUsersPage = Math.max(1, Math.min(total, window._adminUsersPage + dir));
  renderUsersTable(window._adminUsersFiltered);
};

function renderUsersTable(users) {
  const list = document.getElementById('usersCardList');
  if (!list) return;

  // Paginate
  const total = users.length;
  const totalPages = Math.ceil(total / ADMIN_USERS_PAGE_SIZE) || 1;
  window._adminUsersPage = Math.min(window._adminUsersPage || 1, totalPages);
  const start = (window._adminUsersPage - 1) * ADMIN_USERS_PAGE_SIZE;
  const pageUsers = users.slice(start, start + ADMIN_USERS_PAGE_SIZE);

  // Pagination controls
  const pagEl = document.getElementById('adminUsersPagination');
  if (pagEl) {
    if (totalPages > 1) {
      pagEl.innerHTML = `
        <button onclick="adminUsersPageNav(-1)" ${window._adminUsersPage === 1 ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          ← Previous
        </button>
        <div class="text-sm text-white/50">
          Page <span class="font-semibold text-white">${window._adminUsersPage}</span> of ${totalPages}
          <span class="text-white/30 ml-2">(${total} total)</span>
        </div>
        <button onclick="adminUsersPageNav(1)" ${window._adminUsersPage === totalPages ? 'disabled' : ''}
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-40 transition">
          Next →
        </button>`;
    } else {
      pagEl.innerHTML = '';
    }
  }

  list.innerHTML = pageUsers.map(u => `
    <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            ${(u.name || '?')[0].toUpperCase()}
          </div>
          <div class="min-w-0">
            <div class="font-semibold truncate">${u.name || '(no name)'}</div>
            <div class="text-white/50 text-xs truncate">${u.email || '(no email)'}</div>
            <div class="text-white/40 text-xs mt-0.5">Joined ${u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : 'Unknown'}</div>
          </div>
        </div>
        <div class="flex-shrink-0 text-right">
          <span class="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">⭐ ${u.reputation || 0}</span>
          ${u.isModerator ? `<div class="mt-1"><span class="inline-flex items-center gap-1 bg-purple-500/20 text-purple-400 text-xs font-semibold px-2.5 py-1 rounded-full">👮 Mod</span></div>` : ''}
        </div>
      </div>
      ${(u.registrationIp || (u.loginIps && u.loginIps.length)) ? `
      <div class="mt-2 px-1 space-y-1">
        ${u.registrationIp ? `<div class="text-white/40 text-xs">🌐 Registered from: <span class="text-white/60 font-mono">${u.registrationIp}</span></div>` : ''}
        ${u.loginIps && u.loginIps.length ? `
          <div class="text-white/40 text-xs">🔑 Login IPs:
            <span class="text-white/60 font-mono">${[...new Set(u.loginIps.map(e => e.ip))].slice(-5).join(', ')}</span>
          </div>` : ''}
        ${u.isIpBanned ? `<div class="text-red-400 text-xs font-semibold">🚫 IP Banned</div>` : ''}
      </div>` : ``}
      <div class="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
        <button onclick="adminEditReputation('${u._id}')" 
                class="flex-1 min-w-[80px] px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold rounded-xl transition">
          ⭐ Edit Rep
        </button>
        <button onclick="adminToggleModerator('${u._id}', ${!!u.isModerator})" 
                class="flex-1 min-w-[80px] px-3 py-2 ${u.isModerator ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 hover:bg-white/20 text-white/70'} text-xs font-semibold rounded-xl transition">
          👮 ${u.isModerator ? 'Remove Mod' : 'Make Mod'}
        </button>
        <button onclick="adminIpBanUser('${u._id}', ${!!u.isIpBanned})"
                class="flex-1 min-w-[80px] px-3 py-2 ${u.isIpBanned ? 'bg-orange-500/30 text-orange-300' : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400'} text-xs font-semibold rounded-xl transition">
          🚫 ${u.isIpBanned ? 'Unban IP' : 'IP Ban'}
        </button>
        <button onclick="adminDeleteUser('${u._id}', '${(u.name || '').replace(/'/g,"\\\\'")}')"
                class="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold rounded-xl transition">
          🗑️ Delete
        </button>
      </div>
    </div>
  `).join('');
}

// ─── OWNER ANALYTICS ─────────────────────────────────────────────────────────
async function loadOwnerAnalytics() {
  const container = document.getElementById('analyticsContent');
  if (!container) return;

  container.innerHTML = `<div class="text-white/30 text-center py-8 text-sm">Loading analytics…</div>`;

  try {
    const [deals, events, homes] = await Promise.all([
      apiGet('/owner/deals').catch(() => []),
      apiGet('/owner/events').catch(() => []),
      apiGet('/owner/homes').catch(() => [])
    ]);

    const totalDeals = deals.length;
    const totalEvents = events.length;
    const totalListings = homes.length;

    container.innerHTML = `
      <div class="space-y-4">
        <h3 class="font-bold text-xl px-1">Business Analytics</h3>

        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white/10 rounded-3xl p-5">
            <div class="text-xs text-white/50">Deals Posted</div>
            <div class="text-4xl font-black mt-1">${totalDeals}</div>
          </div>
          <div class="bg-white/10 rounded-3xl p-5">
            <div class="text-xs text-white/50">Events Posted</div>
            <div class="text-4xl font-black mt-1">${totalEvents}</div>
          </div>
          <div class="bg-white/10 rounded-3xl p-5">
            <div class="text-xs text-white/50">Marketplace Listings</div>
            <div class="text-4xl font-black mt-1">${totalListings}</div>
          </div>
        </div>

        <div class="bg-white/5 rounded-3xl p-5 text-sm text-white/60">
          <p class="mb-2 font-semibold text-white/80">Coming soon:</p>
          <ul class="list-disc pl-5 space-y-1 text-xs">
            <li>Profile view counts</li>
            <li>Notification open rates</li>
            <li>Engagement on your deals &amp; events</li>
          </ul>
        </div>
      </div>
    `;
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="text-red-400 text-center py-8">Failed to load analytics.</p>`;
  }
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

window.adminIpBanUser = async function(userId, currentlyBanned) {
  const action = currentlyBanned ? 'lift the IP ban on' : 'IP ban';
  if (!confirm(`Are you sure you want to ${action} this user?`)) return;
  const res = await apiPost(`/admin/users/${userId}/ip-ban`, { isIpBanned: !currentlyBanned });
  if (res.success !== undefined) {
    showToast(res.isIpBanned ? '🚫 IP ban applied' : 'IP ban lifted', 'success');
    renderAdminUsers();
  } else {
    showToast(res.message || 'Failed to update IP ban', 'error');
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

window.showAddBusinessModal = async function() {
  if (!window._dirCategories || window._dirCategories.length === 0) {
    try {
      const data = await apiGet('/directory');
      window._dirCategories = data.categories || [];
    } catch (e) {
      window._dirCategories = [];
    }
  }

  const existing = document.getElementById('addBusinessModal');
  if (existing) existing.remove();

  let categoryOptions = `<option value="" class="bg-[#1a2332] text-white">— Select Category —</option>`;
  if (window._dirCategories.length) {
    categoryOptions += window._dirCategories.map(cat => `
      <option value="${cat._id}" class="bg-[#1a2332] text-white">${cat.icon} ${cat.name}</option>
    `).join('');
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div id="addBusinessModal" onclick="if(event.target.id==='addBusinessModal') document.getElementById('addBusinessModal').remove()"
         class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[20000] p-4">
      <div onclick="event.stopPropagation()"
           class="bg-[#1a2332] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl">

        <div class="sticky top-0 bg-[#1a2332] px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 class="text-lg font-bold">➕ Add New Business</h2>
          <button onclick="document.getElementById('addBusinessModal').remove()" class="text-2xl text-white/50 hover:text-white">×</button>
        </div>

        <div class="p-5 space-y-4">
          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Business Name *</label>
            <input id="abName" type="text" placeholder="e.g. Joe's Diner"
                   class="mt-1 w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400">
          </div>

          <div>
            <label class="text-xs text-white/50 uppercase tracking-wide">Category *</label>
            <select id="abCategory" 
                    class="mt-1 w-full bg-[#1a2332] border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-400 appearance-none">
              ${categoryOptions}
            </select>
          </div>

          <!-- Rest of your form fields stay exactly the same -->
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
            <textarea id="abDescription" rows="3" placeholder="Brief description..."
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
  const categoryId = document.getElementById('abCategory').value;

  if (!name) return showToast('Business name is required', 'error');
  if (!categoryId) return showToast('Please select a category', 'error');

  const payload = {
    name,
    category: categoryId,
    address:     document.getElementById('abAddress').value.trim(),
    phone:       document.getElementById('abPhone').value.trim(),
    email:       document.getElementById('abEmail').value.trim(),
    website:     document.getElementById('abWebsite').value.trim(),
    description: document.getElementById('abDescription').value.trim(),
    logo:        document.getElementById('abLogo').value.trim() || null,
  };

  try {
    const res = await apiPost('/admin/business', payload);

    if (res.business || res._id) {
      showToast(`✅ "${name}" added successfully!`, 'success');
      document.getElementById('addBusinessModal').remove();

      // Force fresh directory fetch so category + icon appear immediately
      const freshData = await apiGet('/directory');
      if (freshData?.businesses) {
        allBusinesses = freshData.businesses;
        window._dirCategories = freshData.categories || [];
      }

      // Refresh whichever page we're on
      if (currentPage === 'admin') {
        renderAdminBusinesses();
      } else if (currentPage === 'directory') {
        renderDirectory(allBusinesses);
      }
    } else {
      showToast(res.message || 'Failed to add business', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Network error — check server logs', 'error');
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
        <h3 class="font-bold text-xl mb-6 flex items-center gap-3">
          🚩 Pending Reports (${reports.length})
        </h3>`;

    if (reports.length === 0) {
      html += `<p class="text-white/50 py-16 text-center text-lg">No pending reports — all good!</p>`;
    } else {
      html += reports.map(r => {
        let title = r.type.toUpperCase();
        let viewAction = '';

        if (r.type === 'shoutout') {
          title = '🚦 Shoutout';
          viewAction = `<button onclick="viewReportedContent('shoutout', '${r.reportedShoutout}')" 
                               class="text-emerald-400 hover:text-emerald-300 text-sm font-medium">View Post →</button>`;
        } else if (r.type === 'lost') {
          title = '🔎 Lost & Found';
          viewAction = `<button onclick="viewReportedContent('lost', '${r.reportedLostItem}')" 
                               class="text-emerald-400 hover:text-emerald-300 text-sm font-medium">View Item →</button>`;
        } else if (r.type === 'market') {
          title = '🛒 Marketplace';
          viewAction = `<button onclick="viewReportedContent('market', '${r.reportedMarketItem}')" 
                               class="text-emerald-400 hover:text-emerald-300 text-sm font-medium">View Listing →</button>`;
        } else if (r.type === 'user') {
          title = '👤 User Report';
          viewAction = `<button onclick="showUserProfileModal('${r.reportedUser?._id || r.reportedUser}')" 
                               class="text-emerald-400 hover:text-emerald-300 text-sm font-medium">View Profile →</button>`;
        } else if (r.type === 'comment') {
          title = '💬 Comment';
        }

        return `
          <div class="bg-white/5 rounded-2xl p-5 mb-4 border border-white/10">
            <div class="flex justify-between items-start mb-3">
              <span class="px-3 py-1 text-xs font-bold rounded-full bg-red-500">${title}</span>
              <span class="text-xs text-white/60">by ${r.reporter?.name || 'Unknown'}</span>
            </div>
            
            ${r.snapshotText ? `
            <div class="bg-white/10 rounded-xl p-4 text-sm mb-3">
              <span class="text-white/50 text-xs block mb-1">CONTENT:</span>
              <span class="text-white">${esc(r.snapshotText)}</span>
            </div>` : ''}

            ${r.reason ? `
            <div class="bg-white/10 rounded-xl p-4 text-sm">
              <span class="text-white/50 text-xs block mb-1">REASON:</span>
              <span class="text-white">${esc(r.reason)}</span>
            </div>` : ''}

            <div class="mt-4 flex gap-3">
              ${viewAction}
              <button onclick="reviewReport('${r._id}')" 
                      class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-2xl font-semibold transition">
                Review / Resolve
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

  // Load current switch state before rendering
  let notifEnabled = true;
  try {
    const status = await apiGet('/admin/notifications/status');
    notifEnabled = status.enabled !== false;
  } catch (e) { /* default to enabled if fetch fails */ }

  container.innerHTML = `
    <!-- ── Notification Kill-Switch ───────────────────────────────────────── -->
    <div class="max-w-2xl mx-auto mb-6 bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="font-bold text-lg flex items-center gap-2">
            🔔 Global Notifications
          </h3>
          <p class="text-white/50 text-sm mt-1">
            Toggle push notifications for all users.<br>
            <span class="text-emerald-400 font-medium">imhoggbox@gmail.com</span> and
            <span class="text-emerald-400 font-medium">test@gmail.com</span> always receive notifications regardless.
          </p>
        </div>
        <button id="notifToggleBtn" onclick="toggleGlobalNotifications()"
                class="relative flex-shrink-0 w-16 h-9 rounded-full transition-colors duration-300 focus:outline-none
                       ${notifEnabled ? 'bg-emerald-500' : 'bg-red-500/70'}">
          <span id="notifToggleKnob"
                class="absolute top-1 w-7 h-7 bg-white rounded-full shadow transition-transform duration-300
                       ${notifEnabled ? 'translate-x-8' : 'translate-x-1'}"></span>
        </button>
      </div>
      <div id="notifStatusBadge"
           class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
                  ${notifEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'}">
        <span id="notifStatusDot" class="w-2 h-2 rounded-full ${notifEnabled ? 'bg-emerald-400' : 'bg-red-400'}"></span>
        <span id="notifStatusText">${notifEnabled ? 'Notifications ON — all users receiving pushes' : 'Notifications OFF — only test accounts receiving pushes'}</span>
      </div>
    </div>

    <!-- ── Broadcast Message ─────────────────────────────────────────────── -->
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

window.toggleGlobalNotifications = async function () {
  const btn  = document.getElementById('notifToggleBtn');
  const knob = document.getElementById('notifToggleKnob');
  if (btn) btn.disabled = true;

  try {
    const res = await apiPost('/admin/notifications/toggle', {});
    const on  = res.enabled !== false;

    // Update toggle appearance
    if (btn) {
      btn.className = btn.className
        .replace(/bg-(emerald|red)[^\s]*/g, '')
        .trim() + ` ${on ? 'bg-emerald-500' : 'bg-red-500/70'}`;
    }
    if (knob) {
      knob.className = knob.className
        .replace(/translate-x-\d+/g, '')
        .trim() + ` ${on ? 'translate-x-8' : 'translate-x-1'}`;
    }

    // Update status badge
    const badge = document.getElementById('notifStatusBadge');
    const dot   = document.getElementById('notifStatusDot');
    const text  = document.getElementById('notifStatusText');
    if (badge) {
      badge.className = badge.className
        .replace(/bg-(emerald|red)[^\s]*/g, '')
        .replace(/text-(emerald|red)[^\s]*/g, '')
        .replace(/border-(emerald|red)[^\s]*/g, '')
        .trim() + ` ${on
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : 'bg-red-500/20 text-red-300 border border-red-500/30'}`;
    }
    if (dot)  dot.className  = dot.className.replace(/bg-(emerald|red)-400/g, '').trim() + ` ${on ? 'bg-emerald-400' : 'bg-red-400'}`;
    if (text) text.textContent = on
      ? 'Notifications ON — all users receiving pushes'
      : 'Notifications OFF — only test accounts receiving pushes';

    showToast(on ? '🔔 Notifications enabled for all users' : '🔕 Notifications disabled (test accounts exempt)', on ? 'success' : 'info');
  } catch (e) {
    console.error('Toggle notifications error:', e);
    showToast('Failed to toggle notifications', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};
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
    description: document.getElementById('editBizDescription').value.trim(),
    category: document.getElementById('editBizCategory')?.value || null,
    logo: window.pendingBusinessLogo || null   // ← Important for logo upload
  };

  if (!payload.name) {
    return showToast('Business name is required', 'error');
  }

  if (payload.category && !mongoose.Types.ObjectId.isValid(payload.category)) {
    return showToast('Please select a valid category', 'error');
  }

  try {
    showToast('Saving changes...', 'loading');

    const response = await apiPut(`/admin/business/${businessId}`, payload);

    if (response.success || response.message?.includes('success')) {
      showToast('✅ Business updated successfully!', 'success');
      closeEditBusinessModal();
      
      // Refresh the admin businesses list
      await renderAdminBusinesses();
    } else {
      showToast(response.message || 'Failed to update business', 'error');
    }

  } catch (err) {
    console.error(err);
    showToast('Failed to save business. Please try again.', 'error');
  }
};

// API PUT helper
window.apiPut = async function(url, data) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { message: text || 'Server error' };
    }
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

// ─── AD SPOTLIGHT ADMIN PANEL ────────────────────────────────────────────────
async function renderAdminAdSpotlight() {
  const container = document.getElementById('adminMainContent');
  container.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div></div>`;

  let current = null;
  try { current = await apiGet('/admin/spotlight-ad'); } catch(e) {}

  const hasAd = current && current.image;

  container.innerHTML = `
    <div class="space-y-6 max-w-2xl mx-auto">
      <div class="flex items-center gap-3">
        <div class="text-3xl">📣</div>
        <div>
          <h2 class="text-2xl font-bold">Ad Spotlight</h2>
          <p class="text-white/50 text-sm">Paid business banner shown full-width on the home screen below the weather widget.</p>
        </div>
      </div>

      <!-- CURRENT AD PREVIEW -->
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <h3 class="font-bold text-sm uppercase tracking-widest text-white/50 mb-4">Current Spotlight</h3>
        ${hasAd ? `
          <div class="relative rounded-2xl overflow-hidden mb-4" style="aspect-ratio:4/1;">
            <img src="${current.image}" alt="Current ad" class="w-full h-full object-cover"/>
            ${current.businessName ? `
            <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
              <p class="text-white text-sm font-bold truncate">${current.businessName}</p>
              ${current.link ? `<p class="text-white/60 text-xs truncate">${current.link}</p>` : ''}
            </div>` : ''}
            <div class="absolute top-2 right-2 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">LIVE</div>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="bg-white/5 rounded-xl p-3">
              <div class="text-white/40 text-xs mb-1">Business Name</div>
              <div class="font-semibold truncate">${current.businessName || '—'}</div>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
              <div class="text-white/40 text-xs mb-1">Click Link</div>
              <div class="font-semibold truncate text-emerald-400">${current.link || 'None'}</div>
            </div>
          </div>
          <button onclick="clearSpotlightAd()" class="mt-4 w-full py-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/30 transition-all">
            🗑️ Remove Current Ad
          </button>
        ` : `
          <div class="flex flex-col items-center justify-center py-10 border-2 border-dashed border-white/20 rounded-2xl text-center gap-2">
            <div class="text-4xl">📭</div>
            <p class="text-white/50 font-semibold">No Ad Running</p>
            <p class="text-white/30 text-xs">Upload a banner below to activate the spotlight</p>
          </div>
        `}
      </div>

      <!-- UPLOAD NEW AD -->
      <div class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <h3 class="font-bold text-sm uppercase tracking-widest text-white/50 mb-4">Upload New Ad</h3>

        <div class="space-y-4">
          <!-- Image upload -->
          <div>
            <label class="block text-xs text-white/50 mb-2 font-semibold uppercase tracking-wide">Banner Image <span class="text-amber-400">*</span></label>
            <div id="adDropZone" onclick="document.getElementById('adImageInput').click()"
              class="border-2 border-dashed border-white/20 rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-400/50 hover:bg-emerald-400/5 transition-all group">
              <input type="file" id="adImageInput" accept="image/jpeg,image/png,image/webp" class="hidden" onchange="previewAdImage(event)"/>
              <div id="adPreviewWrap" class="hidden mb-3">
                <img id="adPreviewImg" class="w-full rounded-xl bg-black" style="object-fit:contain;max-height:120px;"/>
              </div>
              <div id="adDropLabel" class="space-y-1">
                <div class="text-3xl">🖼️</div>
                <p class="font-semibold text-white/70 group-hover:text-white transition-colors">Click to choose image</p>
        <p class="text-xs text-white/30">JPG, PNG or WebP · Recommended: <strong class="text-amber-300">800 × 200 px</strong> (4:1) · Max 2 MB</p>
              </div>
            </div>
          </div>

          <!-- Business name -->
          <div>
            <label class="block text-xs text-white/50 mb-2 font-semibold uppercase tracking-wide">Business Name</label>
            <input id="adBusinessName" type="text" placeholder="e.g. Miller's BBQ" maxlength="50"
              class="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50"/>
          </div>

          <!-- Click link -->
          <div>
            <label class="block text-xs text-white/50 mb-2 font-semibold uppercase tracking-wide">Click-Through Link <span class="text-white/30">(optional)</span></label>
            <input id="adLink" type="url" placeholder="https://yourbusiness.com"
              class="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50"/>
          </div>

          <button onclick="uploadSpotlightAd()" id="adUploadBtn"
            class="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white transition-all flex items-center justify-center gap-2">
            <span>📣</span> Save & Activate Spotlight Ad
          </button>
        </div>
      </div>

      <!-- SIZE GUIDE -->
      <div class="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 text-sm text-amber-200">
        <p class="font-bold mb-1">📐 Image Size Guide</p>
        <p class="text-amber-200/70">Upload at <strong>800 × 200 px</strong> (4:1 ratio) for a perfect fit. The ad fills the strip edge-to-edge with no black bars — keep important text and logos centered so nothing gets clipped on narrower screens.</p>
      </div>
    </div>`;
}

window.previewAdImage = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2 MB', 'error'); event.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('adPreviewImg');
    const wrap = document.getElementById('adPreviewWrap');
    const label = document.getElementById('adDropLabel');
    img.src = e.target.result;
    wrap.classList.remove('hidden');
    label.querySelector('p:first-of-type').textContent = file.name;
    label.querySelector('p:last-of-type').textContent = `${(file.size/1024).toFixed(0)} KB`;
  };
  reader.readAsDataURL(file);
};

window.uploadSpotlightAd = async function() {
  const fileInput = document.getElementById('adImageInput');
  const businessName = document.getElementById('adBusinessName').value.trim();
  const link = document.getElementById('adLink').value.trim();
  const btn = document.getElementById('adUploadBtn');

  if (!fileInput.files[0]) { showToast('Please choose a banner image first', 'error'); return; }

  const reader = new FileReader();
  reader.onload = async e => {
    btn.disabled = true;
    btn.innerHTML = '<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Uploading…';
    try {
      await apiPost('/admin/spotlight-ad', { image: e.target.result, businessName, link });
      showToast('Ad Spotlight updated! 📣', 'success');
      await renderAdminAdSpotlight();
    } catch(err) {
      showToast(err.message || 'Upload failed', 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>📣</span> Save & Activate Spotlight Ad';
    }
  };
  reader.readAsDataURL(fileInput.files[0]);
};

window.clearSpotlightAd = async function() {
  if (!confirm('Remove the current spotlight ad?')) return;
  try {
    await apiDelete('/admin/spotlight-ad');
    showToast('Ad removed', 'success');
    await renderAdminAdSpotlight();
  } catch(err) {
    showToast(err.message || 'Failed to remove ad', 'error');
  }
};

// Track how many comments are visible per container
const _commentVisibleCount = {};

function renderComments(comments = [], containerId, contentType, contentId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!comments || comments.length === 0) {
    container.innerHTML = `<p class="text-white/40 text-center py-6">No comments yet — be the first!</p>`;
    return;
  }

  let html = '<div class="space-y-3">';

  comments.forEach(c => {
    const authorId = c.authorId?._id || c.authorId;
    const authorName = c.author || c.authorName || 'Anonymous';

    html += `
      <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div class="flex justify-between items-center">
          <div onclick="event.stopImmediatePropagation(); showUserProfileModal('${authorId}')" 
               class="font-medium cursor-pointer hover:underline text-emerald-400">
            ${esc(authorName)}
          </div>
          <button onclick="event.stopImmediatePropagation(); reportContent('comment', '${c._id}')" 
                  class="text-xs text-red-400 hover:text-red-500">
            🚩
          </button>
        </div>
        <p class="text-white/90 mt-1.5">${esc(c.text)}</p>
        <span class="text-[10px] text-white/40">${timeAgo(c.createdAt)}</span>
      </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderCommentInput(contentType, contentId) {
  return `
    <div class="mt-4 flex gap-2">
      <input id="comment-input-${contentId}" type="text" placeholder="Write a comment..." 
             class="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400"
             onkeypress="if(event.key === 'Enter') submitComment('${contentType}', '${contentId}')">
      <button onclick="submitComment('${contentType}', '${contentId}')" 
              class="bg-emerald-600 hover:bg-emerald-700 px-6 rounded-2xl text-sm font-semibold transition">
        Post
      </button>
    </div>`;
}

window.viewMoreComments = function(containerId, contentType, contentId, total) {
  _commentVisibleCount[containerId] = (_commentVisibleCount[containerId] || 5) + 5;
  // Re-render with full list (we need to store it)
  // For now we'll reload the detail modal or fetch fresh data
  if (contentType === 'market') {
    // Re-open or refresh marketplace detail
    const modal = document.getElementById('marketDetailModal');
    if (modal) modal.remove();
    showMarketplaceDetail(contentId);
  } else if (contentType === 'lost') {
    const modal = document.getElementById('lostDetailModal');
    if (modal) modal.remove();
    showLostDetail(contentId);
  }
};

window.showLessComments = function(containerId, contentType, contentId) {
  _commentVisibleCount[containerId] = 5;
  if (contentType === 'market') {
    const modal = document.getElementById('marketDetailModal');
    if (modal) modal.remove();
    showMarketplaceDetail(contentId);
  } else if (contentType === 'lost') {
    const modal = document.getElementById('lostDetailModal');
    if (modal) modal.remove();
    showLostDetail(contentId);
  }
};

// ─── ONBOARDING / WELCOME TOUR (First-time users) ───────────────────────────
window.showOnboardingTour = function() {
  // Don't show again if already completed
  if (localStorage.getItem('onboardingCompleted') === 'true') return;

  const tourHTML = `
    <div id="onboardingTour" class="fixed inset-0 bg-black/90 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
      <div class="bg-zinc-900 border border-white/10 rounded-3xl max-w-md w-full overflow-hidden">
        
        <!-- Progress dots -->
        <div class="flex justify-center gap-2 pt-6">
          <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <div class="w-2 h-2 bg-white/30 rounded-full"></div>
          <div class="w-2 h-2 bg-white/30 rounded-full"></div>
        </div>

        <div id="tourSlide" class="p-8 text-center min-h-[380px] flex flex-col">
          <!-- Slide 1 -->
          <div id="slide1">
            <div class="text-6xl mb-6">🚦</div>
            <h2 class="text-3xl font-bold mb-3">Welcome to Milledgeville Connect</h2>
            <p class="text-zinc-400 text-lg leading-relaxed">Your local community app for real-time traffic alerts, buying & selling, lost pets, events, and more.</p>
          </div>

          <!-- Slide 2 (hidden by default) -->
          <div id="slide2" class="hidden">
            <div class="text-6xl mb-6">🛒</div>
            <h2 class="text-3xl font-bold mb-3">Marketplace & Lost & Found</h2>
            <p class="text-zinc-400 text-lg leading-relaxed">Buy, sell, trade locally and help neighbors find lost items and pets.</p>
          </div>

          <!-- Slide 3 -->
          <div id="slide3" class="hidden">
            <div class="text-6xl mb-6">📅</div>
            <h2 class="text-3xl font-bold mb-3">Stay Connected</h2>
            <p class="text-zinc-400 text-lg leading-relaxed">Events, deals, news, and live community shoutouts — all in one place.</p>
          </div>
        </div>

        <div class="p-6 border-t border-white/10 flex items-center gap-4">
          <button onclick="skipOnboarding()" 
                  class="flex-1 py-4 text-white/70 hover:text-white font-medium transition">
            Skip
          </button>
          <button onclick="nextOnboardingSlide()" id="tourNextBtn"
                  class="flex-1 bg-emerald-600 hover:bg-emerald-700 py-4 rounded-2xl font-semibold transition">
            Next
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', tourHTML);
  window.currentTourSlide = 1;
};

// ─── NOTE ────────────────────────────────────────────────────────────────────
// postShoutoutWithPhoto is defined above (search for "window.postShoutoutWithPhoto")
// near handleShoutoutImages / _pendingShoutoutImages. DO NOT redefine it here.
// A previous version here used window._shoutoutImages (never populated) instead
// of _pendingShoutoutImages, silently dropping all attached photos.
// The correct definition uses _pendingShoutoutImages — keep it that way.
// ─────────────────────────────────────────────────────────────────────────────
let isPostingShoutout = false; // guard used by the correct postShoutoutWithPhoto above

// ─── CUSTOM NOTIFICATION + CREDIT SYSTEM (FINAL) ─────────────────────────────
// ⚠️  NOTE: This old sendCustomNotification button path MUST send imageUrl.
//     The API route /owner/custom-notification accepts { title, body, imageUrl }.
//     Omitting imageUrl here means images never show in notifications from this path.
//     DO NOT remove the imageUrl field from the apiPost call below.
window.sendCustomNotification = async function() {
  showToast("Custom notifications have been disabled.", "info");
  return;
};

window.nextOnboardingSlide = function() {
  const slide1  = document.getElementById('slide1');
  const slide2  = document.getElementById('slide2');
  const slide3  = document.getElementById('slide3');
  const nextBtn = document.getElementById('tourNextBtn');
  const dots    = document.querySelectorAll('#onboardingTour .w-2.h-2');

  function setDot(activeIndex) {
    dots.forEach((d, i) => {
      d.classList.toggle('bg-emerald-500', i === activeIndex);
      d.classList.toggle('bg-white/30',   i !== activeIndex);
    });
  }

  if (window.currentTourSlide === 1) {
    slide1.classList.add('hidden');
    slide2.classList.remove('hidden');
    setDot(1);
    window.currentTourSlide = 2;
  } else if (window.currentTourSlide === 2) {
    slide2.classList.add('hidden');
    slide3.classList.remove('hidden');
    setDot(2);
    nextBtn.textContent = "Get Started";
    window.currentTourSlide = 3;
  } else if (window.currentTourSlide === 3) {
    finishOnboarding();
  }
};

window.skipOnboarding = function() {
  finishOnboarding();
};

function finishOnboarding() {
  localStorage.setItem('onboardingCompleted', 'true');
  const tour = document.getElementById('onboardingTour');
  if (tour) tour.remove();
  showToast("🎉 Welcome to Milledgeville Connect!", "success");
}

// ─── REPORT CONTENT (Fixed + Better Feedback) ───────────────────────────────
window.reportContent = async function (type, id, extraInfo = '') {
  if (!currentUser) {
    showAuthModal({ message: 'Sign in to report content.' });
    return;
  }

  const reason = prompt(`Why are you reporting this ${type}? (be specific)`);
  if (!reason || reason.trim() === '') {
    showToast('Report cancelled', 'error');
    return;
  }

  try {
    const res = await apiPost('/reports', {
      type: type,
      contentId: id,
      reason: reason.trim(),
      extraInfo: extraInfo || ''
    });

    if (res && (res.message?.includes('Report submitted') || res._id)) {
      showToast('🚩 Report sent to admin team. Thank you.', 'success');
    } else {
      showToast(res?.message || 'Failed to send report', 'error');
    }
  } catch (e) {
    showToast('Could not send report — try again later', 'error');
  }
};

// ─── VIEW REPORTED CONTENT ─────────────────────────────────────────────────
window.viewReportedContent = async function (type, id) {
  if (!id) {
    showToast('Content no longer exists', 'error');
    return;
  }

  if (type === 'shoutout') {
    navigate('shoutouts');
    setTimeout(() => {
      const el = document.getElementById(`shoutout-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else showToast('Shoutout may have been deleted', 'error');
    }, 800);
  } else if (type === 'lost') {
    navigate('lostfound');
    setTimeout(() => showLostDetail(id), 800);
  } else if (type === 'market') {
    navigate('marketplace');
    setTimeout(() => showMarketplaceDetail(id), 800);
  } else if (type === 'event') {
    navigate('events');
    setTimeout(() => showEventDetail(id), 800);
  } else if (type === 'deal') {
    navigate('deals');
    setTimeout(() => showDealDetail(id), 800);
  } else if (type === 'news') {
    openNewsArticle(id);
  } else if (type === 'comment') {
    showToast('Navigate to the content section to find this comment', 'success');
  }
};

// Credit check removed — all verified owners can send notifications
async function checkNotificationCredits() { return true; }

// ─── OWNER LOGO UPLOAD HELPERS ───────────────────────────────────────────────
let pendingOwnerLogo = null;

window.handleOwnerLogoUpload = async function(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('Logo must be under 5MB', 'error');
    input.value = '';
    return;
  }

  try {
    // Create a square logo (400x400)
    const squareLogo = await createSquareLogo(file, 400);

    const reader = new FileReader();
    reader.onload = e => {
      pendingOwnerLogo = e.target.result;

      // Update preview (square)
      const preview = document.getElementById('ownerLogoPreview');
      if (preview) {
        preview.innerHTML = `
          <img src="${pendingOwnerLogo}" 
               class="w-full h-full object-cover rounded-2xl" 
               style="aspect-ratio: 1 / 1;" 
               alt="Logo Preview">`;
      }

      // Show the save button now that a logo is staged
      const saveBtn = document.getElementById('ownerLogoSaveBtn');
      if (saveBtn) saveBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(squareLogo);

  } catch (e) {
    console.error(e);
    showToast('Failed to process logo', 'error');
  }

  input.value = '';
};

// Helper function to create a square logo
async function createSquareLogo(file, size = 400) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        
        // Fill background (optional - white or transparent)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Calculate cropping to make it square
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(
          img,
          sx, sy, minSide, minSide,   // source crop (center square)
          0, 0, size, size            // destination (full square)
        );

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Credits / Pro system removed — always allow notifications
window.canSendNotification = async function() { return true; };

window.saveOwnerBusinessLogo = async function() {
  if (!pendingOwnerLogo) {
    showToast('Please select a logo first', 'error');
    return;
  }

  try {
    showToast('Uploading logo...', 'success');

    const res = await apiPost('/owner/business/logo', { logo: pendingOwnerLogo });

    if (res.business) {
      showToast('✅ Logo updated!', 'success');
      pendingOwnerLogo = null;

      // Hide the save button
      const saveBtn = document.getElementById('ownerLogoSaveBtn');
      if (saveBtn) saveBtn.classList.add('hidden');

      // Update the logo in our local cache
      const index = allBusinesses.findIndex(b => String(b._id) === String(res.business._id));
      if (index !== -1) {
        allBusinesses[index].logo = res.business.logo;
      }

      // Keep currentUser in sync
      if (currentUser?.verifiedBusiness) {
        currentUser.verifiedBusiness.logo = res.business.logo;
      }

      // Refresh the owner dashboard
      loadOwnerDashboard(document.getElementById('content'));

      // If the user is currently on the directory page, refresh it too
      if (currentPage === 'directory') {
        const content = document.getElementById('content');
        if (content) {
          renderDirectory(allBusinesses);
        }
      }
    } else {
      showToast(res.message || 'Failed to save logo', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Upload failed', 'error');
  }
};

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

// ─── DELETE ACCOUNT FEATURE ─────────────────────────────────────────────────
window.showDeleteAccountModal = function() {
  if (document.getElementById('deleteAccountModal')) return;
  const html = `
    <div id="deleteAccountModal" onclick="if(event.target.id==='deleteAccountModal') hideDeleteAccountModal()" 
         class="fixed inset-0 bg-black/80 flex items-center justify-center z-[30000] p-4">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-[#0f172a] border border-red-500/30 rounded-3xl max-w-md w-full p-8">
        
        <div class="text-center">
          <div class="text-5xl mb-4">🗑️</div>
          <h2 class="text-2xl font-bold text-red-400 mb-2">Delete Your Account</h2>
          <p class="text-white/70 text-sm leading-relaxed">
            This will <strong>immediately and permanently</strong> delete your profile, posts, messages, and all associated data. There is no waiting period and no undo.
          </p>
        </div>

        <div class="mt-4 text-center">
          <a href="https://www.milledgevilleconnect.com/delete-account.html" target="_blank" rel="noopener noreferrer"
             class="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 underline underline-offset-2 transition">
            🌐 Prefer to request deletion via the web?
          </a>
        </div>

        <div class="mt-6 bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-sm space-y-2">
          <p class="font-semibold text-red-300 mb-1">What gets deleted immediately:</p>
          <p class="text-white/60">• Your profile and account</p>
          <p class="text-white/60">• All your posts, shoutouts, and listings</p>
          <p class="text-white/60">• All your messages and conversations</p>
          <p class="text-white/60">• Your reviews, reputation, and history</p>
        </div>

        <div class="mt-5 space-y-4">
          <div>
            <label class="block text-xs text-white/50 mb-1.5">Reason for leaving (optional)</label>
            <textarea id="deleteReason" rows="2" placeholder="Help us improve the app"
                      class="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:outline-none resize-none"></textarea>
          </div>
          <div>
            <label class="block text-xs text-white/50 mb-1.5">Enter your password to confirm <span class="text-red-400">*</span></label>
            <input id="deletePassword" type="password" placeholder="Your current password"
                   class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-red-500/50">
          </div>
        </div>

        <div class="flex gap-3 mt-8">
          <button onclick="hideDeleteAccountModal()" 
                  class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-semibold transition">
            Cancel
          </button>
          <button id="confirmDeleteBtn" onclick="confirmAccountDeletion()" 
                  class="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition">
            Confirm Permanent Deletion
          </button>
        </div>
      </div>
    </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
};

window.hideDeleteAccountModal = function() {
  const modal = document.getElementById('deleteAccountModal');
  if (modal) modal.remove();
};

window.requestAccountDeletion = async function() {
  if (!currentUser) {
    showToast('Please sign in to request deletion', 'error');
    return;
  }

  if (!confirm("FINAL WARNING: This will permanently delete your account and all data. Continue?")) {
    return;
  }

  try {
    const res = await apiPost('/user/delete-request', { 
      reason: "Requested via public deletion link" 
    });

    showToast('✅ Deletion request submitted. You will be notified when processed.', 'success');
  } catch (e) {
    showToast('Failed to submit request. Please email us directly.', 'error');
  }
};

window.confirmAccountDeletion = async function() {
  const reason   = document.getElementById('deleteReason')?.value.trim() || 'No reason provided';
  const password = document.getElementById('deletePassword')?.value || '';

  if (!password) {
    showToast('Please enter your password to confirm deletion.', 'error');
    return;
  }

  const confirmed = confirm(
    'FINAL WARNING\n\nThis will PERMANENTLY and IMMEDIATELY delete your account and ALL your data (posts, messages, listings, etc.).\n\nThis CANNOT be undone.\n\nDo you want to continue?'
  );
  if (!confirmed) return;

  const btn = document.getElementById('confirmDeleteBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Deleting…'; }

  try {
    await apiDelete('/user/delete-account', { password, reason });

    hideDeleteAccountModal();
    showToast('Your account has been permanently deleted.', 'success');

    setTimeout(() => {
      localStorage.removeItem('token');
      currentUser = null;
      window.location.reload();
    }, 1200);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Permanent Deletion'; }
    showToast(e?.message || 'Failed to delete account. Please check your password and try again.', 'error');
  }
};



// ─── PRO USER ANALYTICS STUB (expand later) ───────────────────────────────
window.showProAnalytics = function() {
  showToast("📊 Pro Analytics coming soon:\n• Notification reach\n• Profile views\n• Listing performance", "success");
};

// Marketplace notification preferences are managed via the unified
// saveNotificationPreferences() in profile.js → POST /user/notification-preferences.

// ─── HOMES TAB: IMAGE STATE ──────────────────────────────────────────────────
let _pendingHomeImages = [];

window.handleHomeImages = async function(input) {
  const files = Array.from(input.files);
  const remaining = 10 - _pendingHomeImages.length;
  if (remaining <= 0) {
    showToast('Maximum 10 photos reached', 'error');
    input.value = '';
    return;
  }
  const toProcess = files.slice(0, remaining);
  if (files.length > remaining) showToast(`Only ${remaining} more photo(s) allowed — extras ignored`, 'error');

  for (const file of toProcess) {
    if (file.size > 8 * 1024 * 1024) { showToast(`${file.name} is too large (max 8MB)`, 'error'); continue; }
    try {
      const compressed = await compressImage(file, 1100, 0.75);
      await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => { _pendingHomeImages.push(e.target.result); renderHomeImagePreviews(); resolve(); };
        reader.readAsDataURL(compressed);
      });
    } catch (e) { console.error(e); }
  }
  input.value = '';
};

// ─── NOTIFICATION PREFERENCES MODAL ─────────────────────────────────────────
window.showNotificationSettingsModal = async function() {
  if (document.getElementById('notificationSettingsModal')) return;

  // Load current preferences from user object (set at login)
  const prefs = currentUser?.notificationPreferences || {};
  const p = {
    events:    prefs.events    !== false,
    deals:     prefs.deals     !== false,
    shoutouts: prefs.shoutouts !== false,
    lostFound: prefs.lostFound !== false,
    messages:  prefs.messages  !== false,
    comments:  prefs.comments  === true,
    marketplace: {
      all:       prefs.marketplace?.all       !== false,
      homes:     prefs.marketplace?.homes     !== false,
      cars:      prefs.marketplace?.cars      !== false,
      furniture: prefs.marketplace?.furniture !== false,
      other:     prefs.marketplace?.other     !== false,
    }
  };

  const toggle = (id, checked, label, sub = '') => `
    <div class="flex items-center justify-between bg-white/5 rounded-2xl px-5 py-4 ${sub}">
      <div>
        <div class="font-semibold text-sm">${label}</div>
      </div>
      <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} class="sr-only peer">
        <div class="w-11 h-6 bg-white/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
      </label>
    </div>`;

  const subToggle = (id, checked, label) => `
    <div class="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
      <div class="text-sm text-white/80">${label}</div>
      <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} class="sr-only peer market-sub">
        <div class="w-9 h-5 bg-white/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
      </label>
    </div>`;

  const html = `
    <div id="notificationSettingsModal" onclick="if(event.target.id==='notificationSettingsModal') hideNotificationSettingsModal()" 
         class="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-[35000] p-0 md:p-4">
      <div onclick="event.stopImmediatePropagation()" 
           class="bg-[#0f172a] border border-white/10 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto">
        
        <div class="sticky top-0 bg-[#0f172a] border-b border-white/10 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div class="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2 top-2 md:hidden"></div>
          <h2 class="text-lg font-bold">🔔 Notification Preferences</h2>
          <button onclick="hideNotificationSettingsModal()" class="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div class="p-6 space-y-3">

          <p class="text-white/50 text-xs leading-relaxed pb-1">
            Choose what you get notified about. Custom notifications from verified local businesses cannot be turned off.
          </p>

          ${toggle('pref-events',    p.events,    '📅 Events — new events in your area')}
          ${toggle('pref-deals',     p.deals,     '🔥 Deals — new deals from local businesses')}
          ${toggle('pref-shoutouts', p.shoutouts, '🚦 Traffic Alerts — community shoutouts & road updates')}
          ${toggle('pref-lostfound', p.lostFound, '🔎 Lost & Found — lost pets and items nearby')}
          ${toggle('pref-messages',  p.messages,  '✉️ Direct Messages — messages from other users')}
          ${toggle('pref-comments',  p.comments,  '💬 Comments — replies on your posts and listings')}

          <!-- Marketplace section -->
          <div class="pt-2">
            <p class="text-xs font-semibold text-white/40 uppercase tracking-wider px-1 mb-2">Marketplace</p>
            ${toggle('pref-market-all', p.marketplace.all, '🛒 All Marketplace Items')}
            <div id="marketSubToggles" class="pl-3 space-y-2 mt-2 ${!p.marketplace.all ? 'opacity-40 pointer-events-none' : ''}">
              ${subToggle('pref-market-homes',     p.marketplace.homes,     '🏠 Homes & Real Estate')}
              ${subToggle('pref-market-cars',      p.marketplace.cars,      '🚗 Cars & Vehicles')}
              ${subToggle('pref-market-furniture', p.marketplace.furniture, '🪑 Furniture & Appliances')}
              ${subToggle('pref-market-other',     p.marketplace.other,     '📦 Other Items')}
            </div>
          </div>

        </div>

        <div class="sticky bottom-0 bg-[#0f172a] border-t border-white/10 p-6 flex gap-3">
          <button onclick="hideNotificationSettingsModal()" 
                  class="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-semibold transition">
            Cancel
          </button>
          <button onclick="saveNotificationPreferences()" 
                  class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-bold transition">
            Save
          </button>
        </div>

      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // ── Wire up marketplace "All" master toggle cascade ─────────────────────
  requestAnimationFrame(() => {
    const masterToggle = document.getElementById('pref-market-all');
    const subContainer = document.getElementById('marketSubToggles');
    if (masterToggle && subContainer) {
      masterToggle.addEventListener('change', () => {
        const enabled = masterToggle.checked;
        subContainer.classList.toggle('opacity-40', !enabled);
        subContainer.classList.toggle('pointer-events-none', !enabled);
        // Cascade: when master is turned off, uncheck all subs; when turned on, check all subs
        subContainer.querySelectorAll('.market-sub').forEach(cb => { cb.checked = enabled; });
      });
    }
  });
};

window.hideNotificationSettingsModal = function() {
  const modal = document.getElementById('notificationSettingsModal');
  if (modal) modal.remove();
};

window.saveNotificationPreferences = async function() {
  const prefs = {
    events: document.getElementById('pref-events')?.checked ?? true,
    deals: document.getElementById('pref-deals')?.checked ?? true,
    shoutouts: document.getElementById('pref-shoutouts')?.checked ?? true,
    lostFound: document.getElementById('pref-lostfound')?.checked ?? true,
    messages: document.getElementById('pref-messages')?.checked ?? true,
    comments: document.getElementById('pref-comments')?.checked ?? false,
    marketplace: {
      all: document.getElementById('pref-market-all')?.checked ?? true,
      homes: document.getElementById('pref-market-homes')?.checked ?? true,
      cars: document.getElementById('pref-market-cars')?.checked ?? true,
      furniture: document.getElementById('pref-market-furniture')?.checked ?? true,
      other: document.getElementById('pref-market-other')?.checked ?? true
    }
  };

  try {
    const res = await apiPost('/user/notification-preferences', { preferences: prefs });
    
    if (res.success) {
      // Update local user object
      if (currentUser) currentUser.notificationPreferences = prefs;
      showToast('✅ Notification preferences saved!', 'success');
      hideNotificationSettingsModal();
    } else {
      showToast('Failed to save preferences', 'error');
    }
  } catch (e) {
    showToast('Failed to save preferences', 'error');
  }
};

function renderHomeImagePreviews() {
  const container = document.getElementById('homeImagePreviews');
  const label     = document.getElementById('homePhotoLabel');
  if (!container) return;
  container.innerHTML = _pendingHomeImages.map((src, i) => `
    <div class="relative w-20 h-20 rounded-2xl overflow-hidden bg-white/10 group flex-shrink-0">
      <img src="${src}" class="w-full h-full object-cover">
      <button onclick="removeHomeImage(${i})" class="absolute top-0 right-0 w-6 h-6 bg-red-500 text-white text-xs rounded-bl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✕</button>
      ${i === 0 ? '<div class="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5">Cover</div>' : ''}
    </div>`).join('');
  if (label) label.textContent = _pendingHomeImages.length >= 10 ? '10/10 photos added' : `${_pendingHomeImages.length > 0 ? _pendingHomeImages.length + '/10 — ' : ''}Add photos…`;
}

window.removeHomeImage = function(index) {
  _pendingHomeImages.splice(index, 1);
  renderHomeImagePreviews();
};

window.toggleHomeExtraFields = function() {
  const category = document.getElementById('ownerMarketCategory')?.value;
  const extra = document.getElementById('homeExtraFields');
  if (!extra) return;

  if (category === 'Homes') {
    extra.classList.remove('hidden');
  } else {
    extra.classList.add('hidden');
  }
};

// ─── HOMES TAB: POST LISTING ─────────────────────────────────────────────────
window.postHomeListing = async function() {
  const category  = document.getElementById('homeCategory')?.value;
  const title     = document.getElementById('homeTitle')?.value.trim();
  const price     = document.getElementById('homePrice')?.value.trim();
  const condition = document.getElementById('homeCondition')?.value || 'used';
  const desc      = document.getElementById('homeDesc')?.value.trim();
  const notify    = document.getElementById('homeNotify')?.checked ?? false;

  if (!title || !category) {
    showToast('Title and Category are required', 'error');
    return;
  }

  if (notify && !(await checkNotificationCredits(2))) return;

  const btn = document.querySelector('#dtabContent-homes button[onclick="postHomeListing()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  try {
    let payload = {
      title,
      description: desc || '',
      price: price || '0',
      condition,
      images: _pendingHomeImages,
      category,
      sendNotify: notify
    };

    // === HOMES CATEGORY → use rich fields + /owner/homes endpoint ===
    if (category === 'Homes') {
      const type    = document.getElementById('homeType')?.value;
      const beds    = document.getElementById('homeBeds')?.value.trim();
      const baths   = document.getElementById('homeBaths')?.value.trim();
      const pet     = document.getElementById('homePetFriendly')?.checked;
      const sqft    = document.getElementById('homeSqft')?.value.trim();
      const address = document.getElementById('homeAddress')?.value.trim();

      const homeDetails = [
        type ? (type === 'rent' ? 'For Rent' : 'For Sale') : '',
        beds   ? `${beds} bed${beds !== '1' ? 's' : ''}` : '',
        baths  ? `${baths} bath${baths !== '1' ? 's' : ''}` : '',
        sqft   ? `${sqft} sq ft` : '',
        pet    ? '🐾 Pet Friendly' : '',
        address ? `📍 ${address}` : ''
      ].filter(Boolean).join(' · ');

      payload.description = homeDetails ? `${homeDetails}\n\n${desc || ''}`.trim() : desc;
      payload.condition   = type || condition;
      payload.address     = address || '';

      const res = await apiPost('/owner/homes', payload);
      if (res._id) {
        showToast('🏠 Home listing posted!', 'success');
      } else {
        showToast(res.message || 'Failed to post', 'error');
        return;
      }
    } 
    else {
      // === OTHER CATEGORIES → normal marketplace post ===
      const res = await apiPost('/marketplace', payload);
      if (res._id) {
        showToast('🛒 Item posted to Marketplace!', 'success');
      } else {
        showToast(res.message || 'Failed to post', 'error');
        return;
      }
    }

    // Reset form
    ['homeTitle', 'homePrice', 'homeDesc', 'homeSqft', 'homeBeds', 'homeBaths', 'homeAddress'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const catEl = document.getElementById('homeCategory');
    if (catEl) catEl.value = '';
    const typeEl = document.getElementById('homeType');
    if (typeEl) typeEl.value = '';
    if (document.getElementById('homePetFriendly')) document.getElementById('homePetFriendly').checked = false;
    if (document.getElementById('homeCondition')) document.getElementById('homeCondition').value = 'used';

    _pendingHomeImages = [];
    renderHomeImagePreviews();

    const extra = document.getElementById('homeExtraFields');
    if (extra) extra.classList.add('hidden');

    loadOwnerHomes();

  } catch (e) {
    console.error(e);
    showToast('Failed to post listing', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🛒 Post to Marketplace'; }
  }
};

// ─── HOMES TAB: LOAD + PAGINATED LIST ────────────────────────────────────────
const HOMES_PAGE_SIZE = 5;
let _homesPage = 1;
let _homesAll  = [];

async function loadOwnerHomes() {
  const container = document.getElementById('ownerHomesList');
  if (!container) return;
  container.innerHTML = `<div class="text-white/30 text-center py-8 text-sm">Loading…</div>`;

  try {
    const items = await apiGet('/owner/homes');
    _homesAll  = items || [];
    _homesPage = 1;
    renderHomesPage();
  } catch (e) {
    container.innerHTML = `<p class="text-white/40 text-center py-6 text-sm">Failed to load listings.</p>`;
  }
}

function renderHomesPage() {
  const container = document.getElementById('ownerHomesList');
  if (!container) return;

  if (!_homesAll.length) {
    container.innerHTML = `<p class="text-white/40 text-center py-6 text-sm">No home listings yet. Post your first one above!</p>`;
    return;
  }

  const totalPages = Math.ceil(_homesAll.length / HOMES_PAGE_SIZE);
  const start      = (_homesPage - 1) * HOMES_PAGE_SIZE;
  const page       = _homesAll.slice(start, start + HOMES_PAGE_SIZE);

  const typeLabel  = { rent: '🔑 For Rent', sale: '🏷️ For Sale' };

  container.innerHTML = page.map(item => {
    const firstPhoto = item.images?.[0];
    const photoCount = item.images?.length || 0;
    return `
    <div class="bg-white/10 border border-white/10 rounded-3xl overflow-hidden mb-3">
      ${firstPhoto ? `
      <div class="relative h-36 bg-white/5">
        <img src="${firstPhoto}" class="w-full h-full object-cover">
        ${photoCount > 1 ? `<span class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">📷 ${photoCount}</span>` : ''}
        <span class="absolute top-2 left-2 bg-black/70 text-white text-xs px-2.5 py-1 rounded-full font-semibold">${typeLabel[item.condition] || item.condition}</span>
      </div>` : ''}
      <div class="p-4">
        <div class="flex justify-between items-start gap-2">
          <div class="flex-1 min-w-0">
            ${!firstPhoto ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/20 mb-1 inline-block">${typeLabel[item.condition] || item.condition}</span>` : ''}
            <div class="font-bold leading-snug truncate">${item.title}</div>
            ${item.price > 0 ? `<div class="text-emerald-400 font-semibold text-sm mt-0.5">$${Number(item.price).toLocaleString()}${item.condition === 'rent' ? '/mo' : ''}</div>` : ''}
            ${item.description ? `<div class="text-xs text-white/50 mt-1 line-clamp-2">${item.description}</div>` : ''}
            <div class="text-xs text-white/30 mt-1.5">${new Date(item.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
          </div>
          <button onclick="deleteOwnerHome('${item._id}')" class="text-red-400 hover:text-red-300 text-lg flex-shrink-0 mt-1">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Pagination controls
  if (totalPages > 1) {
    container.insertAdjacentHTML('beforeend', `
      <div class="flex items-center justify-between px-1 pt-2 pb-1">
        <button onclick="homesPageNav(-1)" ${_homesPage === 1 ? 'disabled' : ''}
                class="text-sm px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition">← Prev</button>
        <span class="text-xs text-white/40">${_homesPage} / ${totalPages}</span>
        <button onclick="homesPageNav(1)" ${_homesPage === totalPages ? 'disabled' : ''}
                class="text-sm px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition">Next →</button>
      </div>`);
  }
}


// ─── SETTINGS & PRIVACY MODAL ────────────────────────────────────────────────
// Single authoritative definition (profile.js no longer has a copy).
window.showAccountSettingsModal = function() {
  if (document.getElementById('accountSettingsModal')) return;

  const user = currentUser;

  const html = `
    <div id="accountSettingsModal" onclick="if(event.target.id==='accountSettingsModal') hideAccountSettingsModal()" 
         class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-[35000] p-0 sm:p-4">
      <div onclick="event.stopPropagation()" 
           class="bg-[#0f172a] border border-white/10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        
        <!-- Header -->
        <div class="sticky top-0 bg-[#0f172a]/95 backdrop-blur border-b border-white/10 px-6 py-4 rounded-t-3xl flex items-center justify-between">
          <div class="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2 top-2 sm:hidden"></div>
          <h2 class="text-lg font-bold flex items-center gap-2">⚙️ Settings & Privacy</h2>
          <button onclick="hideAccountSettingsModal()" class="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div class="p-6 space-y-6">

          <!-- User Info -->
          ${user ? `
          <div class="flex items-center gap-4 bg-white/5 rounded-2xl p-4">
            <div class="w-12 h-12 rounded-full overflow-hidden bg-emerald-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
              ${user.avatar
                ? `<img src="${user.avatar}" class="w-full h-full object-cover">`
                : (user.name || '?')[0].toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="font-semibold truncate">${esc(user.name || 'Your Account')}</p>
              <p class="text-white/40 text-sm truncate">${esc(user.email || '')}</p>
            </div>
          </div>` : ''}

          <!-- Settings Buttons -->
          <div class="space-y-3">

            <!-- Notification Preferences -->
            <button onclick="hideAccountSettingsModal(); setTimeout(showNotificationSettingsModal, 150)" 
                    class="w-full flex items-center gap-3 px-5 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl transition text-left">
              <span class="text-xl">🔔</span>
              <span class="font-semibold text-sm">Notification Preferences</span>
            </button>

            <!-- Privacy Policy -->
            <button onclick="window.open('https://www.milledgevilleconnect.com/privacy.html', '_blank')" 
                    class="w-full flex items-center gap-3 px-5 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl transition text-left">
              <span class="text-xl">🔏</span>
              <span class="font-semibold text-sm">Privacy Policy</span>
            </button>

            <!-- Change Password -->
            <button onclick="hideAccountSettingsModal(); setTimeout(showChangePasswordModal, 150)" 
                    class="w-full flex items-center gap-3 px-5 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl transition text-left">
              <span class="text-xl">🔑</span>
              <span class="font-semibold text-sm">Change Password</span>
            </button>

            <!-- Delete Account -->
            <div class="bg-red-500/10 border border-red-500/30 rounded-2xl overflow-hidden mt-4">
              <div class="px-5 py-4">
                <p class="font-semibold text-red-400 text-sm flex items-center gap-2">🗑️ Delete My Account</p>
                <p class="text-white/50 text-xs mt-1 leading-relaxed">
                  Permanently removes your account and all your data. This cannot be undone.
                </p>
              </div>
              <button onclick="hideAccountSettingsModal(); setTimeout(showDeleteAccountModal, 200)" 
                      class="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition border-t border-red-500/30">
                Delete My Account Permanently
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
};

window.hideAccountSettingsModal = function() {
  const modal = document.getElementById('accountSettingsModal');
  if (modal) modal.remove();
};

// ─── CHANGE PASSWORD MODAL ────────────────────────────────────────────────────
window.showChangePasswordModal = function() {
  if (document.getElementById('changePasswordModal')) return;

  const html = `
    <div id="changePasswordModal"
         onclick="if(event.target.id==='changePasswordModal') hideChangePasswordModal()"
         class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-[36000] p-0 sm:p-4">
      <div onclick="event.stopPropagation()"
           class="bg-[#0f172a] border border-white/10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden">

        <!-- Header -->
        <div class="sticky top-0 bg-[#0f172a]/95 backdrop-blur border-b border-white/10 px-6 py-4 rounded-t-3xl flex items-center justify-between">
          <div class="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2 top-2 sm:hidden"></div>
          <h2 class="text-lg font-bold flex items-center gap-2">🔑 Change Password</h2>
          <button onclick="hideChangePasswordModal()" class="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div class="p-6 space-y-3">
          <input id="cpCurrentPassword" type="password" placeholder="Current password"
                 class="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-2xl focus:border-emerald-400 outline-none text-white placeholder:text-white/30">
          <input id="cpNewPassword" type="password" placeholder="New password"
                 class="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-2xl focus:border-emerald-400 outline-none text-white placeholder:text-white/30">
          <input id="cpConfirmPassword" type="password" placeholder="Confirm new password"
                 class="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-2xl focus:border-emerald-400 outline-none text-white placeholder:text-white/30">

          <div class="flex gap-3 pt-2">
            <button onclick="hideChangePasswordModal()"
                    class="flex-1 py-4 rounded-2xl border border-white/20 text-sm font-semibold hover:bg-white/5 transition">
              Cancel
            </button>
            <button onclick="submitChangePassword()"
                    class="flex-1 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition">
              Update Password
            </button>
          </div>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
};

window.hideChangePasswordModal = function() {
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.remove();
};

window.submitChangePassword = async function() {
  const current = document.getElementById('cpCurrentPassword').value;
  const newPass  = document.getElementById('cpNewPassword').value;
  const confirm  = document.getElementById('cpConfirmPassword').value;

  if (!current || !newPass || !confirm) {
    return showToast('All fields are required', 'error');
  }
  if (newPass !== confirm) {
    return showToast('New passwords do not match', 'error');
  }
  if (newPass.length < 6) {
    return showToast('Password must be at least 6 characters', 'error');
  }
  if (newPass === current) {
    return showToast('New password must be different from current', 'error');
  }

  const btn = document.querySelector('#changePasswordModal button[onclick="submitChangePassword()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }

  try {
    const res = await apiPost('/auth/change-password', {
      currentPassword: current,
      newPassword: newPass
    });

    if (res.success) {
      hideChangePasswordModal();
      showToast('✅ Password updated successfully!', 'success');
    } else {
      showToast(res.message || 'Failed to update password', 'error');
    }
  } catch (e) {
    showToast('Network error — try again', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
};

window.homesPageNav = function(dir) {
  const totalPages = Math.ceil(_homesAll.length / HOMES_PAGE_SIZE);
  _homesPage = Math.max(1, Math.min(totalPages, _homesPage + dir));
  renderHomesPage();
  document.getElementById('ownerHomesList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteOwnerHome = async function(id) {
  if (!confirm('Delete this home listing?')) return;
  try {
    await apiDelete(`/owner/homes/${id}`);
    showToast('Listing deleted', 'success');
    _homesAll = _homesAll.filter(h => h._id !== id);
    // Adjust page if we deleted the last item on a non-first page
    const totalPages = Math.ceil(_homesAll.length / HOMES_PAGE_SIZE);
    if (_homesPage > totalPages) _homesPage = Math.max(1, totalPages);
    renderHomesPage();
  } catch (e) {
    showToast('Failed to delete listing', 'error');
  }
};

// NOTE: Marketplace preferences are now part of the unified notification preferences
// system. See saveNotificationPreferences() in profile.js → POST /user/notification-preferences.

// Live badge updates every 30 seconds
setInterval(() => {
  if (typeof currentUser !== 'undefined' && currentUser) {
    updateMessageBadge();
  }
}, 30000);

window.toggleHomeExtraFields = function() {
  const cat = document.getElementById('homeCategory')?.value;
  const extra = document.getElementById('homeExtraFields');
  if (!extra) return;

  if (cat === 'Homes') {
    extra.classList.remove('hidden');
  } else {
    extra.classList.add('hidden');
  }
};

// ─── STILL THERE (Frontend) ─────────────────────────────────────────────────
window.stillThere = async function(shoutoutId, btnElement) {
  if (!currentUser) {
    showAuthModal({ message: 'Sign in to confirm this alert.' });
    return;
  }

  if (btnElement.disabled) return;
  btnElement.disabled = true;

  try {
    const res = await apiPost(`/shoutouts/${shoutoutId}/still-there`, {});

    // Update the count shown on the button
    const countSpan = btnElement.querySelector('span.font-mono');
    if (countSpan) {
      countSpan.textContent = res.stillThereCount || 0;
    }

    // Make the button look active
    btnElement.classList.remove('bg-white/10', 'hover:bg-white/20', 'text-white/80');
    btnElement.classList.add('bg-emerald-500/20', 'text-emerald-400');

    showToast('Thanks for confirming!', 'success');

  } catch (err) {
    if (err.message && err.message.includes('already confirmed')) {
      showToast('You already confirmed this one', 'info');
      btnElement.classList.remove('bg-white/10', 'hover:bg-white/20', 'text-white/80');
      btnElement.classList.add('bg-emerald-500/20', 'text-emerald-400');
    } else {
      showToast('Something went wrong', 'error');
    }
  } finally {
    btnElement.disabled = false;
  }
};

// ─── CLEAR SHOUTOUT (Frontend) ──────────────────────────────────────────────
window.clearShoutout = async function(shoutoutId, btnElement) {
  if (!currentUser) {
    showAuthModal({ message: 'Sign in to mark alerts as cleared.' });
    return;
  }

  if (!confirm('Mark this traffic alert as resolved?')) {
    return;
  }

  if (btnElement.disabled) return;
  btnElement.disabled = true;

  try {
    const res = await apiPost(`/shoutouts/${shoutoutId}/clear`, {});

    if (res.cleared) {
      // Replace button with "Cleared" state
      const container = btnElement.parentElement;
      btnElement.outerHTML = `<div class="sc-pill sc-cleared-badge">✅ Cleared</div>`;
      showToast('Alert marked as cleared. Thanks!', 'success');
    } else {
      showToast(`Marked (${res.clearCount}/${res.threshold} needed)`, 'success');
      btnElement.disabled = false;
    }

  } catch (err) {
    if (err.message && err.message.includes('already marked')) {
      showToast('You already marked this as cleared', 'info');
    } else {
      showToast('Failed to mark as cleared', 'error');
    }
    btnElement.disabled = false;
  }
};

window.likeShoutout = async function(shoutoutId) {
  if (!currentUser) {
    showAuthModal({ message: 'Sign in to like traffic alerts.' });
    return;
  }
  try {
    const res = await apiPost(`/shoutouts/${shoutoutId}/like`, {});
    const countEl = document.getElementById(`like-count-${shoutoutId}`);
    if (countEl) countEl.textContent = res.likes;
    const btn = countEl?.closest('button');
    if (btn) {
      if (res.liked) btn.classList.add('liked');
      else btn.classList.remove('liked');
    }
  } catch (err) {
    showToast('Could not like this alert', 'error');
  }
};

// ─── PWA INSTALL BUTTON HANDLER ─────────────────────────────────────────────
let deferredPrompt = null;

// Listen for the install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();           // Prevent the default mini-infobar
  deferredPrompt = e;           // Stash the event
  console.log('✅ beforeinstallprompt captured');
});

// Make your install button work
window.installApp = async function() {
  const btn = document.getElementById('installAppBtn'); // Change to your button ID

  // Android / Desktop Chrome / Edge
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      showToast('✅ App installed!', 'success');
    } else {
      showToast('Install cancelled', 'info');
    }
    
    deferredPrompt = null;
    if (btn) btn.style.display = 'none';
    return;
  }

  // iOS Safari (or other browsers that don't support the prompt)
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    showIOSInstallInstructions();
    return;
  }

  // Fallback for other browsers
  showToast('Use your browser menu → "Add to Home Screen"', 'info');
};

// Show nice instructions for iOS users
function showIOSInstallInstructions() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] p-4';
  modal.innerHTML = `
    <div class="bg-[#0f172a] rounded-3xl max-w-sm w-full p-6 text-center">
      <h3 class="text-xl font-bold mb-4">Install on iPhone / iPad</h3>
      
      <div class="text-left space-y-4 text-sm text-white/80">
        <div class="flex gap-3">
          <span class="text-2xl flex-shrink-0">1.</span>
          <p>Tap the <strong>Share</strong> button at the bottom of Safari</p>
        </div>
        <div class="flex gap-3">
          <span class="text-2xl flex-shrink-0">2.</span>
          <p>Scroll down and tap <strong>"Add to Home Screen"</strong></p>
        </div>
        <div class="flex gap-3">
          <span class="text-2xl flex-shrink-0">3.</span>
          <p>Tap <strong>"Add"</strong> in the top right</p>
        </div>
      </div>

      <button onclick="this.closest('.fixed').remove()" 
              class="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 py-3.5 rounded-2xl font-semibold">
        Got it
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

// ─── NOTE: sendCustomNotification / canSendNotification are defined above ──────
// Duplicate definitions removed to prevent the second copy from silently
// overwriting the first and breaking the credit-check flow.

// Extra protection against any accidental double broadcast
window.addEventListener('beforeunload', () => {
  isPostingShoutout = false;
});

// ─── Push Notifications ───────────────────────────────────────────────────────
// initPushAfterLogin is defined in profile.js (_initNativePush).
// That version correctly checks existing permissions before re-requesting,
// preventing the black-screen bug on startup. No duplicate needed here.