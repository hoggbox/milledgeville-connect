const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  lastLogin: { type: Date, default: Date.now },
  verifiedBusiness: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },

  // ─── Enhanced Profile Fields ───────────────────────────────────────────────
  bio: { type: String, default: '', maxlength: 280 },
  phone: { type: String, default: '' },
  neighborhood: { type: String, default: '' },
  website: { type: String, default: '' },
  avatar: { type: String, default: null },      // base64 data URI (≤ 2 MB)
  joinedAt: { type: Date, default: Date.now },

  // Social / vanity links
  instagram: { type: String, default: '' },
  facebook:  { type: String, default: '' },

  // Notification preferences
  notifyDeals:    { type: Boolean, default: true },
  notifyEvents:   { type: Boolean, default: true },
  notifyShoutouts:{ type: Boolean, default: false },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);