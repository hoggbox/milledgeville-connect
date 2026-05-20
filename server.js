const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const LostItem = require('./models/LostItem');
const MarketplaceItem = require('./models/MarketplaceItem');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CRITICAL FIX: Increased body size limit for photo uploads ───
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use(cors());
app.use(express.static('public'));   // Serves all HTML/JS/CSS

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB: milledgevilleconnect'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api', require('./routes/api'));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MSConnect running at http://localhost:${PORT}`);
  console.log('📱 Open in any browser — works great on phones!');
});