/**
 * seed-physicians-category.js
 *
 * ONE-TIME script to add "Physicians & Dentists" to the Category collection.
 *
 * Run from your project root:
 *   node seed-physicians-category.js
 *
 * Requires MONGODB_URI in your environment (or edit the URI below directly).
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name';

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  icon: String,
});
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const result = await Category.findOneAndUpdate(
    { name: 'Physicians & Dentists' },           // find by name
    { $setOnInsert: { name: 'Physicians & Dentists', icon: '🩺' } }, // only set on new doc
    { upsert: true, new: true, runValidators: true }
  );

  console.log('✅ Category ready:', result.name, result.icon, '— _id:', result._id);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});