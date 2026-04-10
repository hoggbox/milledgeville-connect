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
  verifiedOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  hours: { type: Map, of: String, default: new Map() },
  photos: [{ type: String }],
  menu: [{
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: String
  }],
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('Business', businessSchema);