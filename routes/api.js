const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Post = require('../models/Post');
const Event = require('../models/Event');
const Deal = require('../models/Deal');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendMail(subject, html) {
  await transporter.sendMail({ from: process.env.EMAIL_USER, to: 'imhoggbox@gmail.com', subject, html }).catch(console.error);
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.email !== 'imhoggbox@gmail.com') return res.status(403).json({ message: 'Admin access only' });
    next();
  });
}

async function requireVerifiedOwner(req, res, next) {
  await requireAuth(req, res, () => {
    if (!req.user.verifiedOwner || !req.user.claimedBusiness) return res.status(403).json({ message: 'Verified business owner required' });
    next();
  });
}

// ====================== AUTH ======================
router.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user = await User.create({ name, email, password });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { ...user.toObject(), password: undefined } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ message: 'Invalid credentials' });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { ...user.toObject(), password: undefined } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).select('-password').populate('claimedBusiness');
  res.json(user);
});

router.put('/auth/profile', requireAuth, async (req, res) => {
  const { name, birthdate, profilePicture } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id, { name, birthdate, profilePicture }, { new: true }).select('-password');
  res.json({ message: 'Profile updated!', user });
});

// ====================== CATEGORIES & DIRECTORY ======================
router.get('/categories', async (req, res) => {
  const cats = await Category.find().sort({ name: 1 });
  res.json(cats);
});

router.get('/directory', async (req, res) => {
  const businesses = await Business.find().populate('category');
  res.json(businesses);
});

// ====================== BUSINESS FEATURES ======================
router.post('/business/:id/review', requireAuth, async (req, res) => {
  const { rating, text } = req.body;
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ message: 'Business not found' });
  business.reviews.push({ user: req.user._id, rating, text });
  await business.save();
  res.json({ message: 'Review submitted!' });
});

router.put('/business/my-listing', requireVerifiedOwner, async (req, res) => {
  const updated = await Business.findByIdAndUpdate(req.user.claimedBusiness, req.body, { new: true });
  res.json({ message: 'Listing updated!', business: updated });
});

