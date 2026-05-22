// ── LostItem.js ───────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const lostItemSchema = new mongoose.Schema({
  type:       { type: String, enum: ['lost', 'found'], required: true },
  title:      { type: String, required: true },
  description:{ type: String, required: true },
  itemType:   { type: String, default: '' },
  isPet:      { type: Boolean, default: false },
  location:   String,
  date:       Date,
  images:     [{ type: String }],
  owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  status:     { type: String, enum: ['active', 'resolved'], default: 'active' },
  hidden:     { type: Boolean, default: false },
  comments:   [commentSchema],
 
  // ── AUTO-MOD ──────────────────────────────────────────────────────────────
  flaggedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  autoHidden: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────
}, { timestamps: true });
 
module.exports = mongoose.model('LostItem', lostItemSchema);