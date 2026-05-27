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

  // ─── SECURITY QUESTION (password reset) ──────────────────────────────────
  // securityAnswer is hashed on save — never returned in normal queries
  securityQuestion: { type: String, default: null },
  securityAnswer:   { type: String, default: null, select: false },

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
    comments:   { type: Boolean, default: true },

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
  deletionReason:      { type: String, default: '' }
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (this.isModified('securityAnswer') && this.securityAnswer) {
    this.securityAnswer = await bcrypt.hash(
      this.securityAnswer.trim().toLowerCase(), 10
    );
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isPostTimedOut = function () {
  return this.postTimeoutUntil && this.postTimeoutUntil > new Date();
};

module.exports = mongoose.model('User', userSchema);