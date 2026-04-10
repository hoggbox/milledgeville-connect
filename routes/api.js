const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Shoutout = require('../models/Shoutout');
const Event = require('../models/Event');
const Deal = require('../models/Deal');
const ClaimRequest = require('../models/ClaimRequest');

const ADMIN_EMAIL = 'imhoggbox@gmail.com';

// ─── Middleware helpers ────────────────────────────────────────────────────────
async function requireAuth(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ message: 'Login required' }); return null; }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) { res.status(404).json({ message: 'User not found' }); return null; }
    return user;
  } catch {
    res.status(401).json({ message: 'Invalid token' }); return null;
  }
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.email !== ADMIN_EMAIL) { res.status(403).json({ message: 'Admin only' }); return null; }
  return user;
}

// ===================== AUTH =====================
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already used' });

    const user = new User({ name, email, password });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, verifiedBusiness: user.verifiedBusiness } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).populate('verifiedBusiness');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, lastLogin: user.lastLogin, verifiedBusiness: user.verifiedBusiness } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('verifiedBusiness');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { id: user._id, name: user.name, email: user.email, lastLogin: user.lastLogin, verifiedBusiness: user.verifiedBusiness } });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ===================== PUBLIC =====================
router.get('/directory', async (req, res) => {
  const categories = await Category.find();
  const businesses = await Business.find().populate('category').populate('owner', 'name email');
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
  const deals = await Deal.find().sort({ expires: 1 }).populate('business', 'name');
  res.json(deals);
});

// ===================== POPULAR BUSINESSES (for home page) =====================
router.get('/popular', async (req, res) => {
  const businesses = await Business.find().populate('category').populate('owner', 'name email');
  // Sort by avg rating then count
  const sorted = businesses
    .filter(b => b.ratings && b.ratings.length > 0)
    .sort((a, b) => {
      const aAvg = a.avgRating || 0;
      const bAvg = b.avgRating || 0;
      if (bAvg !== aAvg) return bAvg - aAvg;
      return b.ratings.length - a.ratings.length;
    })
    .slice(0, 5);
  res.json(sorted);
});

// ===================== RATINGS =====================
router.post('/business/:id/rate', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { score } = req.body;
  if (!score || score < 1 || score > 5) return res.status(400).json({ message: 'Score must be 1–5' });

  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ message: 'Business not found' });

  const existing = business.ratings.find(r => r.user.toString() === user._id.toString());
  if (existing) {
    existing.score = score;
  } else {
    business.ratings.push({ user: user._id, score });
  }
  await business.save();

  const avg = business.avgRating;
  const count = business.ratings.length;
  res.json({ avg, count, userScore: score });
});

router.get('/business/:id/myrating', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ score: 0 });
  const existing = business.ratings.find(r => r.user.toString() === user._id.toString());
  res.json({ score: existing ? existing.score : 0 });
});

// ===================== CLAIM BUSINESS =====================
router.post('/claim/:businessId', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const business = await Business.findById(req.params.businessId);
  if (!business) return res.status(404).json({ message: 'Business not found' });
  if (business.owner) return res.status(400).json({ message: 'This business has already been claimed' });

  const existing = await ClaimRequest.findOne({ user: user._id, business: business._id, status: 'pending' });
  if (existing) return res.status(400).json({ message: 'You already have a pending claim for this business' });

  const { ownerName, phone, address, message } = req.body;
  const claim = new ClaimRequest({
    user: user._id,
    business: business._id,
    verificationInfo: { ownerName, phone, address, message }
  });
  await claim.save();
  res.json({ message: 'Claim submitted! You will be notified once approved.' });
});

router.get('/claim/status/:businessId', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const claim = await ClaimRequest.findOne({ user: user._id, business: req.params.businessId }).sort({ createdAt: -1 });
  if (!claim) return res.json({ status: 'none' });
  res.json({ status: claim.status });
});

// ===================== PROTECTED — SHOUTOUTS =====================
router.post('/shoutouts', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { text } = req.body;
  const newShoutout = new Shoutout({ text, author: user.name || 'Verified User', authorId: user._id });
  await newShoutout.save();
  res.json(newShoutout);
});

// Like / unlike a shoutout
router.post('/shoutouts/:id/like', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const shoutout = await Shoutout.findById(req.params.id);
  if (!shoutout) return res.status(404).json({ message: 'Not found' });

  const idx = shoutout.likes.indexOf(user._id);
  if (idx === -1) {
    shoutout.likes.push(user._id);
  } else {
    shoutout.likes.splice(idx, 1);
  }
  await shoutout.save();
  res.json({ likes: shoutout.likes.length, liked: idx === -1 });
});

// Add a comment to a shoutout
router.post('/shoutouts/:id/comments', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text required' });

  const shoutout = await Shoutout.findById(req.params.id);
  if (!shoutout) return res.status(404).json({ message: 'Not found' });

  shoutout.comments.push({ text: text.trim(), author: user.name, authorId: user._id });
  await shoutout.save();
  const comment = shoutout.comments[shoutout.comments.length - 1];
  res.json(comment);
});

