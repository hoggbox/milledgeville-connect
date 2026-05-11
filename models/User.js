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

  // ─── Notification Preferences ─────────────────────────────────────
  notifyDeals:             { type: Boolean, default: true },
  notifyEvents:            { type: Boolean, default: true },
  notifyShoutouts:         { type: Boolean, default: false },
  notifyShoutoutComments:  { type: Boolean, default: false },   // ← Important for comments
  notifyLostFound:         { type: Boolean, default: true },
  notifyMarketplace:       { type: Boolean, default: true },
  notifyMessages:          { type: Boolean, default: true },

  pushEnabled: { type: Boolean, default: false },
    // Anti-spam
  lastPostAt: { type: Date, default: null },

  // ─── Token Storage ─────────────────────────────────────────────────
  fcmTokens: [{ type: String }],                    // Native Android/iOS tokens

  webPushSubscriptions: [{                          // Browser push subscriptions
    endpoint: String,
    expirationTime: Number,
    keys: {
      p256dh: String,
      auth: String
    }
  }],

  // ─── Social / Other ────────────────────────────────────────────────
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  }],

  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);