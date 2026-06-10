const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');

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
const Report          = require('../models/Report');
const BusinessPost    = require('../models/BusinessPost'); // ← BUSINESS PHOTO POSTS
const ScheduledNotification = require('../models/ScheduledNotification');

// \u2500\u2500\u2500 Inline model: SpotlightAd (singleton \u2014 only one doc ever exists) \u2500\u2500\u2500\u2500\u2500\u2500
const spotlightAdSchema = new mongoose.Schema({
  image:        { type: String, required: true },
  businessName: { type: String, default: '' },
  link:         { type: String, default: '' },
  updatedAt:    { type: Date, default: Date.now }
});
const SpotlightAd = mongoose.models.SpotlightAd || mongoose.model('SpotlightAd', spotlightAdSchema);
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
const FLAG_THRESHOLD    = 8;             // 8 unique flaggers → post soft-hidden + timeout
const TIMEOUT_DURATION  = 24 * 60 * 60 * 1000; // 24-hour posting ban

// =============================================================================
// AUTO-MODERATION — UNIVERSAL FLAG SYSTEM
// =============================================================================

// ─── CONTENT-TYPE MAP ─────────────────────────────────────────────────────────
// Maps the `type` string from the client to:
//   model        — Mongoose model to query
//   reportField  — which Report field to store the content ID in
//   ownerField   — which field on the doc holds the author/owner user ID
function contentTypeMap(type) {
  const map = {
    shoutout: { model: Shoutout,        reportField: 'reportedShoutout',   ownerField: 'authorId' },
    lost:     { model: LostItem,        reportField: 'reportedLostItem',   ownerField: 'owner'    },
    market:   { model: MarketplaceItem, reportField: 'reportedMarketItem', ownerField: 'seller'   },
    event:    { model: Event,           reportField: 'reportedEvent',      ownerField: 'owner'    },
    deal:     { model: Deal,            reportField: 'reportedDeal',       ownerField: 'owner'    },
    news:     { model: News,            reportField: 'reportedNews',       ownerField: 'author'   },
  };
  return map[type] || null;
}

// ─── HELPER: short text snapshot for the report panel ────────────────────────
function getSnapshotText(doc, type) {
  if (type === 'shoutout') return (doc.text || '').substring(0, 300);
  if (type === 'news')     return `${doc.title || ''} — ${(doc.summary || '').substring(0, 200)}`;
  return `${doc.title || doc.text || ''}`.substring(0, 300);
}

// =============================================================================
// 1.  UNIVERSAL FLAG ENDPOINT
//     POST /api/flag
//
//     Body: { type, contentId, reason? }
//     • Each user can flag a given post exactly once (enforced by flaggedBy array)
//     • At FLAG_THRESHOLD (8) unique flags:
//         - Post is soft-hidden (autoHidden = true) — NOT hard-deleted
//         - Author gets a 24-hour posting timeout
//         - A consolidated auto-mod Report is upserted for the admin panel
// =============================================================================
router.post('/flag', authenticate, async (req, res) => {
  try {
    const { type, contentId, reason } = req.body;

    if (!type || !contentId) {
      return res.status(400).json({ message: 'type and contentId are required' });
    }

    const entry = contentTypeMap(type);
    if (!entry) {
      return res.status(400).json({ message: `Unknown content type: ${type}` });
    }

    const { model, reportField, ownerField } = entry;

    // ── Load the document ────────────────────────────────────────────────────
    const doc = await model.findById(contentId);
    if (!doc) return res.status(404).json({ message: 'Content not found' });

    // ── Block self-flagging ──────────────────────────────────────────────────
    const ownerId = doc[ownerField];
    if (ownerId && ownerId.toString() === req.userId) {
      return res.status(400).json({ message: 'You cannot flag your own post' });
    }

    // ── Block double-flagging (flaggedBy is the source of truth) ─────────────
    const alreadyFlagged = doc.flaggedBy.some(id => id.toString() === req.userId);
    if (alreadyFlagged) {
      return res.status(409).json({ message: 'You have already flagged this post' });
    }

    // ── Block flagging an already-hidden post ────────────────────────────────
    if (doc.autoHidden) {
      return res.status(409).json({ message: 'This post has already been removed for review' });
    }

    // ── Record the flag on the document ─────────────────────────────────────
    doc.flaggedBy.push(req.userId);
    const flagCount = doc.flaggedBy.length;

    // ── Store an individual Report for the audit trail ───────────────────────
    try {
      await Report.create({
        type,
        reporter: req.userId,
        [reportField]: doc._id,
        reportedUser: ownerId || null,
        snapshotText: getSnapshotText(doc, type),
        reason: (reason || 'Flagged by user').trim(),
        status: 'pending'
      });
    } catch (dupErr) {
      // Unique index violation = race-condition double-flag; ignore silently
      if (dupErr.code !== 11000) throw dupErr;
    }

    // ── Threshold reached → soft-hide ────────────────────────────────────────
    if (flagCount >= FLAG_THRESHOLD) {
      doc.autoHidden = true;
      await doc.save();

      // Apply 24-hour posting timeout to the author
      if (ownerId) {
        await User.findByIdAndUpdate(ownerId, {
          postTimeoutUntil: new Date(Date.now() + TIMEOUT_DURATION)
        });
      }

      // Upsert a single consolidated auto-mod Report for the admin panel
      const consolidatedFilter  = { autoFlagged: true, [reportField]: doc._id };
      const consolidatedData    = {
        type,
        reporter: req.userId,
        [reportField]: doc._id,
        reportedUser: ownerId || null,
        snapshotText: getSnapshotText(doc, type),
        reason: `Auto-removed: reached ${flagCount} unique community flags`,
        autoFlagged: true,
        flagCount,
        status: 'pending'
      };

      await Report.findOneAndUpdate(
        consolidatedFilter,
        { $set: consolidatedData },
        { upsert: true, new: true }
      );

      return res.json({
        flagCount,
        removed: true,
        message: 'Post removed by community flags and sent for admin review'
      });
    }

    // ── Threshold not reached — save and return current count ─────────────────
    await doc.save();
    res.json({ flagCount, removed: false, message: `Post flagged (${flagCount}/${FLAG_THRESHOLD})` });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You have already flagged this post' });
    }
    console.error('Flag error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY SHOUTOUT FLAG REDIRECT — keeps old deep-links working
// POST /api/shoutouts/:id/flag  →  delegates to the universal handler
// ─────────────────────────────────────────────────────────────────────────────
router.post('/shoutouts/:id/flag', authenticate, async (req, res) => {
  req.body.type      = 'shoutout';
  req.body.contentId = req.params.id;
  // Re-dispatch through the universal handler by hand (avoids a full redirect round-trip)
  const entry = contentTypeMap('shoutout');
  const { model, reportField, ownerField } = entry;
  try {
    const doc = await model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Post not found' });
    if (doc.authorId && doc.authorId.toString() === req.userId)
      return res.status(400).json({ message: 'You cannot flag your own post' });
    if (doc.flaggedBy.some(id => id.toString() === req.userId))
      return res.status(409).json({ message: 'You have already flagged this post' });
    if (doc.autoHidden)
      return res.status(409).json({ message: 'This post has already been removed for review' });

    doc.flaggedBy.push(req.userId);
    const flagCount = doc.flaggedBy.length;

    try {
      await Report.create({
        type: 'shoutout', reporter: req.userId,
        reportedShoutout: doc._id, reportedUser: doc.authorId || null,
        snapshotText: getSnapshotText(doc, 'shoutout'),
        reason: (req.body.reason || 'Flagged by user').trim(), status: 'pending'
      });
    } catch (dupErr) { if (dupErr.code !== 11000) throw dupErr; }

    if (flagCount >= FLAG_THRESHOLD) {
      doc.autoHidden = true;
      await doc.save();
      if (doc.authorId) {
        await User.findByIdAndUpdate(doc.authorId, {
          postTimeoutUntil: new Date(Date.now() + TIMEOUT_DURATION)
        });
      }
      await Report.findOneAndUpdate(
        { autoFlagged: true, reportedShoutout: doc._id },
        { $set: { type: 'shoutout', reporter: req.userId, reportedShoutout: doc._id,
            reportedUser: doc.authorId || null, snapshotText: getSnapshotText(doc, 'shoutout'),
            reason: `Auto-removed: reached ${flagCount} unique community flags`,
            autoFlagged: true, flagCount, status: 'pending' } },
        { upsert: true, new: true }
      );
      return res.json({ message: 'Post removed by community flags', removed: true, flagCount });
    }

    await doc.save();
    res.json({ message: 'Post flagged', removed: false, flagCount });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'You have already flagged this post' });
    console.error('Flag error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
      reportedUser:       type === 'user'     ? contentId : null,
      reportedShoutout:   type === 'shoutout' ? contentId : null,
      reportedLostItem:   type === 'lost'     ? contentId : null,
      reportedMarketItem: type === 'market'   ? contentId : null,
      reportedEvent:      type === 'event'    ? contentId : null,
      reportedDeal:       type === 'deal'     ? contentId : null,
      reportedNews:       type === 'news'     ? contentId : null,
      reportedComment:    type === 'comment'  ? contentId : null,
      snapshotText: extraInfo || '',
      reason: reason.trim(),
      status: 'pending'
    });

    res.json({ 
      message: 'Report submitted. Our team will review it.',
      _id: report._id  // frontend checks for _id OR message substring
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

router.post('/shoutouts', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    // ─── SANITIZE INPUT ─────────────────────────────────────────────────────
    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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

    // ←←← THIS IS THE IMPORTANT PART ←←←
    // ✅ FIX: if the shoutout has a photo, pass a real https:// thumb URL
    // so the notification shows the image (data: URLs are blocked in push notifications)
    const shoutoutThumb = (shoutout.images && shoutout.images.length > 0)
      ? `https://www.milledgevilleconnect.com/api/shoutout-thumb/${shoutout._id}`
      : null;

    broadcastPush(
      `🚗 New Traffic Alert from ${user.name}`,
      text.length > 80 ? text.substring(0, 77) + '...' : text,
      { 
        page: 'shoutouts', 
        id: shoutout._id.toString() 
      },
      { type: 'shoutout', imageUrl: shoutoutThumb }
    );

    res.json(shoutout);
  } catch (err) {
    console.error(err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// =============================================================================
// ⚠️  DO NOT MOVE THESE ROUTES — they must stay at the top level of the router,
//     NOT nested inside any other route handler's try{} block.
//     Past mistakes: these were accidentally pasted inside the /shoutouts POST
//     handler, causing unpredictable behavior. Keep them here.
// =============================================================================

// STEP 1 — Client sends email, server returns the security question
// POST /api/auth/forgot-password/question
router.post('/auth/forgot-password/question', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() })
                           .select('securityQuestion');

    // Always return the same shape — don't reveal whether the email exists
    if (!user || !user.securityQuestion) {
      return res.status(404).json({ message: 'No account found with that email, or no security question set.' });
    }

    res.json({ question: user.securityQuestion });
  } catch (err) {
    console.error('Forgot password step 1 error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// STEP 2 — Client sends email + answer + new password, server verifies and resets
// POST /api/auth/forgot-password/reset
router.post('/auth/forgot-password/reset', async (req, res) => {
  try {
    const { email, answer, newPassword } = req.body;

    if (!email || !answer || !newPassword) {
      return res.status(400).json({ message: 'Email, answer, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
                           .select('+securityAnswer +password');

    if (!user || !user.securityAnswer) {
      return res.status(404).json({ message: 'No account found with that email.' });
    }

    // Compare answer (case-insensitive, trimmed) against stored hash
    const answerMatch = await bcrypt.compare(
      answer.trim().toLowerCase(),
      user.securityAnswer
    );

    if (!answerMatch) {
      return res.status(401).json({ message: 'Incorrect answer. Please try again.' });
    }

    // Hash and save the new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('Forgot password reset error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/change-password
// ⚠️  DO NOT MOVE — keep at router top level, not inside another handler.
router.post('/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    const user = await User.findById(req.userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// ADMIN AUTO-MOD ROUTES
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/flagged
// Returns only consolidated auto-mod reports (autoFlagged: true).
// Query: ?status=pending|reviewed|dismissed|all  (default: pending)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/flagged', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const filter = { autoFlagged: true };
    if (status !== 'all') filter.status = status;

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('reportedUser',      'name email')
      .populate('reportedShoutout',  'text author authorId autoHidden hidden flaggedBy')
      .populate('reportedLostItem',  'title description authorName autoHidden hidden flaggedBy')
      .populate('reportedMarketItem','title description authorName autoHidden hidden flaggedBy')
      .populate('reportedEvent',     'title description owner autoHidden hidden flaggedBy')
      .populate('reportedDeal',      'title description owner autoHidden hidden flaggedBy')
      .populate('reportedNews',      'title summary authorName autoHidden hidden flaggedBy');

    res.json(reports);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/flagged/:reportId/restore
// • Clears autoHidden + flaggedBy on the content doc
// • Removes the author's 24-hour timeout
// • Marks all individual flag reports for this content as dismissed
// • Marks the consolidated auto-mod report as reviewed
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/flagged/:reportId/restore', authenticate, requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    const entry = contentTypeMap(report.type);
    if (!entry) return res.status(400).json({ message: 'Unknown content type' });

    const { model, reportField } = entry;
    const contentId = report[reportField];
    if (!contentId) return res.status(400).json({ message: 'No content reference on report' });

    const doc = await model.findByIdAndUpdate(
      contentId,
      { $set: { autoHidden: false, flaggedBy: [] } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Content not found — may have been hard-deleted already' });

    // Lift posting timeout from the author
    const ownerId = doc[entry.ownerField];
    if (ownerId) {
      await User.findByIdAndUpdate(ownerId, { $unset: { postTimeoutUntil: '' } });
    }

    const adminNote = (req.body.adminNote || 'Restored by admin — post reviewed and approved').trim();

    report.status    = 'reviewed';
    report.adminNote = adminNote;
    await report.save();

    // Dismiss all individual flag reports for this content
    await Report.updateMany(
      { [reportField]: contentId, autoFlagged: { $ne: true }, status: 'pending' },
      { $set: { status: 'dismissed', adminNote } }
    );

    res.json({ message: 'Post restored and author timeout lifted', docId: contentId });
  } catch (err) {
    console.error('Restore error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/flagged/:reportId
// • Hard-deletes the content document
// • Marks the consolidated report and all individual flag reports as reviewed
// • Leaves the 24-hour author timeout in place
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/admin/flagged/:reportId', authenticate, requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    const entry = contentTypeMap(report.type);
    if (!entry) return res.status(400).json({ message: 'Unknown content type' });

    const { model, reportField } = entry;
    const contentId = report[reportField];

    if (contentId) await model.findByIdAndDelete(contentId);

    const adminNote = (req.body.adminNote || 'Permanently deleted by admin after review').trim();

    report.status    = 'reviewed';
    report.adminNote = adminNote;
    await report.save();

    if (contentId) {
      await Report.updateMany(
        { [reportField]: contentId, autoFlagged: { $ne: true } },
        { $set: { status: 'reviewed', adminNote } }
      );
    }

    res.json({ message: 'Post permanently deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── ADMIN BROADCAST (Fixed - sends exactly once) ─────────────────────────────
router.post('/admin/broadcast', authenticate, requireAdmin, async (req, res) => {
  try {
    const { message, ownersOnly = false } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Message is required' });

    // Safe message
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

    // Send ONE broadcast (broadcastPush already handles all users internally)
    await broadcastPush(
      ownersOnly ? "📢 Owner Announcement" : "📢 Community Update",
      safeMessage.length > 140 ? safeMessage.substring(0, 137) + '...' : safeMessage,
      { 
        page: 'home', 
        url: 'https://milledgevilleconnect.com/app.html' 
      }
    );

    res.json({ 
      success: true, 
      message: 'Broadcast sent successfully to all users' 
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
async function sendPushToUser(userId, title, body, data = {}, imageUrl = null) {
  const sub = await PushSubscription.findOne({ user: userId });
  if (!sub) {
    console.log(`[Push] No subscription record for user ${userId}`);
    return false;
  }

  const APP_ICON   = 'https://www.milledgevilleconnect.com/icon-192.png';
  // Only use a real https:// URL as the notification image.
  // data: URLs are blocked by browsers/FCM in push notifications.
  const notifImage = (imageUrl && imageUrl.startsWith('https://')) ? imageUrl : null;

  if (sub.nativeToken) {
    try {
      const message = {
        token: sub.nativeToken,
        notification: {
          title,
          body,
          // ✅ FIX: Firebase Admin SDK uses "image", NOT "imageUrl"
          ...(notifImage ? { image: notifImage } : {})
        },
        data: {
          page: data.page || '',
          id:   data.id   || '',
          url:  data.url  || ''
        },
        android: {
          priority: 'high',
          notification: {
            sound:     'default',
            channelId: 'default',
            // ✅ FIX: "image" not "imageUrl" here too
            ...(notifImage ? { image: notifImage } : {})
          }
        },
        // iOS support
        ...(notifImage ? {
          apns: {
            payload: { aps: { 'mutable-content': 1 } },
            fcmOptions: { image: notifImage }
          }
        } : {})
      };
      await admin.messaging().send(message);
      console.log(`✅ Native push sent to ${userId}${notifImage ? ' (with image)' : ''}`);
      return true;
    } catch (err) {
      console.error(`[Push] FCM failed for ${userId}:`, err.message);
      if (err.code === 'messaging/registration-token-not-registered') {
        sub.nativeToken = null;
        await sub.save();
      }
      return false;
    }
  }

  if (sub.subscription?.endpoint && process.env.VAPID_PUBLIC_KEY) {
    try {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({
          title,
          body,
          data,
          icon:  APP_ICON,
          badge: APP_ICON,
          // ✅ Only attach image when it's a real https:// URL
          ...(notifImage ? { image: notifImage } : {})
        })
      );
      console.log(`✅ Web push sent to ${userId}${notifImage ? ' (with image)' : ''}`);
      return true;
    } catch (err) {
      console.error(`[Push] Web push failed for ${userId}:`, err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        sub.subscription = null;
        await sub.save();
      }
      return false;
    }
  }

  return false;
}

// ─── UNIFIED BROADCAST (Native FCM + Web VAPID) ─────────────────────────────
// Sends exactly ONE notification per user:
//   • If the user has a native FCM token → use FCM (preferred, higher delivery rate)
//   • Else if the user has a web VAPID subscription → use VAPID
//   • Users with BOTH channels only receive one notification (no duplicates)
// ─── UPDATED BROADCAST PUSH (Respects User Preferences) ─────────────────────
// ─── SAFE UPDATED BROADCAST PUSH (Backward Compatible) ──────────────────────
// ─── IMPROVED BROADCAST PUSH (Respects All Preferences) ─────────────────────
// ─── GLOBAL NOTIFICATION KILL-SWITCH ─────────────────────────────────────────
// When true, push notifications are suppressed for ALL users EXCEPT the
// exempt test accounts listed below.  Toggled by admins via the Broadcast panel.
// In-memory: resets to true (enabled) on server restart — intentional.
let globalNotificationsEnabled = true;
const NOTIFICATION_EXEMPT_EMAILS = ['imhoggbox@gmail.com', 'test@gmail.com'];

// GET /api/admin/notifications/status — returns current switch state
router.get('/admin/notifications/status', authenticate, requireAdmin, (req, res) => {
  res.json({ enabled: globalNotificationsEnabled });
});

// POST /api/admin/notifications/toggle — flips the switch
router.post('/admin/notifications/toggle', authenticate, requireAdmin, (req, res) => {
  globalNotificationsEnabled = !globalNotificationsEnabled;
  console.log(`🔔 Global notifications ${globalNotificationsEnabled ? 'ENABLED' : 'DISABLED'} by admin ${req.userId}`);
  res.json({ enabled: globalNotificationsEnabled });
});

async function broadcastPush(title, body, data = {}, options = {}) {
  const { type = null, subCategory = null, imageUrl = null } = options;

  console.log(`📢 [Broadcast] "${title}" | type: ${type || 'general'} | sub: ${subCategory || 'n/a'}`);

  try {
    const users = await User.find({
      $or: [
        { fcmTokens: { $exists: true, $ne: [] } },
        { pushEnabled: true }
      ]
    }).select('_id email notificationPreferences');

    for (const user of users) {
      const prefs = user.notificationPreferences || {};
      let shouldSend = true;

      // ── Global kill-switch: skip non-exempt users when notifications are off ─
      if (!globalNotificationsEnabled) {
        const isExempt = NOTIFICATION_EXEMPT_EMAILS.includes((user.email || '').toLowerCase());
        if (!isExempt) continue;
      }

      if (!type) {
        // No type passed = send to everyone (old/safe behavior)
        await sendPushToUser(user._id, title, body, data, imageUrl);
        continue;
      }

      switch (type) {
        case 'event':
          if (prefs.events === false) shouldSend = false;
          break;

        case 'deal':
          if (prefs.deals === false) shouldSend = false;
          break;

        case 'shoutout':
          if (prefs.shoutouts === false) shouldSend = false;
          break;

        case 'lost':
          if (prefs.lostFound === false) shouldSend = false;
          break;

        case 'message':
          if (prefs.messages === false) shouldSend = false;
          break;

        case 'comment':
          if (prefs.comments === false) shouldSend = false;
          break;

        case 'marketplace':
          // Master toggle
          if (prefs.marketplace?.all === false) {
            shouldSend = false;
          } 
          // Individual category toggles
          else if (subCategory) {
            const cat = subCategory.toLowerCase();
            if (cat === 'homes' && prefs.marketplace?.homes === false) shouldSend = false;
            if (cat === 'cars' && prefs.marketplace?.cars === false) shouldSend = false;
            if (cat === 'furniture' && prefs.marketplace?.furniture === false) shouldSend = false;
            if (cat === 'other' && prefs.marketplace?.other === false) shouldSend = false;
          }
          break;

        case 'news':
          if (prefs.news === false) shouldSend = false;
          break;

        case 'custom':
          // Verified business custom notifications — always send
          shouldSend = true;
          break;

        default:
          shouldSend = true;
      }

      if (shouldSend) {
        await sendPushToUser(user._id, title, body, data, imageUrl);
      }
    }
  } catch (err) {
    console.error('broadcastPush error:', err);
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/messages', authenticate, async (req, res) => {
  try {
    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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

    // Check receiver's messages preference before sending push
    const receiverUser = await User.findById(receiverId).select('notificationPreferences');
    if (!receiverUser || receiverUser.notificationPreferences?.messages !== false) {
      sendPushToUser(
        receiverId,
        `💬 New message from ${sender.name}`,
        text.substring(0, 80) + (text.length > 80 ? '...' : ''),
        { page: 'messages', id: req.userId, url: `/messages/${req.userId}` }
      );
    }

    res.json(message);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.patch('/messages/:id/read', authenticate, async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    res.json(msg);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// DELETE /api/messages/inbox
// Clears all messages received by the current user
router.delete('/messages/inbox', authenticate, async (req, res) => {
  try {
    const result = await Message.deleteMany({ receiver: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// DELETE /api/messages/outbox
// Clears all messages sent by the current user
router.delete('/messages/outbox', authenticate, async (req, res) => {
  try {
    const result = await Message.deleteMany({ sender: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/users/:id', optionalAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -email -blockedUsers');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/push/unsubscribe', authenticate, async (req, res) => {
  try {
    await PushSubscription.deleteOne({ user: req.userId });
    await User.findByIdAndUpdate(req.userId, { pushEnabled: false });
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
        .select('-images')
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/lostitems', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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

const lostItemThumb = (item.images && item.images.length > 0)
  ? `https://www.milledgevilleconnect.com/api/lostitem-thumb/${item._id}`
  : null;

broadcastPush(
  isPet ? '🐾 New Lost Pet!' : '🔎 New Lost & Found Item',
  `${user.name} posted: ${title}`,
  { 
    page: 'lostfound', 
    id: item._id.toString(),
    url: `/lostfound/${item._id}`
  },
  { type: 'lost', imageUrl: lostItemThumb }
);

    res.json(item);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/lostitems/:id — fetch single lost/found item by ID
router.get('/lostitems/:id', optionalAuth, async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
      const itemOwner = await User.findById(lost.owner).select('notificationPreferences');
      if (!itemOwner || itemOwner.notificationPreferences?.comments !== false) {
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
    }
    res.json(lost.comments[lost.comments.length - 1]);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
        .select('-images')
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/marketplace', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
    const { title, description, price, images, category, condition, homeNotifDetails } = clean;

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

    // ── Community notification — sent for every new marketplace listing ──
    {
      let notifBody = '';

      if (category === 'Homes' && homeNotifDetails) {
        const { type, beds, baths, address } = homeNotifDetails;
        const parts = [];
        if (type) parts.push(type === 'rent' ? 'For Rent' : 'For Sale');
        if (beds)  parts.push(`${beds}bd`);
        if (baths) parts.push(`${baths}ba`);
        if (price && Number(price) > 0) parts.push(`$${Number(price).toLocaleString()}${type === 'rent' ? '/mo' : ''}`);
        if (address) parts.push(address);
        notifBody = parts.join(' · ');
      } else {
        notifBody = price && Number(price) > 0
          ? `${title} — $${Number(price).toLocaleString()}`
          : title;
      }

      const notifTitle = category === 'Homes'
        ? `🏠 New Home Listing from ${user.name}`
        : `🛒 New Marketplace Listing from ${user.name}`;

      const marketplaceThumb = (item.images && item.images.length > 0)
        ? `https://www.milledgevilleconnect.com/api/marketplace-thumb/${item._id}`
        : null;

      broadcastPush(
        notifTitle,
        notifBody,
        { page: 'marketplace', id: item._id.toString() },
        { type: 'marketplace', subCategory: category, imageUrl: marketplaceThumb }
      );
    }

    res.json(item);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/marketplace/:id — fetch single marketplace item by ID
router.get('/marketplace/:id', optionalAuth, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
      const sellerUser = await User.findById(item.seller).select('notificationPreferences');
      if (!sellerUser || sellerUser.notificationPreferences?.comments !== false) {
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
    }
    res.json(item.comments[item.comments.length - 1]);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── ADMIN MODERATION FOR NEW FEATURES (Lost & Found + Marketplace) ─────────────
router.get('/admin/lostitems', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    const items = await LostItem.find().sort({ createdAt: -1 }).populate('owner', 'name');
    res.json(items);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/admin/lostitems/:id', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    await LostItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lost & Found item deleted by admin' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/admin/marketplace', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    const items = await MarketplaceItem.find().sort({ createdAt: -1 }).populate('seller', 'name');
    res.json(items);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/admin/marketplace/:id', authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    await MarketplaceItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Marketplace item deleted by admin' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── OWNER: CUSTOM NOTIFICATION ─────────────────────────────────────────────
router.post('/owner/custom-notification', authenticate, async (req, res) => {
  try {
    // ✅ FIX: also read imageUrl from request body so biz dashboard images work
    const { title, body, imageUrl } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ message: 'Title and body required' });
    }

    // Must have a verified business
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.verifiedBusiness) {
      return res.status(403).json({ message: 'Only verified business owners can send notifications' });
    }

    // Fetch business name to stamp on the notification
    const business = await Business.findById(user.verifiedBusiness).select('name');
    const bizName  = business?.name || user.name;

    // Prepend business name to the body so recipients always know who sent it
    const stampedBody = `${bizName} · ${body.trim()}`;

    // ✅ FIX: resolve the notification image URL
    // - If it's already an https:// URL (e.g. previously uploaded), use it directly
    // - If it's a base64 data URL, persist it as a BusinessPost and use the thumb endpoint
    // - Otherwise send with no image
    let notifImageUrl = null;
    if (imageUrl) {
      if (imageUrl.startsWith('https://')) {
        notifImageUrl = imageUrl;
      } else if (/^data:image\/(jpeg|png|webp);base64,/.test(imageUrl)) {
        if (imageUrl.length > 5_600_000) {
          return res.status(400).json({ message: 'Image too large (max ~4MB)' });
        }
        // Store via BusinessPost so we can serve it at a real https:// URL
        const tempPost = await BusinessPost.create({
          business: user.verifiedBusiness,
          owner:    user._id,
          bizName,
          caption:  `[notification image: ${title.trim()}]`,
          image:    imageUrl
        });
        notifImageUrl = `https://www.milledgevilleconnect.com/api/business-post-thumb/${tempPost._id}`;
      }
    }

    let deepLinkData;
    if (notifImageUrl && notifImageUrl.includes('/business-post-thumb/')) {
      const postIdMatch = notifImageUrl.match(/business-post-thumb\/([a-f0-9]{24})/i);
      const postId = postIdMatch ? postIdMatch[1] : null;
      deepLinkData = postId
        ? { page: 'business-post', id: postId }
        : { page: 'directory',     id: String(user.verifiedBusiness) };
    } else {
      deepLinkData = { page: 'directory', id: String(user.verifiedBusiness) };
    }

    await broadcastPush(
      title.trim(),
      stampedBody,
      deepLinkData,
      { type: 'custom', imageUrl: notifImageUrl }
    );

    // Return success
    res.json({ success: true, message: 'Notification sent' });
  } catch (err) {
    console.error('Custom notification error:', err);
    res.status(500).json({ message: 'Failed to send notification' });
  }
});

// ─── REGISTER ───────────────────────────────────────────────────────────────
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'Email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({ 
      token, 
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed' });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/business/:id/reviews', optionalAuth, async (req, res) => {
  try {
    const reviews = await Review.find({ business: req.params.id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/business/:id/reviews', authenticate, async (req, res) => {
  try {
    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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
      { type: 'comment' }          // filter
    );

    res.json(shoutout.comments[shoutout.comments.length - 1]);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments/:commentId/replies', authenticate, async (req, res) => {
  try {
    const user     = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const comment  = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/news', optionalAuth, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/news/:id', optionalAuth, async (req, res) => {
  try {
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    res.json(article);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.post('/news', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = ADMIN_EMAILS.has(user.email);
    if (!isAdmin && !user.canPostNews)
      return res.status(403).json({ message: 'Not authorized to post news' });

    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
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
    const newsThumb = (article.images && article.images.length > 0)
      ? `https://www.milledgevilleconnect.com/api/news-thumb/${article._id}`
      : null;

    broadcastPush(
      `📰 Breaking News: ${title}`,
      summary.length > 80 ? summary.substring(0, 77) + '...' : summary,
      { page: 'news', id: article._id.toString(), url: `/news/${article._id}` },
      { type: 'news', imageUrl: newsThumb }
    );

    res.json(article);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── AUTO-VERIFICATION HELPERS ───────────────────────────────────────────────

// Strip everything that isn't a digit from a phone number for comparison
function normalizePhone(p = '') {
  return (p || '').replace(/\D/g, '').slice(-10); // last 10 digits
}

// Rough address match: compare digits + first two alpha tokens
function addressMatchScore(submitted = '', onFile = '') {
  if (!submitted || !onFile) return 0;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const a = norm(submitted);
  const b = norm(onFile);
  if (!a || !b) return 0;

  // Extract street number
  const numA = a.match(/^\d+/)?.[0];
  const numB = b.match(/^\d+/)?.[0];
  if (!numA || !numB || numA !== numB) return 0; // street number must match exactly

  // Check how many words overlap
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = b.split(/\s+/);
  const overlap = wordsB.filter(w => w.length > 2 && wordsA.has(w)).length;
  return overlap >= 2 ? 30 : overlap === 1 ? 15 : 0;
}

// Extract domain from a URL or email string
function extractDomain(str = '') {
  const m = str.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s@]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase() : '';
}

// ─── COMPUTE CONFIDENCE SCORE ─────────────────────────────────────────────────
// Returns { score: 0-100, signals: [...] }
function computeVerificationConfidence(user, business, { ownerName, phone, address, email: submittedEmail }) {
  let score = 0;
  const signals = [];

  // ── Signal 1: Phone match (+40) ──────────────────────────────────────────
  const normalizedSubmitted = normalizePhone(phone);
  const normalizedOnFile    = normalizePhone(business.phone);
  if (normalizedSubmitted && normalizedOnFile && normalizedSubmitted === normalizedOnFile) {
    score += 40;
    signals.push({ label: 'Phone matches listing', points: 40, passed: true });
  } else {
    signals.push({ label: 'Phone matches listing', points: 40, passed: false });
  }

  // ── Signal 2: Address match (+30) ────────────────────────────────────────
  const addrScore = addressMatchScore(address, business.address);
  score += addrScore;
  signals.push({ label: 'Address matches listing', points: addrScore, passed: addrScore > 0 });

  // ── Signal 3: Email domain matches business website (+20) ────────────────
  const userEmailDomain     = extractDomain(user.email || '');
  const businessWebDomain   = extractDomain(business.website || '');
  const submittedEmailDomain = extractDomain(submittedEmail || '');
  const domainMatch = businessWebDomain && (
    (userEmailDomain     && userEmailDomain     === businessWebDomain) ||
    (submittedEmailDomain && submittedEmailDomain === businessWebDomain)
  );
  if (domainMatch) {
    score += 20;
    signals.push({ label: 'Email domain matches business website', points: 20, passed: true });
  } else {
    signals.push({ label: 'Email domain matches business website', points: 20, passed: false });
  }

  // ── Signal 4: Account age ≥ 7 days (+10) ─────────────────────────────────
  const accountAgeDays = (Date.now() - new Date(user.createdAt || user.joinedAt || 0)) / 86400000;
  if (accountAgeDays >= 7) {
    score += 10;
    signals.push({ label: 'Account is at least 7 days old', points: 10, passed: true });
  } else {
    signals.push({ label: 'Account is at least 7 days old', points: 10, passed: false });
  }

  return { score: Math.min(score, 100), signals };
}

// ─── PIN store (in-memory; swap for Redis/DB in production) ───────────────────
// Key: `${userId}:${businessId}`  Value: { pin, expiresAt }
const _verifyPins = new Map();

// Generate a 6-digit PIN and store it for 15 minutes
function generateVerifyPin(userId, businessId) {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const key = `${userId}:${businessId}`;
  _verifyPins.set(key, { pin, expiresAt: Date.now() + 15 * 60 * 1000 });
  return pin;
}

function checkVerifyPin(userId, businessId, submittedPin) {
  const key = `${userId}:${businessId}`;
  const entry = _verifyPins.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { _verifyPins.delete(key); return false; }
  if (entry.pin !== String(submittedPin).trim()) return false;
  _verifyPins.delete(key); // single-use
  return true;
}

// ─── CLAIM — STEP 1: SUBMIT + AUTO-VERIFY ────────────────────────────────────
//   POST /api/claim/:businessId
//
//   Returns one of three outcomes:
//     { status: 'approved', autoApproved: true }          ← confidence ≥ 70, instant grant
//     { status: 'pending',  needsPin: true }              ← confidence < 40, PIN required
//     { status: 'pending',  fastTrack: true, score }      ← 40–69, queued for quick review
router.post('/claim/:businessId', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.params.businessId);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (business.owner)
      return res.status(400).json({ message: 'This business has already been claimed.' });

    const user = await User.findById(req.userId);
    const existing = await ClaimRequest.findOne({
      business: req.params.businessId,
      user: req.userId,
      status: 'pending'
    });
    if (existing)
      return res.status(400).json({ message: 'You already have a pending claim for this business.' });

    const { ownerName, phone, address, email, message, isRestaurant } = req.body;

    if (!ownerName?.trim() || !phone?.trim() || !address?.trim()) {
      return res.status(400).json({ message: 'Name, phone, and address are required.' });
    }

    // ── Score the claim ───────────────────────────────────────────────────
    const { score, signals } = computeVerificationConfidence(user, business, { ownerName, phone, address, email });

    const claim = await ClaimRequest.create({
      user: req.userId,
      business: req.params.businessId,
      verificationInfo: { ownerName, phone, address, email, message, isRestaurant: !!isRestaurant },
      confidenceScore: score,
      signals
    });

    // ── AUTO-APPROVE (score ≥ 70) ─────────────────────────────────────────
    if (score >= 70) {
      claim.status = 'approved';
      await claim.save();
      await Business.findByIdAndUpdate(business._id, { owner: req.userId, isRestaurant: !!isRestaurant });

      // Update user's verified business
      await User.findByIdAndUpdate(req.userId, {
        verifiedBusiness: business._id,
      });

      // Send a personal welcome push to the new owner
      sendPushToUser(
        req.userId,
        '🎉 Business Verified!',
        `Welcome to Milledgeville Connect, ${business.name}! Your business dashboard is ready — start posting deals, events, and updates to the community!`,
        { page: 'home' }
      );

      return res.json({
        status: 'approved',
        autoApproved: true,
        score,
        signals,
        message: "✅ Verified automatically! Your business dashboard is ready."
      });
    }

    // ── PIN REQUIRED (score < 40) ─────────────────────────────────────────
    if (score < 40) {
      const pin = generateVerifyPin(req.userId, req.params.businessId);

      // If Twilio is configured, send the PIN via SMS — otherwise log it
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
        try {
          const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await twilio.messages.create({
            body: `Your Milledgeville Connect business verification code is: ${pin}. It expires in 15 minutes.`,
            from: process.env.TWILIO_FROM,
            to: normalizePhone(phone).replace(/^(\d{3})(\d{3})(\d{4})$/, '+1$1$2$3')
          });
        } catch (smsErr) {
          // SMS failed — do NOT log the PIN in plaintext
          console.warn('[Verify] SMS failed for user', req.userId, ':', smsErr.message);
        }
      } else {
        // Twilio not configured — PIN cannot be delivered; reject the request
        return res.status(503).json({
          message: 'SMS verification is not available at this time. Please try the manual review path or contact support.'
        });
      }

      return res.json({
        status: 'pending',
        needsPin: true,
        score,
        signals,
        message: 'A 6-digit verification code has been sent to the phone number you provided. Enter it below to complete your claim.'
      });
    }

    // ── FAST-TRACK REVIEW (40–69) ─────────────────────────────────────────
    // Good enough to be legit but not auto-approvable — surfaces first in admin queue
    claim.fastTrack = true;
    await claim.save();

    return res.json({
      status: 'pending',
      fastTrack: true,
      score,
      signals,
      message: 'Your claim looks good! It\'s been flagged for fast-track review and you\'ll hear back very shortly.'
    });

  } catch (err) {
    console.error('Claim error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── CLAIM — STEP 2: CONFIRM PIN ─────────────────────────────────────────────
//   POST /api/claim/:businessId/verify-pin
//   Body: { pin: '123456', isRestaurant: bool }
// ─── IMPROVED CLAIM VERIFICATION (Auto-approve on PIN success) ───────────────
router.post('/claim/:businessId/verify-pin', authenticate, async (req, res) => {
  try {
    const { pin, isRestaurant } = req.body;
    if (!pin) return res.status(400).json({ message: 'PIN is required' });

    if (!checkVerifyPin(req.userId, req.params.businessId, pin)) {
      return res.status(400).json({ message: 'Incorrect or expired PIN.' });
    }

    const business = await Business.findById(req.params.businessId);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (business.owner) return res.status(400).json({ message: 'Already claimed.' });

    // Auto-approve on successful PIN
    await ClaimRequest.findOneAndUpdate(
      { business: req.params.businessId, user: req.userId, status: 'pending' },
      { 
        status: 'approved', 
        confidenceScore: 95,
        signals: [{ label: 'Phone PIN verified', points: 95, passed: true }]
      },
      { sort: { createdAt: -1 } }
    );

    await Business.findByIdAndUpdate(business._id, { 
      owner: req.userId, 
      isRestaurant: !!isRestaurant 
    });

    // Update user's verified business
    await User.findByIdAndUpdate(req.userId, {
      verifiedBusiness: business._id,
    });

    // Log to admin for audit
    console.log(`✅ AUTO-APPROVED CLAIM (PIN): ${business.name} by user ${req.userId}`);

    // Send a personal welcome push to the new owner
    sendPushToUser(
      req.userId,
      '🎉 Business Verified!',
      `Welcome to Milledgeville Connect, ${business.name}! Your business dashboard is ready — start posting deals, events, and updates to the community!`,
      { page: 'home' }
    );

    res.json({
      status: 'approved',
      pinVerified: true,
      message: "✅ Business successfully verified and claimed! Your dashboard is ready."
    });
  } catch (err) {
    console.error('PIN verify error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── CLAIM STATUS ─────────────────────────────────────────────────────────────
router.get('/claim/status/:businessId', authenticate, async (req, res) => {
  try {
    const claim = await ClaimRequest.findOne({
      business: req.params.businessId,
      user: req.userId
    }).sort({ createdAt: -1 });
    if (!claim) return res.json({ status: 'none' });
    res.json({ status: claim.status, score: claim.confidenceScore, fastTrack: claim.fastTrack });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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

    // Always send push notification for verified owners (no credit gate)
    broadcastPush(
      '🔥 New Deal Available!',
      title,
      {
        page: 'deals',
        id: deal._id.toString(),
        url: `/deals/${deal._id}`
      },
      { type: 'deal' }
    );

    res.json(deal);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/owner/deals/:id', authenticate, async (req, res) => {
  try {
    await Deal.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/owner/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find({ owner: req.userId }).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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

    // Always send push notification for verified owners (no credit gate)
    broadcastPush(
      '📅 New Event Posted!',
      title + (location ? ` · ${location}` : ''),
      {
        page: 'events',
        id: event._id.toString(),
        url: `/events/${event._id}`
      },
      { type: 'event' }
    );

    res.json(event);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/owner/events/:id', authenticate, async (req, res) => {
  try {
    await Event.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── OWNER: HOMES FOR RENT / SALE ────────────────────────────────────────────

// GET  /api/owner/homes  — list this owner's home marketplace items
router.get('/owner/homes', authenticate, async (req, res) => {
  try {
    const items = await MarketplaceItem.find({
      seller:   req.userId,
      category: 'Homes'
    }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// POST /api/owner/homes  — create a home listing with optional push notification
router.post('/owner/homes', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('verifiedBusiness', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.verifiedBusiness) {
      return res.status(403).json({ message: 'Only verified business owners can post home listings' });
    }

    const clean = sanitizeContent(req.body, { userId: req.userId, ip: req.ip || req.headers['x-forwarded-for'] });
    const { title, description, price, condition, address, sendNotify } = clean;

    if (!title?.trim()) return res.status(400).json({ message: 'Title is required' });
    if (!condition || !['rent','sale'].includes(condition)) {
      return res.status(400).json({ message: 'Listing type must be "rent" or "sale"' });
    }

    // Cap images at 10
    const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
    const images = rawImages.slice(0, 10);

    const bizName = user.verifiedBusiness?.name || user.name;

    const item = await MarketplaceItem.create({
      title:       title.trim(),
      description: description || '',
      price:       Number(price) || 0,
      images,
      seller:      user._id,
      authorName:  bizName,        // show business name, not personal name
      category:    'Homes',
      condition,                   // 'rent' | 'sale'
      address:     address || ''
    });

    // Optional push notification — costs 2 credits
if (sendNotify) {
  const deducted = await deductNotificationCredit(req.userId, 2, false);
  if (deducted) {
    broadcastPush(
      `🏠 New Home Listing`,
      `${bizName} posted: ${title}`,
      { 
        page: 'marketplace', 
        id: item._id.toString() 
      },
      { 
        type: 'marketplace', 
        subCategory: 'Homes',     // ← Important
        imageUrl: item.images?.length ? `https://www.milledgevilleconnect.com/api/marketplace-thumb/${item._id}` : null
      }
    );
  }
}

    res.json(item);
  } catch (err) {
    console.error('Owner homes post error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// DELETE /api/owner/homes/:id  — remove a home listing (owner only)
router.delete('/owner/homes/:id', authenticate, async (req, res) => {
  try {
    const item = await MarketplaceItem.findOne({
      _id:      req.params.id,
      seller:   req.userId,
      category: 'Homes'
    });
    if (!item) return res.status(404).json({ message: 'Listing not found or not yours' });
    await item.deleteOne();
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── ADMIN: ADD / UPDATE BUSINESS ────────────────────────────────────────────
router.post('/admin/business', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, email, website, description, category, logo } = req.body;

    if (!name?.trim() || !address?.trim() || !category) {
      return res.status(400).json({ message: 'Name, address, and category are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Invalid category selected' });
    }

    const business = await Business.create({
      name: name.trim(),
      address: address.trim(),
      phone: phone?.trim() || '',
      email: email?.trim() || '',
      website: website?.trim() || '',
      description: description?.trim() || '',
      category,
      logo: logo || null
    });

    const populated = await Business.findById(business._id).populate('category', 'name icon');

    res.json({ 
      success: true, 
      message: 'Business added successfully',
      business: populated 
    });

  } catch (err) {
    console.error('Admin Add Business Error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.put('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, email, website, description, category, logo } = req.body;

    const updates = {
      name: name?.trim(),
      address: address?.trim(),
      phone: phone?.trim() || '',
      email: email?.trim() || '',
      website: website?.trim() || '',
      description: description?.trim() || '',
      logo: logo || null
    };

    // Only update category if a valid one is sent
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'Invalid category selected' });
      }
      const catExists = await Category.findById(category);
      if (!catExists) {
        return res.status(400).json({ message: 'Category not found' });
      }
      updates.category = category;
    }

    const business = await Business.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).populate('category', 'name icon');

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    res.json({ 
      success: true,
      message: 'Business updated successfully', 
      business 
    });

  } catch (err) {
    console.error('Admin Update Business Error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.delete('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Business.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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

  await Business.findByIdAndUpdate(claim.business._id, { 
    owner: claim.user._id, 
    isRestaurant 
  });

  const user = await User.findById(claim.user._id);
  if (user) {
    user.verifiedBusiness = claim.business._id;

    // Always grant 5 free starter credits as a one-time registration gift
    user.notificationCredits = 5;

    await user.save();

    // Send a personal welcome push to the newly verified owner
    sendPushToUser(
      user._id.toString(),
      '🎉 Business Verified! You have 5 free credits',
      `Welcome to Milledgeville Connect, ${claim.business.name}! As a thank-you for joining, we've gifted you 5 free notification credits. Use them to promote deals, events, or special offers to the community. Once they run out, upgrade to Business Pro ($29.99/mo) to keep reaching your customers!`,
      { page: 'home' }
    );
  }
}

    res.json({ message: `Claim ${decision}` });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/admin/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/admin/deals/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Deal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.get('/messages/unread-count', authenticate, async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.userId, read: false });
    res.json({ count });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

router.delete('/admin/news/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const { token, platform = 'android' } = req.body;
    if (!token || token.length < 100) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    const sub = await PushSubscription.findOneAndUpdate(
      { user: req.userId },
      { 
        $set: {
          user: req.userId,
          nativeToken: token,
          platform: platform,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(req.userId, { pushEnabled: true });

    console.log(`✅ Native token saved for user ${req.userId}`);
    res.json({ message: 'Token saved', success: true });

  } catch (err) {
    console.error('Native subscribe error:', err);
    res.status(500).json({ message: 'Server error' });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
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
// ⚠️  IMAGE SAFETY: base64 data URLs (data:image/...) must NOT be passed through
//     the HTML-strip regex or the 10000-char substring — both will corrupt them.
//     Any key whose value looks like a data URL is passed through untouched.
//     The shoutout route stores images[] as base64; the business-post and
//     custom-notification routes do the same. Do NOT add substring/replace logic
//     that would touch these fields.
function sanitizeContent(fields = {}, meta = {}) {
  const out = {};
  const textFields = ['text', 'description', 'caption', 'title', 'body', 'reason', 'summary', 'content'];

  // Decode HTML entities so &#58; -> : etc. are caught before pattern matching
  function decodeEntities(str) {
    return str
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&colon;/gi, ':')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  const suspicious = [
    '<script', 'javascript:', 'vbscript:', 'onerror=', 'onload=', 'onclick=',
    'onmouseover=', 'onfocus=', 'alert(', 'document.cookie', 'document.location',
    'window.location', 'eval(', 'expression(', '<iframe', '<object', '<embed'
  ];

  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'string') {

      if (textFields.includes(key.toLowerCase())) {
        // Decode entities first so obfuscated payloads are caught
        const decoded = decodeEntities(val).toLowerCase();

        if (suspicious.some(p => decoded.includes(p))) {
          const userId = meta.userId || 'unknown';
          const ip     = meta.ip     || 'unknown';
          console.warn(`[SECURITY] XSS attempt blocked | user: ${userId} | ip: ${ip} | field: "${key}" | payload: ${val.substring(0, 300)}`);
          const xssJokes = [
            'Nice try, hacker man 👀',
            'lmaooo bro really tried to XSS a community app',
            'Your \'hacking\' has been logged and nobody is impressed',
            'Script kiddie detected 🚨',
            'That\'s cute. Really.',
            'Sir this is a Milledgeville traffic app',
            'We\'ve notified the cyber police 👮',
            'Error 1337: Skill issue detected',
          ];
          const joke = xssJokes[Math.floor(Math.random() * xssJokes.length)];
          throw Object.assign(new Error(joke), { status: 400, xss: true });
        }
      }

      // Protect base64 images
      if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(val)) {
        out[key] = val;
      } else {
        out[key] = val
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\0/g, '')
          .trim()
          .substring(0, 10000);
      }
    } 
    else if (Array.isArray(val)) {
      // Handle image arrays safely
      out[key] = val.map(item => {
        if (typeof item === 'string' && /^data:image\//i.test(item)) {
          return item; // keep base64 images untouched
        }
        if (typeof item === 'string') {
          return item.replace(/<script[\s\S]*?<\/script>/gi, '')
                     .replace(/<[^>]+>/g, '')
                     .replace(/\0/g, '')
                     .trim()
                     .substring(0, 10000);
        }
        return item;
      });
    } 
    else {
      out[key] = val;
    }
  }
  return out;
}

// ─── OWNER SUBSCRIPTION / CREDITS ───────────────────────────────────────────
// Monetization removed — all verified business owners have full access for free.
router.get('/owner/subscription', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ tier: 'free', credits: 0, expires: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── SUBSCRIPTION VALIDATION (REMOVED) ──────────────────────────────────────
// Google Play billing / subscription system removed — app is free.
// Route kept as a no-op stub so any lingering client calls don't 500.
router.post('/owner/validate-subscription', authenticate, async (req, res) => {
  res.json({ success: true, tier: 'free', credits: 0 });
});

// ─── UPDATE BUSINESS LOGO ───────────────────────────────────────────────────
router.post('/owner/business/logo', authenticate, async (req, res) => {
  try {
    const { logo } = req.body;

    if (!logo) {
      return res.status(400).json({ message: 'Logo is required' });
    }

    // Find the business owned by the logged-in user
    const business = await Business.findOne({ owner: req.userId });

    if (!business) {
      return res.status(404).json({ message: 'You do not own a verified business' });
    }

    // Update the logo
    business.logo = logo;
    await business.save();

    res.json({ business });

  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(500).json({ message: 'Failed to update logo' });
  }
});

// Test both native + web
router.post('/test-push', authenticate, async (req, res) => {
  await broadcastPush(
    "🧪 Test Push",
    "If you see this, push is working on your device!",
    { page: 'home', id: 'test123' }
  );
  res.json({ success: true });
});

// ─── BUY CREDIT PACK (REMOVED) ───────────────────────────────────────────────
// Monetization removed — stub kept so old clients don't 500.
router.post('/owner/buy-credits', authenticate, async (req, res) => {
  res.json({ success: false, message: 'Credit purchases are no longer available.' });
});

// VAPID Public Key route is defined earlier in the PUSH NOTIFICATION ROUTES section

// ─── USER: MARKETPLACE NOTIFICATION PREFERENCES ─────────────────────────────
router.post('/user/marketplace-preferences', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { homes, cars, furniture, other } = req.body;

    user.marketplacePreferences = {
      homes:     !!homes,
      cars:      !!cars,
      furniture: !!furniture,
      other:     !!other
    };

    await user.save();

    res.json({ 
      success: true, 
      message: 'Marketplace preferences saved',
      preferences: user.marketplacePreferences 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save preferences' });
  }
});

// Optional: GET route so frontend can load current prefs
router.get('/user/marketplace-preferences', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json(user.marketplacePreferences || {
      homes: true, cars: true, furniture: true, other: true
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load preferences' });
  }
});

// ─── NOTIFICATION PREFERENCES ────────────────────────────────────────────────
// POST /api/user/notification-preferences
// Saves the full notificationPreferences object from the settings modal.
router.post('/user/notification-preferences', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ message: 'preferences object is required' });
    }

    // Only allow toggling of the fields defined in the schema.
    // Verified-business custom notifications are NOT included — they cannot be turned off.
    user.notificationPreferences = {
      events:    typeof preferences.events    === 'boolean' ? preferences.events    : (user.notificationPreferences?.events    ?? true),
      deals:     typeof preferences.deals     === 'boolean' ? preferences.deals     : (user.notificationPreferences?.deals     ?? true),
      shoutouts: typeof preferences.shoutouts === 'boolean' ? preferences.shoutouts : (user.notificationPreferences?.shoutouts ?? true),
      lostFound: typeof preferences.lostFound === 'boolean' ? preferences.lostFound : (user.notificationPreferences?.lostFound ?? true),
      messages:  typeof preferences.messages  === 'boolean' ? preferences.messages  : (user.notificationPreferences?.messages  ?? true),
      comments:  typeof preferences.comments  === 'boolean' ? preferences.comments  : (user.notificationPreferences?.comments  ?? true),
      marketplace: {
        all:       typeof preferences.marketplace?.all       === 'boolean' ? preferences.marketplace.all       : (user.notificationPreferences?.marketplace?.all       ?? true),
        homes:     typeof preferences.marketplace?.homes     === 'boolean' ? preferences.marketplace.homes     : (user.notificationPreferences?.marketplace?.homes     ?? true),
        cars:      typeof preferences.marketplace?.cars      === 'boolean' ? preferences.marketplace.cars      : (user.notificationPreferences?.marketplace?.cars      ?? true),
        furniture: typeof preferences.marketplace?.furniture === 'boolean' ? preferences.marketplace.furniture : (user.notificationPreferences?.marketplace?.furniture ?? true),
        other:     typeof preferences.marketplace?.other     === 'boolean' ? preferences.marketplace.other     : (user.notificationPreferences?.marketplace?.other     ?? true),
      }
    };

    await user.save();
    res.json({ success: true, preferences: user.notificationPreferences });
  } catch (err) {
    console.error('Save notification preferences error:', err);
    res.status(500).json({ message: 'Failed to save preferences' });
  }
});

// GET /api/user/notification-preferences
router.get('/user/notification-preferences', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('notificationPreferences');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.notificationPreferences || {});
  } catch (err) {
    res.status(500).json({ message: 'Failed to load preferences' });
  }
});

// ─── ACCOUNT HARD DELETE ──────────────────────────────────────────────────────
// DELETE /api/user/delete-account
// Immediately and permanently deletes the user and all their associated content.
// This is irreversible — no soft-delete, no 30-day window.
router.delete('/user/delete-account', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify password before allowing deletion (extra safety check)
    const { password } = req.body;
    if (password) {
      const valid = await user.comparePassword(password);
      if (!valid) return res.status(401).json({ message: 'Incorrect password' });
    }

    // ── Delete all content authored by this user ──────────────────────────────
    await Promise.allSettled([
      Shoutout.deleteMany({ authorId: userId }),
      LostItem.deleteMany({ owner: userId }),
      MarketplaceItem.deleteMany({ seller: userId }),
      Event.deleteMany({ owner: userId }),
      Deal.deleteMany({ owner: userId }),
      News.deleteMany({ author: userId }),
      Review.deleteMany({ author: userId }),
      Report.deleteMany({ reporter: userId }),
      // Remove this user from other users' blockedUsers / following lists
      User.updateMany(
        { $or: [{ blockedUsers: userId }, { following: userId }] },
        { $pull: { blockedUsers: userId, following: userId } }
      ),
      // Remove web push subscriptions
      PushSubscription.deleteMany({ user: userId }),
      // Delete all messages sent or received
      Message.deleteMany({ $or: [{ sender: userId }, { recipient: userId }] }),
    ]);

    // ── Finally delete the user document itself ───────────────────────────────
    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Account permanently deleted.' });
  } catch (err) {
    console.error('Hard account delete error:', err);
    res.status(500).json({ message: 'Failed to delete account. Please try again.' });
  }
});

// ─── CREDIT DEDUCTION SYSTEM ───────────────────────────────────────────────
// All notification sends cost 2 credits regardless of tier.
// Pro users have their 12 monthly credits refreshed each billing cycle.
// Normal users (no verifiedBusiness) should never reach this function,
// but we guard against it anyway.
// ─── CREDIT DEDUCTION (REMOVED) ─────────────────────────────────────────────
// Monetization removed — push notifications are free for all verified owners.
// Stub kept so any missed call sites fail gracefully instead of crashing.
async function deductNotificationCredit(userId) {
  return true; // always allow
}

// ─── PRO TIER MONTHLY CREDIT RESET (REMOVED) ────────────────────────────────
// Subscription system removed. No-op.


// ─── APP VERSION ──────────────────────────────────────────────────────────────
// Bump CURRENT_VERSION here on each release. The client's checkForAppUpdate()
// compares against this — no client-side code deploy needed to show the banner.
const CURRENT_VERSION = '1.2.5';

router.get('/app/version', (req, res) => {
  res.json({ latest: CURRENT_VERSION });
});

// (resetProCredits cron removed — subscription system disabled)

// ─── BUSINESS POSTS (Photo Updates) ──────────────────────────────────────────
// Verified business owners can create a photo post with a caption.
// The notification deep-links directly to the individual post.

// POST /api/owner/business-posts — create a new photo post
router.post('/owner/business-posts', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('verifiedBusiness', 'name');
    if (!user)                  return res.status(404).json({ message: 'User not found' });
    if (!user.verifiedBusiness) return res.status(403).json({ message: 'Only verified business owners can post updates' });

    const { caption, image, sendNotify, notifTitle } = req.body;

    if (!image?.trim()) return res.status(400).json({ message: 'An image is required' });

    // Validate it's a real base64 data URL (jpeg/png/webp only)
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
      return res.status(400).json({ message: 'Image must be a valid JPEG, PNG, or WebP' });
    }

    // Enforce a ~4 MB base64 limit (4 MB raw ≈ 5.5 MB base64)
    if (image.length > 5_600_000) {
      return res.status(400).json({ message: 'Image is too large (max 4 MB)' });
    }

    const bizName = user.verifiedBusiness.name || user.name;

    const post = await BusinessPost.create({
      business:   user.verifiedBusiness._id,
      owner:      user._id,
      bizName,
      caption:    (caption || '').trim().substring(0, 500),
      image,
    });

    // Optional push notification — always allowed for verified owners
    if (sendNotify) {
      const pushTitle = (notifTitle || '').trim() || `📸 ${bizName}`;
      await broadcastPush(
        pushTitle,
        caption?.trim() || 'Posted a new photo update — tap to see it!',
        { page: 'business-post', id: post._id.toString() },
        { type: 'business-post', imageUrl: `https://www.milledgevilleconnect.com/api/business-post-thumb/${post._id}` }
      );
    }

    res.json(post);
  } catch (err) {
    console.error('Business post create error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/business-post-thumb/:postId — serves the stored base64 image as a real HTTP response
// Used so FCM/VAPID push notifications can show a thumbnail via a public URL instead of raw base64
router.get('/business-post-thumb/:postId', async (req, res) => {
  try {
    const post = await BusinessPost.findById(req.params.postId).select('image');
    if (!post?.image) return res.status(404).send('Not found');

    // Parse the data URL: data:image/jpeg;base64,<data>
    const match = post.image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) return res.status(400).send('Invalid image format');

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (err) {
    console.error('Thumb fetch error:', err);
    res.status(500).send('Error');
  }
});

// GET /api/shoutout-thumb/:shoutoutId — serves a shoutout's first image as a real HTTP response
// Required because data: URLs are blocked by browsers/FCM in push notification image fields
router.get('/shoutout-thumb/:shoutoutId', async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.shoutoutId).select('images');
    if (!shoutout?.images?.length) return res.status(404).send('Not found');

    const raw = shoutout.images[0];
    const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) return res.status(400).send('Invalid image format');

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type':   mimeType,
      'Cache-Control':  'public, max-age=86400',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (err) {
    console.error('Shoutout thumb error:', err);
    res.status(500).send('Error');
  }
});

// GET /api/lostitem-thumb/:id — serves first image of a lost/found item for push notifications
router.get('/lostitem-thumb/:id', async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id).select('images');
    if (!item?.images?.length) return res.status(404).set('Cache-Control', 'no-store').send('Not found');

    const raw = item.images[0];

    // If stored as an external URL, redirect to it
    if (/^https?:\/\//i.test(raw)) {
      return res.redirect(302, raw);
    }

    const match = raw.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if (!match) return res.status(400).set('Cache-Control', 'no-store').send('Invalid image format');

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type':   mimeType,
      'Cache-Control':  'public, max-age=86400',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (err) {
    console.error('LostItem thumb error:', err);
    res.status(500).set('Cache-Control', 'no-store').send('Error');
  }
});

// GET /api/marketplace-thumb/:id — serves first image of a marketplace listing for push notifications
router.get('/marketplace-thumb/:id', async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id).select('images');
    if (!item?.images?.length) return res.status(404).set('Cache-Control', 'no-store').send('Not found');

    const raw = item.images[0];

    // If stored as an external URL, redirect to it
    if (/^https?:\/\//i.test(raw)) {
      return res.redirect(302, raw);
    }

    const match = raw.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if (!match) return res.status(400).set('Cache-Control', 'no-store').send('Invalid image format');

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type':   mimeType,
      'Cache-Control':  'public, max-age=86400',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (err) {
    console.error('Marketplace thumb error:', err);
    res.status(500).set('Cache-Control', 'no-store').send('Error');
  }
});

// GET /api/news-thumb/:id — serves first image of a news article for push notifications
router.get('/news-thumb/:id', async (req, res) => {
  try {
    const article = await News.findById(req.params.id).select('images');
    if (!article?.images?.length) return res.status(404).send('Not found');

    const raw = article.images[0];
    const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) return res.status(400).send('Invalid image format');

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type':   mimeType,
      'Cache-Control':  'public, max-age=86400',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (err) {
    console.error('News thumb error:', err);
    res.status(500).send('Error');
  }
});

// GET /api/business-posts/post/:postId — fetch single post by ID (public, for deep-link)
// MUST come BEFORE the generic /:businessId route
router.get('/business-posts/post/:postId', async (req, res) => {
  try {
    const post = await BusinessPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    res.json(post);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/business-posts/:businessId — fetch all posts for one business (public)
router.get('/business-posts/:businessId', async (req, res) => {
  try {
    const posts = await BusinessPost
      .find({ business: req.params.businessId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(posts);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/business-posts — recent posts from all businesses (public feed)
router.get('/business-posts', async (req, res) => {
  try {
    const posts = await BusinessPost
      .find({})
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(posts);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/owner/business-posts — owner's own posts
router.get('/owner/business-posts', authenticate, async (req, res) => {
  try {
    const posts = await BusinessPost
      .find({ owner: req.userId })
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// DELETE /api/owner/business-posts/:id — owner deletes their own post
router.delete('/owner/business-posts/:id', authenticate, async (req, res) => {
  try {
    const post = await BusinessPost.findOne({ _id: req.params.id, owner: req.userId });
    if (!post) return res.status(404).json({ message: 'Post not found or not yours' });
    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ─── SCHEDULED NOTIFICATION BACKGROUND JOB (Minimal Recurring Version) ──────
let RECURRING_ENABLED = true; // ← Easy kill switch. Set to false to disable recurring

async function processScheduledNotifications() {
  if (!RECURRING_ENABLED) return;

  try {
    const now = new Date();

    const due = await ScheduledNotification.find({
      status: { $in: ['pending', 'scheduled'] },
      scheduledFor: { $lte: now }
    });

for (const notif of due) {
  // Skip paused recurring notifications
  if (notif.status === 'paused') {
    continue;
  }

  try {
        // Build image URL if exists (unchanged from before)
        const imageUrl = notif.image 
          ? `https://www.milledgevilleconnect.com/api/scheduled-notification-thumb/${notif._id}`
          : null;

        // Send the notification
        await broadcastPush(
          notif.title,
          notif.body,
          { 
            page: notif.targetType || 'home', 
            id: notif.targetId || '' 
          },
          { 
            type: notif.targetType || 'custom', 
            imageUrl 
          }
        );

        console.log(`✅ Scheduled notification sent: ${notif.title}`);

        // ─── RECURRING LOGIC (Minimal & Safe) ───────────────────────────────
        if (notif.repeat === 'weekly' && notif.days && notif.days.length > 0) {
          const nextRun = getNextRecurringDate(notif.days, notif.scheduledFor);

          if (nextRun) {
            notif.scheduledFor = nextRun;
            notif.status = 'pending';
            notif.lastSentAt = new Date();      // ← track last send time for the UI badge
            await notif.save();
            console.log(`🔁 Recurring rescheduled for: ${nextRun}`);
          } else {
            notif.status = 'sent';
            notif.lastSentAt = new Date();
            await notif.save();
          }
        } else {
          // One-time notification
          notif.status = 'sent';
          notif.sentAt = new Date();
          await notif.save();
        }

      } catch (err) {
        console.error(`Failed to process scheduled notif ${notif._id}:`, err);
        notif.status = 'failed';
        await notif.save();
      }
    }
  } catch (err) {
    console.error('Scheduled processor error:', err);
  }
}

// Helper: Calculate next recurring date (same as before)
function getNextRecurringDate(daysArray, currentScheduledFor) {
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const selectedDays = daysArray.map(d => dayMap[d]).filter(d => d !== undefined);

  if (selectedDays.length === 0) return null;

  let nextDate = new Date(currentScheduledFor || new Date());

  if (nextDate <= new Date()) {
    nextDate.setDate(nextDate.getDate() + 1);
  }

  for (let i = 0; i < 14; i++) {
    if (selectedDays.includes(nextDate.getDay())) {
      return nextDate;
    }
    nextDate.setDate(nextDate.getDate() + 1);
  }

  return null;
}

// Run every 30 seconds
setInterval(processScheduledNotifications, 30 * 1000);
processScheduledNotifications(); // run once on startup

// GET /api/admin/scheduled-notifications
router.get('/admin/scheduled-notifications', authenticate, requireAdmin, async (req, res) => {
  try {
    const items = await ScheduledNotification.find()
      .populate('business', 'name category')
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// POST /api/admin/scheduled-notifications
router.post('/admin/scheduled-notifications', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await ScheduledNotification.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    console.error('Create scheduled notification error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// GET /api/scheduled-notification-thumb/:id
router.get('/scheduled-notification-thumb/:id', async (req, res) => {
  try {
    const notif = await ScheduledNotification.findById(req.params.id).select('image');
    if (!notif?.image) return res.status(404).send('Not found');

    const match = notif.image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) return res.status(400).send('Invalid image format');

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (err) {
    console.error('Scheduled thumb error:', err);
    res.status(500).send('Error');
  }
});

// PATCH /api/admin/scheduled-notifications/:id
router.patch('/admin/scheduled-notifications/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Handle "Send Now" action
    if (req.body.action === 'send-now') {
      const notif = await ScheduledNotification.findById(id);
      if (!notif) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      // Build image URL if exists
      const imageUrl = notif.image 
        ? `https://www.milledgevilleconnect.com/api/scheduled-notification-thumb/${notif._id}`
        : null;

      // Send the push notification immediately
      await broadcastPush(
        notif.title,
        notif.body,
        { 
          page: notif.targetType || 'home', 
          id: notif.targetId || '' 
        },
        { 
          type: notif.targetType || 'custom', 
          imageUrl 
        }
      );

      // Mark as sent (or reschedule if recurring)
      if (notif.repeat === 'weekly' && notif.days && notif.days.length > 0) {
        const nextRun = getNextRecurringDate(notif.days, new Date());
        notif.lastSentAt = new Date();
        if (nextRun) {
          notif.scheduledFor = nextRun;
          notif.status = 'pending';
        } else {
          notif.status = 'sent';
          notif.sentAt = new Date();
        }
      } else {
        notif.status = 'sent';
        notif.sentAt = new Date();
      }
      await notif.save();

      return res.json({ message: 'Notification sent successfully' });
    }

    // Handle Pause and Resume
    if (req.body.action === 'pause' || req.body.action === 'resume') {
      const notif = await ScheduledNotification.findById(id);
      if (!notif) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      notif.status = req.body.action === 'pause' ? 'paused' : 'pending';

      await notif.save();
      return res.json({ message: `Notification ${req.body.action}d` });
    }

    // Normal update (for editing) — strip any invalid status values before saving
    const VALID_STATUSES = ['pending', 'sent', 'failed', 'paused'];
    const updateBody = { ...req.body };
    if (updateBody.status && !VALID_STATUSES.includes(updateBody.status)) {
      updateBody.status = 'pending';
    }

    const updated = await ScheduledNotification.findByIdAndUpdate(
      id,
      updateBody,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json(updated);

  } catch (err) {
    console.error('PATCH scheduled notification error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// DELETE /api/admin/scheduled-notifications/:id
router.delete('/admin/scheduled-notifications/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const deleted = await ScheduledNotification.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Scheduled notification not found' });
    }
    res.json({ message: 'Scheduled notification deleted' });
  } catch (err) {
    console.error('Delete scheduled notification error:', err);
    res.status(500).json({ message: 'Failed to delete' });
  }
});

// ←←← MUST BE AT THE VERY BOTTOM ←←←

// \u2500\u2500\u2500 SPOTLIGHT AD ROUTES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// GET /api/admin/spotlight-ad  \u2014 public (home screen reads it)
router.get('/admin/spotlight-ad', async (req, res) => {
  try {
    const ad = await SpotlightAd.findOne().sort({ updatedAt: -1 });
    if (!ad) return res.json(null);
    res.json({ image: ad.image, businessName: ad.businessName, link: ad.link });
  } catch (err) {
    console.error('GET spotlight-ad error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// POST /api/admin/spotlight-ad  \u2014 admin only, saves/replaces current ad
router.post('/admin/spotlight-ad', authenticate, requireAdmin, async (req, res) => {
  try {
    const { image, businessName = '', link = '' } = req.body;
    if (!image) return res.status(400).json({ message: 'image is required' });
    // Keep only one doc \u2014 replace any existing
    await SpotlightAd.deleteMany({});
    const ad = await SpotlightAd.create({ image, businessName, link, updatedAt: new Date() });
    res.json({ message: 'Spotlight ad saved', id: ad._id });
  } catch (err) {
    console.error('POST spotlight-ad error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// DELETE /api/admin/spotlight-ad  \u2014 admin only
router.delete('/admin/spotlight-ad', authenticate, requireAdmin, async (req, res) => {
  try {
    await SpotlightAd.deleteMany({});
    res.json({ message: 'Spotlight ad removed' });
  } catch (err) {
    console.error('DELETE spotlight-ad error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});


module.exports = router;

//close