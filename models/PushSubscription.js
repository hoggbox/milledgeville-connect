const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // Web Push (VAPID) - original field
  subscription: {
    type: Object,           // full PushSubscription JSON from browser
    default: null
  },

  // Native FCM Token (Capacitor / Android)
  nativeToken: {
    type: String,
    default: null,
    index: true
  },

  platform: {
    type: String,
    enum: ['android', 'ios', 'web'],
    default: 'android'
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure only one record per user
pushSubscriptionSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);