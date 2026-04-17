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

const shoutoutSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  
  // NEW: Photo support
  images: [{ type: String }],   // base64 data URIs

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shoutout', shoutoutSchema);