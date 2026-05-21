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
  images: [{ type: String }],

  // Auto-delete after 4 hours
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shoutout', shoutoutSchema);