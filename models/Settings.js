const mongoose = require('mongoose');

// ─── SETTINGS MODEL ───────────────────────────────────────────────────────────
// Singleton document (always _id: 'site') for site-wide admin settings.
// Access via Settings.getSiteSettings() — creates the doc on first use.

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'site' },

    // Global push notification kill-switch.
    // When true, no push is sent to anyone except PUSH_EXEMPT_EMAILS in api.js.
    pushNotificationsDisabled: { type: Boolean, default: false },
  },
  {
    _id: false,       // we supply our own string _id
    timestamps: true, // updatedAt tells you when admin last toggled it
  }
);

// Convenience method — always returns the one site settings doc.
settingsSchema.statics.getSiteSettings = async function () {
  let doc = await this.findById('site');
  if (!doc) {
    doc = await this.create({ _id: 'site' });
  }
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);