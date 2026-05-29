/**
 * create-text-indexes.js
 * Run this ONCE to create MongoDB text indexes for search.
 * Safe to re-run.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Use your actual env variable name
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set in your .env file.');
  process.exit(1);
}

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    async function addTextIndex(collectionName, fields, weights = {}) {
      try {
        const col = db.collection(collectionName);
        const indexSpec = Object.fromEntries(fields.map(f => [f, 'text']));
        const indexOpts = {
          name: `${collectionName}_text_search`,
          default_language: 'english',
          ...(Object.keys(weights).length > 0 && { weights }),
        };
        await col.createIndex(indexSpec, indexOpts);
        console.log(`  ✓ ${collectionName}: text index on [${fields.join(', ')}]`);
      } catch (err) {
        if (err.code === 85 || err.code === 86) {
          console.warn(`  ⚠️  ${collectionName}: text index already exists (skipped)`);
        } else {
          throw err;
        }
      }
    }

    console.log('\nBuilding text indexes…\n');

    await Promise.all([
      addTextIndex('businesses', ['name', 'description', 'tags', 'address'], {
        name: 10, description: 3, tags: 5, address: 1,
      }),
      addTextIndex('events', ['title', 'description', 'location'], {
        title: 10, description: 3, location: 2,
      }),
      addTextIndex('deals', ['title', 'description'], {
        title: 10, description: 3,
      }),
      addTextIndex('news', ['title', 'summary', 'content'], {
        title: 10, summary: 5, content: 1,
      }),
      addTextIndex('shoutouts', ['text', 'author'], {
        text: 10, author: 2,
      }),
      addTextIndex('lostitems', ['title', 'description', 'authorName'], {
        title: 10, description: 3, authorName: 1,
      }),
      addTextIndex('marketplaceitems', ['title', 'description', 'authorName', 'category'], {
        title: 10, description: 3, category: 5, authorName: 1,
      }),
    ]);

    console.log('\n✅ All text indexes created successfully.\n');
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();