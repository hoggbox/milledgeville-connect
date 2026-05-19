// ─────────────────────────────────────────────────────────────────────────────
// sanitize.js  —  Drop-in security middleware for api.js
//
// HOW TO USE:
//   1. Copy this file next to your api.js  (e.g. routes/sanitize.js)
//   2. At the TOP of api.js, add:
//        const { sanitizeBody, securityHeaders, pickUserFields,
//                htmlStrip, stripDangerousFields } = require('./sanitize');
//   3. Directly after `const router = express.Router();`, add:
//        router.use(securityHeaders);
//        router.use(sanitizeBody);
//   4. In every route that updates a User from req.body, replace the raw
//      spread with pickUserFields(req.body)  — see examples in the comments.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ─── MongoDB operator / prototype-pollution patterns ──────────────────────────
const MONGO_OP_RE    = /^\$/;
const PROTO_KEYS     = new Set(['__proto__', 'constructor', 'prototype']);

// Fields that must NEVER be accepted from user input (privilege / scam fields)
const BLOCKED_FIELDS = new Set([
  // Privilege escalation
  'isAdmin', 'isModerator', 'canPostNews', 'isMuted', 'postTimeoutUntil',
  'recentPostTimes', 'verifiedBusiness', 'blockedUsers',
  // Credential fields (password intentionally NOT blocked — it is accepted
  // on auth routes and hashed by the User model's pre-save hook; blocking it
  // here breaks login/register without adding any actual security benefit)
  'passwordResetToken', 'passwordResetExpires',
  // Mongoose internals
  '__v', '_id', 'createdAt', 'updatedAt',
  // Previously-injected scam / phishing fields
  'admin_login', 'admin_panel_url', 'confirmation_email',
  'payment_instructions', 'payment_alert', 'urgent_message',
  'notice_display', 'primary_payment_method', 'card_payment_status',
  'card_available_in', 'crypto_btc', 'crypto_eth', 'crypto_trc20',
  'crypto_discount', 'crypto_discount_active', 'crypto_discount_percent',
  'payment_crypto'
]);

// Pattern that catches any NEW scam fields the attacker might invent
const SCAM_KEY_RE = /^(crypto_|payment_|card_|admin_|urgent_|confirm_|notice_|primary_)/i;

// ─── String sanitisers ────────────────────────────────────────────────────────

/**
 * Strips ALL HTML tags and dangerous patterns from a string.
 * Use this for plain-text fields (names, titles, descriptions, etc.)
 */
function htmlStrip(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')   // full <script> blocks
    .replace(/<style[\s\S]*?<\/style>/gi, '')      // full <style> blocks
    .replace(/<!--[\s\S]*?-->/g, '')               // HTML comments
    .replace(/<[^>]+>/g, '')                       // remaining tags
    .replace(/javascript\s*:/gi, '')               // javascript: URIs
    .replace(/vbscript\s*:/gi, '')                 // vbscript: URIs
    .replace(/data\s*:/gi, '')                     // data: URIs in text
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')  // inline event handlers
    .replace(/\0/g, '')                            // null bytes
    .trim();
}

/**
 * HTML-encodes a string so it is safe to embed inside HTML.
 * Use this when you actually need to output the raw text in a template.
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

// ─── Deep sanitiser (walks the entire req.body tree) ─────────────────────────

/**
 * Recursively sanitises an object:
 *  • Removes MongoDB operator keys  ($gt, $where, etc.)
 *  • Blocks prototype-pollution keys
 *  • Removes known-dangerous field names
 *  • Strips null bytes from strings
 *  • Limits string length to 10 000 chars to prevent DoS
 */
function deepSanitize(obj, depth = 0) {
  if (depth > 12) return {};                   // prevent stack-overflow via deeply nested payload

  if (Array.isArray(obj)) {
    return obj.slice(0, 500).map(item => deepSanitize(item, depth + 1));
  }

  if (obj !== null && typeof obj === 'object') {
    const clean = {};
    for (const key of Object.keys(obj)) {
      if (MONGO_OP_RE.test(key))   continue;   // $gt, $where, etc.
      if (PROTO_KEYS.has(key))     continue;   // prototype pollution
      if (BLOCKED_FIELDS.has(key)) continue;   // privilege / scam fields
      if (SCAM_KEY_RE.test(key))   continue;   // catch-all scam pattern
      clean[key] = deepSanitize(obj[key], depth + 1);
    }
    return clean;
  }

  if (typeof obj === 'string') {
    return obj.replace(/\0/g, '').substring(0, 10000);
  }

  return obj;   // numbers, booleans, null — pass through unchanged
}

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Middleware: sanitises req.body on every request before any route handler
 * runs.  Must be registered with router.use() BEFORE your route definitions.
 *
 * Usage:
 *   router.use(sanitizeBody);
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  next();
}

