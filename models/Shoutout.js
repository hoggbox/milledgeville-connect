const mongoose = require('mongoose');

const shoutoutSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shoutout', shoutoutSchema);