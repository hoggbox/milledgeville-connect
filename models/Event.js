// ── Event.js ──────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  date:       { type: Date, required: true },
  location:   String,
  description:String,
  owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category:   { type: String, default: '' },
  hidden:     { type: Boolean, default: false },
  rsvps:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
 
  // ── AUTO-MOD ──────────────────────────────────────────────────────────────
  flaggedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  autoHidden: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────
}, { timestamps: true });
 
module.exports = mongoose.model('Event', eventSchema);
 