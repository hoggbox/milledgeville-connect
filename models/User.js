const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  email:           { type: String, required: true, unique: true, lowercase: true },
  password:        { type: String, required: true },
  lastLogin:       { type: Date, default: Date.now },
  profilePicture:  { type: String, default: '' },
  birthdate:       { type: Date },

  role:            { type: String, enum: ['user', 'business_owner', 'admin'], default: 'user' },
  verifiedOwner:   { type: Boolean, default: false },
  claimedBusiness: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },

  pendingClaim: {
    businessId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    businessName: { type: String, default: '' },
    ownerPhone:   { type: String, default: '' },
    message:      { type: String, default: '' },
    submittedAt:  { type: Date, default: null }
  },

  pendingNewBusiness: {
    businessName:    { type: String, default: '' },
    businessAddress: { type: String, default: '' },
    businessPhone:   { type: String, default: '' },
    website:         { type: String, default: '' },
    category:        { type: String, default: '' },
    description:     { type: String, default: '' },
    ownerPhone:      { type: String, default: '' },
    submittedAt:     { type: Date, default: null }
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);