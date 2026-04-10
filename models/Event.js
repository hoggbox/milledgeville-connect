const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  location: String,
  description: String
});
module.exports = mongoose.model('Event', eventSchema);