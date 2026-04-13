const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  date:        { type: Date, required: true },
  location:    String,
  description: String,
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Stores the directory Category name (e.g. "Insurance", "Restaurant") directly.
  // No enum constraint — any category that exists in the directory is valid.
  category:    { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);