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

const lostItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['lost', 'found'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  itemType: { type: String, default: '' }, // e.g. "Pet", "Wallet", "Phone", "Keys"
  isPet: { type: Boolean, default: false },
  location: String,
  date: Date,
  images: [{ type: String }],               // base64 data URIs
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  status: { type: String, enum: ['active', 'resolved'], default: 'active' },
  comments: [commentSchema]
}, { timestamps: true });

module.exports = mongoose.model('LostItem', lostItemSchema);