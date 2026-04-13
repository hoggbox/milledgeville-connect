const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  rating:   { type: Number, min: 1, max: 5, required: true },
  title:    { type: String, maxlength: 100 },
  body:     { type: String, maxlength: 1000 },
  createdAt:{ type: Date, default: Date.now }
});

// One review per user per business
reviewSchema.index({ business: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);