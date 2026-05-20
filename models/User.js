// models/User.js  ── Updated with moderation fields
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  lastLogin:{ type: Date, default: Date.now },
  verifiedBusiness: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },

  bio:          { type: String, default: '', maxlength: 280 },
  phone:        { type: String, default: '' },
  neighborhood: { type: String, default: '' },
  website:      { type: String, default: '' },
  avatar:       { type: String, default: null },
  joinedAt:     { type: Date,   default: Date.now },

  instagram: { type: String, default: '' },
  facebook:  { type: String, default: '' },

  // ─── Notification Preferences ─────────────────────────────────────────────
  notifyDeals:             { type: Boolean, default: true },
  notifyEvents:            { type: Boolean, default: true },
  notifyShoutouts:         { type: Boolean, default: false },
  notifyShoutoutComments:  { type: Boolean, default: false },
  notifyLostFound:         { type: Boolean, default: true },
  notifyMarketplace:       { type: Boolean, default: true },
  notifyMessages:          { type: Boolean, default: true },

  pushEnabled: { type: Boolean, default: false },

  // Anti-spam (existing)
  lastPostAt: { type: Date, default: null },

  // ─── MODERATION / FLAGGING ────────────────────────────────────────────────
  // Set by the system when 8 unique users flag one of the user's posts.
  // The user cannot post shoutouts/alerts until this timestamp has passed.
  postTimeoutUntil: { type: Date, default: null },
  // Beta tester gifts
  isBetaTester: { type: Boolean, default: false },

  // Set by the system's spam detector or manually by admin.
  // When true, ALL outbound notifications (shoutouts, lost-found, marketplace)
  // are silenced until an admin lifts the mute.
  isMuted: { type: Boolean, default: false },

  // Admin/moderator access flags (existing pattern from api.js)
  isModerator: { type: Boolean, default: false },
  canPostNews:  { type: Boolean, default: false },

  // ─── Spam tracking ────────────────────────────────────────────────────────
  // Rolling window of recent post timestamps used to detect burst posting.
  // We keep up to 10; older entries are pruned automatically on each post.
  recentPostTimes: [{ type: Date }],

  // ─── REPUTATION SYSTEM ─────────────────────────────────────────────────────
  reputation: { type: Number, default: 0 },
  repHistory: [{
    action: String,
    amount: Number,
    sourceId: String,
    date: { type: Date, default: Date.now }
  }],

  // ─── Token Storage ─────────────────────────────────────────────────────────
  fcmTokens: [{ type: String }],

  webPushSubscriptions: [{
    endpoint: String,
    expirationTime: Number,
    keys: {
      p256dh: String,
      auth: String
    }
  }],

  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  }],

  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // ─── BUSINESS PRO TIER ─────────────────────────────────────────────────────
  subscriptionTier: { 
    type: String, 
    enum: ['free', 'pro'], 
    default: 'free' 
  },
  subscriptionExpiry: { type: Date, default: null },
  notificationCredits: { type: Number, default: 10 },
  lastCreditReset: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Convenience: is the user currently in a post-timeout? ─────────────────
userSchema.methods.isPostTimedOut = function () {
  return this.postTimeoutUntil && this.postTimeoutUntil > new Date();
};

module.exports = mongoose.model('User', userSchema);