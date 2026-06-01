// ─────────────────────────────────────────────────────────────────────────────
// sanitize.js — FIXED VERSION (safe for login/register)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ─── MongoDB operator / prototype-pollution patterns ──────────────────────────
const MONGO_OP_RE = /^\$/;
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Fields that are dangerous in most routes
const BLOCKED_FIELDS = new Set([
  'isAdmin', 'isModerator', 'canPostNews', 'isMuted', 'postTimeoutUntil',
  'verifiedBusiness', 'admin_login', 'admin_panel_url', 'confirmation_email',
  'payment_instructions', 'payment_alert', 'urgent_message', 'notice_display',
  'primary_payment_method', 'card_payment_status', 'crypto_btc', 'crypto_eth',
  'crypto_trc20', 'crypto_discount', 'payment_crypto'
]);

const SCAM_KEY_RE = /^(crypto_|payment_|card_|admin_|urgent_|confirm_|notice_|primary_)/i;

// ─── Basic string cleaner ─────────────────────────────────────────────────────
function htmlStrip(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\0/g, '')
    .trim();
}

// ─── Deep sanitiser (used on most routes) ─────────────────────────────────────
function deepSanitize(obj, depth = 0) {
  if (depth > 12) return {};
  if (Array.isArray(obj)) return obj.slice(0, 500).map(item => deepSanitize(item, depth + 1));

  if (obj !== null && typeof obj === 'object') {
    const clean = {};
    for (const key of Object.keys(obj)) {
      if (MONGO_OP_RE.test(key)) continue;
      if (PROTO_KEYS.has(key)) continue;
      if (BLOCKED_FIELDS.has(key)) continue;
      if (SCAM_KEY_RE.test(key)) continue;
      clean[key] = deepSanitize(obj[key], depth + 1);
    }
    return clean;
  }

  if (typeof obj === 'string') {
    // Don't truncate base64 image data URLs (they are often 100k+ chars)
    if (obj.startsWith('data:image/')) {
      return obj.replace(/\0/g, '');
    }
    return obj.replace(/\0/g, '').substring(0, 10000);
  }
  return obj;
}

// ─── Special sanitiser for AUTH routes (login / register) ────────────────────
function sanitizeAuth(body) {
  const safe = {};
  if (body.name)     safe.name = htmlStrip(body.name).substring(0, 80);
  if (body.email)    safe.email = htmlStrip(body.email).substring(0, 200).toLowerCase();
  if (body.password) safe.password = body.password;   // ← DO NOT strip password
  return safe;
}

// ─── Special sanitiser for password-change / reset routes ────────────────────
// These carry currentPassword / newPassword / answer — none must be touched.
function sanitizePasswordRoute(body) {
  const safe = {};
  if (body.email)           safe.email = (body.email || '').toLowerCase().trim();
  if (body.answer)          safe.answer = body.answer;           // compared via bcrypt
  if (body.currentPassword) safe.currentPassword = body.currentPassword;
  if (body.newPassword)     safe.newPassword = body.newPassword;
  return safe;
}

// ─── Express middleware ───────────────────────────────────────────────────────
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const path = req.path.toLowerCase();

    if (path.includes('/auth/login') || path.includes('/auth/register')) {
      // login / register — preserve password as-is, light clean on name/email
      req.body = sanitizeAuth(req.body);
    } else if (
      path.includes('/auth/forgot-password') ||
      path.includes('/auth/change-password')
    ) {
      // password reset / change — never mutate password or security-answer fields
      req.body = sanitizePasswordRoute(req.body);
    } else {
      req.body = deepSanitize(req.body);
    }
  }
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    // Allow connections to Firebase/FCM and browser push endpoints
    "connect-src 'self' https://fcm.googleapis.com https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://identitytoolkit.googleapis.com",
    // Required for the service worker that handles web push
    "worker-src 'self'",
    "frame-ancestors 'none'"
  ].join('; '));

  // Required so Chrome/Android service workers can fetch notification images
  // from your API thumb endpoints (cross-origin image fetch from SW context).
  // Without this, Chrome silently drops the image on Android web push.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  next();
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sanitizeBody,
  securityHeaders,
  htmlStrip,
  deepSanitize,
  sanitizeAuth,
  sanitizePasswordRoute
};