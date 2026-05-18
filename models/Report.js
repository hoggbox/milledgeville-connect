// models/Report.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['user', 'shoutout', 'lost', 'market', 'comment', 'event', 'deal', 'news'],
    required: true
  },

  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // References
  reportedUser:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',            default: null },
  reportedShoutout:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shoutout',        default: null },
  reportedLostItem:  { type: mongoose.Schema.Types.ObjectId, ref: 'LostItem',        default: null },
  reportedMarketItem:{ type: mongoose.Schema.Types.ObjectId, ref: 'MarketplaceItem', default: null },
  reportedComment:   { type: mongoose.Schema.Types.ObjectId,                         default: null },
  reportedEvent:     { type: mongoose.Schema.Types.ObjectId, ref: 'Event',           default: null },
  reportedDeal:      { type: mongoose.Schema.Types.ObjectId, ref: 'Deal',            default: null },
  reportedNews:      { type: mongoose.Schema.Types.ObjectId, ref: 'News',            default: null },

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
reportSchema.index({ reporter: 1, reportedShoutout:   1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedLostItem:   1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedMarketItem: 1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedUser:       1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedEvent:      1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedDeal:       1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedNews:       1 }, { sparse: true });

module.exports = mongoose.model('Report', reportSchema);