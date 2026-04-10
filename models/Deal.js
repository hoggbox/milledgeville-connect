const mongoose = require('mongoose');
const dealSchema = new mongoose.Schema({
  title: { type: String, required: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  description: String,
  expires: Date
});
module.exports = mongoose.model('Deal', dealSchema);