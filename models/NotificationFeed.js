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

  createdAt: { type: Date, default: Date.now, index: true }
});

// Compound index for the main feed query: unread first, newest first
notificationFeedSchema.index({ recipient: 1, deleted: 1, createdAt: -1 });

// Auto-expire notifications after 60 days to keep the collection lean
notificationFeedSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.models.NotificationFeed ||
  mongoose.model('NotificationFeed', notificationFeedSchema);