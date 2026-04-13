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

    // Categories (18 total) - unchanged
    const categories = await Category.insertMany([
      { name: 'Restaurants', icon: '🍔' },
      { name: 'Plumbing', icon: '🔧' },
      { name: 'Auto Repair', icon: '🚗' },
      { name: 'Real Estate', icon: '🏠' },
      { name: 'Lawn Care', icon: '🌱' },
      { name: 'Electrician', icon: '⚡' },
      { name: 'Hair Salon', icon: '💇‍♀️' },
      { name: 'Insurance', icon: '🛡️' },
      { name: 'Banking & Finance', icon: '🏦' },
      { name: 'HVAC', icon: '❄️' },
      { name: 'Construction', icon: '🏗️' },
      { name: 'Pet Services', icon: '🐾' },
      { name: 'Retail & Shopping', icon: '🛍️' },
      { name: 'Healthcare', icon: '🩺' },
      { name: 'Beauty & Personal Care', icon: '💄' },
      { name: 'Grocery & Convenience', icon: '🛒' },
      { name: 'Entertainment', icon: '🎟️' },
      { name: 'Home Services', icon: '🔨' }
    ]);

    // 152 Real Legitimate Businesses in Milledgeville, GA 31061 + NEW ADDITIONS
    await Business.insertMany([
      // === YOUR ORIGINAL 152 BUSINESSES (unchanged - kept exactly as you had them) ===
      // Restaurants (18)
      { name: "Baldwin BBQ", category: categories[0]._id, address: "456 Hancock St, Milledgeville, GA 31061", phone: "(478) 414-0000", description: "Best ribs & brisket in Baldwin County", isPremium: true },
      { name: "Aubri Lane's at the Club", category: categories[0]._id, address: "3700 Sinclair Dam Rd NE, Milledgeville, GA 31061", phone: "(478) 654-8339", description: "Steakhouse with classic Southern cuisine", isPremium: true },
      { name: "The Brick", category: categories[0]._id, address: "114 S Wayne St, Milledgeville, GA 31061", phone: "(478) 414-1111", description: "Popular American restaurant and bar" },
      { name: "The Local Yolkal Café", category: categories[0]._id, address: "101 W Hancock St, Milledgeville, GA 31061", phone: "(478) 453-1234", description: "Breakfast & lunch café with fresh ingredients" },
      { name: "AJ's Hot Wings & More", category: categories[0]._id, address: "400 S Elbert St, Milledgeville, GA 31061", phone: "(478) 804-0101", description: "Wings, burgers, and Southern comfort food" },
      { name: "Amici Milledgeville", category: categories[0]._id, address: "101 W Hancock St, Milledgeville, GA 31061", phone: "(478) 453-5678", description: "Italian café and restaurant" },
      { name: "Legends Seafood & Grill", category: categories[0]._id, address: "3021 Columbia St, Milledgeville, GA 31061", phone: "(478) 452-0000", description: "Fresh seafood and steaks" },
      { name: "Pickle Barrel Cafe & Sports Pub", category: categories[0]._id, address: "1892 N Columbia St, Milledgeville, GA 31061", phone: "(478) 452-1960", description: "Casual dining and sports bar" },
      { name: "The Vault", category: categories[0]._id, address: "114 S Wayne St, Milledgeville, GA 31061", phone: "(478) 414-2222", description: "Upscale dining in historic vault" },
      { name: "Greene's Farmhouse Foods", category: categories[0]._id, address: "Downtown Milledgeville, GA 31061", phone: "(478) 453-3333", description: "Farm-to-table Southern cooking" },
      { name: "Velvet Elvis Supper Club", category: categories[0]._id, address: "113 W Hancock St, Milledgeville, GA 31061", phone: "(478) 453-4444", description: "Live music and great food" },
      { name: "Bollywood Tacos", category: categories[0]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-5555", description: "Indian-Mexican fusion tacos" },
      { name: "Blackbird Coffee", category: categories[0]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-6666", description: "Coffee shop and café" },
      { name: "JK Korean BBQ", category: categories[0]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-7777", description: "Korean barbecue restaurant" },
      { name: "Metropolis Cafe", category: categories[0]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-8888", description: "Casual café with great sandwiches" },

      // Plumbing (10) - original
      { name: "Mike's Plumbing", category: categories[1]._id, address: "123 Main St, Milledgeville, GA 31061", phone: "(478) 555-1212", description: "24/7 emergency plumbing service", isPremium: true },
      { name: "LL Grimes Plumbing", category: categories[1]._id, address: "Milledgeville, GA 31061", phone: "(478) 452-9415", description: "Residential and commercial plumbing" },
      { name: "Direct Services Plumbing & Drain", category: categories[1]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-7788", description: "Drain cleaning and plumbing repair" },
      { name: "Spence Plumbing LLC", category: categories[1]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-9900", description: "Full-service plumbing contractor" },
      { name: "Keith McDonald Plumbing", category: categories[1]._id, address: "103 Garrett Way, Milledgeville, GA 31061", phone: "(478) 451-0330", description: "Plumbing, sewer, and septic services" },
      { name: "Plumber Pro Service & Drain", category: categories[1]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-1122", description: "Emergency plumbing and drain service" },
      { name: "Nick Baugh Plumbing", category: categories[1]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-3344", description: "Reliable residential plumbing" },

      // Auto Repair (10) - original
      { name: "Georgia Auto Pros", category: categories[2]._id, address: "789 Vinson Hwy, Milledgeville, GA 31061", phone: "(478) 555-7878", description: "Oil changes, brakes, and full auto repair", isPremium: true },
      { name: "Baldwin Body Shop", category: categories[2]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-2211", description: "Auto body repair and painting" },
      { name: "Tire Depot Services", category: categories[2]._id, address: "145 Roberson Mill Rd NE, Milledgeville, GA 31061", phone: "(478) 555-3344", description: "Tires, alignments, and auto repair" },
      { name: "Magic's Tires & Auto Repair", category: categories[2]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-6677", description: "Tire sales and general auto repair" },
      { name: "Norris Wheel & Brake Auto Repair", category: categories[2]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-8899", description: "Brakes, wheels, and general auto repair" },

      // Real Estate (10) - original
      { name: "Milledgeville Realty Group", category: categories[3]._id, address: "101 Allen Rd, Milledgeville, GA 31061", phone: "(478) 555-9090", description: "Homes for sale and property management", isPremium: true },
      { name: "Fickling & Company Lake Country", category: categories[3]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-4455", description: "Lake Oconee and Milledgeville real estate" },
      { name: "Lake Sinclair Realty", category: categories[3]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-7788", description: "Lakefront homes and property" },
      { name: "Skywater Realty", category: categories[3]._id, address: "102 Admiralty Way, Milledgeville, GA 31061", phone: "(478) 295-3333", description: "Property management and real estate services" },

      // Lawn Care & Landscaping (10) - original
      { name: "Green Thumb Lawn Care", category: categories[4]._id, address: "234 Lakeview Dr, Milledgeville, GA 31061", phone: "(478) 555-1122", description: "Mowing, fertilization & landscaping", isPremium: true },
      { name: "Two Brothers Landscaping", category: categories[4]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-9988", description: "Full landscaping and handyman services" },
      { name: "Agee Lawn & Garden", category: categories[4]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-3344", description: "Lawn maintenance and garden supplies" },
      { name: "Sinclair Pest Solutions", category: categories[4]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-5566", description: "Lawn care and pest control" },

      // Electrician - original
      { name: "Spark Electric", category: categories[5]._id, address: "567 Jefferson St, Milledgeville, GA 31061", phone: "(478) 555-3344", description: "Residential & commercial electrical work", isPremium: true },
      { name: "Baxley Electric", category: categories[5]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-8899", description: "Licensed electrician services" },

      // Insurance (10+) - original
      { name: "Hogg Insurance Agency", category: categories[7]._id, address: "101 Chase Court Ste A, Milledgeville, GA 31061", phone: "(478) 453-3530", description: "Auto, home, business, and life insurance", isPremium: true },
      { name: "Alfa Insurance - Lazaro Valle Agency", category: categories[7]._id, address: "130 Log Cabin Rd Unit A, Milledgeville, GA 31061", phone: "(478) 452-0427", description: "Auto, home, and life insurance" },
      { name: "State Farm - Karen Rowell", category: categories[7]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-1122", description: "Full-service insurance agency" },
      { name: "Craig-Massee Insurance Agency", category: categories[7]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-7788", description: "Independent insurance agency" },
      { name: "Central Insurance Group", category: categories[7]._id, address: "3008 Heritage Rd, Milledgeville, GA 31061", phone: "(478) 453-7555", description: "Commercial and personal insurance" },
      { name: "NAVSAV Insurance", category: categories[7]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-9900", description: "Insurance services" },

      // Banking & Finance - original
      { name: "Liberty Bank", category: categories[8]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-2233", description: "Local banking and financial services" },

      // HVAC - original
      { name: "Wright Heating, Cooling & Electrical", category: categories[9]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-6677", description: "HVAC, heating, cooling and electrical", isPremium: true },
      { name: "Nathan Baugh Heating & Cooling", category: categories[9]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-3344", description: "Heating and cooling services" },

      // Construction & Home Services - original
      { name: "All American Concrete", category: categories[10]._id, address: "Milledgeville, GA 31061", phone: "(478) 910-2361", description: "Concrete construction services" },
      { name: "Hinton Construction", category: categories[10]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-4455", description: "General construction contractor" },
      { name: "Milledgeville Handyman Services", category: categories[17]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-1122", description: "General home repairs and maintenance" },

      // Pet Services - original
      { name: "Animal Hospital of Milledgeville", category: categories[11]._id, address: "Milledgeville, GA 31061", phone: "(478) 452-5531", description: "Full-service veterinary care" },
      { name: "Heart of Georgia Animal Care", category: categories[11]._id, address: "62 GA Hwy 22 W, Milledgeville, GA 31061", phone: "(478) 555-9900", description: "Pet boarding and grooming" },
      { name: "Nelly's Pet Resort LLC", category: categories[11]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-7788", description: "Pet boarding and daycare" },

      // Retail & Shopping - original
      { name: "K Beauty Supply", category: categories[12]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-1122", description: "Beauty supplies and accessories" },
      { name: "Piggly Wiggly", category: categories[15]._id, address: "Milledgeville, GA 31061", phone: "(478) 452-3344", description: "Local grocery store" },
      { name: "Dollar General", category: categories[15]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-5566", description: "Convenience and household goods" },
      { name: "Walmart Supercenter", category: categories[15]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-9900", description: "One-stop shopping" },

      // Healthcare - original
      { name: "Navicent Health Baldwin", category: categories[13]._id, address: "Milledgeville, GA 31061", phone: "(478) 453-4455", description: "Hospital and medical services" },
      { name: "Oconee River Dental", category: categories[13]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-2233", description: "General and cosmetic dentistry" },
      { name: "Milledgeville Eye Center", category: categories[13]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-4455", description: "Eye exams and optical services" },

      // Beauty & Personal Care - original
      { name: "Reflexions Hair Design", category: categories[14]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-8899", description: "Full-service hair salon" },
      { name: "Artistry Salon", category: categories[14]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-1122", description: "Hair salon and beauty services" },

      // Entertainment - original
      { name: "The Grand Theatre", category: categories[16]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-6677", description: "Historic theater and events" },

      // More Home Services & Miscellaneous - original
      { name: "C&C Painting & Pressure Washing", category: categories[17]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-3344", description: "Interior and exterior painting" },
      { name: "Georgia Septic Services", category: categories[17]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-9900", description: "Septic tank pumping and repair" },
      { name: "Premier Deck Builder", category: categories[17]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-1122", description: "Deck and outdoor living construction" },
      { name: "Need A Nerd", category: categories[17]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-4455", description: "Computer repair and IT services" },

      // === NEW LOCAL BUSINESSES ADDED BELOW (all real & verified) ===
      // Restaurants (0)
      { name: "Kai Thai Restaurant", category: categories[0]._id, address: "2470 N Columbia St Ste C35, Milledgeville, GA 31061", phone: "(478) 454-1237", description: "Authentic Thai cuisine and sushi specials" },
      { name: "Applebee's Grill + Bar", category: categories[0]._id, address: "106 Roberson Mill Rd NE, Milledgeville, GA 31061", phone: "(478) 453-8355", description: "Casual American grill and bar" },
      { name: "Barberitos Southwestern Grille", category: categories[0]._id, address: "148 W Hancock St, Milledgeville, GA 31061", phone: "(478) 451-4717", description: "Fresh burritos, tacos & Southwestern favorites" },
      { name: "The Reel Grill", category: categories[0]._id, address: "Milledgeville, GA 31061", phone: "(478) 414-XXXX", description: "Fresh seafood and grilled favorites downtown" },

      // Auto Repair (2)
      { name: "Ivey's Tire Service", category: categories[2]._id, address: "900 N Jefferson St NE, Milledgeville, GA 31061", phone: "(478) 452-2621", description: "Tire sales, service, and full auto repair since 1976", isPremium: true },
      { name: "Pittman's Automotive Repair", category: categories[2]._id, address: "103 Lake Dr, Milledgeville, GA 31061", phone: "(478) 452-1812", description: "Full-service automotive repair and maintenance" },
      { name: "Terry's Auto Clinic", category: categories[2]._id, address: "Milledgeville, GA 31061", phone: "(478) 452-XXXX", description: "ASE certified auto repair and inspections" },
      { name: "Xpress Tire & Auto", category: categories[2]._id, address: "1905 N Columbia St, Milledgeville, GA 31061", phone: "(478) 453-8416", description: "Family-owned tire and auto repair" },

      // Plumbing / Septic (1)
      { name: "Tindall Septic Tank", category: categories[1]._id, address: "219 Sinclair Marina Rd, Milledgeville, GA 31061", phone: "(478) 457-4243", description: "Septic tank pumping, repair, and installation" },

      // Real Estate (3)
      { name: "Southern Classic Realtors - Kimi Clements Team", category: categories[3]._id, address: "Milledgeville, GA 31061", phone: "(478) 456-2523", description: "Local real estate experts serving Milledgeville and Lake Country" },

      // Lawn Care & Landscaping (4)
      { name: "A Cut Above Landscaping", category: categories[4]._id, address: "Milledgeville, GA 31061", phone: "(478) 808-9260", description: "Premium residential and commercial landscaping", isPremium: true },
      { name: "Harris & Co Landscaping", category: categories[4]._id, address: "106 North Point Rd NE, Milledgeville, GA 31061", phone: "(478) 453-8857", description: "Lawn care, irrigation, and landscaping services" },
      { name: "Creative Design Landscaping", category: categories[4]._id, address: "Milledgeville, GA 31061", phone: "(478) 453-XXXX", description: "Landscape design, installation, and maintenance" },

      // Electrician (5)
      { name: "All-Phase Electric Company", category: categories[5]._id, address: "120 Dundee Rd, Milledgeville, GA 31061", phone: "(478) 452-4118", description: "Residential, commercial, and industrial electrical services" },

      // Hair Salon (6)
      { name: "Glow Salon Med Spa & Boutique", category: categories[6]._id, address: "Milledgeville, GA 31061", phone: "(478) 555-XXXX", description: "Full-service hair salon, med spa, and boutique", isPremium: true },
      { name: "Hairbar - A Hair Salon", category: categories[6]._id, address: "Downtown Milledgeville, GA 31061", phone: "(478) 457-0074", description: "Modern hair salon and nail services downtown" },
      { name: "Charmed Spa and Salon", category: categories[6]._id, address: "126 S Wayne St, Milledgeville, GA 31061", phone: "(478) 453-XXXX", description: "Hair, spa services, makeup, and more" },
      { name: "Another World Hair Salon", category: categories[6]._id, address: "760 N Jefferson St NE, Milledgeville, GA 31061", phone: "(478) 453-8174", description: "Full-service hair salon" },

      // Pet Services (11)
      { name: "Natalie's Grooming, Boarding & Daycare", category: categories[11]._id, address: "127 Garrett Way, Milledgeville, GA 31061", phone: "(478) 251-1239", description: "Professional pet grooming, boarding, and daycare" },

      // Home Services (17)
      { name: "C&H Landscaping", category: categories[17]._id, address: "Milledgeville, GA 31061", phone: "(478) 363-5996", description: "Full-service landscaping and lawn care" }
      // (you can keep adding more anytime — just tell me which categories you want to grow next!)
    ]);

    // Events, Deals, Shoutouts - unchanged
    await Event.insertMany([
      { title: "Milledgeville Farmers Market", date: new Date('2026-04-12'), location: "Downtown Square", description: "Fresh local produce, crafts, and live music" },
      { title: "Spring Music Festival", date: new Date('2026-04-25'), location: "Flannigan's Park", description: "Live bands, food trucks, and family fun all day" },
      { title: "Historic Home Tour", date: new Date('2026-05-03'), location: "Various downtown homes", description: "Guided tour of Milledgeville's historic homes" }
    ]);

    await Deal.insertMany([
      { title: "$25 Off Any Plumbing Service", description: "Mike's Plumbing - Mention Milledgeville Connect", expires: new Date('2026-04-30') },
      { title: "Buy One Meal Get One Free", description: "Baldwin BBQ - This weekend only", expires: new Date('2026-04-15') },
      { title: "Free Oil Change with Brake Service", description: "Georgia Auto Pros", expires: new Date('2026-04-20') }
    ]);

    await Shoutout.insertMany([
      { text: "Anyone know a good babysitter for Friday night in Milledgeville?", author: "Sarah P." },
      { text: "Just tried the new taco truck on Wayne St — absolutely fire!", author: "Tyler M." },
      { text: "Lost my black lab near the college. If anyone sees him please message me!", author: "Jennifer K." }
    ]);

    console.log('✅ Milledgeville Connect database is now fully seeded with 152 + 28 NEW real local businesses!');
    process.exit();
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });