const mongoose = require('mongoose');

const pushSubSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscription: { type: Object, required: true },  // Web Push subscription JSON
  createdAt:    { type: Date, default: Date.now }
});

pushSubSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubSchema);