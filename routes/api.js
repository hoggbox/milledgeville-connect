const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const webpush = require('web-push');

const User            = require('../models/User');
const Business        = require('../models/Business');
const Category        = require('../models/Category');
const Deal            = require('../models/Deal');
const Event           = require('../models/Event');
const Shoutout        = require('../models/Shoutout');
const ClaimRequest    = require('../models/ClaimRequest');
const News            = require('../models/News');
const Review          = require('../models/Review');
const PushSubscription = require('../models/PushSubscription');

// ─── Web Push setup ───────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@milledgevilleconnect.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch (_) {}
  }
  next();
}

function requireAdmin(req, res, next) {
  User.findById(req.userId).then(user => {
    if (!user || user.email !== 'imhoggbox@gmail.com')
      return res.status(403).json({ message: 'Admin only' });
    req.user = user;
    next();
  }).catch(() => res.status(500).json({ message: 'Server error' }));
}

// ─── Helper: send push to a single user ──────────────────────────────────────
async function sendPushToUser(userId, payload) {
  try {
    const sub = await PushSubscription.findOne({ user: userId });
    if (!sub) return;
    const user = await User.findById(userId);
    if (!user || !user.pushEnabled) return;
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410) {
      await PushSubscription.deleteOne({ user: userId });
      await User.findByIdAndUpdate(userId, { pushEnabled: false });
    }
  }
}

