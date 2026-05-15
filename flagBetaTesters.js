const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
  await mongoose.connect('mongodb+srv://jhogg39:!Snake1988@cluster0.0uyxp2y.mongodb.net/milledgevilleconnect?retryWrites=true&w=majority');
  
  const result = await User.updateMany({}, { $set: { isBetaTester: true } });
  
  console.log(`✅ Flagged ${result.modifiedCount} users as beta testers`);
  await mongoose.disconnect();
}

run().catch(console.error);