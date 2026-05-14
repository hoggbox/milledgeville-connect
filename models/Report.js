// models/Report.js
// Handles both "report a user" (from profile) and "flag a post" (from shoutout/alert)

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  // ─── What kind of report is this? ─────────────────────────────────────────
  type: {
    type: String,
    enum: ['user', 'shoutout'],
    required: true
  },

  // ─── Who filed the report ──────────────────────────────────────────────────
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ─── The user being reported (for type === 'user') ─────────────────────────
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // ─── The shoutout being flagged (for type === 'shoutout') ──────────────────
  reportedShoutout: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shoutout',
    default: null
  },

  // ─── Snapshot of content at time of report ────────────────────────────────
  snapshotText: { type: String, default: '' },

  reason: { type: String, default: '' },

  // ─── Admin workflow ────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'dismissed'],
    default: 'pending'
  },

  adminNote: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

// Compound index so we can quickly enforce one-flag-per-user-per-shoutout
reportSchema.index({ reporter: 1, reportedShoutout: 1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedUser: 1 },    { sparse: true });

module.exports = mongoose.model('Report', reportSchema);