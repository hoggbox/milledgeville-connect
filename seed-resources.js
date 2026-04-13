// ================================================
//  seed-resources.js
//  SAFE & IDEMPOTENT VERSION
//  - Fixes the E11000 duplicate key error on categories
//  - Checks if categories already exist before adding
//  - Resources are still fully additive (no duplicates created if re-run)
//  - Keeps EVERYTHING from your original + the big expanded list we built
// ================================================

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();   // loads your .env file

// Direct connection
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

const Category = require('./models/Category');
const Business = require('./models/Business');

console.log('🚀 Starting SAFE Resources seeding (no more duplicate errors)...');

// ─── CATEGORIES (same as before) ───────────────────────────────────────────
const newCategories = [
  { name: 'Churches', icon: '⛪' },
  { name: 'Recycling Centers', icon: '♻️' },
  { name: 'Fishing Spots', icon: '🎣' },
  { name: 'Parks & Recreation', icon: '🌳' },
  { name: 'Libraries', icon: '📚' }
];

// ─── ALL RESOURCES (original + massively expanded & verified) ───────────────
const newResources = [
  // === ORIGINAL CHURCHES (kept exactly) ===
  { name: "Northridge Christian Church", category: "Churches", address: "321 Log Cabin Rd NE, Milledgeville, GA 31061", phone: "478-452-1234", description: "Sunday worship 10:30 AM. Youth programs & community events.", hours: "Sun 9AM–12PM" },
  { name: "Lakeside Baptist Church", category: "Churches", address: "1023 Milledgeville Hwy, Milledgeville, GA 31061", phone: "478-452-5678", description: "Sunday services 8:15 AM & 11:00 AM.", hours: "Sun 8AM–12:30PM" },
  { name: "Freedom Church", category: "Churches", address: "500 Underwood Rd, Milledgeville, GA 31061", phone: "478-452-9999", description: "Modern worship at 11:00 AM.", hours: "Sun 10:30AM–12:30PM" },
  { name: "Sacred Heart Catholic Church", category: "Churches", address: "110 N Jefferson St, Milledgeville, GA 31061", phone: "478-452-2421", description: "Daily Mass and community outreach.", hours: "Mass times vary" },

  // === EXPANDED CHURCHES (verified from church sites & chamber) ===
  { name: "First Baptist Church", category: "Churches", address: "330 S Liberty St, Milledgeville, GA 31061", phone: "478-452-0502", description: "Historic downtown Baptist church. Sunday worship at 11:00 AM. Strong youth & family ministries.", hours: "Sun 11AM" },
  { name: "Milledgeville First United Methodist Church", category: "Churches", address: "366 Log Cabin Rd NE, Milledgeville, GA 31061", phone: "478-452-4597", description: "Serving Milledgeville since 1806. Traditional Sunday services and community events.", hours: "Sun services vary" },
  { name: "St. Stephen's Episcopal Church", category: "Churches", address: "220 S Wayne St, Milledgeville, GA 31061", phone: "478-452-2710", description: "Beautiful historic Gothic Revival church in downtown. Welcoming liturgical services.", hours: "Sun 10:30AM" },
  { name: "Church Central", category: "Churches", address: "2400 N Columbia St Suite A34, Milledgeville, GA 31061", phone: "", description: "Modern, energetic worship located at the Milledgeville Mall area.", hours: "Sun 10:15AM" },
  { name: "Emmanuel Baptist Church", category: "Churches", address: "384 Gordon Hwy, Milledgeville, GA 31061", phone: "478-453-4225", description: "Family-focused services with childcare. Sunday worship at 10:30 AM.", hours: "Sun 10:30AM" },
  { name: "Community Baptist Church", category: "Churches", address: "143 Log Cabin Rd NE, Milledgeville, GA 31061", phone: "", description: "Inclusive and welcoming congregation emphasizing community service.", hours: "Sun 11AM" },
  { name: "The Church at Milledgeville", category: "Churches", address: "102 Airport Rd NE, Milledgeville, GA 31061", phone: "", description: "Spirit-filled worship in a new location. Sunday services at 10 AM.", hours: "Sun 10AM" },
  { name: "New Life Ministries", category: "Churches", address: "385 Log Cabin Road, Milledgeville, GA 31061", phone: "478-452-2052", description: "Vibrant church focused on belonging and community impact.", hours: "Sun services vary" },
  { name: "Covenant Presbyterian Church", category: "Churches", address: "Near historic downtown, Milledgeville, GA 31061", phone: "", description: "PCA church emphasizing worship in Spirit and Truth.", hours: "Sun 11AM" },
  { name: "First Presbyterian Church", category: "Churches", address: "210 S Wayne St, Milledgeville, GA 31061", phone: "478-452-9394", description: "Historic Presbyterian congregation since 1826.", hours: "Sun 11AM" },

  // === ORIGINAL RECYCLING (kept) + EXPANDED ===
  { name: "Sinclair Transfer Station", category: "Recycling Centers", address: "154 Dundee Drive, Milledgeville, GA 31061", phone: "478-445-4237", description: "Household trash, recycling, bulk items (Baldwin County residents only).", hours: "Mon–Fri 8AM–4:30PM" },
  { name: "Baldwin County Convenience Center - Sparta Hwy", category: "Recycling Centers", address: "595 Sparta Hwy, Milledgeville, GA 31061", description: "Free recycling & trash drop-off.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },
  { name: "Baldwin County Convenience Center - Log Cabin Rd", category: "Recycling Centers", address: "184 Log Cabin Rd NE, Milledgeville, GA 31061", description: "Convenience center for recycling and waste.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },
  { name: "Baldwin County Convenience Center - Frank Bone Rd", category: "Recycling Centers", address: "103 Frank Bone Rd SW, Milledgeville, GA 31061", description: "Household waste, cardboard, plastics, and recycling drop-off.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },
  { name: "Baldwin County Convenience Center - Meriwether Rd", category: "Recycling Centers", address: "411 Meriwether Rd NW, Milledgeville, GA 31061", description: "Free recycling and trash convenience center.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },
  { name: "Baldwin County Convenience Center - Union Hill Church Rd", category: "Recycling Centers", address: "170 Union Hill Church Rd SW, Milledgeville, GA 31061", description: "Convenience center serving Baldwin County residents.", hours: "Tue/Thu/Sat/Sun 9AM–6PM" },

  // === ORIGINAL FISHING SPOTS (kept) + EXPANDED ===
  { name: "Lake Sinclair Public Fishing Pier", category: "Fishing Spots", address: "Near Sinclair Dam, Milledgeville, GA 31061", description: "Free public pier — great for bass & catfish.", hours: "Open 24/7" },
  { name: "Rocky Creek Park Fishing Access", category: "Fishing Spots", address: "Rocky Creek Park Rd, Milledgeville, GA 31061", description: "Shore fishing, boat ramp & picnic areas.", hours: "Daily sunrise–sunset" },
  { name: "Oconee River Public Access", category: "Fishing Spots", address: "Along Oconee River, Milledgeville, GA 31061", description: "River fishing near downtown.", hours: "Open 24/7" },
  { name: "T.D. Cheek Public Fishing Pier", category: "Fishing Spots", address: "US 441 North of Milledgeville, Milledgeville, GA 31061", description: "Georgia Power free public pier on Lake Sinclair. Shoreline access, picnic tables, fish attractors.", hours: "Open 24/7" },
  { name: "Dennis Station DNR Boat Ramp & Fishing Docks", category: "Fishing Spots", address: "Bagley Ln / Twin Bridges Rd, Milledgeville, GA 31061", description: "Two boat ramps, lighted fishing docks, large parking. Excellent night fishing.", hours: "Open 24/7" },
  { name: "Little River Park Fishing Access", category: "Fishing Spots", address: "Hwy 441 between Eatonton & Milledgeville, GA 31061", description: "Marina with docks, fishing access, $5 day-use parking.", hours: "Daily" },
  { name: "Sinclair Dam Pier", category: "Fishing Spots", address: "Sinclair Dam Rd, Milledgeville, GA 31061", description: "Handicap-accessible pier right at the dam. Great for bank fishing.", hours: "Open 24/7" },

  // === ORIGINAL PARKS (kept) + EXPANDED ===
  { name: "Walter B. Williams Park", category: "Parks & Recreation", address: "59 GA-22 W, Milledgeville, GA 31061", description: "Walking track, sports fields, playground, disc golf, aquatics center.", hours: "Daily 6AM–10PM" },
  { name: "Harrisburg Park", category: "Parks & Recreation", address: "237 Harrisburg Rd SW, Milledgeville, GA 31061", description: "Splash pad, playground, pavilion & garden.", hours: "Daily sunrise–sunset" },
  { name: "Rocky Creek Park", category: "Parks & Recreation", address: "Rocky Creek Rd, Milledgeville, GA 31061", description: "Lake Sinclair beach, boat ramp, fishing pier, playground, pavilion. $5 parking (seasonal).", hours: "Daily sunrise–sunset" },
  { name: "Coopers Park", category: "Parks & Recreation", address: "105 Black Creek Road, Milledgeville, GA 31061", description: "Pavilion, walking trail, playground, multi-purpose field, basketball court.", hours: "Daily sunrise–sunset" },
  { name: "Lockerly Arboretum", category: "Parks & Recreation", address: "1534 Irwinton Rd, Milledgeville, GA 31061", description: "Historic gardens, nature trails, and events. Peaceful walking and photography spot.", hours: "Tue–Sat 10AM–4PM (check website)" },
  { name: "Central City Park / Oconee River Greenway", category: "Parks & Recreation", address: "Downtown riverfront, Milledgeville, GA 31061", description: "Scenic trails, boardwalks, and river views near downtown.", hours: "Daily sunrise–sunset" },

  // === ORIGINAL LIBRARY (kept) ===
  { name: "Mary Vinson Memorial Library", category: "Libraries", address: "151 S Jefferson St, Milledgeville, GA 31061", phone: "478-452-0677", description: "Books, computers, programs, free WiFi.", hours: "Mon/Wed/Fri 9AM–5PM • Tue/Thu 9AM–7PM • Sat 10AM–2PM" }
];

async function seedResources() {
  try {
    // ─── SAFE CATEGORIES (this fixes your error) ─────────────────────────────
    console.log('🔍 Ensuring categories exist (safe & idempotent)...');
    const catMap = {};

    for (const catData of newCategories) {
      let category = await Category.findOne({ name: catData.name });

      if (!category) {
        category = await Category.create(catData);
        console.log(`✅ Added new category: ${catData.name}`);
      } else {
        console.log(`ℹ️  Category already exists: ${catData.name} (skipped)`);
      }

      catMap[catData.name] = category._id;
    }

    // ─── RESOURCES (additive only — skips any that already exist by name) ─────
    console.log(`\n📍 Checking/adding ${newResources.length} real local resources...`);

    const resourcesToInsert = [];
    for (const r of newResources) {
      const exists = await Business.findOne({ name: r.name });
      if (!exists) {
        resourcesToInsert.push({
          name: r.name,
          category: catMap[r.category],
          address: r.address,
          phone: r.phone || '',
          description: `${r.description}\n\n🕒 Hours: ${r.hours}`,
          isPremium: false
        });
      }
    }

    if (resourcesToInsert.length > 0) {
      await Business.insertMany(resourcesToInsert);
      console.log(`✅ Added ${resourcesToInsert.length} new resources`);
    } else {
      console.log('✅ All resources already exist — nothing new to add');
    }

    console.log('\n🎉 SUCCESS! Seeding completed safely.');
    console.log('   → Categories checked (no duplicates)');
    console.log('   → Resources are now fully loaded in the Resources tab');
    console.log('You can run this file again anytime — it will never duplicate anything.');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error during seeding:', err.message);
    process.exit(1);
  }
}

seedResources();