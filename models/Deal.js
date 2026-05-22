// ── Deal.js ───────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const dealSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  business:   { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  description:String,
  expires:    Date,
  owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category:   { type: String, default: '' },
  hidden:     { type: Boolean, default: false },
 
  // ── AUTO-MOD ──────────────────────────────────────────────────────────────
  flaggedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  autoHidden: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────
}, { timestamps: true });
 
module.exports = mongoose.model('Deal', dealSchema);