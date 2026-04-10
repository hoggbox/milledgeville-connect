const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['shoutout', 'question', 'recommendation', 'lost_found'], default: 'shoutout' },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  replies: [{
    text: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('Post', postSchema);