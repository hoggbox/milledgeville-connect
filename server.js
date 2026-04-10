const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));   // Serves all HTML/JS/CSS

// Connect to your local MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB: msconnect'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api', require('./routes/api'));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MSConnect running at http://localhost:${PORT}`);
  console.log('📱 Open in any browser — works great on phones!');
});