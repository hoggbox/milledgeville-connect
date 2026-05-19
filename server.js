const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const LostItem = require('./models/LostItem');
const MarketplaceItem = require('./models/MarketplaceItem');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CRITICAL FIX: Increased body size limit for photo uploads ───
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ─── CORS: restrict to your actual domain in production ──────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:8080'];

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Capacitor)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ─── Security headers (supplements api.js securityHeaders) ───────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP is set per-route in api.js

// ─── Global rate limiter — last resort fallback ───────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
}));
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