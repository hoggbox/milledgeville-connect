const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  replies: [replySchema],
  createdAt: { type: Date, default: Date.now }
});

const marketplaceItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  images: [{ type: String }],
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  category: { type: String, default: '' },   // e.g. Furniture, Pets, Electronics, Vehicles
  condition: { type: String, enum: ['new', 'like-new', 'used', 'fair'], default: 'used' },
  status: { type: String, enum: ['available', 'sold'], default: 'available' },
  comments: [commentSchema]
}, { timestamps: true });

module.exports = mongoose.model('MarketplaceItem', marketplaceItemSchema);