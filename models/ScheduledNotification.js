// models/ScheduledNotification.js
const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  body:        { type: String, required: true, trim: true, maxlength: 1000 },

  // Optional image stored as base64 data URL (same pattern as shoutout/business-post)
  image:       { type: String, default: null },

  // Which business this notification is for (optional — null = system/admin)
  business:    { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },

  // Deep-link routing
  targetType:  { type: String, default: 'home' },   // 'home','business','external','app','business-post'
  targetId:    { type: String, default: null },
  targetUrl:   { type: String, default: null },

  // Scheduling
  status:      { type: String, enum: ['draft','pending','sent','failed'], default: 'pending' },
  scheduledFor:{ type: Date, default: null },
  sentAt:      { type: Date, default: null },

  // Recurring
  repeat:      { type: String, default: 'once' },   // 'once' | 'daily' | 'weekly' | 'custom'
  days:        [{ type: String }],                  // ['Mon','Tue',…]
  endDate:     { type: Date, default: null },

  // Lightweight delivery stats (updated by broadcastPush wrapper)
  deliveryStats: {
    sent:   { type: Number, default: 0 },
    opens:  { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr:    { type: Number, default: 0 },
  },

  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('ScheduledNotification', scheduledNotificationSchema);