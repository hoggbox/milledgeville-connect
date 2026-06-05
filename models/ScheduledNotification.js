const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  body:         { type: String, required: true },
  image:        { type: String },          // base64 or URL
  business:     { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  targetType:   { type: String, default: 'home' },
  targetId:     { type: String },
  targetUrl:    { type: String },
  status:       { type: String, enum: ['pending', 'sent', 'failed', 'paused'], default: 'pending' },
  scheduledFor: { type: Date },
  sentAt:       { type: Date },
  lastSentAt:   { type: Date },          // most recent send time for recurring notifications
  repeat:       { type: String, default: 'once' },
  days:         [{ type: String }],
  endDate:      { type: Date },
  deliveryStats: {
    sent:   { type: Number, default: 0 },
    opens:  { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr:    { type: Number, default: 0 },
  }
}, { timestamps: true });

module.exports = mongoose.model('ScheduledNotification', scheduledNotificationSchema);