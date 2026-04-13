const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  business:    { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  description: String,
  expires:     Date,
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Stores the directory Category name (e.g. "Insurance", "Restaurant") directly.
  // No enum constraint — any category that exists in the directory is valid.
  category:    { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Deal', dealSchema);