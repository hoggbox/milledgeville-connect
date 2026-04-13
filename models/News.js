const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  summary: { type: String, required: true },
  content: { type: String, required: true },
  images: [{ type: String }],   // array of base64 data URIs or URL strings
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('News', newsSchema);