// Reply to a comment
router.post('/shoutouts/:id/comments/:commentId/replies', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Reply text required' });

  const shoutout = await Shoutout.findById(req.params.id);
  if (!shoutout) return res.status(404).json({ message: 'Not found' });

  const comment = shoutout.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  comment.replies.push({ text: text.trim(), author: user.name, authorId: user._id });
  await shoutout.save();
  const reply = comment.replies[comment.replies.length - 1];
  res.json(reply);
});

// Delete a comment (owner or admin)
router.delete('/shoutouts/:id/comments/:commentId', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const shoutout = await Shoutout.findById(req.params.id);
  if (!shoutout) return res.status(404).json({ message: 'Not found' });

  const comment = shoutout.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  const isOwner = comment.authorId?.toString() === user._id.toString();
  const isAdmin = user.email === ADMIN_EMAIL;
  if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });

  comment.deleteOne();
  await shoutout.save();
  res.json({ message: 'Deleted' });
});

// ===================== BUSINESS OWNER — DEALS =====================
router.post('/owner/deals', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!user.verifiedBusiness) return res.status(403).json({ message: 'Verified business owners only' });

  const { title, description, expires } = req.body;
  const deal = new Deal({ title, description, expires, business: user.verifiedBusiness, owner: user._id });
  await deal.save();
  res.json(deal);
});

router.put('/owner/deals/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const deal = await Deal.findById(req.params.id);
  if (!deal) return res.status(404).json({ message: 'Deal not found' });
  if (deal.owner?.toString() !== user._id.toString()) return res.status(403).json({ message: 'Not your deal' });

  const { title, description, expires } = req.body;
  Object.assign(deal, { title, description, expires });
  await deal.save();
  res.json(deal);
});

router.delete('/owner/deals/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const deal = await Deal.findById(req.params.id);
  if (!deal) return res.status(404).json({ message: 'Deal not found' });
  if (deal.owner?.toString() !== user._id.toString()) return res.status(403).json({ message: 'Not your deal' });
  await deal.deleteOne();
  res.json({ message: 'Deleted' });
});

router.get('/owner/deals', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const deals = await Deal.find({ owner: user._id });
  res.json(deals);
});

// ===================== BUSINESS OWNER — EVENTS =====================
router.post('/owner/events', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!user.verifiedBusiness) return res.status(403).json({ message: 'Verified business owners only' });

  const { title, date, location, description } = req.body;
  const event = new Event({ title, date, location, description, owner: user._id });
  await event.save();
  res.json(event);
});

router.put('/owner/events/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (event.owner?.toString() !== user._id.toString()) return res.status(403).json({ message: 'Not your event' });

  const { title, date, location, description } = req.body;
  Object.assign(event, { title, date, location, description });
  await event.save();
  res.json(event);
});

router.delete('/owner/events/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (event.owner?.toString() !== user._id.toString()) return res.status(403).json({ message: 'Not your event' });
  await event.deleteOne();
  res.json({ message: 'Deleted' });
});

router.get('/owner/events', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const events = await Event.find({ owner: user._id });
  res.json(events);
});

// ===================== BUSINESS OWNER — EDIT OWN LISTING =====================
router.put('/owner/business', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!user.verifiedBusiness) return res.status(403).json({ message: 'Verified business owners only' });

  const { name, address, phone, website, description } = req.body;
  const updated = await Business.findByIdAndUpdate(
    user.verifiedBusiness,
    { name, address, phone, website, description },
    { new: true }
  ).populate('category');
  res.json(updated);
});

// ===================== ADMIN ONLY =====================
router.get('/admin/claims', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const claims = await ClaimRequest.find({ status: 'pending' })
    .populate('user', 'name email')
    .populate('business', 'name address')
    .sort({ createdAt: -1 });
  res.json(claims);
});

router.post('/admin/claims/:id/decision', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { decision } = req.body;
  const claim = await ClaimRequest.findById(req.params.id);
  if (!claim) return res.status(404).json({ message: 'Claim not found' });

  claim.status = decision;
  await claim.save();

  if (decision === 'approved') {
    await Business.findByIdAndUpdate(claim.business, { owner: claim.user });
    await User.findByIdAndUpdate(claim.user, { verifiedBusiness: claim.business });
  }

  res.json({ message: `Claim ${decision}` });
});

router.post('/admin/business', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { name, address, phone, website, description, categoryId, keywords } = req.body;
  const newBusiness = new Business({
    name, address, phone, website, description,
    category: categoryId,
    keywords: keywords || [],
    isPremium: true
  });
  await newBusiness.save();
  res.json({ message: 'Business added successfully!' });
});

router.put('/admin/business/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { name, address, phone, website, description, categoryId } = req.body;
  await Business.findByIdAndUpdate(req.params.id,
    { name, address, phone, website, description, category: categoryId },
    { new: true });
  res.json({ message: 'Business updated successfully!' });
});

router.delete('/admin/business/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  await Business.findByIdAndDelete(req.params.id);
  res.json({ message: 'Business deleted successfully!' });
});

module.exports = router;