/**
 * Middleware: adds security response headers to every reply.
 *
 * Usage:
 *   router.use(securityHeaders);
 *
 * Adjust the Content-Security-Policy domains to match your own CDNs/fonts.
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Keep 'unsafe-inline' only until you move scripts into a bundle; then remove it
      "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://api.open-meteo.com https://fcm.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
}

// ─── Allowlist-based user profile update ─────────────────────────────────────

/**
 * Fields a regular user is allowed to update on their own profile.
 * Anything NOT in this set will be silently dropped.
 *
 * Usage (in your PUT /profile or PATCH /users/:id route):
 *
 *   const safe = pickUserFields(req.body);
 *   await User.findByIdAndUpdate(req.userId, safe, { new: true });
 */
const USER_ALLOWED_FIELDS = new Set([
  'name', 'bio', 'phone', 'avatar', 'location', 'website',
  'pushEnabled',
  'notifyShoutouts', 'notifyMessages', 'notifyDeals',
  'notifyEvents', 'notifyNews', 'notifyLostFound',
  'notifyMarketplace', 'notifyShoutoutComments'
]);

const USER_STRING_MAX = {
  name:     80,
  bio:      500,
  phone:    30,
  location: 100,
  website:  200
};

function pickUserFields(body) {
  const safe = {};
  for (const key of USER_ALLOWED_FIELDS) {
    if (!(key in body)) continue;
    const val = body[key];
    if (typeof val === 'string') {
      const max   = USER_STRING_MAX[key] || 500;
      safe[key]   = htmlStrip(val).substring(0, max);
    } else if (typeof val === 'boolean') {
      safe[key]   = val;
    }
    // ignore anything else (objects, arrays, numbers in string fields)
  }
  return safe;
}

// ─── Belt-and-suspenders: strip injected fields from any object ───────────────

/**
 * Removes all BLOCKED_FIELDS and scam-pattern keys from a plain object.
 * Use as a last-resort guard before saving to the DB if you're unsure
 * whether deepSanitize already ran on the input.
 *
 * Usage:
 *   const safeUpdate = stripDangerousFields({ ...req.body });
 *   await User.findByIdAndUpdate(req.userId, safeUpdate);
 */
function stripDangerousFields(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean = { ...obj };
  for (const field of BLOCKED_FIELDS) delete clean[field];
  for (const key of Object.keys(clean)) {
    if (SCAM_KEY_RE.test(key) || MONGO_OP_RE.test(key)) delete clean[key];
  }
  return clean;
}

// ─── Sanitise content fields (titles, descriptions, text bodies) ──────────────

/**
 * Sanitises the user-generated text fields on common content models
 * (shoutouts, lost items, marketplace listings, deals, events, news).
 *
 * Call this before saving a new document or updating an existing one.
 *
 * Example:
 *   const clean = sanitizeContent({ title, description, text, location });
 *   await LostItem.create({ ...clean, owner: user._id });
 */
function sanitizeContent(fields = {}) {
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'string') {
      out[key] = htmlStrip(val).substring(0, 5000);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ─── Validate MongoDB ObjectId to prevent injection via URL params ─────────────

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/**
 * Returns true only if `id` looks like a valid MongoDB ObjectId.
 * Use in route handlers that take an :id param before doing a DB lookup:
 *
 *   if (!isValidObjectId(req.params.id))
 *     return res.status(400).json({ message: 'Invalid ID' });
 */
function isValidObjectId(id) {
  return typeof id === 'string' && OBJECT_ID_RE.test(id);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sanitizeBody,       // Express middleware — registers on the whole router
  securityHeaders,    // Express middleware — adds CSP + security headers
  deepSanitize,       // Manual call: sanitize any object
  htmlStrip,          // Strip all HTML/scripts from a string
  htmlEscape,         // HTML-encode a string for safe output in templates
  pickUserFields,     // Allowlist filter for user profile updates
  stripDangerousFields, // Remove privilege/scam fields from any update object
  sanitizeContent,    // Strip HTML from content model fields before saving
  isValidObjectId     // Validate MongoDB ObjectIds from URL params
};