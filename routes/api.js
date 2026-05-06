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

// ─── NEW MODELS ─────────────────────────────────────────────────────────────
const LostItem        = require('../models/LostItem');
const MarketplaceItem = require('../models/MarketplaceItem');
const Message         = require('../models/Message');   // ← NEW MESSAGING MODEL

// ─── Web Push setup ───────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@milledgevilleconnect.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ─── Firebase Admin Setup (for Native Push) ───────────────────────────────────
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const serviceAccount = require('./firebase-service-account.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized');
  } catch (err) {
    console.warn('⚠️ Firebase service account not found. Native push disabled.');
  }
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

// Send push to a single user (supports both web + native)
async function sendPushToUser(userId, payload) {
  try {
    const sub = await PushSubscription.findOne({ user: userId });
    if (!sub) return;

    const user = await User.findById(userId);
    if (!user || !user.pushEnabled) return;

    // Native push (FCM)
    if (sub.nativeToken) {
      await admin.messaging().send({
        token: sub.nativeToken,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data || {}
      });
    } 
    // Web push (fallback)
    else if (sub.subscription) {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify(payload),
        { TTL: 86400 }
      );
    }
  } catch (err) {
    console.error('sendPushToUser error:', err.message);
    if (err.code === 'messaging/registration-token-not-registered') {
      await PushSubscription.deleteOne({ user: userId });
    }
  }
}

