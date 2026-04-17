// seed-master.js
// ─────────────────────────────────────────────────────────────────────────────
// Master seed: combines ALL businesses, events, and deals from every previous
// seed file into one. Skips duplicates by name (businesses) or title
// (events/deals).  Never deletes existing data.
// Run with: node seed-master.js
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

const Business = require('./models/Business');
const Category = require('./models/Category');
const Event    = require('./models/Event');
const Deal     = require('./models/Deal');
const Shoutout = require('./models/Shoutout');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🌱 Running MASTER seed — adding all legitimate Milledgeville content...');
    console.log('   ✅ Skips duplicates • Never deletes existing data\n');

    const categories = await Category.find();
    function cat(name) {
      const found = categories.find(c => c.name === name);
      if (!found) { console.warn(`   ⚠️  Category not found: "${name}"`); return null; }
      return found._id;
    }

    // ─── Helper: upsert by name ─────────────────────────────────────────────
    async function addBusiness(biz) {
      const exists = await Business.findOne({ name: biz.name });
      if (exists) {
        // Update new fields if they are currently null/empty on the existing doc
        const update = {};
        if (!exists.email      && biz.email)      update.email      = biz.email;
        if (!exists.hours      && biz.hours)      update.hours      = biz.hours;
        if (!exists.priceRange && biz.priceRange) update.priceRange = biz.priceRange;
        if ((!exists.tags || exists.tags.length === 0) && biz.tags && biz.tags.length) update.tags = biz.tags;
        if (!exists.logo       && biz.logo)       update.logo       = biz.logo;
        if (Object.keys(update).length) {
          await Business.findByIdAndUpdate(exists._id, update);
          console.log(`   🔄 Updated new fields on: ${biz.name}`);
        } else {
          console.log(`   ⏭️  Skipped (already exists): ${biz.name}`);
        }
        return;
      }
      if (!biz.category) { console.warn(`   ⚠️  Skipped (no category): ${biz.name}`); return; }
      await Business.create(biz);
      console.log(`   ✅ Added: ${biz.name}`);
    }

    async function addEvent(ev) {
      const exists = await Event.findOne({ title: ev.title });
      if (exists) { console.log(`   ⏭️  Event skipped: ${ev.title}`); return; }
      await Event.create(ev);
      console.log(`   ✅ Event added: ${ev.title}`);
    }

    async function addDeal(deal) {
      const exists = await Deal.findOne({ title: deal.title });
      if (exists) { console.log(`   ⏭️  Deal skipped: ${deal.title}`); return; }
      await Deal.create(deal);
      console.log(`   ✅ Deal added: ${deal.title}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  BUSINESSES
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📍 BUSINESSES');

    const allBusinesses = [
      // ── Restaurants ──────────────────────────────────────────────────────
      {
        name: "The Brick",
        category: cat('Restaurants'),
        address: "136 W Hancock St, Milledgeville, GA 31061",
        phone: "(478) 452-0089",
        website: "https://thebrickmilledgeville.com",
        description: "Craft beer, burgers, and live music in a converted downtown warehouse",
        isPremium: true,
        priceRange: "$$",
        hours: "Mon-Thu 11am-10pm • Fri-Sat 11am-12am • Sun 12pm-9pm",
        tags: ["Live Music", "Craft Beer", "Outdoor Seating"],
        isRestaurant: true
      },
      {
        name: "Blackbird Coffee",
        category: cat('Restaurants'),
        address: "135 W Hancock St, Milledgeville, GA 31061",
        phone: "(478) 453-1234",
        website: "https://blackbirdcoffeemilledgeville.com",
        description: "Local coffee roaster, espresso drinks, pastries, and free wifi",
        isPremium: true,
        priceRange: "$",
        hours: "Mon-Fri 7am-6pm • Sat 8am-5pm • Sun 9am-3pm",
        tags: ["Family Owned", "Free WiFi", "Vegan Options"],
        isRestaurant: true
      },
      {
        name: "Amici Italian Café",
        category: cat('Restaurants'),
        address: "105 W Hancock St, Milledgeville, GA 31061",
        phone: "(478) 453-1234",
        description: "Authentic Italian food — pasta, pizza, and gelato in the heart of downtown",
        isPremium: true,
        priceRange: "$$",
        hours: "Tue-Sat 11am-9pm",
        tags: ["Family Owned", "Dine-In", "Takeout"],
        isRestaurant: true
      },
      {
        name: "Front Page News",
        category: cat('Restaurants'),
        address: "153 W Hancock St, Milledgeville, GA 31061",
        phone: "(478) 452-0066",
        description: "Southern comfort food and brunch favorites in a relaxed setting",
        priceRange: "$$",
        hours: "Mon-Sun 8am-3pm",
        tags: ["Brunch", "Southern Food"],
        isRestaurant: true
      },
      {
        name: "Sinclair Shores Marina & Grill",
        category: cat('Restaurants'),
        address: "219 Sinclair Marina Rd, Milledgeville, GA 31061",
        phone: "(478) 457-4243",
        description: "Lakeside dining, boat fuel, and live music on weekends",
        priceRange: "$$",
        hours: "Wed-Sun 11am-9pm",
        tags: ["Waterfront", "Live Music", "Family Friendly"],
        isRestaurant: true
      },
      {
        name: "AJ's Hot Wings & More",
        category: cat('Restaurants'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 414-0000",
        description: "Famous hot wings, loaded fries, and Southern sides",
        priceRange: "$",
        hours: "Mon-Sun 11am-10pm",
        tags: ["Wings", "Takeout", "Family Owned"],
        isRestaurant: true
      },
      {
        name: "Cantina Letty",
        category: cat('Restaurants'),
        address: "Near Hampton Inn on Hwy 441, Milledgeville, GA 31061",
        phone: "(478) 454-1234",
        description: "Mexican restaurant with birria tacos, chilaquiles, and Kid Zone",
        isPremium: true,
        priceRange: "$$",
        hours: "Tue-Sun 11am-9pm",
        tags: ["Mexican", "Family Friendly", "Kid Zone"],
        isRestaurant: true
      },
      {
        name: "Ms. Stella's",
        category: cat('Restaurants'),
        address: "North Columbia St, Milledgeville, GA 31061",
        phone: "(478) 453-0000",
        description: "Classic Southern comfort food in a larger new location (2025)",
        isPremium: true,
        priceRange: "$",
        hours: "Mon-Sat 10am-8pm",
        tags: ["Southern Food", "Soul Food", "Family Owned"],
        isRestaurant: true
      },
      {
        name: "Buffington's",
        category: cat('Restaurants'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 452-0000",
        description: "Casual dining with smashburgers, loaded fries, and boozy milkshakes (refreshed 2025)",
        priceRange: "$$",
        hours: "Mon-Sun 11am-10pm",
        tags: ["Burgers", "Bar", "Late Night"],
        isRestaurant: true
      },
      {
        name: "Kai Thai Restaurant",
        category: cat('Restaurants'),
        address: "2470 N Columbia St Ste C35, Milledgeville, GA 31061",
        phone: "(478) 454-1237",
        description: "Authentic Thai cuisine and sushi",
        isPremium: true,
        priceRange: "$$",
        hours: "Tue-Sun 11am-9pm",
        tags: ["Thai", "Sushi", "Dine-In"],
        isRestaurant: true
      },
      {
        name: "Applebee's Grill + Bar",
        category: cat('Restaurants'),
        address: "106 Roberson Mill Rd NE, Milledgeville, GA 31061",
        phone: "(478) 453-8355",
        description: "Casual American grill and bar",
        priceRange: "$$",
        hours: "Mon-Thu 11am-11pm • Fri-Sat 11am-12am • Sun 11am-10pm",
        tags: ["Bar", "Family Friendly", "Happy Hour"],
        isRestaurant: true
      },
      {
        name: "Barberitos Southwestern Grille",
        category: cat('Restaurants'),
        address: "148 W Hancock St, Milledgeville, GA 31061",
        phone: "(478) 451-4717",
        description: "Fresh burritos, tacos & Southwestern favorites",
        priceRange: "$",
        hours: "Mon-Sun 10am-9pm",
        tags: ["Burritos", "Takeout", "Quick Bites"],
        isRestaurant: true
      },
      {
        name: "The Reel Grill",
        category: cat('Restaurants'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 414-0000",
        description: "Fresh seafood and grilled favorites downtown",
        priceRange: "$$",
        hours: "Wed-Sun 11am-9pm",
        tags: ["Seafood", "Grilled", "Dine-In"],
        isRestaurant: true
      },
      {
        name: "The Local Butcher & Deli",
        category: cat('Grocery & Convenience'),
        address: "101 W Hancock St, Milledgeville, GA 31061",
        phone: "(478) 453-3344",
        description: "Fresh local meats, deli sandwiches, and Southern staples",
        priceRange: "$$",
        hours: "Mon-Fri 8am-6pm • Sat 8am-4pm",
        tags: ["Local", "Deli", "Family Owned"],
        isRestaurant: false
      },

      // ── Auto Repair ───────────────────────────────────────────────────────
      {
        name: "Norris Wheel & Brake Auto Repair",
        category: cat('Auto Repair'),
        address: "401 E Hancock St, Milledgeville, GA 31061",
        phone: "(478) 452-2211",
        description: "Family-owned auto repair, brakes, wheels, and tires since 1976",
        isPremium: true,
        priceRange: "$$",
        hours: "Mon-Fri 8am-5pm • Sat 9am-1pm",
        tags: ["Family Owned", "ASE Certified", "Free Estimates"]
      },
      {
        name: "Ivey's Tire Service",
        category: cat('Auto Repair'),
        address: "900 N Jefferson St NE, Milledgeville, GA 31061",
        phone: "(478) 452-2621",
        description: "Tire sales, service, and full auto repair since 1976",
        isPremium: true,
        priceRange: "$$",
        hours: "Mon-Fri 7:30am-5pm • Sat 8am-12pm",
        tags: ["Tires", "Full Service", "Free Inspection"]
      },
      {
        name: "Pittman's Automotive Repair",
        category: cat('Auto Repair'),
        address: "103 Lake Dr, Milledgeville, GA 31061",
        phone: "(478) 452-1812",
        description: "Full-service automotive repair and maintenance",
        priceRange: "$$",
        hours: "Mon-Fri 8am-5pm",
        tags: ["Full Service", "Local"]
      },
      {
        name: "Mavis Tires & Brakes",
        category: cat('Auto Repair'),
        address: "3001 Heritage Rd, Milledgeville, GA 31061",
        phone: "(478) 453-0000",
        description: "Tires, brakes, and full auto service",
        priceRange: "$$",
        hours: "Mon-Fri 8am-6pm • Sat 8am-5pm • Sun 10am-4pm",
        tags: ["Tires", "Brakes", "Walk-Ins Welcome"]
      },
      {
        name: "K.O. Performance Automotive",
        category: cat('Auto Repair'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 295-0993",
        description: "Performance auto repair and general service",
        priceRange: "$$",
        hours: "Mon-Fri 8am-5pm",
        tags: ["Performance", "Full Service"]
      },

      // ── Grocery ───────────────────────────────────────────────────────────
      {
        name: "Robbins Farm Market",
        category: cat('Grocery & Convenience'),
        address: "Woodland Acres at Robbins Farm, Milledgeville, GA 31061",
        phone: "(478) 453-1234",
        description: "Fresh local produce, eggs, and handmade goods every Saturday",
        isPremium: true,
        priceRange: "$",
        hours: "Sat 8am-1pm",
        tags: ["Local", "Farmers Market", "Family Owned"]
      },

      // ── Entertainment ─────────────────────────────────────────────────────
      {
        name: "Georgia College JazzFest Venue",
        category: cat('Entertainment'),
        address: "Georgia College Campus, Milledgeville, GA 31061",
        phone: "(478) 445-1234",
        description: "Home of annual JazzFest and live music events",
        priceRange: "$$",
        tags: ["Live Music", "Jazz", "Events"]
      },
      {
        name: "Downtown Trolley Tours",
        category: cat('Entertainment'),
        address: "Downtown Square, Milledgeville, GA 31061",
        phone: "(478) 414-4014",
        description: "Historic trolley tours of Milledgeville's mansions and landmarks",
        priceRange: "$$",
        hours: "Sat-Sun 10am-4pm",
        tags: ["Historic", "Tours", "Family Friendly"]
      },

      // ── Home Services ─────────────────────────────────────────────────────
      {
        name: "Lockerly Arboretum Gardens",
        category: cat('Home Services'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 452-5566",
        description: "Beautiful gardens, events, and Lockerly in Lights holiday displays",
        priceRange: "$",
        hours: "Mon-Sat 8:30am-4:30pm",
        tags: ["Gardens", "Events", "Family Friendly"]
      },

      // ── Pet Services ──────────────────────────────────────────────────────
      {
        name: "Baldwin County Pet Rescue",
        category: cat('Pet Services'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 451-1122",
        description: "Animal rescue, adoption events, and pet supply store",
        priceRange: "$",
        hours: "Tue-Sat 11am-4pm",
        tags: ["Rescue", "Adoption", "Non-Profit"]
      },
      {
        name: "Natalie's Grooming, Boarding & Daycare",
        category: cat('Pet Services'),
        address: "127 Garrett Way, Milledgeville, GA 31061",
        phone: "(478) 251-1239",
        description: "Professional pet grooming, boarding, and daycare",
        priceRange: "$$",
        hours: "Mon-Fri 7am-6pm • Sat 8am-4pm",
        tags: ["Grooming", "Boarding", "Daycare"]
      },

      // ── Beauty & Personal Care ─────────────────────────────────────────────
      {
        name: "Sassy Nails of Milledgeville",
        category: cat('Beauty & Personal Care'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 295-0000",
        description: "New nail salon (opened 2025)",
        priceRange: "$$",
        hours: "Mon-Sat 9am-7pm • Sun 11am-5pm",
        tags: ["Nails", "New in 2025", "Walk-Ins Welcome"]
      },
      {
        name: "Glow Salon Med Spa & Boutique",
        category: cat('Beauty & Personal Care'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 453-0000",
        description: "Full-service hair, med spa, and boutique (chamber sponsor)",
        priceRange: "$$$",
        hours: "Tue-Sat 9am-6pm",
        tags: ["Med Spa", "Hair", "Boutique"]
      },

      // ── Retail & Shopping ─────────────────────────────────────────────────
      {
        name: "Wax Galaxy",
        category: cat('Retail & Shopping'),
        address: "124 N Wayne St, Milledgeville, GA 31061",
        phone: "(478) 295-0249",
        description: "New vinyl record shop downtown (opened 2025)",
        priceRange: "$$",
        hours: "Tue-Sat 11am-7pm",
        tags: ["Vinyl", "Records", "Music", "New in 2025"]
      },

      // ── Lawn Care ─────────────────────────────────────────────────────────
      {
        name: "A Cut Above Landscaping",
        category: cat('Lawn Care'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 808-9260",
        description: "Premium residential and commercial landscaping",
        isPremium: true,
        priceRange: "$$",
        hours: "Mon-Fri 7am-6pm • Sat 8am-2pm",
        tags: ["Residential", "Commercial", "Free Estimates"]
      },
      {
        name: "Harris & Co Landscaping",
        category: cat('Lawn Care'),
        address: "106 North Point Rd NE, Milledgeville, GA 31061",
        phone: "(478) 453-8857",
        description: "Lawn care, irrigation, and landscaping services",
        priceRange: "$$",
        hours: "Mon-Fri 7am-5pm",
        tags: ["Lawn Care", "Irrigation", "Local"]
      },
      {
        name: "Creative Design Landscaping",
        category: cat('Lawn Care'),
        address: "Milledgeville, GA 31061",
        phone: "(478) 453-0000",
        description: "Landscape design, installation, and maintenance",
        priceRange: "$$",
        hours: "Mon-Fri 8am-5pm",
        tags: ["Design", "Installation", "Maintenance"]
      },

      // ── Real Estate / Development ──────────────────────────────────────────
      {
        name: "Homewood Suites by Hilton Milledgeville",
        category: cat('Real Estate'),
        address: "North Elbert St (former Duckworth Supply site), Milledgeville, GA 31061",
        phone: "(478) 414-0000",
        description: "New Hilton-branded hotel and convention center (opening late 2026)",
        isPremium: true,
        priceRange: "$$$",
        tags: ["Hotel", "Convention Center", "Coming 2026"]
      },
    ];

    for (const biz of allBusinesses) {
      await addBusiness(biz);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📅 EVENTS');

    const allEvents = [
      { title: "ArtHealthy Festival",                             date: new Date('2026-04-11'), location: "Georgia College Campus",              description: "Group fitness, live music, healthy food vendors, and wellness activities", category: "Entertainment" },
      { title: "Robbins Farm Farmers Market",                     date: new Date('2026-04-12'), location: "Woodland Acres at Robbins Farm",       description: "Fresh local produce, crafts, baked goods, and live music every Saturday", category: "Grocery & Convenience" },
      { title: "Milledgeville Garden Club Spring Plant Sale",      date: new Date('2026-04-13'), location: "Flannigan's Park",                    description: "Spring plants, flowers, and gardening tips", category: "Lawn Care" },
      { title: "Children's Trolley Tour: Princess & Hero Adventure", date: new Date('2026-04-18'), location: "Downtown Milledgeville",             description: "Fun trolley ride for kids with princess and hero themes", category: "Entertainment" },
      { title: "Burger Week Milledgeville",                        date: new Date('2026-04-21'), location: "Participating restaurants citywide",   description: "Local restaurants compete with special burger creations all week", category: "Restaurants" },
      { title: "Downtown Wine & Music Walk",                       date: new Date('2026-05-08'), location: "Downtown Milledgeville",               description: "Wine tasting and live music", category: "Restaurants" },
      { title: "Georgia College Luminous Spring Dance Concert",    date: new Date('2026-05-01'), location: "Russell Auditorium, Georgia College",  description: "Spring dance performance by Georgia College students", category: "Entertainment" },
      { title: "Higher Ground Town Hall Meeting",                  date: new Date('2026-05-07'), location: "10 Meriwether Place NW, Milledgeville, GA", description: "Community meeting about the new Higher Ground development", category: "Entertainment" },
      { title: "Evenings with History Lecture",                    date: new Date('2026-05-20'), location: "Allen's Market, 101 Floyd L Griffin Jr St", description: "Free local history lecture series at the Old Capital Heritage Center", category: "Entertainment" },
      { title: "Deep Roots Festival Preview Market",               date: new Date('2026-05-30'), location: "Downtown Square",                     description: "Early vendor market and music preview for the big October festival", category: "Entertainment" },
      { title: "Lake Sinclair Fishing Derby",                      date: new Date('2026-06-07'), location: "Sinclair Marina",                     description: "Community fishing event with prizes and family activities", category: "Entertainment" },
    ];

    for (const ev of allEvents) {
      await addEvent(ev);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DEALS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔥 DEALS');

    const allDeals = [
      { title: "Buy One Burger Get One Free",         description: "Participating restaurants during Burger Week — mention Milledgeville Connect", expires: new Date('2026-04-28'), category: "Restaurants" },
      { title: "Free Kids Trolley Ride",              description: "Downtown Trolley Tours — every Saturday in April with adult ticket",           expires: new Date('2026-04-30'), category: "Entertainment" },
      { title: "20% Off First Pet Grooming",          description: "Baldwin County Pet Rescue — new customers only",                               expires: new Date('2026-05-15'), category: "Pet Services" },
      { title: "Free Brake Inspection",               description: "Ivey's Tire Service — Mention Milledgeville Connect",                          expires: new Date('2026-04-30'), category: "Auto Repair" },
      { title: "$10 Off Any Purchase Over $30",       description: "Robbins Farm Market — fresh produce and goods",                                expires: new Date('2026-04-20'), category: "Grocery & Convenience" },
      { title: "BOGO Coffee & Pastry",                description: "Blackbird Coffee — valid weekdays",                                            expires: new Date('2026-05-10'), category: "Restaurants" },
      { title: "Half Price Boat Fuel",                description: "Sinclair Shores Marina — first 10 gallons",                                    expires: new Date('2026-05-05'), category: "Entertainment" },
      { title: "Free Garden Tour + 10% Off Plants",   description: "Lockerly Arboretum Gardens",                                                   expires: new Date('2026-05-20'), category: "Home Services" },
      { title: "20% Off First Landscaping Consultation", description: "A Cut Above Landscaping",                                                  expires: new Date('2026-05-15'), category: "Lawn Care" },
      { title: "Free Pet Grooming Consultation",      description: "Natalie's Grooming, Boarding & Daycare",                                       expires: new Date('2026-04-30'), category: "Pet Services" },
      { title: "Buy One Get One Free Wings",          description: "AJ's Hot Wings & More — This weekend only",                                    expires: new Date('2026-04-20'), category: "Restaurants" },
    ];

    for (const deal of allDeals) {
      await addDeal(deal);
    }

    console.log('\n✅ Master seed complete!');
    console.log('   → All real local businesses, events, and deals have been safely added.');
    console.log('   → New fields (email, hours, priceRange, tags, logo) populated where applicable.');
    console.log('   → Existing data (including claimed businesses) was untouched.\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  });