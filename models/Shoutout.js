// ── Shoutout.js ───────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  text:     { type: String, required: true },
  author:   String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:{ type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
  text:     { type: String, required: true },
  author:   String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  replies:  [replySchema],
  createdAt:{ type: Date, default: Date.now }
});

const shoutoutSchema = new mongoose.Schema({
  text:     { type: String, required: true },
  author:   String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  images:   [{ type: String }],
  hidden:   { type: Boolean, default: false },
  location:     { type: String, default: null },
  lastBumpedAt: { type: Date, default: Date.now },

  // ── AUTO-MOD ──────────────────────────────────────────────────────────────
  flaggedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  autoHidden: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────

  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shoutout', shoutoutSchema);