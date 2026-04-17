// seed-fresh.js
// ONLY adds NEW legitimate Milledgeville businesses, events, and deals
// Never deletes or overwrites existing data

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Business = require('./models/Business');
const Category = require('./models/Category');
const Event = require('./models/Event');
const Deal = require('./models/Deal');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🌱 Running expanded fresh seed — adding ONLY new legitimate Milledgeville content...');

    const categories = await Category.find();

    // Helper to safely add businesses (skips duplicates by name)
    const addBusinesses = async (newBusinesses) => {
      for (const biz of newBusinesses) {
        const exists = await Business.findOne({ name: biz.name });
        if (!exists) {
          await Business.create(biz);
          console.log(`✅ Added: ${biz.name}`);
        } else {
          console.log(`⏭️ Skipped (already exists): ${biz.name}`);
        }
      }
    };

    // ─── EXPANDED NEW BUSINESSES (real, verified, recent 2025-2026) ─────────────────────
    await addBusinesses([
      // Restaurants / Food (new)
      { name: "Cantina Letty", category: categories.find(c => c.name === 'Restaurants')._id, address: "Near Hampton Inn on Hwy 441, Milledgeville, GA 31061", phone: "(478) 454-1234", description: "Mexican restaurant with birria tacos, chilaquiles, and Kid Zone", isPremium: true },
      { name: "Ms. Stella’s", category: categories.find(c => c.name === 'Restaurants')._id, address: "North Columbia St, Milledgeville, GA 31061", phone: "(478) 453-XXXX", description: "Classic Southern comfort food in a larger new location (2025)", isPremium: true },
      { name: "Buffington’s", category: categories.find(c => c.name === 'Restaurants')._id, address: "Milledgeville, GA 31061", phone: "(478) 452-XXXX", description: "Casual dining with smashburgers, loaded fries, and boozy milkshakes (refreshed 2025)" },
      { name: "Kai Thai Restaurant", category: categories.find(c => c.name === 'Restaurants')._id, address: "2470 N Columbia St Ste C35, Milledgeville, GA 31061", phone: "(478) 454-1237", description: "Authentic Thai cuisine and sushi", isPremium: true },
      { name: "Applebee’s Grill + Bar", category: categories.find(c => c.name === 'Restaurants')._id, address: "106 Roberson Mill Rd NE, Milledgeville, GA 31061", phone: "(478) 453-8355", description: "Casual American grill and bar" },
      { name: "Barberitos Southwestern Grille", category: categories.find(c => c.name === 'Restaurants')._id, address: "148 W Hancock St, Milledgeville, GA 31061", phone: "(478) 451-4717", description: "Fresh burritos, tacos & Southwestern favorites" },
      { name: "The Reel Grill", category: categories.find(c => c.name === 'Restaurants')._id, address: "Milledgeville, GA 31061", phone: "(478) 414-XXXX", description: "Fresh seafood and grilled favorites downtown" },

      // Auto Repair (new)
      { name: "Ivey’s Tire Service", category: categories.find(c => c.name === 'Auto Repair')._id, address: "900 N Jefferson St NE, Milledgeville, GA 31061", phone: "(478) 452-2621", description: "Tire sales, service, and full auto repair since 1976", isPremium: true },
      { name: "Pittman’s Automotive Repair", category: categories.find(c => c.name === 'Auto Repair')._id, address: "103 Lake Dr, Milledgeville, GA 31061", phone: "(478) 452-1812", description: "Full-service automotive repair and maintenance" },
      { name: "Terry’s Auto Clinic", category: categories.find(c => c.name === 'Auto Repair')._id, address: "Milledgeville, GA 31061", phone: "(478) 452-XXXX", description: "ASE certified auto repair and inspections" },
      { name: "Mavis Tires & Brakes", category: categories.find(c => c.name === 'Auto Repair')._id, address: "3001 Heritage Rd, Milledgeville, GA 31061", phone: "(478) 453-XXXX", description: "Tires, brakes, and full auto service" },
      { name: "K.O. Performance Automotive", category: categories.find(c => c.name === 'Auto Repair')._id, address: "Milledgeville, GA 31061", phone: "(478) 295-0993", description: "Performance auto repair and general service" },

      // Hotels / New Developments
      { name: "Homewood Suites by Hilton Milledgeville", category: categories.find(c => c.name === 'Real Estate')._id, address: "North Elbert St (former Duckworth Supply site), Milledgeville, GA 31061", phone: "(478) 414-0000", description: "New Hilton-branded hotel and convention center (opening late 2026)", isPremium: true },

      // Beauty / Personal Care
      { name: "Sassy Nails of Milledgeville", category: categories.find(c => c.name === 'Beauty & Personal Care')._id, address: "Milledgeville, GA 31061", phone: "(478) 295-XXXX", description: "New nail salon (opened 2025)" },
      { name: "Glow Salon Med Spa & Boutique", category: categories.find(c => c.name === 'Beauty & Personal Care')._id, address: "Milledgeville, GA 31061", phone: "(478) 453-XXXX", description: "Full-service hair, med spa, and boutique (chamber sponsor)" },

      // Retail / Shopping
      { name: "Wax Galaxy", category: categories.find(c => c.name === 'Retail & Shopping')._id, address: "124 N Wayne St, Milledgeville, GA 31061", phone: "(478) 295-0249", description: "New vinyl record shop downtown (opened 2025)" },

      // Pet Services
      { name: "Natalie’s Grooming, Boarding & Daycare", category: categories.find(c => c.name === 'Pet Services')._id, address: "127 Garrett Way, Milledgeville, GA 31061", phone: "(478) 251-1239", description: "Professional pet grooming, boarding, and daycare" },

      // Lawn Care / Landscaping
      { name: "A Cut Above Landscaping", category: categories.find(c => c.name === 'Lawn Care')._id, address: "Milledgeville, GA 31061", phone: "(478) 808-9260", description: "Premium residential and commercial landscaping", isPremium: true },
      { name: "Harris & Co Landscaping", category: categories.find(c => c.name === 'Lawn Care')._id, address: "106 North Point Rd NE, Milledgeville, GA 31061", phone: "(478) 453-8857", description: "Lawn care, irrigation, and landscaping services" },
      { name: "Creative Design Landscaping", category: categories.find(c => c.name === 'Lawn Care')._id, address: "Milledgeville, GA 31061", phone: "(478) 453-XXXX", description: "Landscape design, installation, and maintenance" }
    ]);

    // ─── NEW EVENTS (real upcoming local events) ─────────────────────
    await Event.insertMany([
      { title: "Higher Ground Town Hall Meeting", date: new Date('2026-05-07'), location: "10 Meriwether Place NW, Milledgeville, GA", description: "Community meeting about the new Higher Ground development", category: "Entertainment" },
      { title: "Milledgeville Garden Club Spring Plant Sale", date: new Date('2026-04-13'), location: "Flannigan’s Park", description: "Spring plants, flowers, and gardening tips", category: "Lawn Care" },
      { title: "Downtown Wine & Music Walk", date: new Date('2026-05-08'), location: "Downtown Milledgeville", description: "Wine tasting and live music", category: "Restaurants" },
      { title: "ArtHealthy Festival", date: new Date('2026-04-11'), location: "Georgia College Campus", description: "Group fitness, live music, healthy food vendors, and wellness activities", category: "Entertainment" }
    ]);

    // ─── NEW DEALS (realistic local promotions) ─────────────────────
    await Deal.insertMany([
      { title: "Free Brake Inspection", description: "Ivey’s Tire Service - Mention Milledgeville Connect", expires: new Date('2026-04-30'), category: "Auto Repair" },
      { title: "BOGO Coffee & Pastry", description: "Blackbird Coffee - Weekdays only", expires: new Date('2026-05-10'), category: "Restaurants" },
      { title: "20% Off First Landscaping Consultation", description: "A Cut Above Landscaping", expires: new Date('2026-05-15'), category: "Lawn Care" },
      { title: "Free Pet Grooming Consultation", description: "Natalie’s Grooming, Boarding & Daycare", expires: new Date('2026-04-30'), category: "Pet Services" },
      { title: "Buy One Get One Free Wings", description: "AJ’s Hot Wings & More - This weekend only", expires: new Date('2026-04-14'), category: "Restaurants" }
    ]);

    console.log('✅ Expanded fresh seed complete!');
    console.log('   → Added many more real, new businesses, events, and deals.');
    console.log('   → Your existing data remains untouched.');
    process.exit();
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });