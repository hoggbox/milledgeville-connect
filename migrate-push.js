// migrate-push.js
const mongoose = require('mongoose');
const PushSubscription = require('./models/PushSubscription');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI);

async function migrate() {
  const subs = await PushSubscription.find({});
  console.log(`Found ${subs.length} subscriptions to migrate...`);

  for (const sub of subs) {
    sub.nativeToken = null;   // or leave undefined
    sub.platform = 'web';
    await sub.save();
  }

  console.log('Migration completed!');
  process.exit(0);
}

migrate();