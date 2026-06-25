// models/NotificationFeed.js
// ─────────────────────────────────────────────────────────────────────────────
// Stores per-user in-app notification feed items (like Facebook's bell icon).
// These are created server-side whenever a relevant event happens (comment on
// your post, reply to your comment, new deal/event/shoutout, etc.) and are
// independent of push notifications — users see them even with push turned off.
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const notificationFeedSchema = new mongoose.Schema({
  // Who receives this notification
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Who triggered it (null for system/broadcast notifications)
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Notification type — drives the icon and deep-link behaviour
  type: {
    type: String,
    required: true,
    enum: [
      'comment',          // someone commented on your post
      'reply',            // someone replied to your comment
      'like',             // someone liked your post
      'new_event',        // new community event posted
      'new_deal',         // new deal posted
      'new_shoutout',     // new traffic shoutout
      'new_marketplace',  // new marketplace listing
      'new_lost',         // new lost & found post
      'new_news',         // new news article
      'message',          // new direct message
      'follow',           // someone followed your business
      'system',           // admin broadcast / system alert
    ]
  },

  // Human-readable title (bold first line, like Facebook)
  title: { type: String, required: true, maxlength: 120 },

  // Supporting detail line (body text below title)
  body: { type: String, default: '', maxlength: 280 },

  // Actor's avatar URL (cached so we don't need to populate every time)
  actorAvatar: { type: String, default: null },
  actorName:   { type: String, default: '' },

  // ── Deep link ─────────────────────────────────────────────────────────────
  // page  : which nav page to navigate() to
  // itemId: the specific post/item/comment ID to scroll to / open
  // anchor: optional CSS anchor / element ID on that page
  linkPage:  { type: String, default: '' },   // e.g. 'shoutouts', 'marketplace'
  linkItemId:{ type: String, default: '' },   // MongoDB _id as string
  linkAnchor:{ type: String, default: '' },   // e.g. 'comment-abc123'

  // Read state
  read: { type: Boolean, default: false, index: true },

  // Soft-delete (admin can retract notifications)
  deleted: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now, index: true },

  // ── Cleanup ──────────────────────────────────────────────────────────────
  // Drives the TTL index below. Defaults to createdAt + 60 days (unread
  // window). Whenever a notification is marked read, this gets pulled in to
  // readAt + 1 day, so read notifications clear out fast while unread ones
  // stick around for the full 60 days. Set via the pre-save hook and the
  // markAsRead helpers below — don't need to set this manually elsewhere.
  expiresAt: { type: Date, default: null }
});

const UNREAD_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const READ_TTL_MS    = 1  * 24 * 60 * 60 * 1000; // 1 day

// On creation, default expiresAt to the full 60-day unread window.
notificationFeedSchema.pre('save', function (next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date((this.createdAt || Date.now()) + UNREAD_TTL_MS);
  }
  next();
});

// ── Helpers for marking read ────────────────────────────────────────────────
// Your /notifications/read route almost certainly does a bulk update
// (updateMany / findByIdAndUpdate) rather than load-then-save, so plain
// `read: true` won't trigger the pre('save') hook above. Use these statics
// from the route instead — they set both `read` and the short expiresAt
// window in one atomic update:
//
//   // single notification:
//   await NotificationFeed.markRead({ _id: id, recipient: userId });
//
//   // all of a user's notifications:
//   await NotificationFeed.markAllRead(userId);
//
notificationFeedSchema.statics.markRead = function (filter) {
  return this.updateMany(
    { ...filter, read: false },
    { $set: { read: true, expiresAt: new Date(Date.now() + READ_TTL_MS) } }
  );
};

notificationFeedSchema.statics.markAllRead = function (recipientId) {
  return this.updateMany(
    { recipient: recipientId, read: false },
    { $set: { read: true, expiresAt: new Date(Date.now() + READ_TTL_MS) } }
  );
};

// ── Helpers for dismissing/clearing ────────────────────────────────────────
// Same 1-day window as markRead — user is explicitly done with these.
//
//   // single notification:
//   await NotificationFeed.markDeleted({ _id: id, recipient: userId });
//
//   // all of a user's notifications:
//   await NotificationFeed.markAllDeleted(recipientId);
//
notificationFeedSchema.statics.markDeleted = function (filter) {
  return this.updateMany(
    filter,
    { $set: { deleted: true, expiresAt: new Date(Date.now() + READ_TTL_MS) } }
  );
};

notificationFeedSchema.statics.markAllDeleted = function (recipientId) {
  return this.updateMany(
    { recipient: recipientId },
    { $set: { deleted: true, expiresAt: new Date(Date.now() + READ_TTL_MS) } }
  );
};

// Compound index for the main feed query: unread first, newest first
notificationFeedSchema.index({ recipient: 1, deleted: 1, createdAt: -1 });

// Auto-expire: deletes once `expiresAt` is reached. expiresAt defaults to
// createdAt + 60 days (unread), but gets pulled in to readAt + 1 day as soon
// as a notification is marked read via markRead()/markAllRead() above — so
// read items clear out fast and unread items still get the full 60-day window.
notificationFeedSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.NotificationFeed ||
  mongoose.model('NotificationFeed', notificationFeedSchema);