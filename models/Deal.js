const mongoose = require('mongoose');
const dealSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: String,
  expires:     Date,
  // Track which business/owner posted this deal
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
module.exports = mongoose.model('Deal', dealSchema);