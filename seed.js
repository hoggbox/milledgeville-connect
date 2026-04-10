// seed.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Business = require('./models/Business');
const Category = require('./models/Category');
const Shoutout = require('./models/Shoutout');
const Event = require('./models/Event');
const Deal = require('./models/Deal');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🧹 Clearing old data...');
    await Business.deleteMany({});
    await Category.deleteMany({});
    await Shoutout.deleteMany({});
    await Event.deleteMany({});
    await Deal.deleteMany({});

    console.log('🌱 Seeding Milledgeville Connect data...');

    // Categories
    const categories = await Category.insertMany([
      { name: 'Restaurants', icon: '🍔' },
      { name: 'Plumbing', icon: '🔧' },
      { name: 'Auto Repair', icon: '🚗' },
      { name: 'Real Estate', icon: '🏠' },
      { name: 'Lawn Care', icon: '🌱' },
      { name: 'Electrician', icon: '⚡' },
      { name: 'Hair Salon', icon: '💇‍♀️' }
    ]);

    // Businesses (more realistic Milledgeville ones)
    await Business.insertMany([
      { name: "Mike's Plumbing", category: categories[1]._id, address: "123 Main St, Milledgeville", phone: "(478) 555-1212", description: "24/7 emergency plumbing service", isPremium: true },
      { name: "Baldwin BBQ", category: categories[0]._id, address: "456 Hancock St", phone: "(478) 555-3434", description: "Best ribs & brisket in Baldwin County", isPremium: true },
      { name: "Georgia Auto Pros", category: categories[2]._id, address: "789 Vinson Hwy", phone: "(478) 555-7878", description: "Oil changes, brakes, and full auto repair" },
      { name: "Milledgeville Realty Group", category: categories[3]._id, address: "101 Allen Rd", phone: "(478) 555-9090", description: "Homes for sale and property management" },
      { name: "Green Thumb Lawn Care", category: categories[4]._id, address: "234 Lakeview Dr", phone: "(478) 555-1122", description: "Mowing, fertilization & landscaping" },
      { name: "Spark Electric", category: categories[5]._id, address: "567 Jefferson St", phone: "(478) 555-3344", description: "Residential & commercial electrical work" }
    ]);

    // Events
    await Event.insertMany([
      { title: "Milledgeville Farmers Market", date: new Date('2026-04-12'), location: "Downtown Square", description: "Fresh local produce, crafts, and live music" },
      { title: "Spring Music Festival", date: new Date('2026-04-25'), location: "Flannigan's Park", description: "Live bands, food trucks, and family fun all day" },
      { title: "Historic Home Tour", date: new Date('2026-05-03'), location: "Various downtown homes", description: "Guided tour of Milledgeville's historic homes" }
    ]);

    // Deals
    await Deal.insertMany([
      { title: "$25 Off Any Plumbing Service", description: "Mike's Plumbing - Mention Milledgeville Connect", expires: new Date('2026-04-30') },
      { title: "Buy One Meal Get One Free", description: "Baldwin BBQ - This weekend only", expires: new Date('2026-04-15') },
      { title: "Free Oil Change with Brake Service", description: "Georgia Auto Pros", expires: new Date('2026-04-20') }
    ]);

    // Shoutouts
    await Shoutout.insertMany([
      { text: "Anyone know a good babysitter for Friday night in Milledgeville?", author: "Sarah P." },
      { text: "Just tried the new taco truck on Wayne St — absolutely fire!", author: "Tyler M." },
      { text: "Lost my black lab near the college. If anyone sees him please message me!", author: "Jennifer K." }
    ]);

    console.log('✅ Milledgeville Connect database is now fully seeded!');
    process.exit();
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });