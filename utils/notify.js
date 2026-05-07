/**
 * utils/notify.js
 * ───────────────────────────────────────────────────────────────────────────
 * Firebase Admin SDK wrapper for sending FCM push notifications.
 *
 * SETUP (one-time):
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → save the JSON file
 *   3. Set env var:  GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *      OR paste the entire JSON into env var FIREBASE_SERVICE_ACCOUNT_JSON
 *   4. npm install firebase-admin
 *
 * USAGE:
 *   const { notifyAll, notifyUser } = require('../utils/notify');
 *
 *   // Broadcast to every registered device
 *   await notifyAll({ title: '🆕 New Shoutout', body: 'Check it out!', data: { page: 'shoutouts' } });
 *
 *   // Send to one specific user (looks up their FCM tokens from DB)
 *   await notifyUser(userId, { title: '💬 New Message', body: 'You have a new message', data: { page: 'messages' } });
 */

const admin = require('firebase-admin');
const User  = require('../models/User');

// ─── Init Firebase Admin (idempotent) ────────────────────────────────────────
function initFirebase() {
  if (admin.apps.length) return; // already initialized

  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Preferred for cloud hosting (Render, Railway, Heroku, etc.)
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(serviceAccount);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Local dev: point env var at the downloaded JSON file
    credential = admin.credential.applicationDefault();
  } else {
    console.warn('⚠️  notify.js: No Firebase credentials found. Push notifications will be skipped.');
    return;
  }

  admin.initializeApp({ credential });
  console.log('🔥 Firebase Admin initialized');
}

initFirebase();

/**
 * Send a notification to a list of FCM tokens.
 * Automatically removes dead/invalid tokens from the DB.
 *
 * @param {string[]} tokens   - Array of FCM device tokens
 * @param {object}   payload  - { title, body, data? }
 */
async function sendToTokens(tokens, { title, body, data = {} }) {
  if (!admin.apps.length || !tokens || tokens.length === 0) return;

  // FCM multicast supports up to 500 tokens per call; chunk if needed
  const CHUNK = 500;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);

    const message = {
      notification: { title, body },
      data: Object.fromEntries(                    // FCM data values must be strings
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      tokens: chunk,
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'default' }
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } }
      }
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`📤 FCM: ${response.successCount} sent, ${response.failureCount} failed`);

      // Clean up invalid tokens so they don't pile up
      const deadTokens = [];
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            deadTokens.push(chunk[idx]);
          }
        }
      });

      if (deadTokens.length > 0) {
        await User.updateMany(
          { fcmTokens: { $in: deadTokens } },
          { $pull: { fcmTokens: { $in: deadTokens } } }
        );
        console.log(`🧹 Removed ${deadTokens.length} expired FCM token(s)`);
      }
    } catch (err) {
      console.error('FCM send error:', err.message);
    }
  }
}

/**
 * Broadcast a notification to ALL users who have FCM tokens.
 */
async function notifyAll(payload) {
  if (!admin.apps.length) return;
  const users  = await User.find({ fcmTokens: { $exists: true, $not: { $size: 0 } } }, 'fcmTokens');
  const tokens = users.flatMap(u => u.fcmTokens || []);
  await sendToTokens(tokens, payload);
}

/**
 * Send a notification to a single user by their MongoDB _id.
 */
async function notifyUser(userId, payload) {
  if (!admin.apps.length) return;
  const user = await User.findById(userId, 'fcmTokens');
  if (!user?.fcmTokens?.length) return;
  await sendToTokens(user.fcmTokens, payload);
}

module.exports = { notifyAll, notifyUser, sendToTokens };