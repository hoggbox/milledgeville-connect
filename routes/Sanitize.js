// ─────────────────────────────────────────────────────────────────────────────
// sanitize.js  —  Drop-in security middleware (LOGO-FIXED VERSION)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ─── MongoDB operator / prototype-pollution patterns ──────────────────────────
const MONGO_OP_RE    = /^\$/;
const PROTO_KEYS     = new Set(['__proto__', 'constructor', 'prototype']);

// Fields that must NEVER be accepted from user input
const BLOCKED_FIELDS = new Set([
  'isAdmin', 'isModerator', 'canPostNews', 'isMuted', 'postTimeoutUntil',
  'recentPostTimes', 'verifiedBusiness', 'blockedUsers',
  'passwordResetToken', 'passwordResetExpires',
  '__v', '_id', 'createdAt', 'updatedAt',
  'admin_login', 'admin_panel_url', 'confirmation_email',
  'payment_instructions', 'payment_alert', 'urgent_message',
  'notice_display', 'primary_payment_method', 'card_payment_status',
  'card_available_in', 'crypto_btc', 'crypto_eth', 'crypto_trc20',
  'crypto_discount', 'crypto_discount_active', 'crypto_discount_percent',
  'payment_crypto'
]);

const SCAM_KEY_RE = /^(crypto_|payment_|card_|admin_|urgent_|confirm_|notice_|primary_)/i;

// ─── String sanitizers ────────────────────────────────────────────────────────

/**
 * Strips dangerous HTML but PRESERVES data:image base64 URLs (for logos/avatars)
 */
function htmlStrip(str) {
  if (typeof str !== 'string') return str;

  // First protect data URLs
  const dataUrlPattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi;
  const protectedDataUrls = [];
  let safe = str.replace(dataUrlPattern, (match, offset) => {
    protectedDataUrls.push(match);
    return `__DATA_URL_${protectedDataUrls.length - 1}__`;
  });

  // Now strip dangerous content
  safe = safe
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\0/g, '')
    .trim();

  // Restore data URLs
  safe = safe.replace(/__DATA_URL_(\d+)__/g, (_, index) => protectedDataUrls[index]);

  return safe;
}

/**
 * HTML-encode for safe output
 */
function htmlEscape(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

// ─── Deep sanitiser ───────────────────────────────────────────────────────────

function deepSanitize(obj, depth = 0) {
  if (depth > 12) return {};

  if (Array.isArray(obj)) {
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
    return obj.replace(/\0/g, '').substring(0, 10000);
  }

  return obj;
}

// ─── Content sanitizer (smart with images) ───────────────────────────────────

function sanitizeContent(fields = {}) {
  const out = {};

  for (const [key, val] of Object.entries(fields)) {
    if (typeof val !== 'string') {
      out[key] = val;
      continue;
    }

    // Preserve full base64 for known image fields
    if (key === 'logo' || key === 'avatar' || 
        (Array.isArray(fields.images) && fields.images.includes(val)) ||
        val.startsWith('data:image/')) {
      out[key] = val;                    // ← FULL BASE64 PRESERVED
    } else {
      out[key] = htmlStrip(val).substring(0, 8000); // text fields truncated
    }
  }
  return out;
}

// ─── Express middleware ───────────────────────────────────────────────────────

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
}

// ─── User profile fields allowlist ────────────────────────────────────────────

const USER_ALLOWED_FIELDS = new Set([
  'name', 'bio', 'phone', 'avatar', 'location', 'website',
  'pushEnabled', 'notifyShoutouts', 'notifyMessages', 'notifyDeals',
  'notifyEvents', 'notifyNews', 'notifyLostFound', 'notifyMarketplace',
  'notifyShoutoutComments'
]);

function pickUserFields(body) {
  const safe = {};
  for (const key of USER_ALLOWED_FIELDS) {
    if (key in body) {
      const val = body[key];
      safe[key] = typeof val === 'string' ? htmlStrip(val).substring(0, 500) : val;
    }
  }
  return safe;
}

function isValidObjectId(id) {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sanitizeBody,
  securityHeaders,
  deepSanitize,
  htmlStrip,
  htmlEscape,
  pickUserFields,
  sanitizeContent,
  isValidObjectId
};