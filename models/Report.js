// models/Report.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['user', 'shoutout', 'lost', 'market', 'comment'],   // ← Added new types
    required: true
  },

  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // References
  reportedUser:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportedShoutout:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shoutout' },
  reportedLostItem:  { type: mongoose.Schema.Types.ObjectId, ref: 'LostItem' },
  reportedMarketItem:{ type: mongoose.Schema.Types.ObjectId, ref: 'MarketplaceItem' },
  reportedComment:   { type: mongoose.Schema.Types.ObjectId },

  snapshotText: { type: String, default: '' },
  reason:       { type: String, required: true },
  
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'dismissed'],
    default: 'pending'
  },
  adminNote: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

// Indexes for performance + duplicate prevention
reportSchema.index({ reporter: 1, reportedShoutout: 1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedLostItem: 1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedMarketItem: 1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedUser: 1 }, { sparse: true });

module.exports = mongoose.model('Report', reportSchema);