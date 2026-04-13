const mongoose = require('mongoose');

const claimRequestSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  verificationInfo: {
    ownerName:    String,
    phone:        String,
    address:      String,
    message:      String,
    isRestaurant: { type: Boolean, default: false }
  },
  status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ClaimRequest', claimRequestSchema);