// ─── Helper: broadcast push to all subscribed users ──────────────────────────
async function broadcastPush(payload, filter = {}) {
  try {
    const subs = await PushSubscription.find({});
    for (const sub of subs) {
      const user = await User.findById(sub.user);
      if (!user || !user.pushEnabled) continue;
      if (filter.notifyDeals !== undefined && !user.notifyDeals) continue;
      if (filter.notifyEvents !== undefined && !user.notifyEvents) continue;
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 410) {
          await PushSubscription.deleteOne({ user: sub.user });
          await User.findByIdAndUpdate(sub.user, { pushEnabled: false });
        }
      }
    }
  } catch (err) {
    console.error('broadcastPush error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW FEATURES ADDED HERE
// ─────────────────────────────────────────────────────────────────────────────

// Hot Right Now Feed (used on home page)
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const [shoutouts, events, deals] = await Promise.all([
      Shoutout.find().sort({ createdAt: -1 }).limit(8),
      Event.find({ date: { $gte: new Date() } }).sort({ date: 1 }).limit(5),
      Deal.find().sort({ createdAt: -1 }).limit(5)
    ]);
    res.json({ shoutouts, events, deals });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Event RSVP
router.post('/events/:id/rsvp', authenticate, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const idx = event.rsvps.indexOf(req.userId);
    if (idx === -1) {
      event.rsvps.push(req.userId);
    } else {
      event.rsvps.splice(idx, 1);
    }
    await event.save();
    res.json({ rsvpCount: event.rsvps.length, going: idx === -1 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Updated Shoutout with photo support
router.post('/shoutouts', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const { text, images } = req.body;
    const shoutout = await Shoutout.create({
      text,
      author: user.name,
      authorId: user._id,
      images: images || []
    });
    res.json(shoutout);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Follow / Unfollow a business
router.post('/business/:id/follow', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const idx = user.following.indexOf(req.params.id);
    if (idx === -1) {
      user.following.push(req.params.id);
    } else {
      user.following.splice(idx, 1);
    }
    await user.save();
    res.json({ following: user.following });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ORIGINAL ROUTES (everything below is unchanged from your original file) ───
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const user  = await User.create({ name, email, password });
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
                     'notifyShoutouts', 'avatar', 'pushEnabled'];
    const updates = {};
    allowed.forEach(k => { if (k in req.body) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
                           .populate('verifiedBusiness');
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
});

router.post('/push/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ message: 'Subscription required' });

    await PushSubscription.findOneAndUpdate(
      { user: req.userId },
      { user: req.userId, subscription },
      { upsert: true, new: true }
    );
    await User.findByIdAndUpdate(req.userId, { pushEnabled: true });
    res.json({ message: 'Subscribed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/push/unsubscribe', authenticate, async (req, res) => {
  try {
    await PushSubscription.deleteOne({ user: req.userId });
    await User.findByIdAndUpdate(req.userId, { pushEnabled: false });
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/directory', optionalAuth, async (req, res) => {
  try {
    const businesses = await Business.find().populate('category').populate('owner', 'name email');
    const categories = await Category.find();
    res.json({ businesses, categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/resources', async (req, res) => {
  try {
    const RESOURCE_CATEGORY_NAMES = ['Churches','Recycling Centers','Fishing Spots','Parks & Recreation','Libraries'];
    const resourceCats = await Category.find({ name: { $in: RESOURCE_CATEGORY_NAMES } });
    const catIds = resourceCats.map(c => c._id);
    const businesses = await Business.find({ category: { $in: catIds } })
      .populate('category').populate('owner', 'name');
    res.json({ businesses, categories: resourceCats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const businesses = await Business.find().populate('category');
    const sorted = businesses
      .filter(b => b.ratings && b.ratings.length > 0)
      .sort((a, b) => {
        const avgA = a.ratings.reduce((s, r) => s + r.score, 0) / a.ratings.length;
        const avgB = b.ratings.reduce((s, r) => s + r.score, 0) / b.ratings.length;
        return avgB - avgA;
      }).slice(0, 5);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/business/:id/rate', authenticate, async (req, res) => {
  try {
    const { score } = req.body;
    if (!score || score < 1 || score > 5)
      return res.status(400).json({ message: 'Score must be 1-5' });

    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const existing = business.ratings.find(r => r.user.toString() === req.userId);
    if (existing) { existing.score = score; } else { business.ratings.push({ user: req.userId, score }); }
    await business.save();

    const avg = Math.round((business.ratings.reduce((s, r) => s + r.score, 0) / business.ratings.length) * 10) / 10;
    res.json({ avg, count: business.ratings.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/business/:id/reviews', optionalAuth, async (req, res) => {
  try {
    const reviews = await Review.find({ business: req.params.id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/business/:id/reviews', authenticate, async (req, res) => {
  try {
    const { rating, title, body } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating 1-5 required' });

    const user = await User.findById(req.userId);

    const review = await Review.findOneAndUpdate(
      { business: req.params.id, user: req.userId },
      { business: req.params.id, user: req.userId, authorName: user.name, rating, title: title || '', body: body || '', createdAt: new Date() },
      { upsert: true, new: true }
    );
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/business/:id/reviews/:reviewId', authenticate, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: 'Not found' });
    const user = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const isAuthor = review.user.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    await review.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/owner/business/menu', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const business = await Business.findById(user.verifiedBusiness);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (!business.isRestaurant)
      return res.status(403).json({ message: 'Menu upload is only available for food/restaurant businesses' });

    const { menu } = req.body;
    if (menu && menu.length > 7 * 1024 * 1024)
      return res.status(400).json({ message: 'Menu file is too large. Maximum 5 MB.' });

    business.menu = menu || null;
    await business.save();
    res.json({ message: 'Menu updated', menu: business.menu });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/shoutouts', optionalAuth, async (req, res) => {
  try {
    const shoutouts = await Shoutout.find().sort({ createdAt: -1 });
    res.json(shoutouts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const user    = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const isAuthor= shoutout.authorId && shoutout.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
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
    if (idx === -1) { shoutout.likes.push(req.userId); liked = true; }
    else            { shoutout.likes.splice(idx, 1);   liked = false; }
    await shoutout.save();
    res.json({ likes: shoutout.likes.length, liked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments', authenticate, async (req, res) => {
  try {
    const user    = await User.findById(req.userId);
    const shoutout= await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const comment = { text: req.body.text, author: user.name, authorId: user._id };
    shoutout.comments.push(comment);
    await shoutout.save();

    if (shoutout.authorId && shoutout.authorId.toString() !== req.userId) {
      sendPushToUser(shoutout.authorId, {
        title: '💬 New Comment',
        body:  `${user.name} commented on your shoutout`,
        url:   '/shoutouts'
      });
    }

    res.json(shoutout.comments[shoutout.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id/comments/:commentId', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const user     = await User.findById(req.userId);
    const isAdmin  = user.email === 'imhoggbox@gmail.com';
    const comment  = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    const isAuthor = comment.authorId && comment.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    comment.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments/:commentId/replies', authenticate, async (req, res) => {
  try {
    const user     = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const comment  = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = { text: req.body.text, author: user.name, authorId: user._id };
    comment.replies.push(reply);
    await shoutout.save();

    if (comment.authorId && comment.authorId.toString() !== req.userId) {
      sendPushToUser(comment.authorId, {
        title: '↩️ New Reply',
        body:  `${user.name} replied to your comment`,
        url:   '/shoutouts'
      });
    }

    res.json(comment.replies[comment.replies.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shoutouts/:id/comments/:commentId/replies/:replyId', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const user    = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const comment = shoutout.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    const reply   = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });
    const isAuthor= reply.authorId && reply.authorId.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    reply.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/events', optionalAuth, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 }).populate('owner', 'name email');
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/deals', optionalAuth, async (req, res) => {
  try {
    const deals = await Deal.find().populate('business', 'name').populate('owner', 'name email');
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/news', optionalAuth, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/news/:id', optionalAuth, async (req, res) => {
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
    const user    = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    if (!isAdmin && !user.canPostNews)
      return res.status(403).json({ message: 'Not authorized to post news' });

    const { title, summary, content, images } = req.body;
    if (!title || !summary || !content)
      return res.status(400).json({ message: 'Title, summary, and content are required' });

    const article = await News.create({ title, summary, content, images: images || [], author: user._id, authorName: user.name });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/news/:id', authenticate, async (req, res) => {
  try {
    const user    = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    const isAuthor = article.author.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
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
    const user    = await User.findById(req.userId);
    const isAdmin = user.email === 'imhoggbox@gmail.com';
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Not found' });
    const isAuthor = article.author.toString() === req.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    await article.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/claim/:businessId', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.params.businessId);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (business.owner)
      return res.status(400).json({ message: 'This business has already been claimed and is no longer available.' });

    const { ownerName, phone, address, message, isRestaurant } = req.body;
    const existing = await ClaimRequest.findOne({ business: req.params.businessId, user: req.userId, status: 'pending' });
    if (existing)
      return res.status(400).json({ message: 'You already have a pending claim for this business' });

    await ClaimRequest.create({
      user: req.userId,
      business: req.params.businessId,
      verificationInfo: { ownerName, phone, address, message, isRestaurant: !!isRestaurant }
    });
    res.json({ message: 'Claim submitted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/claim/status/:businessId', authenticate, async (req, res) => {
  try {
    const claim = await ClaimRequest.findOne({ business: req.params.businessId, user: req.userId }).sort({ createdAt: -1 });
    if (!claim) return res.json({ status: 'none' });
    res.json({ status: claim.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/owner/business', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const { name, address, phone, website, description, email, hours, priceRange, tags, logo } = req.body;
    const updates = { name, address, phone, website, description };
    if (email     !== undefined) updates.email     = email;
    if (hours     !== undefined) updates.hours     = hours;
    if (priceRange !== undefined) updates.priceRange = priceRange;
    if (tags      !== undefined) updates.tags      = tags;
    if (logo      !== undefined) updates.logo      = logo;
    const business = await Business.findByIdAndUpdate(
      user.verifiedBusiness,
      updates,
      { new: true }
    ).populate('category');
    res.json(business);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Owner: Upload photos to business gallery ─────────────────────────────
router.post('/owner/business/photos', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const business = await Business.findById(user.verifiedBusiness);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const { photos } = req.body; // array of base64 strings
    if (!Array.isArray(photos))
      return res.status(400).json({ message: 'photos must be an array' });

    const combined = [...(business.photos || []), ...photos];
    if (combined.length > 5)
      return res.status(400).json({ message: 'Maximum 5 photos allowed' });

    business.photos = combined;
    await business.save();
    res.json({ message: 'Photos updated', photos: business.photos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Owner: Delete a photo by index ──────────────────────────────────────
router.delete('/owner/business/photos/:index', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const business = await Business.findById(user.verifiedBusiness);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= (business.photos || []).length)
      return res.status(400).json({ message: 'Invalid photo index' });

    business.photos.splice(idx, 1);
    await business.save();
    res.json({ message: 'Photo deleted', photos: business.photos });
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
    const user = await User.findById(req.userId).populate({ path: 'verifiedBusiness', populate: { path: 'category' } });
    const { title, description, expires, category } = req.body;

    let resolvedCategory = category;
    if (!resolvedCategory && user.verifiedBusiness) {
      const bizCat = user.verifiedBusiness.category;
      resolvedCategory = (bizCat && typeof bizCat === 'object') ? bizCat.name : (bizCat || '');
    }

    const deal = await Deal.create({
      title, description, expires: expires || null,
      business: user.verifiedBusiness, owner: req.userId,
      category: resolvedCategory || ''
    });

    broadcastPush({
      title: '🔥 New Deal Available!',
      body:  title,
      url:   '/deals'
    }, { notifyDeals: true });

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
    const user = await User.findById(req.userId).populate({ path: 'verifiedBusiness', populate: { path: 'category' } });
    const { title, date, location, description, category } = req.body;

    let resolvedCategory = category;
    if (!resolvedCategory && user.verifiedBusiness) {
      const bizCat = user.verifiedBusiness.category;
      resolvedCategory = (bizCat && typeof bizCat === 'object') ? bizCat.name : (bizCat || '');
    }

    const event = await Event.create({
      title, date, location, description,
      owner: req.userId, category: resolvedCategory || ''
    });

    broadcastPush({
      title: '📅 New Event Posted!',
      body:  title + (location ? ` · ${location}` : ''),
      url:   '/events'
    }, { notifyEvents: true });

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

router.post('/admin/business', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, website, description, categoryId, email, hours, priceRange, tags, logo } = req.body;
    const business = await Business.create({ name, address, phone, website, description, category: categoryId, email: email || null, hours: hours || null, priceRange: priceRange || null, tags: tags || [], logo: logo || null });
    res.json({ message: 'Business added successfully', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/business/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, website, description, categoryId, email, hours, priceRange, tags, logo } = req.body;
    const updates = { name, address, phone, website, description, category: categoryId };
    if (email     !== undefined) updates.email     = email;
    if (hours     !== undefined) updates.hours     = hours;
    if (priceRange !== undefined) updates.priceRange = priceRange;
    if (tags      !== undefined) updates.tags      = tags;
    if (logo      !== undefined) updates.logo      = logo;
    const business = await Business.findByIdAndUpdate(
      req.params.id, updates, { new: true }
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
      const isRestaurant = claim.verificationInfo?.isRestaurant === true;
      await Business.findByIdAndUpdate(claim.business._id, { owner: claim.user._id, isRestaurant });
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
    const user = await User.findByIdAndUpdate(req.params.id, { canPostNews: !!canPostNews }, { new: true })
      .populate('verifiedBusiness', 'name');
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

router.delete('/admin/news/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/search', optionalAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const regex = new RegExp(q, 'i');

    const [businesses, events, deals, news, shoutouts] = await Promise.all([
      Business.find({ $or: [{ name: regex }, { description: regex }] }).populate('category').limit(8),
      Event.find({ $or: [{ title: regex }, { description: regex }] }).limit(6),
      Deal.find({ $or: [{ title: regex }, { description: regex }] }).populate('business').limit(6),
      News.find({ $or: [{ title: regex }, { summary: regex }, { content: regex }] }).limit(6),
      Shoutout.find({ text: regex }).limit(6)
    ]);

    const results = [
      ...businesses.map(b => ({ type: 'business', id: b._id, title: b.name, subtitle: b.description || '', icon: '📍' })),
      ...events.map(e    => ({ type: 'event',    id: e._id, title: e.title,  subtitle: e.description || '', icon: '📅' })),
      ...deals.map(d     => ({ type: 'deal',     id: d._id, title: d.title,  subtitle: d.description || '', icon: '🔥' })),
      ...news.map(n      => ({ type: 'news',     id: n._id, title: n.title,  subtitle: n.summary || '', icon: '📰' })),
      ...shoutouts.map(s => ({ type: 'shoutout', id: s._id, title: s.text,   subtitle: `by ${s.author}`, icon: '💬' }))
    ];
    res.json({ results });
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