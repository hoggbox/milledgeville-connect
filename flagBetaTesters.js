// scripts/flagBetaTesters.js
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const result = await User.updateMany({}, { $set: { isBetaTester: true } });
  
  console.log(`✅ Flagged ${result.modifiedCount} users as beta testers`);
  await mongoose.disconnect();
}

run().catch(console.error);