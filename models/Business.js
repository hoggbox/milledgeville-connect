const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String },
  website: { type: String },
  description: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  keywords: [{ type: String }],
  isPremium: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // ← NEW — links the verified owner (used by claim system)
  verifiedOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ←←← THIS WAS MISSING — fixes the rating 500 error
  ratings: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 }
  }]
});

module.exports = mongoose.model('Business', businessSchema);