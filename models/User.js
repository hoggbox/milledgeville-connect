const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─── Web Push Subscription sub-schema ────────────────────────────────────────
// Stores a single browser VAPID subscription object (endpoint + keys).
// One user can have multiple browser subscriptions (e.g. home + work computer).
const webPushSubscriptionSchema = new mongoose.Schema({
  endpoint:   { type: String, required: true },
  expirationTime: { type: Number, default: null },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true }
  }
}, { _id: false });

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

  // ─── Notification preference toggles ─────────────────────────────────────
  notifyDeals:             { type: Boolean, default: true  },
  notifyEvents:            { type: Boolean, default: true  },
  notifyShoutouts:         { type: Boolean, default: false },   // new traffic alerts
  notifyShoutoutComments:  { type: Boolean, default: false },   // comments on traffic alerts
  notifyLostFound:         { type: Boolean, default: true  },   // lost & found posts
  notifyMarketplace:       { type: Boolean, default: true  },   // new marketplace listings
  notifyMessages:          { type: Boolean, default: true  },   // direct messages / inbox

  canPostNews: { type: Boolean, default: false },

  // ─── Push token storage ───────────────────────────────────────────────────
  // pushEnabled: master switch — true when the user has at least one active
  // subscription or FCM token registered.
  pushEnabled: { type: Boolean, default: false },

  // FCM tokens for native Android/iOS (APK via Capacitor + Firebase).
  // Array supports multiple devices per user (phone + tablet, etc.).
  fcmTokens: [{ type: String }],

  // Web push subscriptions for browser users (VAPID).
  // Array supports multiple browsers / computers per user.
  webPushSubscriptions: [webPushSubscriptionSchema],

  // ─── Social graph ─────────────────────────────────────────────────────────
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  }],

  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
});

// ─── Password hashing ─────────────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Helper: add an FCM token (deduplicates automatically) ───────────────────
userSchema.methods.addFcmToken = function (token) {
  if (!token) return;
  if (!this.fcmTokens.includes(token)) {
    this.fcmTokens.push(token);
  }
  this.pushEnabled = true;
};

// ─── Helper: remove an FCM token ─────────────────────────────────────────────
userSchema.methods.removeFcmToken = function (token) {
  this.fcmTokens = this.fcmTokens.filter(t => t !== token);
  if (this.fcmTokens.length === 0 && this.webPushSubscriptions.length === 0) {
    this.pushEnabled = false;
  }
};

// ─── Helper: add a web push subscription (deduplicates by endpoint) ──────────
userSchema.methods.addWebSub = function (subJSON) {
  if (!subJSON || !subJSON.endpoint) return;
  // Remove stale entry for same endpoint first
  this.webPushSubscriptions = this.webPushSubscriptions.filter(
    s => s.endpoint !== subJSON.endpoint
  );
  this.webPushSubscriptions.push({
    endpoint:       subJSON.endpoint,
    expirationTime: subJSON.expirationTime || null,
    keys: {
      p256dh: subJSON.keys.p256dh,
      auth:   subJSON.keys.auth
    }
  });
  this.pushEnabled = true;
};

// ─── Helper: remove a web push subscription by endpoint ──────────────────────
userSchema.methods.removeWebSub = function (endpoint) {
  this.webPushSubscriptions = this.webPushSubscriptions.filter(
    s => s.endpoint !== endpoint
  );
  if (this.fcmTokens.length === 0 && this.webPushSubscriptions.length === 0) {
    this.pushEnabled = false;
  }
};

module.exports = mongoose.model('User', userSchema);