const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true          // one record per user — the right uniqueness constraint
  },

  // Web Push (VAPID) — full PushSubscription JSON from the browser
  subscription: {
    type: Object,
    default: null
  },

  // Native FCM Token (Capacitor / Android / iOS)
  // sparse: true so multiple null values don't violate the index
  nativeToken: {
    type: String,
    default: null
  },

  platform: {
    type: String,
    enum: ['android', 'ios', 'web'],
    default: 'android'
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Sparse index on nativeToken so null values are excluded (prevents unique-null conflicts)
pushSubscriptionSchema.index({ nativeToken: 1 }, { sparse: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);