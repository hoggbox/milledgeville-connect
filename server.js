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

// ─── Content Security Policy ─────────────────────────────────────────────────
// Restricts where scripts/styles/images can load from, blocking most XSS attacks.
// Adjust worker-src / connect-src if you add new external APIs.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // ← tighten to a nonce in production
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",   // allow external images (logos, uploads)
      "connect-src 'self' https://api.open-meteo.com",  // weather API
      "frame-ancestors 'none'",              // blocks clickjacking
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')
  );
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking (belt-and-suspenders with frame-ancestors above)
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

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