// Broadcast push to everyone (used for shoutouts, deals, events, etc.)
async function broadcastPush(payload, filter = {}) {
  try {
    const subs = await PushSubscription.find({});
    for (const sub of subs) {
      const user = await User.findById(sub.user);
      if (!user || !user.pushEnabled) continue;

      // Apply filters
      if (filter.notifyDeals !== undefined && !user.notifyDeals) continue;
      if (filter.notifyEvents !== undefined && !user.notifyEvents) continue;

      try {
        if (sub.nativeToken) {
          // Native push
          await admin.messaging().send({
            token: sub.nativeToken,
            notification: {
              title: payload.title,
              body: payload.body
            },
            data: payload.data || {}
          });
        } else if (sub.subscription) {
          // Web push
          await webpush.sendNotification(
            sub.subscription,
            JSON.stringify(payload),
            { TTL: 86400 }
          );
        }
      } catch (err) {
        console.error('broadcastPush error:', err.message);
      }
    }
  } catch (err) {
    console.error('broadcastPush error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: MESSAGING SYSTEM ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages/inbox', authenticate, async (req, res) => {
  try {
    const messages = await Message.find({ receiver: req.userId })
      .populate('sender', 'name avatar')
      .populate('receiver', 'name avatar')  // ← FIXED: needed for conversation grouping
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/outbox — messages sent BY the current user
router.get('/messages/outbox', authenticate, async (req, res) => {
  try {
    const messages = await Message.find({ sender: req.userId })
      .populate('sender', 'name')
      .populate('receiver', 'name')
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load outbox' });
  }
});

// NEW: Mark conversation as read (used by badge clearing)
router.post('/messages/mark-as-read', authenticate, async (req, res) => {
  try {
    const { otherId } = req.body;
    if (!otherId) return res.status(400).json({ message: 'otherId required' });

    await Message.updateMany(
      {
        receiver: req.userId,
        sender: otherId,
        read: false
      },
      { $set: { read: true } }
    );

    res.json({ message: 'Conversation marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/messages/conversation/:otherUserId', authenticate, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: req.userId, receiver: otherUserId },
        { sender: otherUserId, receiver: req.userId }
      ]
    }).populate('sender', 'name avatar').sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/messages', authenticate, async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    if (!receiverId || !text?.trim()) 
      return res.status(400).json({ message: 'Receiver and message text required' });

    const sender = await User.findById(req.userId);
    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    if (receiver.blockedUsers?.includes(req.userId)) {
      return res.status(403).json({ message: 'You have been blocked by this user' });
    }

    const message = await Message.create({
      sender: req.userId,
      receiver: receiverId,
      text: text.trim()
    });

    sendPushToUser(receiverId, {
      title: `💬 New message from ${sender.name}`,
      body: text.substring(0, 80) + (text.length > 80 ? '...' : ''),
      url: '/messages'
    });

    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/messages/:id/read', authenticate, async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/messages/:id', authenticate, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.sender.toString() !== req.userId && msg.receiver.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await msg.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/messages/conversation/:otherId
// Deletes all messages between the current user and another user
router.delete('/messages/conversation/:otherId', authenticate, async (req, res) => {
  try {
    const myId    = req.userId;
    const otherId = req.params.otherId;
    const result  = await Message.deleteMany({
      $or: [
        { sender: myId,    receiver: otherId },
        { sender: otherId, receiver: myId    }
      ]
    });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/messages/inbox
// Clears all messages received by the current user
router.delete('/messages/inbox', authenticate, async (req, res) => {
  try {
    const result = await Message.deleteMany({ receiver: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/messages/outbox
// Clears all messages sent by the current user
router.delete('/messages/outbox', authenticate, async (req, res) => {
  try {
    const result = await Message.deleteMany({ sender: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/users/:id/block', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const targetId = req.params.id;
    const idx = user.blockedUsers.indexOf(targetId);
    if (idx === -1) {
      user.blockedUsers.push(targetId);
    } else {
      user.blockedUsers.splice(idx, 1);
    }
    await user.save();
    res.json({ blocked: idx === -1 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/users/:id', optionalAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -email -blockedUsers');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATION ROUTES (Added May 2026)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ message: 'VAPID keys not configured on server' });
  }
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) {
      return res.status(400).json({ message: 'Subscription object required' });
    }

    await PushSubscription.deleteOne({ user: req.userId });
    await PushSubscription.create({
      user: req.userId,
      subscription: subscription
    });

    await User.findByIdAndUpdate(req.userId, { pushEnabled: true });
    res.json({ message: 'Subscribed' });
  } catch (err) {
    console.error('Push subscribe error:', err);
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

// ─────────────────────────────────────────────────────────────────────────────
// YOUR ORIGINAL CODE (everything below this line is exactly as you provided)
// ─────────────────────────────────────────────────────────────────────────────

// Hot Right Now Feed
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
    if (idx === -1) event.rsvps.push(req.userId);
    else event.rsvps.splice(idx, 1);
    await event.save();
    res.json({ rsvpCount: event.rsvps.length, going: idx === -1 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Updated Shoutout
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

    // === SEND PUSH TO EVERYONE ===
    broadcastPush({
      title: `💬 New Shoutout from ${user.name}`,
      body: text.length > 80 ? text.substring(0, 77) + '...' : text,
      url: '/shoutouts'
    });

    res.json(shoutout);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Follow business
router.post('/business/:id/follow', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const idx = user.following.indexOf(req.params.id);
    if (idx === -1) user.following.push(req.params.id);
    else user.following.splice(idx, 1);
    await user.save();
    res.json({ following: user.following });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── LOST & FOUND ROUTES (FULLY FUNCTIONAL + PUSH) ─────────────────────────────
router.get('/lostitems', optionalAuth, async (req, res) => {
  try {
    const items = await LostItem.find().sort({ createdAt: -1 }).populate('owner', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/lostitems', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const { title, description, type, itemType, isPet, location, date, images } = req.body;

    const item = await LostItem.create({
      type: type || 'lost',
      title,
      description,
      itemType: itemType || '',
      isPet: !!isPet,
      location,
      date: date || new Date(),
      images: images || [],
      owner: user._id,
      authorName: user.name
    });

    broadcastPush({
      title: isPet ? '🐾 New Lost Pet!' : '🔎 New Lost & Found Item',
      body: `${user.name} posted: ${title}`,
      url: '/lostfound'
    });

    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/lostitems/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const lost = await LostItem.findById(req.params.id);
    if (!lost) return res.status(404).json({ message: 'Not found' });

    const comment = { text: req.body.text, author: user.name, authorId: user._id };
    lost.comments.push(comment);
    await lost.save();

    if (lost.owner && lost.owner.toString() !== req.userId) {
      sendPushToUser(lost.owner, {
        title: '💬 New comment on your lost item',
        body: `${user.name}: ${req.body.text.substring(0, 60)}...`,
        url: '/lostfound'
      });
    }
    res.json(lost.comments[lost.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/lostitems/:id/resolve', authenticate, async (req, res) => {
  try {
    const lost = await LostItem.findById(req.params.id);
    if (!lost) return res.status(404).json({ message: 'Not found' });
    if (lost.owner.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });

    lost.status = 'resolved';
    await lost.save();
    res.json({ message: 'Marked as resolved', item: lost });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── MARKETPLACE ROUTES (FULLY FUNCTIONAL + PUSH) ─────────────────────────────
router.get('/marketplace', optionalAuth, async (req, res) => {
  try {
    const items = await MarketplaceItem.find({ status: 'available' })
      .sort({ createdAt: -1 })
      .populate('seller', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/marketplace', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const { title, description, price, images, category, condition } = req.body;

    const item = await MarketplaceItem.create({
      title,
      description,
      price: Number(price),
      images: images || [],
      seller: user._id,
      authorName: user.name,
      category: category || '',
      condition: condition || 'used'
    });

    broadcastPush({
      title: '🛒 New Marketplace Listing',
      body: `${user.name} listed: ${title} - $${price}`,
      url: '/marketplace'
    });

    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/marketplace/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const comment = { text: req.body.text, author: user.name, authorId: user._id };
    item.comments.push(comment);
    await item.save();

    if (item.seller && item.seller.toString() !== req.userId) {
      sendPushToUser(item.seller, {
        title: '💬 New message on your listing',
        body: `${user.name}: ${req.body.text.substring(0, 60)}...`,
        url: '/marketplace'
      });
    }
    res.json(item.comments[item.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/marketplace/:id/sold', authenticate, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    if (item.seller.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });

    item.status = 'sold';
    await item.save();
    res.json({ message: 'Marked as sold', item });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ADMIN MODERATION FOR NEW FEATURES (Lost & Found + Marketplace) ─────────────
router.get('/admin/lostitems', authenticate, requireAdmin, async (req, res) => {
  try {
    const items = await LostItem.find().sort({ createdAt: -1 }).populate('owner', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/lostitems/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await LostItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lost & Found item deleted by admin' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/marketplace', authenticate, requireAdmin, async (req, res) => {
  try {
    const items = await MarketplaceItem.find().sort({ createdAt: -1 }).populate('seller', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/marketplace/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await MarketplaceItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Marketplace item deleted by admin' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── MISSING SHOUTOUT ROUTES ────────────────────────────────────────────────
router.get('/shoutouts', optionalAuth, async (req, res) => {
  try {
    const shoutouts = await Shoutout.find().sort({ createdAt: -1 }).limit(50);
    res.json(shoutouts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/like', authenticate, async (req, res) => {
  try {
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });
    const idx = shoutout.likes.indexOf(req.userId);
    if (idx === -1) shoutout.likes.push(req.userId);
    else shoutout.likes.splice(idx, 1);
    await shoutout.save();
    res.json({ likes: shoutout.likes.length, liked: idx === -1 });
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
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    await shoutout.deleteOne();
    res.json({ message: 'Deleted' });
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
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized' });
    comment.deleteOne();
    await shoutout.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/lostitems/:id/resolve', authenticate, async (req, res) => {
  try {
    const lost = await LostItem.findById(req.params.id);
    if (!lost) return res.status(404).json({ message: 'Not found' });
    if (lost.owner.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    lost.status = 'resolved';
    await lost.save();
    res.json({ message: 'Marked as resolved', item: lost });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/marketplace/:id/sold', authenticate, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    if (item.seller.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    item.status = 'sold';
    await item.save();
    res.json({ message: 'Marked as sold', item });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/owner/business/menu', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness) return res.status(403).json({ message: 'No verified business' });
    const { menu } = req.body;
    const business = await Business.findByIdAndUpdate(
      user.verifiedBusiness,
      { menu: menu || null },
      { new: true }
    );
    res.json({ message: 'Menu updated', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ORIGINAL ROUTES (everything below this is your original code unchanged) ───
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
    // Fast lean query + manual avgRating + phone/hours for directory cards
    const raw = await Business.find()
      .select('name address category logo ratings keywords description hours priceRange tags owner isPremium createdAt phone')
      .populate('category', 'name icon _id')
      .populate('owner', 'name _id')
      .lean();

    const businesses = raw.map(b => {
      const count = (b.ratings || []).length;
      const avg = count > 0 
        ? Math.round((b.ratings.reduce((s, r) => s + r.score, 0) / count) * 10) / 10 
        : 0;
      b.avgRating = avg;
      b.ratings = b.ratings || [];
      return b;
    });

    const categories = await Category.find().select('name icon _id').lean();
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

    const raw = await Business.find({ category: { $in: catIds } })
      .select('name address category logo ratings keywords description hours priceRange tags owner isPremium createdAt phone')
      .populate('category', 'name icon _id')
      .populate('owner', 'name _id')
      .lean();

    const businesses = raw.map(b => {
      const count = (b.ratings || []).length;
      const avg = count > 0 
        ? Math.round((b.ratings.reduce((s, r) => s + r.score, 0) / count) * 10) / 10 
        : 0;
      b.avgRating = avg;
      b.ratings = b.ratings || [];
      return b;
    });
    res.json({ businesses, categories: resourceCats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const raw = await Business.find()
      .select('name address category logo ratings keywords description hours priceRange tags owner isPremium createdAt phone')
      .populate('category', 'name icon _id')
      .lean();

    const businesses = raw.map(b => {
      const count = (b.ratings || []).length;
      const avg = count > 0 
        ? Math.round((b.ratings.reduce((s, r) => s + r.score, 0) / count) * 10) / 10 
        : 0;
      b.avgRating = avg;
      b.ratings = b.ratings || [];
      return b;
    });

    const sorted = businesses
      .filter(b => b.ratings && b.ratings.length > 0)
      .sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))
      .slice(0, 5);
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
    if (!isAdmin && review.user.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    await review.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts/:id/comments', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const shoutout = await Shoutout.findById(req.params.id);
    if (!shoutout) return res.status(404).json({ message: 'Not found' });

    const comment = { text: req.body.text, author: user.name, authorId: user._id };
    shoutout.comments.push(comment);
    await shoutout.save();

    if (comment.authorId && comment.authorId.toString() !== req.userId) {
      sendPushToUser(comment.authorId, {
        title: '💬 New comment on shoutout',
        body: `${user.name}: ${req.body.text.substring(0, 60)}...`,
        url: '/shoutouts'
      });
    }
    res.json(shoutout.comments[shoutout.comments.length - 1]);
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

    const article = await News.create({ 
      title, 
      summary, 
      content, 
      images: images || [], 
      author: user._id, 
      authorName: user.name 
    });

    // === SEND PUSH NOTIFICATION ===
    broadcastPush({
      title: `📰 New News: ${title}`,
      body: summary.length > 80 ? summary.substring(0, 77) + '...' : summary,
      url: '/news'
    });

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

router.post('/owner/business/photos', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.verifiedBusiness)
      return res.status(403).json({ message: 'No verified business' });

    const business = await Business.findById(user.verifiedBusiness);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const { photos } = req.body;
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

router.get('/messages/unread-count', authenticate, async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.userId, read: false });
    res.json({ count });
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

// ─── UPDATED SEARCH (now includes Lost & Found + Marketplace) ───────────────
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const regex = new RegExp(q, 'i');

    const [businesses, events, deals, news, shoutouts, lostitems, marketplace] = await Promise.all([
      Business.find({ $or: [{ name: regex }, { description: regex }] }).populate('category').limit(8),
      Event.find({ $or: [{ title: regex }, { description: regex }] }).limit(6),
      Deal.find({ $or: [{ title: regex }, { description: regex }] }).populate('business').limit(6),
      News.find({ $or: [{ title: regex }, { summary: regex }, { content: regex }] }).limit(6),
      Shoutout.find({ text: regex }).limit(6),
      LostItem.find({ $or: [{ title: regex }, { description: regex }] }).limit(6),
      MarketplaceItem.find({ $or: [{ title: regex }, { description: regex }] }).limit(6)
    ]);

    const results = [
      ...businesses.map(b => ({ type: 'business', id: b._id, title: b.name, subtitle: b.description || '', icon: '📍' })),
      ...events.map(e    => ({ type: 'event',    id: e._id, title: e.title,  subtitle: e.description || '', icon: '📅' })),
      ...deals.map(d     => ({ type: 'deal',     id: d._id, title: d.title,  subtitle: d.description || '', icon: '🔥' })),
      ...news.map(n      => ({ type: 'news',     id: n._id, title: n.title,  subtitle: n.summary || '', icon: '📰' })),
      ...shoutouts.map(s => ({ type: 'shoutout', id: s._id, title: s.text,   subtitle: `by ${s.author}`, icon: '💬' })),
      ...lostitems.map(l => ({ type: 'lost',     id: l._id, title: l.title,   subtitle: l.description || '', icon: '🔎' })),
      ...marketplace.map(m => ({ type: 'market', id: m._id, title: m.title,   subtitle: `$${m.price} · ${m.authorName}`, icon: '🛒' }))
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

// Native Push Token Storage
router.post('/push/native-subscribe', authenticate, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ message: 'Token required' });

    await PushSubscription.findOneAndUpdate(
      { user: req.userId },
      { user: req.userId, nativeToken: token, platform: platform || 'android' },
      { upsert: true }
    );

    await User.findByIdAndUpdate(req.userId, { pushEnabled: true });
    res.json({ message: 'Token saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Native Push Token Storage
router.post('/push/native-subscribe', authenticate, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ message: 'Token required' });

    await PushSubscription.findOneAndUpdate(
      { user: req.userId },
      { user: req.userId, nativeToken: token, platform: platform || 'android' },
      { upsert: true }
    );

    await User.findByIdAndUpdate(req.userId, { pushEnabled: true });
    res.json({ message: 'Token saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;