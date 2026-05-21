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

  const res = await fetch(API_BASE + endpoint, options);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { message: text || 'Server error' };
  }

  // Graceful handling for expected conflict / validation errors
  if (!res.ok) {
    // Don't treat 409 (already voted) or 422 as fatal errors in console
    if (res.status === 409 || res.status === 422) {
      return json; // return the body so the caller can handle alreadyVoted etc.
    }
    console.warn(`API ${method} ${endpoint} → ${res.status}`, json);
  }

  return json;
}

// ─── NEW: DELETE helper for admin moderation (critical for Lost & Found + Marketplace) ───
async function apiDelete(endpoint) {
  return apiRequest(endpoint, null, 'DELETE');
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

window.apiGet    = apiGet;
window.apiPost   = apiPost;
window.apiPatch  = apiPatch;
window.apiDelete = apiDelete;
window.setToken  = setToken;
window.apiRequest = apiRequest;  // ← add this