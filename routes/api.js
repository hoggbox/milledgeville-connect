const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const User         = require('../models/User');
const Business     = require('../models/Business');
const Category     = require('../models/Category');
const Deal         = require('../models/Deal');
const Event        = require('../models/Event');
const Shoutout     = require('../models/Shoutout');
const ClaimRequest = require('../models/ClaimRequest');
const News         = require('../models/News');

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  User.findById(req.userId).then(user => {
    if (!user || user.email !== 'imhoggbox@gmail.com') {
      return res.status(403).json({ message: 'Admin only' });
    }
    req.user = user;
    next();
  }).catch(() => res.status(500).json({ message: 'Server error' }));
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const user = await User.create({ name, email, password });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).populate('verifiedBusiness');
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(400).json({ message: 'Invalid email or password' });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('verifiedBusiness');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/auth/profile', authenticate, async (req, res) => {
  try {
    const allowed = ['name', 'bio', 'phone', 'neighborhood', 'website',
                     'instagram', 'facebook', 'notifyDeals', 'notifyEvents',
                     'notifyShoutouts', 'avatar'];
    const updates = {};
    allowed.forEach(k => { if (k in req.body) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
                           .populate('verifiedBusiness');
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Directory ────────────────────────────────────────────────────────────────
router.get('/directory', authenticate, async (req, res) => {
  try {
    const businesses = await Business.find().populate('category').populate('owner', 'name email');
    const categories = await Category.find();
    res.json({ businesses, categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/popular', authenticate, async (req, res) => {
  try {
    const businesses = await Business.find().populate('category');
    const sorted = businesses
      .filter(b => b.ratings && b.ratings.length > 0)
      .sort((a, b) => {
        const avgA = a.ratings.reduce((s, r) => s + r.score, 0) / a.ratings.length;
        const avgB = b.ratings.reduce((s, r) => s + r.score, 0) / b.ratings.length;
        return avgB - avgA;
      })
      .slice(0, 5);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Business Rating ──────────────────────────────────────────────────────────
router.post('/business/:id/rate', authenticate, async (req, res) => {
  try {
    const { score } = req.body;
    if (!score || score < 1 || score > 5)
      return res.status(400).json({ message: 'Score must be 1-5' });

    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const existing = business.ratings.find(r => r.user.toString() === req.userId);
    if (existing) {
      existing.score = score;
    } else {
      business.ratings.push({ user: req.userId, score });
    }
    await business.save();

    const avg = Math.round((business.ratings.reduce((s, r) => s + r.score, 0) / business.ratings.length) * 10) / 10;
    res.json({ avg, count: business.ratings.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Shoutouts ────────────────────────────────────────────────────────────────
router.get('/shoutouts', authenticate, async (req, res) => {
  try {
    const shoutouts = await Shoutout.find().sort({ createdAt: -1 });
    res.json(shoutouts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const shoutout = await Shoutout.create({
      text: req.body.text,
      author: user.name,
      authorId: user._id
    });
    res.json(shoutout);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const isAuthor = shoutout.authorId && shoutout.authorId.toString() === req.userId;

    if (!isAdmin && !isAuthor)
      return res.status(403).json({ message: 'Not authorized' });

    await shoutout.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/like', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const idx = shoutout.likes.indexOf(req.userId);
    let liked;
    if (idx === -1) {
      shoutout.likes.push(req.userId);
      liked = true;
    } else {
      shoutout.likes.splice(idx, 1);
      liked = false;
    }
    await shoutout.save();
    res.json({ likes: shoutout.likes.length, liked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Comments
router.post('/shoutouts/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const comment = { text: req.body.text, author: user.name, authorId: user._id };
    shoutout.comments.push(comment);
    await shoutout.save();
    res.json(shoutout.comments[shoutout.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id/comments/:commentId', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const comment = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const isAuthor = comment.authorId && comment.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor)
      return res.status(403).json({ message: 'Not authorized' });

    comment.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Replies
router.post('/shoutouts/:id/comments/:commentId/replies', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const comment = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = { text: req.body.text, author: user.name, authorId: user._id };
    comment.replies.push(reply);
    await shoutout.save();
    res.json(comment.replies[comment.replies.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id/comments/:commentId/replies/:replyId', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const comment = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    const isAuthor = reply.authorId && reply.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor)
      return res.status(403).json({ message: 'Not authorized' });

    reply.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Events ───────────────────────────────────────────────────────────────────
router.get('/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 }).populate('owner', 'name email');
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Deals ────────────────────────────────────────────────────────────────────
router.get('/deals', authenticate, async (req, res) => {
  try {
    const deals = await Deal.find().populate('business', 'name').populate('owner', 'name email');
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── News (public read, restricted write) ────────────────────────────────────
router.get('/news', authenticate, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/news/:id', authenticate, async (req, res) => {
  try {
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/news', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    if (!isAdmin && !user.canPostNews)
      return res.status(403).json({ message: 'Not authorized to post news' });

    const { title, summary, content, images } = req.body;
    if (!title || !summary || !content)
      return res.status(400).json({ message: 'Title, summary, and content are required' });

    const article = await News.create({
      title,
      summary,
      content,
      images: images || [],
      author: user._id,
      authorName: user.name
    });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/news/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });

    const isAuthor = article.author.toString() === req.userId;
    if (!isAdmin && !isAuthor)
      return res.status(403).json({ message: 'Not authorized' });

    const { title, summary, content, images } = req.body;
    article.title   = title   || article.title;
    article.summary = summary || article.summary;
    article.content = content || article.content;
    if (images !== undefined) article.images = images;
    await article.save();
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/news/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });

    const isAuthor = article.author.toString() === req.userId;
    if (!isAdmin && !isAuthor)
      return res.status(403).json({ message: 'Not authorized' });

    await article.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Claim ────────────────────────────────────────────────────────────────────
router.post('/claim/:businessId', authenticate, async (req, res) => {
  try {
    const { ownerName, phone, address, message } = req.body;
    const existing = await ClaimRequest.findOne({
      business: req.params.businessId,
      user: req.userId,
      status: 'pending'
    });
    if (existing) return res.status(400).json({ message: 'You already have a pending claim for this business' });

    await ClaimRequest.create({
      user: req.userId,
      business: req.params.businessId,
      verificationInfo: { ownerName, phone, address, message }
    });
    res.json({ message: 'Claim submitted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/claim/status/:businessId', authenticate, async (req, res) => {
  try {
    const claim = await ClaimRequest.findOne({
      business: req.params.businessId,
      user: req.userId
    }).sort({ createdAt: -1 });
    if (!claim) return res.json({ status: 'none' });
    res.json({ status: claim.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Category auto-mapping helpers ───────────────────────────────────────────
const BIZ_TO_DEAL_MAP = {
  restaurant:'Food & Drink', food:'Food & Drink', cafe:'Food & Drink',
  bar:'Food & Drink', coffee:'Food & Drink', bakery:'Food & Drink', pizza:'Food & Drink',
  retail:'Shopping', shop:'Shopping', boutique:'Shopping', clothing:'Shopping', grocery:'Shopping',
  pharmacy:'Health & Beauty', salon:'Health & Beauty', spa:'Health & Beauty',
  beauty:'Health & Beauty', fitness:'Health & Beauty', gym:'Health & Beauty',
  health:'Health & Beauty', medical:'Health & Beauty', dental:'Health & Beauty',
  plumbing:'Home & Services', hvac:'Home & Services', contractor:'Home & Services',
  home:'Home & Services', landscaping:'Home & Services', cleaning:'Home & Services',
  services:'Home & Services',
  entertainment:'Entertainment', bowling:'Entertainment', movie:'Entertainment',
  theater:'Entertainment', arcade:'Entertainment',
  auto:'Automotive', car:'Automotive', mechanic:'Automotive', tire:'Automotive', dealership:'Automotive',
};
const BIZ_TO_EVENT_MAP = {
  restaurant:'Food & Drink', food:'Food & Drink', cafe:'Food & Drink',
  bar:'Food & Drink', coffee:'Food & Drink', bakery:'Food & Drink',
  music:'Music & Arts', art:'Music & Arts', gallery:'Music & Arts', theater:'Music & Arts',
  gym:'Sports & Fitness', fitness:'Sports & Fitness', sports:'Sports & Fitness',
  kids:'Family & Kids', family:'Family & Kids', childcare:'Family & Kids',
  school:'Education', education:'Education', tutoring:'Education',
  networking:'Business & Networking', professional:'Business & Networking', business:'Business & Networking',
};

function inferDealCat(bizCatName) {
  if (!bizCatName) return 'Other';
  const lower = bizCatName.toLowerCase();
  for (const [key, val] of Object.entries(BIZ_TO_DEAL_MAP)) { if (lower.includes(key)) return val; }
  return 'Other';
}
function inferEventCat(bizCatName) {
  if (!bizCatName) return 'Community';
  const lower = bizCatName.toLowerCase();
  for (const [key, val] of Object.entries(BIZ_TO_EVENT_MAP)) { if (lower.includes(key)) return val; }
  return 'Community';
}

// ─── Owner Routes ─────────────────────────────────────────────────────────────
router.put('/owner/business', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const { name, address, phone, website, description } = req.body;
    const business = await Business.findByIdAndUpdate(
      user.verifiedBusiness,
      { name, address, phone, website, description },
      { new: true }
    ).populate('category');
    res.json(business);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/owner/deals', authenticate, async (req, res) => {
  try {
    const deals = await Deal.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/owner/deals', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('verifiedBusiness');
    const { title, description, expires, category } = req.body;

    // Auto-derive category from the business's directory category if not explicitly set
    let resolvedCategory = category;
    if (!resolvedCategory) {
      const bizCat = user.verifiedBusiness?.category;
      const bizCatName = typeof bizCat === 'object' ? (bizCat?.name || '') : (bizCat || '');
      resolvedCategory = inferDealCat(bizCatName);
    }

    const deal = await Deal.create({
      title,
      description,
      expires: expires || null,
      business: user.verifiedBusiness,
      owner: req.userId,
      category: resolvedCategory
    });
    res.json(deal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/owner/deals/:id', authenticate, async (req, res) => {
  try {
    await Deal.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/owner/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find({ owner: req.userId }).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/owner/events', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('verifiedBusiness');
    const { title, date, location, description, category } = req.body;

    // Auto-derive category from the business's directory category if not explicitly set
    let resolvedCategory = category;
    if (!resolvedCategory) {
      const bizCat = user.verifiedBusiness?.category;
      const bizCatName = typeof bizCat === 'object' ? (bizCat?.name || '') : (bizCat || '');
      resolvedCategory = inferEventCat(bizCatName);
    }

    const event = await Event.create({
      title,
      date,
      location,
      description,
      owner: req.userId,
      category: resolvedCategory
    });
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/owner/events/:id', authenticate, async (req, res) => {
  try {
    await Event.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.post('/admin/business', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, website, description, categoryId } = req.body;
    const business = await Business.create({ name, address, phone, website, description, category: categoryId });
    res.json({ message: 'Business added successfully', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, website, description, categoryId } = req.body;
    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { name, address, phone, website, description, category: categoryId },
      { new: true }
    );
    res.json({ message: 'Business updated successfully', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Business.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/claims', authenticate, requireAdmin, async (req, res) => {
  try {
    const claims = await ClaimRequest.find({ status: 'pending' })
      .populate('user', 'name email')
      .populate('business', 'name address')
      .sort({ createdAt: -1 });
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/claims/:id/decision', authenticate, requireAdmin, async (req, res) => {
  try {
    const { decision } = req.body;
    const claim = await ClaimRequest.findById(req.params.id).populate('user').populate('business');
    if (!claim) return res.status(404).json({ message: 'Claim not found' });

    claim.status = decision;
    await claim.save();

    if (decision === 'approved') {
      await Business.findByIdAndUpdate(claim.business._id, { owner: claim.user._id });
      await User.findByIdAndUpdate(claim.user._id, { verifiedBusiness: claim.business._id });
    }

    res.json({ message: `Claim ${decision}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/deals/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await Deal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin: User Management ───────────────────────────────────────────────────
router.get('/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().populate('verifiedBusiness', 'name').sort({ joinedAt: -1 });
    res.json(users.map(sanitizeUser));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/admin/users/:id/news-access', authenticate, requireAdmin, async (req, res) => {
  try {
    const { canPostNews } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { canPostNews: !!canPostNews },
      { new: true }
    ).populate('verifiedBusiness', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Updated', user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email === 'imhoggbox@gmail.com')
      return res.status(403).json({ message: 'Cannot delete admin account' });
    await user.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin: News management ───────────────────────────────────────────────────
router.delete('/admin/news/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function sanitizeUser(user) {
  const u = user.toObject ? user.toObject() : user;
  delete u.password;
  return u;
}

module.exports = router;