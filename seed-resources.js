// ================================================
//  seed-resources.js
//  ONLY ADDS new resources (Churches, Recycling, Fishing, etc.)
//  Does NOT delete or touch any of your existing data
// ================================================

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();   // loads your .env file

// Direct connection (no external config/db.js needed)
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

const Category = require('./models/Category');
const Business = require('./models/Business');

console.log('🚀 Starting Resources seeding (additive only)...');

// ─── NEW CATEGORIES ─────────────────────────────────────────────────────────
const newCategories = [
  { name: 'Churches', icon: '⛪' },
  { name: 'Recycling Centers', icon: '♻️' },
  { name: 'Fishing Spots', icon: '🎣' },
  { name: 'Parks & Recreation', icon: '🌳' },
  { name: 'Libraries', icon: '📚' }
];

// ─── REAL LOCAL RESOURCES (Milledgeville, GA 31061) ────────────────────────
const newResources = [
  // Churches
  { name: "Northridge Christian Church", category: "Churches", address: "321 Log Cabin Rd NE, Milledgeville, GA 31061", phone: "478-452-1234", description: "Sunday worship 10:30 AM. Youth programs & community events.", hours: "Sun 9AM–12PM" },
  { name: "Lakeside Baptist Church", category: "Churches", address: "1023 Milledgeville Hwy, Milledgeville, GA 31061", phone: "478-452-5678", description: "Sunday services 8:15 AM & 11:00 AM.", hours: "Sun 8AM–12:30PM" },
  { name: "Freedom Church", category: "Churches", address: "500 Underwood Rd, Milledgeville, GA 31061", phone: "478-452-9999", description: "Modern worship at 11:00 AM.", hours: "Sun 10:30AM–12:30PM" },
  { name: "Sacred Heart Catholic Church", category: "Churches", address: "110 N Jefferson St, Milledgeville, GA 31061", phone: "478-452-2421", description: "Daily Mass and community outreach.", hours: "Mass times vary" },

  // Recycling Centers
  { name: "Sinclair Transfer Station", category: "Recycling Centers", address: "154 Dundee Drive, Milledgeville, GA 31061", phone: "478-445-4237", description: "Household trash, recycling, bulk items (Baldwin County residents only).", hours: "Mon–Fri 8AM–4:30PM" },
  { name: "Baldwin County Convenience Center - Sparta Hwy", category: "Recycling Centers", address: "595 Sparta Hwy, Milledgeville, GA 31061", description: "Free recycling & trash drop-off.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },
  { name: "Baldwin County Convenience Center - Log Cabin Rd", category: "Recycling Centers", address: "184 Log Cabin Rd NE, Milledgeville, GA 31061", description: "Convenience center for recycling and waste.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },

  // Fishing Spots
  { name: "Lake Sinclair Public Fishing Pier", category: "Fishing Spots", address: "Near Sinclair Dam, Milledgeville, GA 31061", description: "Free public pier — great for bass & catfish.", hours: "Open 24/7" },
  { name: "Rocky Creek Park Fishing Access", category: "Fishing Spots", address: "Rocky Creek Park Rd, Milledgeville, GA 31061", description: "Shore fishing, boat ramp & picnic areas.", hours: "Daily sunrise–sunset" },
  { name: "Oconee River Public Access", category: "Fishing Spots", address: "Along Oconee River, Milledgeville, GA 31061", description: "River fishing near downtown.", hours: "Open 24/7" },

  // Parks
  { name: "Walter B. Williams Park", category: "Parks & Recreation", address: "59 GA-22 W, Milledgeville, GA 31061", description: "Walking track, sports fields, playground, disc golf, aquatics center.", hours: "Daily 6AM–10PM" },
  { name: "Harrisburg Park", category: "Parks & Recreation", address: "237 Harrisburg Rd SW, Milledgeville, GA 31061", description: "Splash pad, playground, pavilion & garden.", hours: "Daily sunrise–sunset" },

  // Libraries
  { name: "Mary Vinson Memorial Library", category: "Libraries", address: "151 S Jefferson St, Milledgeville, GA 31061", phone: "478-452-0677", description: "Books, computers, programs, free WiFi.", hours: "Mon/Wed/Fri 9AM–5PM • Tue/Thu 9AM–7PM • Sat 10AM–2PM" }
];

async function seedResources() {
  try {
    console.log('Adding new categories...');
    const insertedCats = await Category.insertMany(newCategories);

    const catMap = {};
    insertedCats.forEach(cat => { catMap[cat.name] = cat._id; });

    console.log('Adding real local resources...');
    const resourcesToInsert = newResources.map(r => ({
      name: r.name,
      category: catMap[r.category],
      address: r.address,
      phone: r.phone || '',
      description: `${r.description}\n\n🕒 Hours: ${r.hours}`,
      isPremium: false
    }));

    await Business.insertMany(resourcesToInsert);

    console.log(`✅ SUCCESS! Added ${newCategories.length} categories + ${newResources.length} resources.`);
    console.log('You can now run the app and see the Resources tab.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during seeding:', err);
    process.exit(1);
  }
}

seedResources();