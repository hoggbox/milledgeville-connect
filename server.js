const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB: msconnect'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Auth middleware
const jwt = require('jsonwebtoken');
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

app.use('/api', require('./routes/api'));

app.listen(PORT, () => {
  console.log(`🚀 MSConnect running at http://localhost:${PORT}`);
  console.log('📱 Desktop + Mobile ready — looks premium!');
});