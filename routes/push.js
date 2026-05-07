/**
 * routes/push.js
 * ───────────────────────────────────────────────────────────────────────────
 * Handles FCM token registration from Capacitor clients.
 *
 * Mount in server.js (already done via app.use('/api', require('./routes/api'))
 * as long as you add:  router.use('/push', require('./push'));  inside api.js,
 * OR add directly in server.js:
 *   app.use('/api/push', require('./routes/push'));
 */

const express    = require('express');
const router     = express.Router();
const authMiddleware = require('../middleware/auth');   // your existing JWT middleware
const User       = require('../models/User');

/**
 * POST /api/push/native-subscribe
 * Body: { token: "<FCM device token>", platform: "android" | "ios" }
 *
 * Saves the FCM token to the logged-in user's document (array, deduplicated).
 * Called automatically by profile.js _initNativePush() right after login.
 */
router.post('/native-subscribe', authMiddleware, async (req, res) => {
  const { token, platform } = req.body;

  if (!token) return res.status(400).json({ message: 'token is required' });

  try {
    // $addToSet prevents duplicate tokens for the same device
    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { fcmTokens: token } },
      { new: true }
    );
    console.log(`✅ FCM token saved for user ${req.user._id} (${platform || 'unknown'})`);
    res.json({ ok: true });
  } catch (err) {
    console.error('native-subscribe error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/push/native-unsubscribe
 * Body: { token: "<FCM device token>" }
 *
 * Removes a specific FCM token (e.g. on logout).
 */
router.delete('/native-unsubscribe', authMiddleware, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'token is required' });

  try {
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { fcmTokens: token } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('native-unsubscribe error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;