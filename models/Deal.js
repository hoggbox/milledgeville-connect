const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title: { type: String, required: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  description: String,
  expires: Date,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category: {
    type: String,
    enum: [
      'Food & Drink',
      'Shopping',
      'Health & Beauty',
      'Home & Services',
      'Entertainment',
      'Automotive',
      'Other'
    ],
    default: 'Other'
  }
}, { timestamps: true });

module.exports = mongoose.model('Deal', dealSchema);