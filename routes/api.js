const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Shoutout = require('../models/Shoutout');
const Event = require('../models/Event');
const Deal = require('../models/Deal');

// ===================== AUTH =====================
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already used' });

    const user = new User({ name, email, password });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, lastLogin: user.lastLogin } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { id: user._id, name: user.name, email: user.email, lastLogin: user.lastLogin } });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ===================== PUBLIC =====================
router.get('/directory', async (req, res) => {
  const categories = await Category.find();
  const businesses = await Business.find().populate('category');
  res.json({ categories, businesses });
});

router.get('/shoutouts', async (req, res) => {
  const shoutouts = await Shoutout.find().sort({ createdAt: -1 }).limit(50);
  res.json(shoutouts);
});

router.get('/events', async (req, res) => {
  const events = await Event.find().sort({ date: 1 });
  res.json(events);
});

router.get('/deals', async (req, res) => {
  const deals = await Deal.find().sort({ expires: 1 });
  res.json(deals);
});

// ===================== PROTECTED =====================
router.post('/shoutouts', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    const { text } = req.body;
    const newShoutout = new Shoutout({ text, author: 'Verified User' });
    await newShoutout.save();
    res.json(newShoutout);
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ===================== ADMIN ONLY =====================
router.post('/admin/business', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user.email !== 'imhoggbox@gmail.com') return res.status(403).json({ message: 'Admin access only' });

    const { name, address, phone, website, description, categoryId } = req.body;
    const newBusiness = new Business({ name, address, phone, website, description, category: categoryId, isPremium: true });
    await newBusiness.save();
    res.json({ message: 'Business added successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/business/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user.email !== 'imhoggbox@gmail.com') return res.status(403).json({ message: 'Admin access only' });

    const { name, address, phone, website, description, categoryId } = req.body;
    const updated = await Business.findByIdAndUpdate(req.params.id, 
      { name, address, phone, website, description, category: categoryId }, 
      { new: true });
    res.json({ message: 'Business updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/business', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user.email !== 'imhoggbox@gmail.com') return res.status(403).json({ message: 'Admin access only' });

    const { name, address, phone, website, description, categoryId, keywords } = req.body;
    const newBusiness = new Business({
      name, address, phone, website, description, category: categoryId, keywords: keywords || [], isPremium: true
    });
    await newBusiness.save();
    res.json({ message: 'Business added successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/business/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user.email !== 'imhoggbox@gmail.com') return res.status(403).json({ message: 'Admin access only' });

    await Business.findByIdAndDelete(req.params.id);
    res.json({ message: 'Business deleted successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;