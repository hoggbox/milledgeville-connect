const express = require('express');
const router  = express.Router();

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────────────
const { sanitizeBody, securityHeaders } = require('./Sanitize'); // adjust path if needed

router.use(securityHeaders);   // CSP + security headers
router.use(sanitizeBody);      // Deep sanitization on every req.body
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const webpush = require('web-push');

const User            = require('../models/User');
const Business        = require('../models/Business');
const Category        = require('../models/Category');
const Deal            = require('../models/Deal');
const Event           = require('../models/Event');
const Shoutout        = require('../models/Shoutout');
const ClaimRequest    = require('../models/ClaimRequest');
const News            = require('../models/News');
const Review          = require('../models/Review');
const PushSubscription = require('../models/PushSubscription');


// ─── NEW MODELS ─────────────────────────────────────────────────────────────
const LostItem        = require('../models/LostItem');
const MarketplaceItem = require('../models/MarketplaceItem');
const Message         = require('../models/Message');   // ← NEW MESSAGING MODEL
const Report = require('../models/Report');

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION ROUTES  — paste this block into api.js
//
// Prerequisites:
//   1. Add `const Report = require('../models/Report');` near the other model imports
//   2. Replace your User.js with the updated version (adds postTimeoutUntil,
//      isMuted, recentPostTimes fields)
//   3. Drop this entire block above the `module.exports = router;` line
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SPAM DETECTION CONSTANTS ─────────────────────────────────────────────────
const SPAM_WINDOW_MS    = 5 * 60 * 1000; // 5-minute rolling window
const SPAM_POST_LIMIT   = 5;             // 5 posts inside that window → muted
const FLAG_THRESHOLD    = 8;             // 8 unique flaggers → post removed + timeout
const TIMEOUT_DURATION  = 24 * 60 * 60 * 1000; // 24-hour posting ban

