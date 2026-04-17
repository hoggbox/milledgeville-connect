const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, min: 1, max: 5, required: true },
  createdAt: { type: Date, default: Date.now }
});

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  address: String,
  phone: String,
  website: { type: String, default: null },
  description: String,
  keywords: [String],
  isPremium: { type: Boolean, default: false },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ratings: [ratingSchema],

  // ─── Restaurant / Food flag ────────────────────────────────────────────────
  // Set during claim — admin must approve claim for this to grant menu access
  isRestaurant: { type: Boolean, default: false },

  // ─── Menu upload (base64 data URI, max ~5 MB) ──────────────────────────────
  menu: { type: String, default: null },

  // ─── Extended business profile fields ─────────────────────────────────────
  email: { type: String, default: null },
  hours: { type: String, default: null },          // e.g. "Mon-Fri 8am-5pm • Sat 9am-3pm"
  priceRange: { type: String, enum: ['$', '$$', '$$$', '$$$$'], default: null },     // "$", "$$", "$$$", "$$$$"
  tags: [{ type: String }],                        // e.g. ["Family Owned", "Delivery", "24/7", "Wheelchair Accessible"]
  logo: { type: String, default: null },           // base64 data URI or image URL for small logo
  photos: [{ type: String, default: null }],   // array of base64 image strings, max 5
});

// Virtual for average rating
businessSchema.virtual('avgRating').get(function () {
  if (!this.ratings || this.ratings.length === 0) return 0;
  const sum = this.ratings.reduce((acc, r) => acc + r.score, 0);
  return Math.round((sum / this.ratings.length) * 10) / 10;
});

businessSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Business', businessSchema);