const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  date:        { type: Date, required: true },
  location:    String,
  description: String,
  // Track which business/owner posted this event
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
module.exports = mongoose.model('Event', eventSchema);