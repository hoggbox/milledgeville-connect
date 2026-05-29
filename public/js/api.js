// ─── CAPACITOR / MOBILE READY ───────────────────────────────────────────────
// Change the line below AFTER you deploy your backend
const PRODUCTION_API_BASE = 'https://www.milledgevilleconnect.com/api';
const isCapacitor = typeof window !== 'undefined' && 
  (window.Capacitor || 
   window.location.protocol === 'capacitor:' || 
   /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

const API_BASE = isCapacitor ? PRODUCTION_API_BASE : '/api';

let token = localStorage.getItem('token');

function setToken(newToken) {
  token = newToken;
  localStorage.setItem('token', newToken);
}

async function apiRequest(endpoint, data = null, method = 'GET') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const options = { method, headers };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  let res;
  try {
    res = await fetch(API_BASE + endpoint, options);
  } catch (networkErr) {
    // Network-level failure (offline, CORS, DNS) — show a real message
    console.error('[API] Network error on ' + method + ' ' + endpoint + ':', networkErr);
    throw new Error('Network error — check your connection and try again');
  }

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { message: text || 'Server error' };
  }

  if (!res.ok) {
    // Log every server error so you can see what's happening in the console
    console.error('[API] ' + method + ' ' + endpoint + ' -> ' + res.status + ':', json);
    const err = new Error(json.message || ('Request failed (' + res.status + ')'));
    err.status = res.status;
    err.data   = json;
    throw err;
  }

  return json;
}

async function apiGet(endpoint) {
  return apiRequest(endpoint, null, 'GET');
}

async function apiPost(endpoint, data, method = 'POST') {
  return apiRequest(endpoint, data, method);
}

async function apiPatch(endpoint, data) {
  return apiRequest(endpoint, data, 'PATCH');
}

// ─── NEW: DELETE helper for admin moderation (critical for Lost & Found + Marketplace) ───
async function apiDelete(endpoint) {
  return apiRequest(endpoint, null, 'DELETE');
}

window.apiGet     = apiGet;
window.apiPost    = apiPost;
window.apiPatch   = apiPatch;
window.apiDelete  = apiDelete;
window.setToken   = setToken;
window.apiRequest = apiRequest;