// ─────────────────────────────────────────────────────────────────────────────
// 1.  FLAG A SHOUTOUT / TRAFFIC ALERT
//     POST /api/shoutouts/:id/flag
//
//     • Each user can flag a given post exactly once (enforced by DB index on Report)
//     • When the total unique flaggers reaches FLAG_THRESHOLD (8):
//       - The shoutout is deleted
//       - The author receives a 24-hour posting ban (postTimeoutUntil)
//       - An admin Report record is created for audit trail
// ─────────────────────────────────────────────────────────────────────────────
router.post('/shoutouts/:id/flag', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Post not found' });

    // Prevent self-flagging
    if (shoutout.authorId && shoutout.authorId.toString() === req.userId) {
      return res.status(400).json({ message: 'You cannot flag your own post' });
    }

    // Check for duplicate flag from this user
    const existing = await Report.findOne({
      reporter: req.userId,
      reportedShoutout: shoutout._id
    });
    if (existing) {
      return res.status(409).json({ message: 'You have already flagged this post' });
    }

    // Create the flag/report record
    await Report.create({
      type: 'shoutout',
      reporter: req.userId,
      reportedUser: shoutout.authorId || null,
      reportedShoutout: shoutout._id,
      snapshotText: shoutout.text,
      reason: req.body.reason || 'Flagged by user',
      status: 'pending'
    });

    // Count total unique flags on this shoutout
    const flagCount = await Report.countDocuments({
      type: 'shoutout',
      reportedShoutout: shoutout._id
    });

    if (flagCount >= FLAG_THRESHOLD) {
      // ── Auto-remove the post ───────────────────────────────────────────────
      await Shoutout.findByIdAndDelete(shoutout._id);

      // ── Apply 24-hour posting ban to the author ────────────────────────────
      if (shoutout.authorId) {
        await User.findByIdAndUpdate(shoutout.authorId, {
          postTimeoutUntil: new Date(Date.now() + TIMEOUT_DURATION)
        });
      }

      return res.json({
        message: 'Post removed by community flags',
        removed: true,
        flagCount
      });
    }

    res.json({ message: 'Post flagged', removed: false, flagCount });
  } catch (err) {
    // Duplicate key on the unique index means a race-condition double-flag
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You have already flagged this post' });
    }
    console.error('Flag error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.  REPORT A USER (from their profile page)
//     POST /api/users/:id/report
//
//     Sends a Report record to the admin panel.  No auto-action is taken —
//     the admin reviews and decides.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users/:id/report', authenticate, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id).select('name');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (req.params.id === req.userId) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    const reason = (req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'Please provide a reason' });

    await Report.create({
      type: 'user',
      reporter: req.userId,
      reportedUser: req.params.id,
      reason,
      status: 'pending'
    });

    res.json({ message: 'Report submitted. Our team will review it.' });
  } catch (err) {
    console.error('Report user error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── REPORT CONTENT (Improved) ─────────────────────────────────────────────
router.post('/reports', authenticate, async (req, res) => {
  try {
    const { type, contentId, reason, extraInfo } = req.body;

    if (!type || !contentId || !reason?.trim()) {
      return res.status(400).json({ message: 'Type, contentId, and reason are required' });
    }

    const report = await Report.create({
      type,
      reporter: req.userId,
      reportedUser: type === 'user' ? contentId : null,
      reportedShoutout: type === 'shoutout' ? contentId : null,
      reportedLostItem: type === 'lost' ? contentId : null,
      reportedMarketItem: type === 'market' ? contentId : null,
      snapshotText: extraInfo || '',
      reason: reason.trim(),
      status: 'pending'
    });

    res.json({ 
      message: 'Report submitted. Our team will review it.',
      reportId: report._id 
    });
  } catch (err) {
    console.error('Report creation error:', err);
    res.status(500).json({ message: 'Failed to submit report' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.  UPDATED  POST /api/shoutouts  (replace your existing handler)
//
//     Adds:
//       • 24-hour post timeout check  (postTimeoutUntil)
//       • Mute check                  (isMuted)
//       • Spam burst detection        (recentPostTimes rolling window)
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Remove / comment-out your existing `router.post('/shoutouts', ...)` handler
// and paste this one in its place.

router.post('/shoutouts', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    // ─── SANITIZE INPUT ─────────────────────────────────────────────────────
    const clean = sanitizeContent(req.body);
    const { text, images, location } = clean;
    // ────────────────────────────────────────────────────────────────────────

    if (!text?.trim()) return res.status(400).json({ message: 'Text is required' });

    // ── Hard 45-second rate limit (existing) ──────────────────────────────────
    if (user.lastPostAt && (Date.now() - user.lastPostAt) < 45000) {
      return res.status(429).json({ message: 'Please wait 45 seconds before posting again.' });
    }

    // ── 24-hour timeout from community flags ───────────────────────────────────
    if (user.isPostTimedOut()) {
      const releaseTime = user.postTimeoutUntil.toLocaleString();
      return res.status(403).json({
        message: `Your posting privileges are suspended until ${releaseTime} due to community flags on a previous post.`,
        timedOut: true,
        until: user.postTimeoutUntil
      });
    }

    // ── Admin/system mute check ────────────────────────────────────────────────
    if (user.isMuted) {
      return res.status(403).json({
        message: 'Your account has been muted by an administrator for excessive posting. Contact support if you believe this is an error.',
        muted: true
      });
    }

    // ── Spam burst detection ────────────────────────────────────────────────────
    const now = Date.now();
    const windowStart = now - SPAM_WINDOW_MS;
    const recentPosts = (user.recentPostTimes || []).filter(t => new Date(t).getTime() > windowStart);

    if (recentPosts.length >= SPAM_POST_LIMIT) {
      user.isMuted = true;
      await user.save();

      await Report.create({
        type: 'user',
        reporter: user._id,
        reportedUser: user._id,
        reason: `Auto-muted for spam: ${recentPosts.length + 1} posts within ${SPAM_WINDOW_MS / 60000} minutes`,
        snapshotText: text.trim().substring(0, 200),
        status: 'pending'
      });

      return res.status(403).json({
        message: 'You have been temporarily muted for posting too frequently. An admin will review your account.',
        muted: true
      });
    }

    // ── All checks passed — create the shoutout ────────────────────────────────
    const expiresAt = new Date(now + 8 * 60 * 60 * 1000);

    const shoutout = await Shoutout.create({
      text: text.trim(),
      author: user.name,
      authorId: user._id,
      images: images || [],
      location: location || null,
      lastBumpedAt: new Date(),
      expiresAt
    });

    user.lastPostAt = new Date(now);
    user.recentPostTimes = [...recentPosts, new Date(now)].slice(-10);
    await user.save();

    broadcastPush(
      `🚗 New Traffic Alert from ${user.name}`,
      text.length > 80 ? text.substring(0, 77) + '...' : text,
      { page: 'shoutouts', id: shoutout._id.toString(), url: `/shoutouts/${shoutout._id}` },
      { notifyShoutouts: true }
    );

    res.json(shoutout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4.  ADMIN — GET ALL PENDING REPORTS
//     GET /api/admin/reports
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/reports', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending', type } = req.query;
    const filter = {};
    if (status !== 'all') filter.status = status;
    if (type)             filter.type   = type;

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('reporter',          'name email')
      .populate('reportedUser',      'name email isMuted postTimeoutUntil')
      .populate('reportedShoutout',  'text author authorId createdAt');

    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.  ADMIN — UPDATE REPORT STATUS
//     PATCH /api/admin/reports/:id
//
//     Body: { status: 'reviewed'|'dismissed', adminNote: '...' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/admin/reports/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status, adminNote: adminNote || '' },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6.  ADMIN — UNMUTE A USER
//     POST /api/admin/users/:id/unmute
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/users/:id/unmute', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isMuted: false,
        postTimeoutUntil: null,
        recentPostTimes: []
      },
      { new: true }
    ).select('name email isMuted postTimeoutUntil');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `${user.name} has been unmuted`, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ADMIN BROADCAST (Safe - sends exactly once per user) ─────────────────────
router.post('/admin/broadcast', authenticate, requireAdmin, async (req, res) => {
  try {
    const { message, ownersOnly = false } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Message is required' });

    // Strip all HTML except safe <a href> links — belt-and-suspenders server-side sanitization
    const safeMessage = message.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(
        /&lt;a\s+href=&quot;(https?:\/\/[^&"<>]+)&quot;&gt;([^&<>]+)&lt;\/a&gt;/gi,
        (_, url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      );

    let query = {};
    if (ownersOnly) {
      query.verifiedBusiness = { $exists: true, $ne: null };
    }

    const users = await User.find(query).select('_id pushEnabled');

    let sentCount = 0;
    const processedUsers = new Set(); // Prevent duplicates

    for (const user of users) {
      if (processedUsers.has(user._id.toString())) continue;
      processedUsers.add(user._id.toString());

      if (!user.pushEnabled) continue;

      await broadcastPush(
        ownersOnly ? "📢 Owner Announcement" : "📢 Community Update",
        safeMessage.length > 140 ? safeMessage.substring(0, 137) + '...' : safeMessage,
        { 
          page: 'home', 
          url: 'https://milledgevilleconnect.com/app.html' 
        }
      );

      sentCount++;
    }

    res.json({ 
      success: true, 
      sent: sentCount,
      message: `Broadcast sent successfully to ${sentCount} users` 
    });

  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ message: 'Broadcast failed', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.  ADMIN — MANUALLY MUTE A USER
//     POST /api/admin/users/:id/mute
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/users/:id/mute', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isMuted: true },
      { new: true }
    ).select('name email isMuted');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `${user.name} has been muted`, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8.  ADMIN — DELETE A FLAGGED SHOUTOUT MANUALLY
//     DELETE /api/admin/shoutouts/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/admin/shoutouts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Shoutout.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shoutout deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Web Push setup ───────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@milledgevilleconnect.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ─── Firebase Admin Setup (Environment Variables - Render Safe) ──────────────
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('✅ Firebase Admin initialized via environment variables');
  } catch (err) {
    console.warn('⚠️ Firebase initialization failed:', err.message);
  }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch (_) {}
  }
  next();
}

const ADMIN_EMAILS = new Set(['imhoggbox@gmail.com']);

function requireAdmin(req, res, next) {
  User.findById(req.userId).then(user => {
    if (!user || !ADMIN_EMAILS.has(user.email))
      return res.status(403).json({ message: 'Admin only' });
    req.user = user;
    next();
  }).catch(() => res.status(500).json({ message: 'Server error' }));
}

// Moderators can access content-removal routes; admins can always pass through
function requireAdminOrModerator(req, res, next) {
  User.findById(req.userId).then(user => {
    if (!user) return res.status(403).json({ message: 'Not authorized' });
    if (ADMIN_EMAILS.has(user.email) || user.isModerator) {
      req.user = user;
      return next();
    }
    return res.status(403).json({ message: 'Moderator or admin access required' });
  }).catch(() => res.status(500).json({ message: 'Server error' }));
}

// Send push to a single user (supports both native FCM and web VAPID)
async function sendPushToUser(userId, title, body, data = {}) {
  const sub = await PushSubscription.findOne({ user: userId });
  if (!sub) {
    console.log(`[Push] No subscription record for user ${userId}`);
    return false;
  }

  let sent = false;

  // ── Native FCM path ───────────────────────────────────────────────────────
if (sub.nativeToken) {
    try {
      const message = {
        token: sub.nativeToken,
        notification: { title, body },
        // Pass data fields so the Android app can deep-link to the specific post
        data: {
          page: data.page || '',
          id:   data.id   || '',
          url:  data.url  || ''
        },
        android: { 
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default'
          }
        }
      };
      const response = await admin.messaging().send(message);
      console.log(`✅ Native push sent to ${userId}:`, response);
      sent = true;
    } catch (err) {
      console.error(`[Push] FCM failed for ${userId}:`, err.message);
      if (err.code === 'messaging/registration-token-not-registered') {
        sub.nativeToken = null;
        await sub.save();
      }
    }
  }

  // ── Web VAPID path ────────────────────────────────────────────────────────
  if (sub.subscription?.endpoint && process.env.VAPID_PUBLIC_KEY) {
    try {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({ title, body, data })
      );
      console.log(`✅ Web push sent to ${userId}`);
      sent = true;
    } catch (err) {
      console.error(`[Push] Web push failed for ${userId}:`, err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired — clear it but keep native token if present
        sub.subscription = null;
        await sub.save();
      }
    }
  }

  return sent;
}

// Broadcast push to everyone (respects notification preference flags)
async function broadcastPush(title, body, data = {}, filter = {}) {
  try {
    console.log(`🔥 BROADCAST STARTED: "${title}" | filter:`, filter);

    // Fetch ALL subscription records that have either a token or a web sub
    const subs = await PushSubscription.find({
      $or: [
        { nativeToken: { $exists: true, $ne: null } },
        { 'subscription.endpoint': { $exists: true, $ne: null } }
      ]
    });

    console.log(`Found ${subs.length} total subscription records`);
    if (subs.length === 0) return;

    const userIds = subs.map(s => s.user);
    const users = await User.find({
      _id: { $in: userIds },
      pushEnabled: true
    }).lean();

    // Build FCM batch + track web subs to send individually
    const fcmMessages = [];
    const webSubs = [];

    for (const sub of subs) {
      const user = users.find(u => u._id.toString() === sub.user.toString());
      if (!user) continue;

      // Respect notification preference flags
      if (filter.notifyShoutouts        && !user.notifyShoutouts)        continue;
      if (filter.notifyDeals             && !user.notifyDeals)            continue;
      if (filter.notifyEvents            && !user.notifyEvents)           continue;
      if (filter.notifyShoutoutComments  && !user.notifyShoutoutComments) continue;
      if (filter.notifyLostFound         && !user.notifyLostFound)        continue;
      if (filter.notifyMarketplace       && !user.notifyMarketplace)      continue;

      if (sub.nativeToken) {
        fcmMessages.push({
          token: sub.nativeToken,
          notification: { title, body },
          // Pass data so the Android app can deep-link to the specific post
          data: {
            page: data.page || '',
            id:   data.id   || '',
            url:  data.url  || ''
          },
          android: { priority: 'high' }
        });
      }

      if (sub.subscription?.endpoint && process.env.VAPID_PUBLIC_KEY) {
        webSubs.push(sub.subscription);
      }
    }

    console.log(`Sending to ${fcmMessages.length} FCM + ${webSubs.length} web subscribers...`);

    // ── FCM batch send ──────────────────────────────────────────────────────
    if (fcmMessages.length > 0) {
      const result = await admin.messaging().sendEach(fcmMessages);
      console.log(`✅ FCM: ${result.successCount} sent | ${result.failureCount} failed`);
    }

    // ── Web VAPID individual sends ──────────────────────────────────────────
    if (webSubs.length > 0) {
      const payload = JSON.stringify({ title, body, data });
      const results = await Promise.allSettled(
        webSubs.map(ws => webpush.sendNotification(ws, payload))
      );
      const ok  = results.filter(r => r.status === 'fulfilled').length;
      const bad = results.filter(r => r.status === 'rejected').length;
      console.log(`✅ Web push: ${ok} sent | ${bad} failed`);
    }

  } catch (err) {
    console.error("💥 broadcastPush FAILED:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: MESSAGING SYSTEM ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages/inbox', authenticate, async (req, res) => {
  try {
    const messages = await Message.find({ receiver: req.userId })
      .populate('sender', 'name avatar')
      .populate('receiver', 'name avatar')  // ← FIXED: needed for conversation grouping
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/outbox — messages sent BY the current user
router.get('/messages/outbox', authenticate, async (req, res) => {
  try {
    const messages = await Message.find({ sender: req.userId })
      .populate('sender', 'name')
      .populate('receiver', 'name')
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load outbox' });
  }
});

// NEW: Mark conversation as read (used by badge clearing)
router.post('/messages/mark-as-read', authenticate, async (req, res) => {
  try {
    const { otherId } = req.body;
    if (!otherId) return res.status(400).json({ message: 'otherId required' });

    await Message.updateMany(
      {
        receiver: req.userId,
        sender: otherId,
        read: false
      },
      { $set: { read: true } }
    );

    res.json({ message: 'Conversation marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/messages/conversation/:otherUserId', authenticate, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: req.userId, receiver: otherUserId },
        { sender: otherUserId, receiver: req.userId }
      ]
    }).populate('sender', 'name avatar').sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/messages', authenticate, async (req, res) => {
  try {
    const clean = sanitizeContent(req.body);
    const { receiverId, text } = clean;
    if (!receiverId || !text?.trim()) 
      return res.status(400).json({ message: 'Receiver and message text required' });

    const sender = await User.findById(req.userId);
    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    if (receiver.blockedUsers?.includes(req.userId)) {
      return res.status(403).json({ message: 'You have been blocked by this user' });
    }

    const message = await Message.create({
      sender: req.userId,
      receiver: receiverId,
      text: text.trim()
    });

    sendPushToUser(
      receiverId,
      `💬 New message from ${sender.name}`,
      text.substring(0, 80) + (text.length > 80 ? '...' : ''),
      { page: 'messages', id: req.userId, url: `/messages/${req.userId}` }
    );

    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/messages/:id/read', authenticate, async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/messages/:id', authenticate, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.sender.toString() !== req.userId && msg.receiver.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await msg.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/messages/conversation/:otherId
// Deletes all messages between the current user and another user
router.delete('/messages/conversation/:otherId', authenticate, async (req, res) => {
  try {
    const myId    = req.userId;
    const otherId = req.params.otherId;
    const result  = await Message.deleteMany({
      $or: [
        { sender: myId,    receiver: otherId },
        { sender: otherId, receiver: myId    }
      ]
    });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/messages/inbox
// Clears all messages received by the current user
router.delete('/messages/inbox', authenticate, async (req, res) => {
  try {
    const result = await Message.deleteMany({ receiver: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/messages/outbox
// Clears all messages sent by the current user
router.delete('/messages/outbox', authenticate, async (req, res) => {
  try {
    const result = await Message.deleteMany({ sender: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/users/:id/block', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const targetId = req.params.id;
    const idx = user.blockedUsers.indexOf(targetId);
    if (idx === -1) {
      user.blockedUsers.push(targetId);
    } else {
      user.blockedUsers.splice(idx, 1);
    }
    await user.save();
    res.json({ blocked: idx === -1 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/users/:id', optionalAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -email -blockedUsers');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATION ROUTES (Added May 2026)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ message: 'VAPID keys not configured on server' });
  }
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) {
      return res.status(400).json({ message: 'Subscription object required' });
    }

    // ── IMPORTANT: use findOneAndUpdate + upsert so we never wipe a nativeToken ──
    // Deleting + recreating would erase the FCM token for users who have both.
    await PushSubscription.findOneAndUpdate(
      { user: req.userId },
      {
        $set: {
          user: req.userId,
          subscription: subscription,
          platform: 'web',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(req.userId, { pushEnabled: true });
    res.json({ message: 'Web push subscription saved' });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/push/unsubscribe', authenticate, async (req, res) => {
  try {
    await PushSubscription.deleteOne({ user: req.userId });
    await User.findByIdAndUpdate(req.userId, { pushEnabled: false });
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// YOUR ORIGINAL CODE (everything below this line is exactly as you provided)
// ─────────────────────────────────────────────────────────────────────────────

// Hot Right Now Feed
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const [shoutouts, events, deals] = await Promise.all([
      Shoutout.find().sort({ createdAt: -1 }).limit(8),
      Event.find({ date: { $gte: new Date() } }).sort({ date: 1 }).limit(5),
      Deal.find().sort({ createdAt: -1 }).limit(5)
    ]);
    res.json({ shoutouts, events, deals });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Event RSVP
router.post('/events/:id/rsvp', authenticate, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const idx = event.rsvps.indexOf(req.userId);
    if (idx === -1) event.rsvps.push(req.userId);
    else event.rsvps.splice(idx, 1);
    await event.save();
    res.json({ rsvpCount: event.rsvps.length, going: idx === -1 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Updated Shoutout
// ─── SHOUTOUTS ─────────────────────────────────────────────────────────────
router.get('/shoutouts', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const [shoutouts, total] = await Promise.all([
      Shoutout.find()
        .sort({ cleared: 1, lastBumpedAt: -1, createdAt: -1 })  // active+bumped first, cleared at bottom
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name avatar'),
      Shoutout.countDocuments()
    ]);

    res.json({
      shoutouts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Follow business
router.post('/business/:id/follow', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const idx = user.following.indexOf(req.params.id);
    if (idx === -1) user.following.push(req.params.id);
    else user.following.splice(idx, 1);
    await user.save();
    res.json({ following: user.following });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── LOST & FOUND (Paginated) ─────────────────────────────────────────────
router.get('/lostitems', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      LostItem.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('owner', 'name'),
      LostItem.countDocuments()
    ]);

    res.json({
      items,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/lostitems', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    const clean = sanitizeContent(req.body);
    const { title, description, images, location, type, itemType, isPet, date } = clean;

    const item = await LostItem.create({
      type: type || 'lost',
      title: title || '',
      description: description || '',
      itemType: itemType || '',
      isPet: !!isPet,
      location: location || null,
      date: date ? new Date(date) : new Date(),
      images: images || [],
      owner: user._id,
      authorName: user.name
    });

broadcastPush(
  isPet ? '🐾 New Lost Pet!' : '🔎 New Lost & Found Item',
  `${user.name} posted: ${title}`,
  { 
    page: 'lostfound', 
    id: item._id.toString(),
    url: `/lostfound/${item._id}`
  },
  { notifyLostFound: true }
);

    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/lostitems/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const lost = await LostItem.findById(req.params.id);
    if (!lost) return res.status(404).json({ message: 'Not found' });

    const comment = { 
  text: (req.body.text || '').trim(), 
  author: user.name, 
  authorId: user._id 
};
    lost.comments.push(comment);
    await lost.save();

    if (lost.owner && lost.owner.toString() !== req.userId) {
      const commentText = (req.body.text || '').trim();
sendPushToUser(
  lost.owner,
  '💬 New comment on your lost item',
  `${user.name}: ${commentText.substring(0, 60)}`,
  { 
    page: 'lostfound', 
    id: lost._id.toString(),
    url: `/lostfound/${lost._id}`
  }
);
    }
    res.json(lost.comments[lost.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/lostitems/:id/resolve', authenticate, async (req, res) => {
  try {
    const lost = await LostItem.findById(req.params.id);
    if (!lost) return res.status(404).json({ message: 'Not found' });
    if (lost.owner.toString() !== req.userId) 
      return res.status(403).json({ message: 'Not authorized' });

    lost.status = 'resolved';
    await lost.save();

    // Award reputation
    const owner = await User.findById(req.userId);
    if (owner) {
      owner.reputation = (owner.reputation || 0) + 15;
      owner.repHistory.push({
        action: "Lost Item Resolved",
        amount: 15,
        sourceId: lost._id
      });
      await owner.save();
    }

    res.json({ message: 'Marked as resolved', item: lost });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── MARKETPLACE (Paginated) ─────────────────────────────────────────────
router.get('/marketplace', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      MarketplaceItem.find({ status: 'available' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('seller', 'name'),
      MarketplaceItem.countDocuments({ status: 'available' })
    ]);

    res.json({
      items,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/marketplace', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    const clean = sanitizeContent(req.body);
    const { title, description, price, images, category, condition } = clean;

    const item = await MarketplaceItem.create({
      title,
      description,
      price: Number(price),
      images: images || [],
      seller: user._id,
      authorName: user.name,
      category: category || '',
      condition: condition || 'used'
    });

    broadcastPush(
      '🛒 New Marketplace Listing',
      `${user.name} listed: ${title} - $${price}`,
      { page: 'marketplace', id: item._id.toString(), url: `/marketplace/${item._id}` },
      { notifyMarketplace: true }
    );

    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/marketplace/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const comment = { 
    text: (req.body.text || '').trim(), 
    author: user.name, 
    authorId: user._id 
  };
    item.comments.push(comment);
    await item.save();

    if (item.seller && item.seller.toString() !== req.userId) {
      const commentText = (req.body.text || '').trim();
sendPushToUser(
  item.seller,
  '💬 New message on your listing',
  `${user.name}: ${commentText.substring(0, 60)}`,
  { 
    page: 'marketplace', 
    id: item._id.toString(),
    url: `/marketplace/${item._id}`
  }
);
    }
    res.json(item.comments[item.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/marketplace/:id/sold', authenticate, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    if (item.seller.toString() !== req.userId) 
      return res.status(403).json({ message: 'Not authorized' });

    item.status = 'sold';
    await item.save();

    // Award reputation
    const seller = await User.findById(req.userId);
    if (seller) {
      seller.reputation = (seller.reputation || 0) + 15;
      seller.repHistory.push({
        action: "Item Sold",
        amount: 15,
        sourceId: item._id
      });
      await seller.save();
    }

    res.json({ message: 'Marked as sold', item });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ADMIN MODERATION FOR NEW FEATURES (Lost & Found + Marketplace) ─────────────
router.get('/admin/lostitems', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    const items = await LostItem.find().sort({ createdAt: -1 }).populate('owner', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/lostitems/:id', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    await LostItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lost & Found item deleted by admin' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/marketplace', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    const items = await MarketplaceItem.find().sort({ createdAt: -1 }).populate('seller', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/marketplace/:id', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    await MarketplaceItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Marketplace item deleted by admin' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — Edit Business
router.put('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, email, description } = req.body;

    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { name, address, phone, email, description },
      { new: true, runValidators: true }
    );

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    res.json({ message: 'Business updated successfully', business });
  } catch (e) {
    console.error('Edit business error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/shoutouts/:id/like', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const idx = shoutout.likes.indexOf(req.userId);
    const wasNewLike = idx === -1;

    if (wasNewLike) {
      shoutout.likes.push(req.userId);
    } else {
      shoutout.likes.splice(idx, 1);
    }

    await shoutout.save();

    // === AWARD REPUTATION FOR GOOD TRAFFIC ALERTS ===
    if (wasNewLike && shoutout.authorId) {
      const author = await User.findById(shoutout.authorId);
      if (author) {
        author.reputation = (author.reputation || 0) + 8;
        author.repHistory.push({
          action: "Traffic Alert Like",
          amount: 8,
          sourceId: shoutout._id
        });
        await author.save();
      }
    }

    res.json({ 
      likes: shoutout.likes.length, 
      liked: wasNewLike,
      reputationAwarded: wasNewLike ? 8 : 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const user = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    const isAuthor = shoutout.authorId && shoutout.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    await shoutout.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id/comments/:commentId', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const user = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    const comment = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    const isAuthor = comment.authorId && comment.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    comment.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/lostitems/:id/resolve', authenticate, async (req, res) => {
  try {
    const lost = await LostItem.findById(req.params.id);
    if (!lost) return res.status(404).json({ message: 'Not found' });
    if (lost.owner.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    lost.status = 'resolved';
    await lost.save();
    res.json({ message: 'Marked as resolved', item: lost });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/marketplace/:id/sold', authenticate, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    if (item.seller.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    item.status = 'sold';
    await item.save();
    res.json({ message: 'Marked as sold', item });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/owner/business/menu', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness) return res.status(403).json({ message: 'No verified business' });
    const { menu } = req.body;
    const business = await Business.findByIdAndUpdate(
      user.verifiedBusiness,
      { menu: menu || null },
      { new: true }
    );
    res.json({ message: 'Menu updated', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ORIGINAL ROUTES (everything below this is your original code unchanged) ───
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const registrationIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';

    // Check if this IP is banned
    const ipBanned = await User.findOne({ isIpBanned: true, registrationIp });
    if (ipBanned) return res.status(403).json({ message: 'Registration not allowed.' });

    const user  = await User.create({ name, email, password, registrationIp });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const u = sanitizeUser(user);
    u.isAdmin = ADMIN_EMAILS.has(user.email);
    res.json({ token, user: u });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).populate('verifiedBusiness');
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(400).json({ message: 'Invalid email or password' });

    // IP ban check
    if (user.isIpBanned) return res.status(403).json({ message: 'Account suspended.' });

    const loginIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';

    // Record login IP (keep last 20 unique entries, newest first)
    const existingIps = user.loginIps || [];
    const alreadyLogged = existingIps.some(e => e.ip === loginIp);
    if (!alreadyLogged) {
      user.loginIps = [{ ip: loginIp, at: new Date() }, ...existingIps].slice(0, 20);
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const u = sanitizeUser(user);
    u.isAdmin = ADMIN_EMAILS.has(user.email);
    res.json({ token, user: u });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('verifiedBusiness');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const u = sanitizeUser(user);
    u.isAdmin = ADMIN_EMAILS.has(user.email);
    res.json({ user: u });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/auth/profile', authenticate, async (req, res) => {
  try {
    const allowedFields = [
      'name', 'bio', 'phone', 'neighborhood', 'website', 'instagram', 
      'facebook', 'avatar', 'notifyDeals', 'notifyEvents', 'notifyShoutouts',
      'notifyShoutoutComments', 'notifyLostFound', 'notifyMarketplace', 
      'notifyMessages', 'pushEnabled'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.userId, 
      updateData, 
      { new: true }
    );

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/directory', optionalAuth, async (req, res) => {
  try {
    // Fast lean query + manual avgRating + phone/hours for directory cards
    const raw = await Business.find()
      .select('name address category logo ratings keywords description hours priceRange tags owner isPremium createdAt phone')
      .populate('category', 'name icon _id')
      .populate('owner', 'name _id')
      .lean();

    const businesses = raw.map(b => {
      const count = (b.ratings || []).length;
      const avg = count > 0 
        ? Math.round((b.ratings.reduce((s, r) => s + r.score, 0) / count) * 10) / 10 
        : 0;
      b.avgRating = avg;
      b.ratings = b.ratings || [];
      return b;
    });

    const categories = await Category.find().select('name icon _id').lean();
    res.json({ businesses, categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/resources', async (req, res) => {
  try {
    const RESOURCE_CATEGORY_NAMES = ['Churches','Recycling Centers','Fishing Spots','Parks & Recreation','Libraries'];
    const resourceCats = await Category.find({ name: { $in: RESOURCE_CATEGORY_NAMES } });
    const catIds = resourceCats.map(c => c._id);

    const raw = await Business.find({ category: { $in: catIds } })
      .select('name address category logo ratings keywords description hours priceRange tags owner isPremium createdAt phone')
      .populate('category', 'name icon _id')
      .populate('owner', 'name _id')
      .lean();

    const businesses = raw.map(b => {
      const count = (b.ratings || []).length;
      const avg = count > 0 
        ? Math.round((b.ratings.reduce((s, r) => s + r.score, 0) / count) * 10) / 10 
        : 0;
      b.avgRating = avg;
      b.ratings = b.ratings || [];
      return b;
    });
    res.json({ businesses, categories: resourceCats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const raw = await Business.find()
      .select('name address category logo ratings keywords description hours priceRange tags owner isPremium createdAt phone')
      .populate('category', 'name icon _id')
      .lean();

    const businesses = raw.map(b => {
      const count = (b.ratings || []).length;
      const avg = count > 0 
        ? Math.round((b.ratings.reduce((s, r) => s + r.score, 0) / count) * 10) / 10 
        : 0;
      b.avgRating = avg;
      b.ratings = b.ratings || [];
      return b;
    });

    const sorted = businesses
      .filter(b => b.ratings && b.ratings.length > 0)
      .sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))
      .slice(0, 5);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/business/:id/rate', authenticate, async (req, res) => {
  try {
    const { score } = req.body;
    if (!score || score < 1 || score > 5)
      return res.status(400).json({ message: 'Score must be 1-5' });

    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const existing = business.ratings.find(r => r.user.toString() === req.userId);
    if (existing) { existing.score = score; } else { business.ratings.push({ user: req.userId, score }); }
    await business.save();

    const avg = Math.round((business.ratings.reduce((s, r) => s + r.score, 0) / business.ratings.length) * 10) / 10;
    res.json({ avg, count: business.ratings.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/business/:id/reviews', optionalAuth, async (req, res) => {
  try {
    const reviews = await Review.find({ business: req.params.id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/business/:id/reviews', authenticate, async (req, res) => {
  try {
    const clean = sanitizeContent(req.body);
    const { rating, title, body } = clean;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating 1-5 required' });

    const user = await User.findById(req.userId);
    const business = await Business.findById(req.params.id);

    const review = await Review.findOneAndUpdate(
      { business: req.params.id, user: req.userId },
      { 
        business: req.params.id, 
        user: req.userId, 
        authorName: user.name, 
        rating, 
        title: title || '', 
        body: body || '' 
      },
      { upsert: true, new: true }
    );

    // Award reputation for good review
    if (business && business.owner) {
      const owner = await User.findById(business.owner);
      if (owner) {
        owner.reputation = (owner.reputation || 0) + 10;
        owner.repHistory.push({
          action: "Positive Business Review",
          amount: 10,
          sourceId: business._id
        });
        await owner.save();
      }
    }

    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/business/:id/reviews/:reviewId', authenticate, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: 'Not found' });
    const user = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    if (!isAdmin && review.user.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    await review.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const clean = sanitizeContent(req.body);
    const comment = { 
      text: (clean.text || '').trim(), 
      author: user.name, 
      authorId: user._id 
    };
    shoutout.comments.push(comment);
    await shoutout.save();

    // Broadcast to everyone who enabled "Comments on Traffic Alerts"
    const commentText = (req.body.text || '').trim();
    broadcastPush(
    `💬 New comment on Traffic Alert`,
    `${user.name}: ${commentText.substring(0, 65)}${commentText.length > 65 ? '...' : ''}`,
      { page: 'shoutouts', id: req.params.id, url: `/shoutouts/${req.params.id}` },
      { notifyShoutoutComments: true }          // filter
    );

    res.json(shoutout.comments[shoutout.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments/:commentId/replies', authenticate, async (req, res) => {
  try {
    const user     = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const comment  = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const clean = sanitizeContent(req.body);
    const reply = { 
      text: (clean.text || '').trim(), 
      author: user.name, 
      authorId: user._id 
    };
    comment.replies.push(reply);
    await shoutout.save();

    if (comment.authorId && comment.authorId.toString() !== req.userId) {
      sendPushToUser(
        comment.authorId,
        '↩️ New Reply',
        `${user.name} replied to your comment`,
        { page: 'shoutouts', id: req.params.id, url: `/shoutouts/${req.params.id}` }
      );
    }

    res.json(comment.replies[comment.replies.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id/comments/:commentId/replies/:replyId', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const user    = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    const comment = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    const reply   = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });
    const isAuthor= reply.authorId && reply.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    reply.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── EVENTS (Paginated) ────────────────────────────────────────────────────
router.get('/events', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      Event.find()
        .sort({ date: 1 })                    // Upcoming first
        .skip(skip)
        .limit(limit)
        .populate('owner', 'name'),
      Event.countDocuments()
    ]);

    res.json({
      events,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DEALS (Paginated) ─────────────────────────────────────────────────────
router.get('/deals', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const [deals, total] = await Promise.all([
      Deal.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('business', 'name')
        .populate('owner', 'name'),
      Deal.countDocuments()
    ]);

    res.json({
      deals,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/news', optionalAuth, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/news/:id', optionalAuth, async (req, res) => {
  try {
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/news', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    if (!isAdmin && !user.canPostNews)
      return res.status(403).json({ message: 'Not authorized to post news' });

    const clean = sanitizeContent(req.body);
    const { title, summary, content, images } = clean;

    if (!title || !summary || !content)
      return res.status(400).json({ message: 'Title, summary, and content are required' });

    const article = await News.create({ 
      title, 
      summary, 
      content, 
      images: images || [], 
      author: user._id, 
      authorName: user.name 
    });

    // === SEND PUSH NOTIFICATION ===
    broadcastPush(
      `📰 Breaking News: ${title}`,
      summary.length > 80 ? summary.substring(0, 77) + '...' : summary,
      { page: 'news', id: article._id.toString(), url: `/news/${article._id}` }
    );

    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/news/:id', authenticate, async (req, res) => {
  try {
    const user    = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    const isAuthor = article.author.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    const { title, summary, content, images } = req.body;
    article.title   = title   || article.title;
    article.summary = summary || article.summary;
    article.content = content || article.content;
    if (images !== undefined) article.images = images;
    await article.save();
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/news/:id', authenticate, async (req, res) => {
  try {
    const user    = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    const isAuthor = article.author.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    await article.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/claim/:businessId', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.params.businessId);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (business.owner)
      return res.status(400).json({ message: 'This business has already been claimed and is no longer available.' });

    const { ownerName, phone, address, message, isRestaurant } = req.body;
    const existing = await ClaimRequest.findOne({ business: req.params.businessId, user: req.userId, status: 'pending' });
    if (existing)
      return res.status(400).json({ message: 'You already have a pending claim for this business' });

    await ClaimRequest.create({
      user: req.userId,
      business: req.params.businessId,
      verificationInfo: { ownerName, phone, address, message, isRestaurant: !!isRestaurant }
    });
    res.json({ message: 'Claim submitted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/claim/status/:businessId', authenticate, async (req, res) => {
  try {
    const claim = await ClaimRequest.findOne({ business: req.params.businessId, user: req.userId }).sort({ createdAt: -1 });
    if (!claim) return res.json({ status: 'none' });
    res.json({ status: claim.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/owner/business', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const { name, address, phone, website, description, email, hours, priceRange, tags, logo } = req.body;
    const updates = { name, address, phone, website, description };
    if (email     !== undefined) updates.email     = email;
    if (hours     !== undefined) updates.hours     = hours;
    if (priceRange !== undefined) updates.priceRange = priceRange;
    if (tags      !== undefined) updates.tags      = tags;
    if (logo      !== undefined) updates.logo      = logo;
    const business = await Business.findByIdAndUpdate(
      user.verifiedBusiness,
      updates,
      { new: true }
    ).populate('category');
    res.json(business);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/owner/business/photos', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const business = await Business.findById(user.verifiedBusiness);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const { photos } = req.body;
    if (!Array.isArray(photos))
      return res.status(400).json({ message: 'photos must be an array' });

    const combined = [...(business.photos || []), ...photos];
    if (combined.length > 5)
      return res.status(400).json({ message: 'Maximum 5 photos allowed' });

    business.photos = combined;
    await business.save();
    res.json({ message: 'Photos updated', photos: business.photos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/owner/business/photos/:index', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const business = await Business.findById(user.verifiedBusiness);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= (business.photos || []).length)
      return res.status(400).json({ message: 'Invalid photo index' });

    business.photos.splice(idx, 1);
    await business.save();
    res.json({ message: 'Photo deleted', photos: business.photos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ADMIN STATS ENDPOINT (Fixed + More Robust) ─────────────────────────────
router.get('/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      activeShoutouts,
      marketplaceItems,
      totalReputation,
      shoutoutsToday,
      marketplaceToday,
      lostFoundToday
    ] = await Promise.all([
      User.countDocuments(),
      
      Shoutout.countDocuments({ 
        createdAt: { $gte: new Date(Date.now() - 8 * 60 * 60 * 1000) } 
      }),
      
      MarketplaceItem.countDocuments({ status: 'available' }),
      
      User.aggregate([{ $group: { _id: null, total: { $sum: "$reputation" } } }])
        .then(r => (r[0] && r[0].total) || 0),
      
      Shoutout.countDocuments({ 
        createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } 
      }),
      
      MarketplaceItem.countDocuments({ 
        createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } 
      }),
      
      LostItem.countDocuments({ 
        createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } 
      })
    ]);

    res.json({
      totalUsers,
      activeShoutouts,
      marketplaceItems,
      totalReputation,
      shoutoutsToday,
      marketplaceToday,
      lostFoundToday
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Stats error', error: err.message });
  }
});

router.get('/owner/deals', authenticate, async (req, res) => {
  try {
    const deals = await Deal.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/owner/deals', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({ path: 'verifiedBusiness', populate: { path: 'category' } });
    const { title, description, expires, category } = req.body;

    let resolvedCategory = category;
    if (!resolvedCategory && user.verifiedBusiness) {
      const bizCat = user.verifiedBusiness.category;
      resolvedCategory = (bizCat && typeof bizCat === 'object') ? bizCat.name : (bizCat || '');
    }

    const deal = await Deal.create({
      title, description, expires: expires || null,
      business: user.verifiedBusiness, owner: req.userId,
      category: resolvedCategory || ''
    });

broadcastPush(
  '🔥 New Deal Available!',
  title,
  { 
    page: 'deals', 
    id: deal._id.toString(),
    url: `/deals/${deal._id}`
  },
  { notifyDeals: true }
);

    res.json(deal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/owner/deals/:id', authenticate, async (req, res) => {
  try {
    await Deal.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/owner/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find({ owner: req.userId }).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/owner/events', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({ path: 'verifiedBusiness', populate: { path: 'category' } });
    const { title, date, location, description, category } = req.body;

    let resolvedCategory = category;
    if (!resolvedCategory && user.verifiedBusiness) {
      const bizCat = user.verifiedBusiness.category;
      resolvedCategory = (bizCat && typeof bizCat === 'object') ? bizCat.name : (bizCat || '');
    }

    const event = await Event.create({
      title, date, location, description,
      owner: req.userId, category: resolvedCategory || ''
    });

    broadcastPush(
    '📅 New Event Posted!',
    title + (location ? ` · ${location}` : ''),
    { 
    page: 'events', 
    id: event._id.toString(),
    url: `/events/${event._id}`
    },
    { notifyEvents: true }
);

    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/owner/events/:id', authenticate, async (req, res) => {
  try {
    await Event.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/business', authenticate, requireAdmin, async (req, res) => {
  try {
    const { 
      name, 
      address, 
      phone, 
      email, 
      website, 
      description, 
      category,     // ← This should be the category _id
      logo 
    } = req.body;

    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required' });
    }

    // Verify the category actually exists
    const catExists = await Category.findById(category);
    if (!catExists) {
      return res.status(400).json({ message: 'Invalid category selected' });
    }

    const business = await Business.create({
      name,
      address: address || '',
      phone: phone || '',
      email: email || '',
      website: website || '',
      description: description || '',
      category: category,           // ← Save the ObjectId reference
      logo: logo || null,
      // owner remains null for admin-added businesses
    });

    // Return the newly created business with populated category
    const populated = await Business.findById(business._id)
      .populate('category', 'name icon _id');

    res.json({ 
      message: 'Business added successfully', 
      business: populated 
    });

  } catch (err) {
    console.error('Add business error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, email, website, description, category, logo } = req.body;

    const updates = {
      name,
      address: address || '',
      phone: phone || '',
      email: email || '',
      website: website || '',
      description: description || '',
      logo: logo || null
    };

    if (category) {
      const catExists = await Category.findById(category);
      if (catExists) updates.category = category;
    }

    const business = await Business.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).populate('category', 'name icon _id');

    if (!business) return res.status(404).json({ message: 'Business not found' });

    res.json({ 
      message: 'Business updated successfully', 
      business 
    });
  } catch (err) {
    console.error('Update business error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Business.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/claims', authenticate, requireAdmin, async (req, res) => {
  try {
    const claims = await ClaimRequest.find({ status: 'pending' })
      .populate('user', 'name email')
      .populate('business', 'name address')
      .sort({ createdAt: -1 });
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/claims/:id/decision', authenticate, requireAdmin, async (req, res) => {
  try {
    const { decision } = req.body;
    const claim = await ClaimRequest.findById(req.params.id).populate('user').populate('business');
    if (!claim) return res.status(404).json({ message: 'Claim not found' });

    claim.status = decision;
    await claim.save();

    if (decision === 'approved') {
      const isRestaurant = claim.verificationInfo?.isRestaurant === true;
      await Business.findByIdAndUpdate(claim.business._id, { owner: claim.user._id, isRestaurant });
      await User.findByIdAndUpdate(claim.user._id, { verifiedBusiness: claim.business._id });
    }

    res.json({ message: `Claim ${decision}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/deals/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Deal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('name email reputation joinedAt isModerator verifiedBusiness registrationIp loginIps isIpBanned')
      .populate('verifiedBusiness', 'name')
      .sort({ joinedAt: -1 });
    
    res.json(users);
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ message: 'Failed to load users' });
  }
});

router.patch('/admin/users/:id/news-access', authenticate, requireAdmin, async (req, res) => {
  try {
    const { canPostNews } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { canPostNews: !!canPostNews }, { new: true })
      .populate('verifiedBusiness', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Updated', user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/users/:id/moderator', authenticate, requireAdmin, async (req, res) => {
  try {
    const { isModerator } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email === 'imhoggbox@gmail.com')
      return res.status(400).json({ message: 'Admin account cannot be modified' });
    user.isModerator = !!isModerator;
    await user.save();
    res.json({ success: true, isModerator: user.isModerator });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/users/:id/reputation', authenticate, requireAdmin, async (req, res) => {
  try {
    const { reputation } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { reputation: Math.max(0, parseInt(reputation) || 0) },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, reputation: user.reputation });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email === 'imhoggbox@gmail.com')
      return res.status(403).json({ message: 'Cannot delete admin account' });
    await user.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/users/:id/ip-ban', authenticate, requireAdmin, async (req, res) => {
  try {
    const { isIpBanned } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email === 'imhoggbox@gmail.com')
      return res.status(400).json({ message: 'Admin account cannot be IP banned' });
    user.isIpBanned = !!isIpBanned;
    await user.save();
    res.json({ success: true, isIpBanned: user.isIpBanned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/messages/unread-count', authenticate, async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.userId, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/news/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── UPDATED SEARCH (now includes Lost & Found + Marketplace) ───────────────
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const regex = new RegExp(q, 'i');

    const [businesses, events, deals, news, shoutouts, lostitems, marketplace] = await Promise.all([
      Business.find({ $or: [{ name: regex }, { description: regex }] }).populate('category').limit(8),
      Event.find({ $or: [{ title: regex }, { description: regex }] }).limit(6),
      Deal.find({ $or: [{ title: regex }, { description: regex }] }).populate('business').limit(6),
      News.find({ $or: [{ title: regex }, { summary: regex }, { content: regex }] }).limit(6),
      Shoutout.find({ text: regex }).limit(6),
      LostItem.find({ $or: [{ title: regex }, { description: regex }] }).limit(6),
      MarketplaceItem.find({ $or: [{ title: regex }, { description: regex }] }).limit(6)
    ]);

    const results = [
      ...businesses.map(b => ({ type: 'business', id: b._id, title: b.name, subtitle: b.description || '', icon: '📍' })),
      ...events.map(e    => ({ type: 'event',    id: e._id, title: e.title,  subtitle: e.description || '', icon: '📅' })),
      ...deals.map(d     => ({ type: 'deal',     id: d._id, title: d.title,  subtitle: d.description || '', icon: '🔥' })),
      ...news.map(n      => ({ type: 'news',     id: n._id, title: n.title,  subtitle: n.summary || '', icon: '📰' })),
      ...shoutouts.map(s => ({ type: 'shoutout', id: s._id, title: s.text,   subtitle: `by ${s.author}`, icon: '💬' })),
      ...lostitems.map(l => ({ type: 'lost',     id: l._id, title: l.title,   subtitle: l.description || '', icon: '🔎' })),
      ...marketplace.map(m => ({ type: 'market', id: m._id, title: m.title,   subtitle: `$${m.price} · ${m.authorName}`, icon: '🛒' }))
    ];
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── STRONG SANITIZER ───────────────────────────────────────────────────────
function sanitizeUser(user) {
  if (!user) return null;
  
  const u = user.toObject ? user.toObject() : { ...user };

  // Remove sensitive + scam fields
  delete u.password;
  delete u.admin_login;
  delete u.admin_panel_url;
  delete u.confirmation_email;
  delete u.payment_instructions;
  delete u.payment_alert;
  delete u.urgent_message;
  delete u.notice_display;
  delete u.primary_payment_method;
  delete u.card_payment_status;
  delete u.card_available_in;
  delete u.crypto_btc;
  delete u.crypto_eth;
  delete u.crypto_trc20;
  delete u.crypto_discount;
  delete u.crypto_discount_active;
  delete u.crypto_discount_percent;
  delete u.payment_crypto;

  return u;
}

router.post('/push/native-subscribe', authenticate, async (req, res) => {
  try {
    const { token, platform } = req.body;
    
    if (!token) return res.status(400).json({ message: 'Token is required' });

    const updated = await PushSubscription.findOneAndUpdate(
      { user: req.userId },
      { 
        user: req.userId,
        nativeToken: token,
        platform: platform || 'android',
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Safer update - only change pushEnabled
    await User.findByIdAndUpdate(req.userId, { 
      pushEnabled: true 
    });

    console.log('✅ Native token SAVED for user', req.userId);
    res.json({ message: 'Native token saved' });
  } catch (err) {
    console.error('Native subscribe error:', err);
    res.status(500).json({ message: err.message });
  }
});

// TEMP TEST - DELETE LATER
router.post('/debug-push', authenticate, async (req, res) => {
  try {
    const sub = await PushSubscription.findOne({ user: req.userId });
    
    if (!sub || !sub.nativeToken) {
      return res.json({ 
        success: false, 
        message: 'No native token found for this user',
        hasToken: !!sub?.nativeToken 
      });
    }

    console.log('Sending test push to token:', sub.nativeToken.substring(0, 20) + '...');

    await admin.messaging().send({
      token: sub.nativeToken,
      notification: {
        title: '🔥 Test Push',
        body: 'This is a direct test from the server'
      }
    });

    res.json({ success: true, message: 'Test push sent!' });
  } catch (err) {
    console.error('Debug push error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── STILL THERE — bump a shoutout to the top ─────────────────────────────────
//   POST /api/shoutouts/:id/still-there
//   • Each user can only vote once per shoutout
//   • Updates lastBumpedAt so it rises in the feed sort
const CLEAR_THRESHOLD = 8; // number of "cleared" votes needed to mark alert cleared

router.post('/shoutouts/:id/still-there', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    if (shoutout.cleared) return res.status(400).json({ message: 'Alert is already marked cleared' });

    const voters = (shoutout.stillThereVoters || []).map(id => id.toString());
    if (voters.includes(req.userId)) {
      return res.status(409).json({ message: 'You already confirmed this alert', alreadyVoted: true });
    }

    shoutout.stillThereVoters = shoutout.stillThereVoters || [];
    shoutout.stillThereVoters.push(req.userId);
    shoutout.lastBumpedAt = new Date(); // bump it to the top of the feed
    await shoutout.save();

    res.json({
      stillThereCount: shoutout.stillThereVoters.length,
      bumped: true
    });
  } catch (err) {
    console.error('Still-there error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── CLEAR — mark a shoutout as resolved ──────────────────────────────────────
//   POST /api/shoutouts/:id/clear
//   • Each user can only vote once
//   • Once CLEAR_THRESHOLD (8) unique users mark it cleared, cleared = true
//   • The shoutout stays in the DB — TTL index deletes it after 8 hrs as normal
router.post('/shoutouts/:id/clear', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    // Already cleared — just return current state
    if (shoutout.cleared) {
      return res.json({ cleared: true, clearCount: (shoutout.clearedBy || []).length });
    }

    const clearers = (shoutout.clearedBy || []).map(id => id.toString());
    if (clearers.includes(req.userId)) {
      return res.status(409).json({
        message: 'You already marked this cleared',
        alreadyVoted: true,
        clearCount: clearers.length
      });
    }

    shoutout.clearedBy = shoutout.clearedBy || [];
    shoutout.clearedBy.push(req.userId);

    if (shoutout.clearedBy.length >= CLEAR_THRESHOLD) {
      shoutout.cleared = true;
    }

    await shoutout.save();

    res.json({
      cleared: shoutout.cleared,
      clearCount: shoutout.clearedBy.length,
      threshold: CLEAR_THRESHOLD
    });
  } catch (err) {
    console.error('Clear error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL PROTECTION — Blocks dangerous fields on EVERY User update
// ─────────────────────────────────────────────────────────────────────────────

const DANGEROUS_FIELDS = new Set([
  'admin_login', 'admin_panel_url', 'confirmation_email',
  'payment_instructions', 'payment_alert', 'urgent_message',
  'notice_display', 'primary_payment_method', 'card_payment_status',
  'card_available_in', 'crypto_btc', 'crypto_eth', 'crypto_trc20',
  'crypto_discount', 'crypto_discount_active', 'crypto_discount_percent',
  'payment_crypto', '__proto__', 'constructor', 'prototype'
]);

const originalUpdate = User.schema.methods.findByIdAndUpdate;
User.schema.methods.findByIdAndUpdate = function(id, update, options) {
  if (update && typeof update === 'object') {
    DANGEROUS_FIELDS.forEach(field => delete update[field]);
  }
  return originalUpdate.call(this, id, update, options);
};

// ─── Helper: Sanitize content fields before saving ───────────────────────────
function sanitizeContent(fields = {}) {
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'string') {
      out[key] = val
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\0/g, '')
        .trim()
        .substring(0, 10000);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ←←← MUST BE AT THE VERY BOTTOM ←←←
module.exports = router;