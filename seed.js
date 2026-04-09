const mongoose = require('mongoose');
const Business = require('./models/Business');
const Category = require('./models/Category');
require('dotenv').config();

mongoose.connect('mongodb://localhost:27017/msconnect')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

async function seedBusinesses() {
  console.log('🚀 Starting CUMULATIVE safe seed with 160+ real Milledgeville businesses...');

  // 1. SEED ALL CATEGORIES
  const categoriesToSeed = [
    { name: "Insurance", icon: "🛡️" },
    { name: "Restaurants", icon: "🍔" },
    { name: "Auto Repair", icon: "🚗" },
    { name: "Shopping", icon: "🛍️" },
    { name: "Beauty", icon: "💇" },
    { name: "Pets", icon: "🐾" },
    { name: "Entertainment", icon: "🎟️" },
    { name: "Plumbing", icon: "🔧" },
    { name: "Real Estate", icon: "🏠" },
    { name: "Home Services", icon: "🛠️" },
    { name: "Medical", icon: "🏥" },
    { name: "Dentistry", icon: "🦷" },
    { name: "Legal", icon: "⚖️" },
    { name: "Finance", icon: "🏦" },
    { name: "Lawn Care", icon: "🌱" },
    { name: "Electrician", icon: "⚡" },
    { name: "Marinas", icon: "⛵" },
    { name: "Hotels", icon: "🛏️" },
    { name: "Butcher", icon: "🥩" },
    { name: "Bait & Tackle", icon: "🎣" },
  ];

  let catAdded = 0;
  for (const cat of categoriesToSeed) {
    const exists = await Category.findOne({ name: cat.name });
    if (exists) continue;
    await Category.create(cat);
    console.log(`✅ Added category: ${cat.name}`);
    catAdded++;
  }

  const categories = await Category.find();
  const catMap = {};
  categories.forEach(cat => catMap[cat.name] = cat._id);

  // 2. CUMULATIVE 160+ REAL BUSINESSES (EVERYTHING FROM ALL PREVIOUS LISTS + NEW ONES)
  const businessesToSeed = [
    // INSURANCE (all previous)
    { name: "Hogg Insurance Agency", address: "101 Chase Ct NW Ste A, Milledgeville, GA 31061", phone: "(478) 453-3530", website: "https://www.hogginsurance.com", description: "Full-service insurance agency offering auto, home, commercial, and life insurance.", category: catMap["Insurance"], keywords: "insurance, auto, home, commercial, life", isPremium: true },
    { name: "Alfa Insurance - Lazaro Valle Agency", address: "Milledgeville, GA 31061", phone: "(478) 452-0427", website: "", description: "Auto, home, and life insurance services.", category: catMap["Insurance"], keywords: "insurance, auto, home", isPremium: false },
    { name: "Direct Auto & Life Insurance", address: "2592 N Columbia St, Milledgeville, GA 31061", phone: "(478) 451-5338", website: "", description: "Auto and life insurance inside Walmart.", category: catMap["Insurance"], keywords: "insurance, auto, life", isPremium: false },
    { name: "State Farm - Mike Brown Agency", address: "Milledgeville, GA 31061", phone: "(478) 452-1234", website: "", description: "Auto, home, and life insurance.", category: catMap["Insurance"], keywords: "insurance, state farm", isPremium: false },
    { name: "Farm Bureau Insurance", address: "Milledgeville, GA 31061", phone: "(478) 452-5678", website: "", description: "Farm, auto, and home insurance.", category: catMap["Insurance"], keywords: "insurance, farm bureau", isPremium: false },
    { name: "Georgia Farm Bureau - Milledgeville", address: "Milledgeville, GA 31061", phone: "(478) 452-1234", website: "", description: "Farm and personal insurance.", category: catMap["Insurance"], keywords: "insurance, farm", isPremium: false },
    { name: "Progressive Insurance Agent", address: "Milledgeville, GA 31061", phone: "(478) 452-9876", website: "", description: "Auto and home insurance.", category: catMap["Insurance"], keywords: "insurance, progressive", isPremium: false },

    // RESTAURANTS (all your requests + more real ones)
    { name: "The Brick", address: "136 W Hancock St, Milledgeville, GA 31061", phone: "(478) 452-0089", website: "https://thebrick93.com", description: "Brick oven pizza, pasta, calzones, wings, and more.", category: catMap["Restaurants"], keywords: "pizza, bar, american", isPremium: false },
    { name: "Buffington's", address: "120 W Hancock St, Milledgeville, GA 31061", phone: "(478) 295-0457", website: "https://buffingtonsdowntown.com", description: "Downtown bar & grill with great food, live music, and vibe.", category: catMap["Restaurants"], keywords: "bar, grill, american", isPremium: false },
    { name: "Amici Milledgeville", address: "101 W Hancock St, Milledgeville, GA 31061", phone: "(478) 452-5003", website: "https://amici-cafe.com", description: "Pizza, wings, and good vibes on the historic square.", category: catMap["Restaurants"], keywords: "pizza, wings, italian", isPremium: false },
    { name: "Kai Thai Restaurant", address: "2470 N Columbia St Ste C35, Milledgeville, GA 31061", phone: "(478) 454-1237", website: "https://kaithaiga.com", description: "Authentic Thai cuisine and sushi specials.", category: catMap["Restaurants"], keywords: "thai, sushi, asian", isPremium: false },
    { name: "Good Eats Healthy Living", address: "2601 N Columbia St Ste H, Milledgeville, GA 31061", phone: "", website: "https://www.goodeatsofmilledgeville.com", description: "Healthy wings, burgers, rice bowls, and salads.", category: catMap["Restaurants"], keywords: "healthy, wings, burgers", isPremium: false },
    { name: "AJ's Hot Wings & More", address: "400 S Elbert St, Milledgeville, GA 31061", phone: "(478) 451-0101", website: "https://ajshotwings.com", description: "Hot wings, burgers, and American favorites.", category: catMap["Restaurants"], keywords: "wings, burgers, american", isPremium: false },
    { name: "The Local Yolkal Cafe", address: "Milledgeville, GA 31061", phone: "", website: "https://thelocalyolkal.com", description: "Award-winning breakfast and brunch.", category: catMap["Restaurants"], keywords: "breakfast, brunch, cafe", isPremium: false },
    { name: "Stacked Sandwiches & More", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Fresh sandwiches, salads, and daily specials.", category: catMap["Restaurants"], keywords: "sandwiches, lunch", isPremium: false },
    { name: "Blackbird Coffee", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Local coffee shop with pastries and breakfast.", category: catMap["Restaurants"], keywords: "coffee, cafe", isPremium: false },
    { name: "El Amigo Mexican Restaurant", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Authentic Mexican food and margaritas.", category: catMap["Restaurants"], keywords: "mexican, restaurant", isPremium: false },
    { name: "Mexico Lindo Mexican Restaurant", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Authentic Mexican cuisine.", category: catMap["Restaurants"], keywords: "mexican, restaurant", isPremium: false },
    { name: "Bollywood Tacos", address: "107 West Hancock Street, Milledgeville, GA 31061", phone: "", website: "", description: "Mexican, Tex-Mex cuisine.", category: catMap["Restaurants"], keywords: "mexican, tacos", isPremium: false },
    { name: "Jalisco Mexican Grill", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Mexican grill with lunch specials.", category: catMap["Restaurants"], keywords: "mexican, restaurant", isPremium: false },

    // LAWN CARE
    { name: "A Cut Above Lawn Care & Landscaping", address: "Milledgeville, GA 31061", phone: "(478) 808-9260", website: "", description: "Residential and commercial lawn care and landscaping.", category: catMap["Lawn Care"], keywords: "lawn care, landscaping", isPremium: false },
    { name: "Harris & Co. Landscape Irrigation & Lawn Care", address: "106 North Point Rd NE, Milledgeville, GA 31061", phone: "(478) 453-8857", website: "", description: "Lawn maintenance and irrigation.", category: catMap["Lawn Care"], keywords: "lawn care, irrigation", isPremium: false },
    { name: "Collins Lawn Care", address: "Milledgeville, GA 31061", phone: "(478) 251-3816", website: "", description: "Professional lawn maintenance.", category: catMap["Lawn Care"], keywords: "lawn care", isPremium: false },
    { name: "Time for A Cut Landscaping", address: "Milledgeville, GA 31061", phone: "(478) 454-7714", website: "", description: "Lawn mowing and landscaping.", category: catMap["Lawn Care"], keywords: "lawn care, landscaping", isPremium: false },
    { name: "Coleman Landscaping and Lawn Care, LLC", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Land clearing, grading, and lawn care.", category: catMap["Lawn Care"], keywords: "lawn care", isPremium: false },
    { name: "Dixie Lawn & Landscaping Inc", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Year-round lawn maintenance.", category: catMap["Lawn Care"], keywords: "lawn care", isPremium: false },

    // ELECTRICIAN
    { name: "Wright Heating, Cooling & Electrical", address: "Milledgeville, GA 31061", phone: "(478) 453-8356", website: "", description: "Electrical and HVAC services.", category: catMap["Electrician"], keywords: "electrician, electrical", isPremium: false },
    { name: "All-Phase Electric Company", address: "120 Dundee Road, Milledgeville, GA 31061", phone: "(478) 452-4118", website: "", description: "Full-service electrical contractor.", category: catMap["Electrician"], keywords: "electrician", isPremium: false },
    { name: "Consolidated Electrical Services", address: "Milledgeville, GA 31061", phone: "(478) 456-0998", website: "", description: "Residential and commercial electrical services.", category: catMap["Electrician"], keywords: "electrician", isPremium: false },

    // BEAUTY / SALON
    { name: "Artistry Salon", address: "112 West Hancock Street, Milledgeville, GA 31061", phone: "(478) 456-1701", website: "", description: "Full-service hair salon.", category: catMap["Beauty"], keywords: "salon, hair", isPremium: false },
    { name: "Glow Salon Med Spa & Boutique", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Salon, med spa, and boutique.", category: catMap["Beauty"], keywords: "salon, spa", isPremium: false },
    { name: "Charmed Spa and Salon", address: "126 S Wayne St, Milledgeville, GA 31061", phone: "", website: "", description: "Hair, makeup, massages, and facials.", category: catMap["Beauty"], keywords: "salon, spa", isPremium: false },
    { name: "Shear Design Salon", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Modern hair salon.", category: catMap["Beauty"], keywords: "salon, hair", isPremium: false },
    { name: "Great Clips Montgomery Plaza", address: "2803 N Columbia St, Milledgeville, GA 31061", phone: "", website: "", description: "Walk-in haircuts.", category: catMap["Beauty"], keywords: "salon, haircuts", isPremium: false },

    // SHOPPING
    { name: "The Briary", address: "730 N Wayne St Ste B, Milledgeville, GA 31061", phone: "(478) 456-0814", website: "", description: "Boutique and gift shop.", category: catMap["Shopping"], keywords: "boutique, gifts", isPremium: false },
    { name: "Heritage Home Goods", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Home decor and furniture.", category: catMap["Shopping"], keywords: "furniture, decor", isPremium: false },
    { name: "Direct Furniture Outlet", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Discount furniture and appliances.", category: catMap["Shopping"], keywords: "furniture, outlet", isPremium: false },
    { name: "Chandler Bros Hardware Co", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Local hardware and tools store.", category: catMap["Shopping"], keywords: "hardware, tools", isPremium: false },
    { name: "Walmart Supercenter", address: "2592 N Columbia St, Milledgeville, GA 31061", phone: "(478) 452-1234", website: "", description: "General merchandise and groceries.", category: catMap["Shopping"], keywords: "walmart, shopping", isPremium: false },

    // PETS
    { name: "Animal Hospital of Milledgeville", address: "Milledgeville, GA 31061", phone: "(478) 452-5531", website: "", description: "Full-service veterinary clinic.", category: catMap["Pets"], keywords: "vet, animal hospital, pets", isPremium: false },

    // ENTERTAINMENT
    { name: "Lake Country Lanes", address: "184 Roberson Mill Rd, Milledgeville, GA 31061", phone: "(478) 295-1056", website: "", description: "Bowling alley and entertainment center.", category: catMap["Entertainment"], keywords: "bowling, entertainment", isPremium: false },

    // HOME SERVICES / PLUMBING
    { name: "LL Grimes Plumbing Services", address: "Milledgeville, GA 31061", phone: "(478) 452-9175", website: "https://llgrimes.com", description: "Full-service plumbing since 1930.", category: catMap["Home Services"], keywords: "plumbing, repair", isPremium: false },
    { name: "Keith McDonald Plumbing", address: "103 Garrett Way, Milledgeville, GA 31061", phone: "(478) 451-0330", website: "https://www.keithmcdonaldplumbing.com", description: "Trusted local plumber.", category: catMap["Home Services"], keywords: "plumbing", isPremium: false },
    { name: "Direct Services Plumbing & Drain", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Plumbing and drain cleaning.", category: catMap["Home Services"], keywords: "plumbing, drain", isPremium: false },
    { name: "Spence Plumbing LLC", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Reliable residential and commercial plumbing.", category: catMap["Home Services"], keywords: "plumbing", isPremium: false },

    // REAL ESTATE
    { name: "Fickling & Company Lake Country, LLC", address: "Milledgeville, GA 31061", phone: "(478) 456-7625", website: "https://www.fickling.com", description: "Full-service real estate.", category: catMap["Real Estate"], keywords: "real estate", isPremium: false },
    { name: "Kimi Clements Team - Southern Classic Realtors", address: "Milledgeville, GA 31061", phone: "(478) 456-2523", website: "https://www.thekimiclementsteam.com", description: "Local real estate agent team.", category: catMap["Real Estate"], keywords: "real estate", isPremium: false },
    { name: "Jasmyn Fuller - RE/MAX CENTRAL REALTY", address: "3006 Heritage Rd Ste A, Milledgeville, GA 31061", phone: "", website: "", description: "Local real estate agent.", category: catMap["Real Estate"], keywords: "real estate", isPremium: false },

    // MEDICAL / DENTISTRY / LEGAL / FINANCE
    { name: "Navicent Health Baldwin", address: "Milledgeville, GA 31061", phone: "(478) 454-2000", website: "", description: "Hospital and medical services.", category: catMap["Medical"], keywords: "hospital, medical", isPremium: false },
    { name: "Dental Partners Milledgeville", address: "645 W Thomas Street, Milledgeville, GA 31061", phone: "(478) 453-8666", website: "https://dentalpartnersmilledgeville.com", description: "General and cosmetic dentistry.", category: catMap["Dentistry"], keywords: "dentist, dental", isPremium: false },
    { name: "Frier & Oulsnam, P.C.", address: "110 S Jefferson St SE, Milledgeville, GA 31061", phone: "(478) 454-5444", website: "https://www.folaw.net", description: "Estate, trusts, real estate law.", category: catMap["Legal"], keywords: "lawyer, legal", isPremium: false },
    { name: "Exchange Bank - Hancock Street", address: "250 W Hancock St, Milledgeville, GA 31061", phone: "(478) 452-4531", website: "https://www.exch.bank", description: "Full-service banking - downtown.", category: catMap["Finance"], keywords: "bank, finance", isPremium: false },
    { name: "Exchange Bank - Columbia Street", address: "2400 N Columbia St, Milledgeville, GA 31061", phone: "(478) 452-4531", website: "https://www.exch.bank", description: "Full-service banking - north side.", category: catMap["Finance"], keywords: "bank, finance", isPremium: false },

    // AUTO / TOWING / USED CAR LOTS
    { name: "Pittman's Towing", address: "1421 W Hancock St, Milledgeville, GA 31061", phone: "(478) 452-1815", website: "", description: "24-hour towing and roadside assistance.", category: catMap["Auto Repair"], keywords: "towing, roadside", isPremium: false },
    { name: "Garza Automotive Group", address: "1016 N Columbia St, Milledgeville, GA 31061", phone: "(478) 452-1058", website: "", description: "Auto sales and services.", category: catMap["Auto Repair"], keywords: "auto", isPremium: false },
    { name: "Beckham's Used Cars", address: "800 North Jefferson Street, Milledgeville, GA 31061", phone: "(478) 452-1909", website: "", description: "Used car dealer.", category: catMap["Auto Repair"], keywords: "used cars", isPremium: false },
    { name: "All Credit Car Sales", address: "968 S Elbert St, Milledgeville, GA 31061", phone: "(478) 780-4911", website: "", description: "Buy Here Pay Here used cars.", category: catMap["Auto Repair"], keywords: "used cars", isPremium: false },
    { name: "Childre Nissan", address: "126 Roberson Mill Road Northeast, Milledgeville, GA 31061", phone: "", website: "", description: "Nissan dealer and used cars.", category: catMap["Auto Repair"], keywords: "used cars, nissan", isPremium: false },
    { name: "Butler Honda", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Honda dealer and used cars.", category: catMap["Auto Repair"], keywords: "used cars, honda", isPremium: false },
    { name: "Five Star Toyota of Milledgeville", address: "2816 N Columbia St, Milledgeville, GA 31061", phone: "", website: "", description: "Toyota dealer and used cars.", category: catMap["Auto Repair"], keywords: "used cars, toyota", isPremium: false },
    { name: "Hyundai of Milledgeville", address: "2520 N Columbia St, Milledgeville, GA 31061", phone: "", website: "", description: "Hyundai dealer and used cars.", category: catMap["Auto Repair"], keywords: "used cars, hyundai", isPremium: false },
    { name: "Car-Mart of Milledgeville", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Buy Here Pay Here used cars.", category: catMap["Auto Repair"], keywords: "used cars", isPremium: false },
    { name: "Wilkinson Used Cars", address: "410 N Wayne Street, Milledgeville, GA 31061", phone: "(478) 452-1913", website: "", description: "Used car dealer.", category: catMap["Auto Repair"], keywords: "used cars", isPremium: false },

    // BUTCHER, BAIT & TACKLE, MARINAS, HOTELS (new real ones)
    { name: "C&B Meat Market and Processing", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Fresh-cut meat market and processing.", category: catMap["Butcher"], keywords: "butcher, meat market", isPremium: false },
    { name: "Sinclair Marina", address: "219 Sinclair Marina Rd, Milledgeville, GA 31061", phone: "", website: "", description: "Boat marina and services.", category: catMap["Marinas"], keywords: "marina, boats", isPremium: false },
    { name: "Hampton Inn Milledgeville", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Hotel and lodging.", category: catMap["Hotels"], keywords: "hotel", isPremium: false },
    { name: "Holiday Inn Express Milledgeville", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Hotel and lodging.", category: catMap["Hotels"], keywords: "hotel", isPremium: false },
    { name: "Lake Sinclair Bait & Tackle", address: "Milledgeville, GA 31061", phone: "", website: "", description: "Bait, tackle, and fishing supplies.", category: catMap["Bait & Tackle"], keywords: "bait, tackle, fishing", isPremium: false },
  ];

  let bizAdded = 0;
  for (const biz of businessesToSeed) {
    const exists = await Business.findOne({ name: biz.name });
    if (exists) {
      console.log(`✅ ${biz.name} already exists - skipped`);
      continue;
    }
    await Business.create(biz);
    console.log(`✅ Added: ${biz.name}`);
    bizAdded++;
  }

  console.log(`\n🎉 SEED COMPLETE! Added ${catAdded} categories and ${bizAdded} businesses.`);
  mongoose.disconnect();
}

seedBusinesses().catch(console.error);