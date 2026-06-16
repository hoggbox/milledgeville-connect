// ─────────────────────────────────────────────────────────────────────────────
// sanitize.js — hardened (XSS + DoS fixes applied)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ─── MongoDB operator / prototype-pollution patterns ──────────────────────────
const MONGO_OP_RE = /^\$/;
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const BLOCKED_FIELDS = new Set([
  'isAdmin', 'isModerator', 'canPostNews', 'isMuted', 'postTimeoutUntil',
  'verifiedBusiness', 'admin_login', 'admin_panel_url', 'confirmation_email',
  'payment_instructions', 'payment_alert', 'urgent_message', 'notice_display',
  'primary_payment_method', 'card_payment_status', 'crypto_btc', 'crypto_eth',
  'crypto_trc20', 'crypto_discount', 'payment_crypto'
]);

const SCAM_KEY_RE = /^(crypto_|payment_|card_|admin_|urgent_|confirm_|notice_|primary_)/i;

const MAX_IMAGE_B64_BYTES = 6_000_000;

// ─── Image sanitization ───────────────────────────────────────────────────────
function sanitizeImageDataURI(str) {
  if (typeof str !== 'string') return null;

  if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(str)) {
    console.warn('[Security] Rejected invalid image format');
    return null;
  }

  if (str.length > MAX_IMAGE_B64_BYTES) {
    console.warn('[Security] Rejected oversized image:', Math.round(str.length / 1024 / 1024 * 10) / 10, 'MB');
    return null;
  }

  return str.replace(/\0/g, '');
}

// ─── Basic string cleaner ─────────────────────────────────────────────────────
function htmlStrip(str) {
  if (typeof str !== 'string') return str;

  let prev;
  do {
    prev = str;
    str = str
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/on\w+\s*=\s*(`[^`]*`|"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\0/g, '');
  } while (str !== prev);

  return str.trim();
}

// ─── Deep sanitiser ───────────────────────────────────────────────────────────
function deepSanitize(obj, depth = 0) {
  if (depth > 12) return {};

  if (Array.isArray(obj)) {
    // Special handling for image arrays
    if (obj.length > 0 && typeof obj[0] === 'string' && obj[0].startsWith('data:image/')) {
      return obj
        .map(item => sanitizeImageDataURI(item))
        .filter(Boolean)
        .slice(0, 5);
    }
    return obj.slice(0, 500).map(item => deepSanitize(item, depth + 1));
  }

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
    if (obj.startsWith('data:image/')) {
      return sanitizeImageDataURI(obj);
    }
    return htmlStrip(obj).substring(0, 10000);
  }

  return obj;
}

// ─── Auth sanitiser ───────────────────────────────────────────────────────────
const MAX_PASSWORD_BYTES = 72;
const MAX_ANSWER_BYTES = 200;

function sanitizeAuth(body) {
  const safe = {};

  if (body.name) safe.name = htmlStrip(body.name).substring(0, 80);
  if (body.email) safe.email = htmlStrip(body.email).substring(0, 200).toLowerCase();
  if (body.password) safe.password = String(body.password).substring(0, MAX_PASSWORD_BYTES);
  if (body.securityQuestion) safe.securityQuestion = htmlStrip(body.securityQuestion).substring(0, 200);
  if (body.securityAnswer) safe.securityAnswer = String(body.securityAnswer).substring(0, MAX_ANSWER_BYTES);
  if (body.answer) safe.answer = String(body.answer).substring(0, MAX_ANSWER_BYTES);
  if (body.newPassword) safe.newPassword = String(body.newPassword).substring(0, MAX_PASSWORD_BYTES);

  return safe;
}

// ─── Express middleware ───────────────────────────────────────────────────────
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const path = req.path.toLowerCase();

    if (path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/auth/forgot-password')) {
      req.body = sanitizeAuth(req.body);
    } else {
      req.body = deepSanitize(req.body);
    }
  }
  next();
}

// ─── Security headers ─────────────────────────────────────────────────────────
const crypto = require('crypto');

function securityHeaders(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: https:",
    "connect-src 'self' https://fcm.googleapis.com https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://identitytoolkit.googleapis.com",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));

  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  next();
}

module.exports = {
  sanitizeBody,
  securityHeaders,
  htmlStrip,
  deepSanitize,
  sanitizeAuth,
  sanitizeImageDataURI
};