const mongoose = require('mongoose');
const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  address: String,
  phone: String,
  website: String,
  description: String,
  keywords: [String],           // ← NEW: for smart search
  isPremium: { type: Boolean, default: false }
});
module.exports = mongoose.model('Business', businessSchema);