// ====================== CLAIM & SUBMIT ======================
router.post('/business/:id/claim', requireAuth, async (req, res) => {
  try {
    const { ownerPhone, message } = req.body;
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (business.verifiedOwner) return res.status(400).json({ message: 'This business already has a verified owner' });
    req.user.pendingClaim = { businessId: business._id, businessName: business.name, ownerPhone, message, submittedAt: new Date() };
    req.user.role = 'business_owner';
    await req.user.save();
    await sendMail(`🏢 Business Claim — ${business.name}`, `<h2>Business Claim Submitted</h2><p>User: ${req.user.name} (${req.user.email})</p><p>Phone: ${ownerPhone}</p><p>Business: ${business.name}</p>`);
    res.json({ message: 'Claim submitted! Admin will review.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/business/submit-new', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    req.user.pendingNewBusiness = { ...data, submittedAt: new Date() };
    req.user.role = 'business_owner';
    await req.user.save();
    await sendMail(`🆕 New Business Submission — ${data.businessName}`, `<h2>New Business Submitted</h2><p>Submitted by: ${req.user.name}</p><p>Business: ${data.businessName}</p>`);
    res.json({ message: 'Submission received! Admin will review.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ====================== ADMIN ======================
router.get('/admin/pending-claims', requireAdmin, async (req, res) => {
  const users = await User.find({ $or: [{ 'pendingClaim.submittedAt': { $ne: null } }, { 'pendingNewBusiness.submittedAt': { $ne: null } }] }).select('-password').populate('pendingClaim.businessId');
  res.json(users);
});

router.put('/admin/verify-claim/:userId', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const bizId = user.pendingClaim?.businessId;
  if (bizId) {
    await Business.findByIdAndUpdate(bizId, { verified: true, verifiedOwner: user._id, owner: user._id });
    user.claimedBusiness = bizId;
  }
  user.verifiedOwner = true;
  user.pendingClaim = {};
  user.pendingNewBusiness = {};
  await user.save();
  res.json({ message: 'Owner verified!' });
});

router.delete('/admin/verify-claim/:userId', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.pendingClaim = {};
  user.pendingNewBusiness = {};
  user.role = 'user';
  await user.save();
  res.json({ message: 'Claim rejected.' });
});

router.post('/admin/approve-new-business/:userId', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user?.pendingNewBusiness?.businessName) return res.status(400).json({ message: 'No pending business' });
  const nb = user.pendingNewBusiness;
  let cat = await Category.findOne({ name: nb.category });
  if (!cat && nb.category) cat = await Category.create({ name: nb.category });
  const business = await Business.create({
    name: nb.businessName, address: nb.businessAddress, phone: nb.businessPhone, website: nb.website,
    description: nb.description, category: cat?._id, verified: true, verifiedOwner: user._id, owner: user._id
  });
  user.verifiedOwner = true;
  user.claimedBusiness = business._id;
  user.pendingNewBusiness = {};
  await user.save();
  res.json({ message: 'Business added and owner verified!', business });
});

// ====================== COMMUNITY ======================
router.get('/posts', async (req, res) => {
  const posts = await Post.find({ approved: true }).populate('author', 'name profilePicture').sort({ createdAt: -1 });
  res.json(posts);
});

router.post('/posts', requireAuth, async (req, res) => {
  const post = await Post.create({ ...req.body, author: req.user._id });
  res.json({ message: 'Post submitted for admin review!', post });
});

router.post('/posts/:id/reply', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  post.replies.push({ text: req.body.text, author: req.user._id });
  await post.save();
  res.json({ message: 'Reply added' });
});

router.get('/admin/pending-posts', requireAdmin, async (req, res) => {
  const posts = await Post.find({ approved: false }).populate('author', 'name');
  res.json(posts);
});

router.put('/admin/approve-post/:id', requireAdmin, async (req, res) => {
  await Post.findByIdAndUpdate(req.params.id, { approved: true });
  res.json({ message: 'Post approved' });
});

// ====================== DEALS, EVENTS ======================
router.get('/deals', async (req, res) => {
  const deals = await Deal.find().populate('business', 'name');
  res.json(deals);
});

router.get('/events', async (req, res) => {
  const events = await Event.find().sort({ date: 1 });
  res.json(events);
});

router.post('/deals', requireVerifiedOwner, async (req, res) => {
  const deal = await Deal.create({ ...req.body, owner: req.user._id, business: req.user.claimedBusiness });
  res.json({ message: 'Deal posted!', deal });
});

router.post('/events', requireVerifiedOwner, async (req, res) => {
  const event = await Event.create({ ...req.body, owner: req.user._id, business: req.user.claimedBusiness });
  res.json({ message: 'Event posted!', event });
});

// ====================== SEED (clears everything and reseeds cleanly) ======================
router.get('/admin/seed', requireAdmin, async (req, res) => {
  try {
    await Business.deleteMany({});
    await Category.deleteMany({});

    const catsToSeed = ["Insurance","Restaurants","Auto Repair","Shopping","Beauty","Pets","Entertainment","Plumbing","Real Estate","Home Services","Medical","Dentistry","Legal","Finance","Lawn Care","Electrician","Marinas","Hotels","Butcher","Bait & Tackle"];
    const catMap = {};
    for (let name of catsToSeed) {
      let cat = await Category.findOne({ name });
      if (!cat) cat = await Category.create({ name });
      catMap[name] = cat._id;
    }

    const businessesData = [
      { name: "Hogg’s BBQ", address: "123 East Hancock St, Milledgeville, GA", phone: "478-555-1212", description: "Best smoked BBQ in Middle Georgia", category: catMap["Restaurants"] },
      { name: "Milledgeville Auto Repair", address: "456 North Jefferson St", phone: "478-555-3344", description: "Full service auto repair", category: catMap["Auto Repair"] },
      { name: "The Mane Salon", address: "789 West Greene St", phone: "478-555-7788", description: "Haircuts, color, and styling", category: catMap["Beauty"] },
      { name: "Lake Sinclair Marina", address: "101 Marina Rd", phone: "478-555-9900", description: "Boat rentals and fishing", category: catMap["Marinas"] },
      { name: "Milledgeville Pharmacy", address: "234 South Wayne St", phone: "478-555-1122", description: "Prescriptions and health supplies", category: catMap["Medical"] },
      { name: "Georgia College Bookstore", address: "1010 West Hancock St", phone: "478-555-4455", description: "Books and campus gear", category: catMap["Shopping"] },
      { name: "Baldwin County Electric", address: "567 North Cobb St", phone: "478-555-6677", description: "Electrical services", category: catMap["Electrician"] },
      { name: "Flint River Animal Hospital", address: "890 East 4th St", phone: "478-555-8899", description: "Veterinary care", category: catMap["Pets"] }
    ];

    for (let b of businessesData) {
      await Business.create({ ...b, verified: true });
    }

    res.json({ message: '✅ Database cleared and seeded with categories + businesses!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;