// seed-master.js - EVENTS ONLY (Updated May 2026)
// Adds real, upcoming Milledgeville events without touching businesses or deals

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Event = require('./models/Event');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🌱 Updating Events only (safe & idempotent)...');

    const events = [
      {
        title: "Concert: Haydon Parker Duo",
        date: new Date('2026-05-08'),
        location: "Allen's Market, 101 Floyd L Griffin Jr St",
        description: "Live acoustic music at Allen's Market",
        category: "Entertainment"
      },
      {
        title: "Robbins Farm Farmer's Market",
        date: new Date('2026-05-09'),
        location: "Woodland Acres at Robbins Farm",
        description: "Fresh local produce, crafts, baked goods & live music",
        category: "Grocery & Convenience"
      },
      {
        title: "Mother's Day Tea Luncheon",
        date: new Date('2026-05-10'),
        location: "Woodland Acres at Robbins Farm",
        description: "Special Mother's Day tea and luncheon",
        category: "Entertainment"
      },
      {
        title: "May Eggs & Issues",
        date: new Date('2026-05-20'),
        location: "Milledgeville-Baldwin County Chamber",
        description: "Monthly Chamber breakfast meeting with guest speakers",
        category: "Entertainment"
      },
      {
        title: "Historic Trolley Tour",
        date: new Date('2026-05-30'),
        location: "Milledgeville Visitor's Center",
        description: "Narrated historic trolley tour of Milledgeville",
        category: "Entertainment"
      },
      {
        title: "Central State Hospital Campus Tour",
        date: new Date('2026-05-09'),
        location: "Central State Hospital Campus",
        description: "Guided historical tour of the historic hospital grounds",
        category: "Entertainment"
      },
      {
        title: "Chamber 101",
        date: new Date('2026-06-05'),
        location: "Milledgeville-Baldwin County Chamber",
        description: "Learn how the Chamber works and how to get involved",
        category: "Entertainment"
      },
      {
        title: "Connections @ the Chamber",
        date: new Date('2026-06-12'),
        location: "Milledgeville-Baldwin County Chamber",
        description: "Networking event for local businesses",
        category: "Entertainment"
      },
      {
        title: "Annual Awards Dinner & Gala",
        date: new Date('2026-06-20'),
        location: "Milledgeville-Baldwin County Chamber",
        description: "Annual chamber awards and celebration",
        category: "Entertainment"
      },
      {
        title: "Deep Roots Festival",
        date: new Date('2026-10-17'),
        location: "Historic Downtown Milledgeville",
        description: "Biggest annual event — live music, vendors, car show, BBQ, and KidZone",
        category: "Entertainment"
      },
      {
        title: "Burger Week Milledgeville",
        date: new Date('2026-05-15'),
        location: "Participating restaurants citywide",
        description: "Local restaurants compete with special burger creations",
        category: "Restaurants"
      },
      {
        title: "Town Hall Meeting - Higher Ground",
        date: new Date('2026-05-07'),
        location: "10 Meriwether Place NW",
        description: "Community meeting about the new Higher Ground development",
        category: "Entertainment"
      },
      {
        title: "Evenings with History Lecture",
        date: new Date('2026-05-20'),
        location: "Allen's Market",
        description: "Free local history lecture series",
        category: "Entertainment"
      },
      {
        title: "Family Paddle on the Oconee River",
        date: new Date('2026-07-18'),
        location: "Oconee River Greenway",
        description: "Family-friendly paddle event on the Oconee River",
        category: "Entertainment"
      }
    ];

    let added = 0;
    for (const ev of events) {
      const exists = await Event.findOne({ title: ev.title });
      if (!exists) {
        await Event.create(ev);
        added++;
        console.log(`✅ Added: ${ev.title}`);
      } else {
        console.log(`⏭️ Skipped (already exists): ${ev.title}`);
      }
    }

    console.log(`\n🎉 Done! Added ${added} new events.`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });