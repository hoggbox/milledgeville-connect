const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  location: String,
  description: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category: {
    type: String,
    enum: [
      'Community',
      'Food & Drink',
      'Music & Arts',
      'Sports & Fitness',
      'Family & Kids',
      'Business & Networking',
      'Education',
      'Other'
    ],
    default: 'Community'
  }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);