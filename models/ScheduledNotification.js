const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  image: { type: String, default: null },           // base64 or URL
  targetType: { 
    type: String, 
    enum: ['all', 'business', 'page', 'external', 'none'], 
    default: 'all' 
  },
  targetId: { type: String, default: null },        // businessId or page name
  targetUrl: { type: String, default: null },       // for external links
  scheduledFor: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'sent', 'failed', 'cancelled'], 
    default: 'pending' 
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' }, // optional link to business
  sentAt: { type: Date },
  deliveryStats: {
    attempted: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  error: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('ScheduledNotification', scheduledNotificationSchema);