const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User     = require('../models/User');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Shoutout = require('../models/Shoutout');
const Event    = require('../models/Event');
const Deal     = require('../models/Deal');

// ====================== EMAIL ======================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendMail(subject, html) {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: 'imhoggbox@gmail.com',
    subject,
    html
  }).catch(err => console.error('Email error:', err));
}

// ====================== AUTH MIDDLEWARE ======================
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.email !== 'imhoggbox@gmail.com') {
      return res.status(403).json({ message: 'Admin access only' });
    }
    next();
  });
}

// FIX: middleware that requires a verified business owner
async function requireVerifiedOwner(req, res, next) {
  await requireAuth(req, res, () => {
    if (!req.user.verifiedOwner || !req.user.claimedBusiness) {
      return res.status(403).json({ message: 'Verified business owner required' });
    }
    next();
  });
}

// ====================== AUTH ROUTES ======================
router.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user  = await User.create({ name, email, password, role: 'user' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// FIX: populate claimedBusiness so the frontend gets name/address
router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password')
    .populate('claimedBusiness', 'name address phone website description verified');
  res.json(user);
});

// ====================== CLAIM AN EXISTING BUSINESS ======================
router.post('/business/:id/claim', requireAuth, async (req, res) => {
  try {
    const { ownerPhone, message } = req.body;
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    if (business.verifiedOwner) {
      return res.status(400).json({ message: 'This business already has a verified owner' });
    }

    req.user.pendingClaim = {
      businessId:   business._id,
      businessName: business.name,
      ownerPhone:   ownerPhone || '',
      message:      message || '',
      submittedAt:  new Date()
    };
    req.user.role = 'business_owner';
    await req.user.save();

    await sendMail(
      `🏢 Business Claim — ${business.name}`,
      `<h2>Business Claim Submitted</h2>
       <p><strong>User:</strong> ${req.user.name} (${req.user.email})</p>
       <p><strong>Phone:</strong> ${ownerPhone || 'not provided'}</p>
       <p><strong>Business:</strong> ${business.name}</p>
       <p><strong>Address:</strong> ${business.address}</p>
       <p><strong>Message:</strong> ${message || '—'}</p>
       <hr>
       <p>Go to Admin Panel → Pending Claims to approve.</p>`
    );

    res.json({ message: 'Claim submitted! Admin will review and verify you.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== SUBMIT A NEW (UNLISTED) BUSINESS ======================
router.post('/business/submit-new', requireAuth, async (req, res) => {
  try {
    const { businessName, businessAddress, businessPhone, website, category, description, ownerPhone } = req.body;

    req.user.pendingNewBusiness = {
      businessName,
      businessAddress,
      businessPhone,
      website:      website || '',
      category:     category || '',
      description:  description || '',
      ownerPhone:   ownerPhone || '',
      submittedAt:  new Date()
    };
    req.user.role = 'business_owner';
    await req.user.save();

    await sendMail(
      `🆕 New Business Submission — ${businessName}`,
      `<h2>New Business Submitted (Not in Directory)</h2>
       <p><strong>Submitted by:</strong> ${req.user.name} (${req.user.email})</p>
       <p><strong>Owner Phone:</strong> ${ownerPhone || 'not provided'}</p>
       <p><strong>Business Name:</strong> ${businessName}</p>
       <p><strong>Address:</strong> ${businessAddress}</p>
       <p><strong>Phone:</strong> ${businessPhone}</p>
       <p><strong>Website:</strong> ${website || '—'}</p>
       <p><strong>Category:</strong> ${category || '—'}</p>
       <p><strong>Description:</strong> ${description || '—'}</p>
       <hr>
       <p>Go to Admin Panel → Pending Claims to add this business and verify the owner.</p>`
    );

    res.json({ message: 'Submission received! Admin will add your business and verify you.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== ADMIN: GET ALL PENDING CLAIMS ======================
router.get('/admin/pending-claims', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({
      $or: [
        { 'pendingClaim.submittedAt': { $ne: null } },
        { 'pendingNewBusiness.submittedAt': { $ne: null } }
      ]
    }).select('-password').populate('pendingClaim.businessId', 'name address');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== ADMIN: VERIFY A CLAIM ======================
router.put('/admin/verify-claim/:userId', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const bizId = user.pendingClaim && user.pendingClaim.businessId;
    if (!bizId) return res.status(400).json({ message: 'No pending claim found' });

    await Business.findByIdAndUpdate(bizId, {
      verified: true,
      verifiedOwner: user._id,
      owner: user._id
    });

    user.verifiedOwner   = true;
    user.claimedBusiness = bizId;
    user.role            = 'business_owner';
    user.pendingClaim    = {};
    await user.save();

    res.json({ message: '✅ Owner verified and business claimed!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== ADMIN: REJECT A CLAIM ======================
router.delete('/admin/verify-claim/:userId', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.pendingClaim       = {};
    user.pendingNewBusiness = {};
    user.role               = 'user';
    await user.save();
    res.json({ message: 'Claim rejected and cleared.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== ADMIN: APPROVE NEW BUSINESS ======================
router.post('/admin/approve-new-business/:userId', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || !user.pendingNewBusiness || !user.pendingNewBusiness.businessName) {
      return res.status(400).json({ message: 'No pending new business found' });
    }

    const nb = user.pendingNewBusiness;

    let categoryDoc = await Category.findOne({ name: nb.category });
    if (!categoryDoc && nb.category) {
      categoryDoc = await Category.create({ name: nb.category });
    }

    const business = await Business.create({
      name:          nb.businessName,
      address:       nb.businessAddress || '',
      phone:         nb.businessPhone   || '',
      website:       nb.website         || '',
      description:   nb.description     || '',
      category:      categoryDoc ? categoryDoc._id : null,
      owner:         user._id,
      verified:      true,
      verifiedOwner: user._id,
      isPremium:     false
    });

    user.verifiedOwner      = true;
    user.claimedBusiness    = business._id;
    user.role               = 'business_owner';
    user.pendingNewBusiness = {};
    await user.save();

    res.json({ message: '✅ Business created and owner verified!', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== OWNER: EDIT THEIR OWN LISTING ======================
router.put('/business/my-listing', requireVerifiedOwner, async (req, res) => {
  try {
    const updated = await Business.findByIdAndUpdate(
      req.user.claimedBusiness,
      req.body,
      { new: true }
    );
    res.json({ message: 'Listing updated!', business: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== ADMIN BUSINESS CRUD ======================
router.post('/admin/business', requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, website, description, category, keywords, isPremium } = req.body;
    const categoryDoc = await Category.findOne({ name: category });
    if (!categoryDoc) return res.status(400).json({ message: 'Invalid category' });

    const business = await Business.create({
      name, address, phone, website, description,
      category: categoryDoc._id,
      keywords: keywords || [],
      isPremium: isPremium || false,
      verified: false
    });
    res.json({ message: 'Business added!', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/business/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await Business.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'Business updated!', business: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/business/:id/verify', requireAdmin, async (req, res) => {
  try {
    const business = await Business.findByIdAndUpdate(req.params.id, { verified: true }, { new: true });
    res.json({ message: '✅ Business verified!', business });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/business/:id', requireAdmin, async (req, res) => {
  try {
    await Business.findByIdAndDelete(req.params.id);
    res.json({ message: 'Business deleted!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== DIRECTORY + RATINGS ======================
router.get('/directory', async (req, res) => {
  const businesses = await Business.find().populate('category');
  res.json(businesses);
});

router.post('/business/:id/rate', requireAuth, async (req, res) => {
  try {
    const { rating } = req.body;
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    business.ratings.push({ user: req.user._id, rating });
    await business.save();
    res.json({ message: 'Rating added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== PUBLIC PAGES: DEALS, EVENTS, SHOUTOUTS ======================
router.get('/deals', async (req, res) => {
  try {
    const deals = await Deal.find().populate('business', 'name');
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/shoutouts', async (req, res) => {
  try {
    const shoutouts = await Shoutout.find().sort({ createdAt: -1 });
    res.json(shoutouts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== POST ROUTES (verified owners only) ======================
router.post('/deals', requireVerifiedOwner, async (req, res) => {
  try {
    const deal = await Deal.create({
      ...req.body,
      owner: req.user._id,
      business: req.user.claimedBusiness
    });
    res.json({ message: 'Deal posted!', deal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/events', requireVerifiedOwner, async (req, res) => {
  try {
    const event = await Event.create({
      ...req.body,
      owner: req.user._id,
      business: req.user.claimedBusiness
    });
    res.json({ message: 'Event posted!', event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shoutouts', requireAuth, async (req, res) => {
  try {
    const shoutout = await Shoutout.create({ ...req.body, user: req.user._id });
    res.json({ message: 'Shoutout posted!', shoutout });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== OWNER: MY DEALS (GET, EDIT, DELETE) ======================
router.get('/my/deals', requireVerifiedOwner, async (req, res) => {
  try {
    const deals = await Deal.find({ business: req.user.claimedBusiness }).sort({ _id: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/my/deals/:id', requireVerifiedOwner, async (req, res) => {
  try {
    const deal = await Deal.findOne({ _id: req.params.id, business: req.user.claimedBusiness });
    if (!deal) return res.status(404).json({ message: 'Deal not found or not yours' });
    const updated = await Deal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'Deal updated!', deal: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/my/deals/:id', requireVerifiedOwner, async (req, res) => {
  try {
    const deal = await Deal.findOne({ _id: req.params.id, business: req.user.claimedBusiness });
    if (!deal) return res.status(404).json({ message: 'Deal not found or not yours' });
    await Deal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deal deleted!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====================== OWNER: MY EVENTS (GET, EDIT, DELETE) ======================
router.get('/my/events', requireVerifiedOwner, async (req, res) => {
  try {
    const events = await Event.find({ business: req.user.claimedBusiness }).sort({ date: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/my/events/:id', requireVerifiedOwner, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, business: req.user.claimedBusiness });
    if (!event) return res.status(404).json({ message: 'Event not found or not yours' });
    const updated = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'Event updated!', event: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/my/events/:id', requireVerifiedOwner, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, business: req.user.claimedBusiness });
    if (!event) return res.status(404).json({ message: 'Event not found or not yours' });
    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;