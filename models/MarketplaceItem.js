// ── MarketplaceItem.js ────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  text:      { type: String, required: true },
  author:    String,
  authorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  edited:    { type: Boolean, default: false },
  editedAt:  { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
  text:      { type: String, default: '' },
  image:     { type: String, default: null },
  author:    String,
  authorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies:   [replySchema],
  edited:    { type: Boolean, default: false },
  editedAt:  { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

commentSchema.pre('validate', function(next) {
  if (!this.text && !this.image) {
    return next(new Error('Comment must have text or an image'));
  }
  next();
});

const marketplaceItemSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  description:{ type: String, required: true },
  price:      { type: Number, required: true },
  images:     [{ type: String }],
  seller:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  category:   { type: String, default: '' },
  condition:  { type: String, enum: ['new', 'like-new', 'used', 'fair'], default: 'used' },
  status:     { type: String, enum: ['available', 'sold'], default: 'available' },
  soldAt:     { type: Date, default: null },
  hidden:     { type: Boolean, default: false },
  comments:   [commentSchema],

  // ── AUTO-MOD ──────────────────────────────────────────────────────────────
  flaggedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  autoHidden: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────
}, { timestamps: true });

module.exports = mongoose.model('MarketplaceItem', marketplaceItemSchema);