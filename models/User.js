// models/User.js
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

  // ─────────────────────────────────────────────────────────────
  // NOTIFICATION PREFERENCES
  // Users can toggle these. Custom business notifications are excluded.
  // ─────────────────────────────────────────────────────────────
  notificationPreferences: {
    // Main notification categories
    events:     { type: Boolean, default: true },
    deals:      { type: Boolean, default: true },
    shoutouts:  { type: Boolean, default: true },
    lostFound:  { type: Boolean, default: true },
    messages:   { type: Boolean, default: true },

    // Global "Comments & Replies" toggle. Covers replies/comments on traffic
    // alerts, marketplace listings, lost & found posts, etc. Opt-in:
    // defaults to false for all (new and existing) users.
    comments:   { type: Boolean, default: false },

    // Marketplace has its own sub-preferences
    marketplace: {
      all:       { type: Boolean, default: true },
      homes:     { type: Boolean, default: true },
      cars:      { type: Boolean, default: true },
      furniture: { type: Boolean, default: true },
      other:     { type: Boolean, default: true }
    }
  },

  pushEnabled: { type: Boolean, default: false },

  // Anti-spam & Moderation
  lastPostAt:       { type: Date, default: null },
  postTimeoutUntil: { type: Date, default: null },
  isMuted:          { type: Boolean, default: false },
  recentPostTimes:  [{ type: Date }],

  isBetaTester: { type: Boolean, default: false },
  isModerator:  { type: Boolean, default: false },
  canPostNews:  { type: Boolean, default: false },

  // Reputation
  reputation: { type: Number, default: 0 },
  repHistory: [{
    action: String,
    amount: Number,
    sourceId: String,
    date: { type: Date, default: Date.now }
  }],

  // Subscription & Credits
  subscriptionTier: { 
    type: String, 
    enum: ['free', 'pro'], 
    default: 'free' 
  },
  subscriptionExpiry: { type: Date, default: null },
  notificationCredits: { 
    type: Number, 
    default: 0 
  },

  // Token Storage
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

  // Account Deletion
  deletionRequestedAt: { type: Date, default: null },
  deletionReason:      { type: String, default: '' },

  // Password Recovery
  securityQuestion: { type: String, default: '' },
  securityAnswer:   { type: String, default: '', select: false }  // hidden by default; use .select('+securityAnswer') to load
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isPostTimedOut = function () {
  return this.postTimeoutUntil && this.postTimeoutUntil > new Date();
};

module.exports = mongoose.model('User', userSchema);