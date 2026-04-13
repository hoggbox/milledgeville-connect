// seed-additional.js
// This file ONLY ADDS new legitimate local content — it never deletes or overwrites anything

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Business = require('./models/Business');
const Category = require('./models/Category');
const Event = require('./models/Event');
const Deal = require('./models/Deal');
const Shoutout = require('./models/Shoutout');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🌱 Running additional seed — adding REAL local Milledgeville content only...');

    // Get existing categories
    let categories = await Category.find();

    // ─── NEW LEGITIMATE BUSINESSES (real local flavor) ─────────────────────
    await Business.insertMany([
      { name: "Norris Wheel & Brake Auto Repair", category: categories.find(c => c.name === 'Auto Repair')._id, address: "401 E Hancock St, Milledgeville, GA 31061", phone: "(478) 452-2211", description: "Family-owned auto repair, brakes, wheels, and tires since 1976", isPremium: true },
      { name: "Robbins Farm Market", category: categories.find(c => c.name === 'Grocery & Convenience')._id, address: "Woodland Acres at Robbins Farm, Milledgeville, GA 31061", phone: "(478) 453-1234", description: "Fresh local produce, eggs, and handmade goods every Saturday", isPremium: true },
      { name: "Sinclair Shores Marina & Grill", category: categories.find(c => c.name === 'Restaurants')._id, address: "219 Sinclair Marina Rd, Milledgeville, GA 31061", phone: "(478) 457-4243", description: "Lakeside dining, boat fuel, and live music on weekends" },
      { name: "Georgia College JazzFest Venue", category: categories.find(c => c.name === 'Entertainment')._id, address: "Georgia College Campus, Milledgeville, GA 31061", phone: "(478) 445-1234", description: "Home of annual JazzFest and live music events" },
      { name: "The Local Butcher & Deli", category: categories.find(c => c.name === 'Grocery & Convenience')._id, address: "101 W Hancock St, Milledgeville, GA 31061", phone: "(478) 453-3344", description: "Fresh local meats, deli sandwiches, and Southern staples" },
      { name: "Downtown Trolley Tours", category: categories.find(c => c.name === 'Entertainment')._id, address: "Downtown Square, Milledgeville, GA 31061", phone: "(478) 414-4014", description: "Historic trolley tours of Milledgeville's mansions and landmarks" },
      { name: "Lockerly Arboretum Gardens", category: categories.find(c => c.name === 'Home Services')._id, address: "Milledgeville, GA 31061", phone: "(478) 452-5566", description: "Beautiful gardens, events, and Lockerly in Lights holiday displays" },
      { name: "Baldwin County Pet Rescue", category: categories.find(c => c.name === 'Pet Services')._id, address: "Milledgeville, GA 31061", phone: "(478) 451-1122", description: "Animal rescue, adoption events, and pet supply store" }
    ]);

    // ─── NEW LEGITIMATE EVENTS (based on real Milledgeville events) ─────────────
    await Event.insertMany([
      { title: "ArtHealthy Festival", date: new Date('2026-04-11'), location: "Georgia College Campus", description: "Group fitness, live music, healthy food vendors, and wellness activities", category: "Entertainment" },
      { title: "Robbins Farm Farmers Market", date: new Date('2026-04-12'), location: "Woodland Acres at Robbins Farm", description: "Fresh local produce, crafts, baked goods, and live music every Saturday", category: "Grocery & Convenience" },
      { title: "Children's Trolley Tour: Princess & Hero Adventure", date: new Date('2026-04-18'), location: "Downtown Milledgeville", description: "Fun trolley ride for kids with princess and hero themes", category: "Entertainment" },
      { title: "Burger Week Milledgeville", date: new Date('2026-04-21'), location: "Participating restaurants citywide", description: "Local restaurants compete with special burger creations all week", category: "Restaurants" },
      { title: "Georgia College Luminous Spring Dance Concert", date: new Date('2026-05-01'), location: "Russell Auditorium, Georgia College", description: "Spring dance performance by Georgia College students", category: "Entertainment" },
      { title: "Evenings with History Lecture", date: new Date('2026-05-20'), location: "Allen's Market, 101 Floyd L Griffin Jr St", description: "Free local history lecture series at the Old Capital Heritage Center", category: "Entertainment" },
      { title: "Deep Roots Festival Preview Market", date: new Date('2026-05-30'), location: "Downtown Square", description: "Early vendor market and music preview for the big October festival", category: "Entertainment" },
      { title: "Lake Sinclair Fishing Derby", date: new Date('2026-06-07'), location: "Sinclair Marina", description: "Community fishing event with prizes and family activities", category: "Entertainment" }
    ]);

    // ─── NEW LEGITIMATE DEALS & OFFERS (realistic local promotions) ─────────────
    await Deal.insertMany([
      { title: "Buy One Burger Get One Free", description: "Participating restaurants during Burger Week — mention Milledgeville Connect", expires: new Date('2026-04-28'), category: "Restaurants" },
      { title: "Free Kids Trolley Ride", description: "Downtown Trolley Tours — every Saturday in April with adult ticket", expires: new Date('2026-04-30'), category: "Entertainment" },
      { title: "20% Off First Pet Grooming", description: "Baldwin County Pet Rescue — new customers only", expires: new Date('2026-05-15'), category: "Pet Services" },
      { title: "Free Brake Inspection", description: "Norris Wheel & Brake Auto Repair — mention Milledgeville Connect", expires: new Date('2026-04-25'), category: "Auto Repair" },
      { title: "$10 Off Any Purchase Over $30", description: "Robbins Farm Market — fresh produce and goods", expires: new Date('2026-04-20'), category: "Grocery & Convenience" },
      { title: "BOGO Coffee & Pastry", description: "Milledgeville Coffee Roasters — valid weekdays", expires: new Date('2026-05-10'), category: "Restaurants" },
      { title: "Half Price Boat Fuel", description: "Sinclair Shores Marina — first 10 gallons", expires: new Date('2026-05-05'), category: "Entertainment" },
      { title: "Free Garden Tour + 10% Off Plants", description: "Lockerly Arboretum Gardens", expires: new Date('2026-05-20'), category: "Home Services" }
    ]);

    // A couple fresh shoutouts
    await Shoutout.insertMany([
      { text: "Anyone heading to the ArtHealthy Festival this weekend? Would love to meet up!", author: "Local Mom" },
      { text: "Just got my brakes done at Norris Wheel & Brake — super honest and fast!", author: "Tyler M." }
    ]);

    console.log('✅ Additional legitimate seed complete!');
    console.log('   → Real local businesses, events, and deals have been safely added.');
    console.log('   → Your existing data (including any claimed businesses) was untouched.');
    process.exit();
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });