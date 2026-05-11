const API_BASE = '/api';
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

  try {
    return JSON.parse(text);
  } catch (e) {
    return { message: text || 'Server error' };
  }
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

window.apiGet    = apiGet;
window.apiPost   = apiPost;
window.apiPatch  = apiPatch;
window.apiDelete = apiDelete;
window.setToken  = setToken;