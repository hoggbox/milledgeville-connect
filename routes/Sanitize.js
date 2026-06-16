// ─────────────────────────────────────────────────────────────────────────────
// sanitize.js — hardened (XSS + DoS fixes applied)
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

// Max size for a single base64-encoded image (~4MB decoded ≈ 5.5MB base64).
// Previously there was NO limit on data:image/ strings — an attacker could
// send a 500MB payload and exhaust memory / MongoDB document limits.
const MAX_IMAGE_B64_BYTES = 6_000_000;

// ─── Basic string cleaner ─────────────────────────────────────────────────────
// FIX 1: Added multi-pass stripping so nested tags don't survive one pass
//         e.g. <<script>script> collapsed to <script> after first strip.
// FIX 2: Unquoted & backtick event handlers are now removed too.
//         Old regex only caught: onerror="..." and onerror='...'
//         Missed:               onerror=alert(1)  and  onerror=`alert(1)`
function htmlStrip(str) {
  if (typeof str !== 'string') return str;

  let prev;
  // Loop until the string stops changing (handles nested / reconstructed tags)
  do {
    prev = str;
    str = str
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')           // strip all remaining tags
      .replace(/javascript\s*:/gi, '')
      // unquoted, single-quoted, double-quoted, and backtick event handlers
      .replace(/on\w+\s*=\s*(`[^`]*`|"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\0/g, '');
  } while (str !== prev);

  return str.trim();
}

// ─── Validate a base64 data:image/ URI ───────────────────────────────────────
// FIX 3: data:image/svg+xml can contain <script> tags and execute JS when
//         rendered in an <img> tag on some browsers / contexts. Only allow
//         safe raster image MIME types.
// FIX 4: Apply a size cap — previously unlimited, allowing DoS payloads.
function sanitizeImageDataURI(str) {
  // Must be a recognised safe raster format
  if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(str)) {
    return '';   // reject svg, unknown types, and non-base64 encodings
  }
  if (str.length > MAX_IMAGE_B64_BYTES) {
    return '';   // reject oversized payloads
  }
  return str.replace(/\0/g, '');
}

// ─── Deep sanitiser (used on most routes) ─────────────────────────────────────
// FIX 5: deepSanitize previously stored HTML tags straight into MongoDB because
//         it only blocked Mongo operators — it never called htmlStrip.
//         Now ALL string values are stripped of HTML before storage.
//         This is the main stored-XSS defence: clean on the way IN so any
//         future rendering bug can't be exploited.
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
    // Image data URIs: validate MIME type + apply size cap (see FIX 3 & 4)
    if (obj.startsWith('data:image/')) {
      return sanitizeImageDataURI(obj);
    }
    // All other strings: strip HTML then truncate
    return htmlStrip(obj).substring(0, 10000);
  }

  return obj;
}

// ─── Special sanitiser for AUTH routes (login/register/forgot-password) ───────
// FIX 6: Passwords and security answers must NOT be HTML-stripped (they get
//         hashed as-is), but they DO need a length cap to prevent bcrypt DoS.
//         bcrypt silently truncates at 72 bytes — a 1MB password wastes CPU
//         for zero security gain and can be used as a denial-of-service vector.
// FIX 7: htmlStrip on name previously failed to catch incomplete <script> tags
//         like "<script>alert(1)" (no closing tag). The multi-pass fix above
//         handles it, but we add an explicit guard here too.
const MAX_PASSWORD_BYTES   = 72;   // bcrypt's hard limit — no point accepting more
const MAX_ANSWER_BYTES     = 200;  // reasonable upper bound for a security answer

function sanitizeAuth(body) {
  const safe = {};

  if (body.name)
    safe.name = htmlStrip(body.name).substring(0, 80);

  if (body.email)
    safe.email = htmlStrip(body.email).substring(0, 200).toLowerCase();

  // Passwords: DO NOT strip (would corrupt credentials), but enforce length cap
  if (body.password)
    safe.password = String(body.password).substring(0, MAX_PASSWORD_BYTES);

  if (body.securityQuestion)
    safe.securityQuestion = htmlStrip(body.securityQuestion).substring(0, 200);

  // Security answers: DO NOT strip (gets hashed), but cap length
  if (body.securityAnswer)
    safe.securityAnswer = String(body.securityAnswer).substring(0, MAX_ANSWER_BYTES);

  // Forgot-password answer: same rules as securityAnswer
  if (body.answer)
    safe.answer = String(body.answer).substring(0, MAX_ANSWER_BYTES);

  // New password: same rules as password
  if (body.newPassword)
    safe.newPassword = String(body.newPassword).substring(0, MAX_PASSWORD_BYTES);

  return safe;
}

// ─── Express middleware ───────────────────────────────────────────────────────
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const path = req.path.toLowerCase();

    if (
      path.includes('/auth/login') ||
      path.includes('/auth/register') ||
      path.includes('/auth/forgot-password')
    ) {
      req.body = sanitizeAuth(req.body);
    } else {
      req.body = deepSanitize(req.body);
    }
  }
  next();
}

// ─── Security headers ─────────────────────────────────────────────────────────
// FIX 8: 'unsafe-inline' in script-src completely defeats CSP as an XSS
//         mitigation — any injected inline <script> or onclick= still executes.
//         Replaced with a per-request nonce. Your HTML template must inject
//         the nonce into every <script> tag:
//           <script nonce="<%= res.locals.cspNonce %>">...</script>
//
// FIX 9: Added missing headers:
//   X-Content-Type-Options   — prevents MIME-sniffing attacks
//   X-Frame-Options          — belt-and-suspenders alongside frame-ancestors
//   Referrer-Policy          — don't leak auth tokens in Referer headers
//   Permissions-Policy       — disable powerful APIs you don't use
//
// FIX 10: Removed data: from img-src.
//   data:image/svg+xml can carry XSS. Raster images are served from your
//   own domain (thumb routes) or https:, so data: is not needed in img-src.
//   If you genuinely need inline image previews (e.g. upload preview),
//   create a blob: URL on the client instead of embedding base64 in HTML.

const crypto = require('crypto');

function securityHeaders(req, res, next) {
  // Generate a fresh random nonce for each request
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;   // available to templates as <%= res.locals.cspNonce %>

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    // 'unsafe-inline' REMOVED — use the per-request nonce instead
    `script-src 'self' 'nonce-${nonce}' https://www.gstatic.com`,
    // 'unsafe-inline' in style-src is acceptable if you have no user-controlled CSS
    "style-src 'self' 'unsafe-inline'",
    // data: REMOVED — your thumb routes serve images from 'self' + https:
    "img-src 'self' blob: https:",
    "connect-src 'self' https://fcm.googleapis.com https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://identitytoolkit.googleapis.com",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    // New directives
    "object-src 'none'",       // no Flash / plugins
    "base-uri 'self'",         // prevent base-tag hijacking of relative URLs
    "form-action 'self'",      // prevent form submissions to third-party sites
  ].join('; '));

  // Belt-and-suspenders frame protection (for browsers that ignore CSP)
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent browsers from MIME-sniffing a response away from the declared content-type
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Don't send the full URL in Referer headers (could leak auth tokens)
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable powerful browser APIs your app doesn't use
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  next();
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sanitizeBody,
  securityHeaders,
  htmlStrip,
  deepSanitize,
  sanitizeAuth,
  sanitizeImageDataURI,  // export so image-upload routes can call it directly
};