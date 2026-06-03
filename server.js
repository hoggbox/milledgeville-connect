const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CRITICAL FIX: Increased body size limit for photo uploads ───
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use(cors());
app.use(express.static('public'));   // Serves all HTML/JS/CSS

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB: milledgevilleconnect'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api', require('./routes/api'));

// ─── BACKGROUND JOB: Scheduled Notifications ────────────────────────────────
const ScheduledNotification = require('./models/ScheduledNotification');

// Run every 60 seconds
setInterval(async () => {
  try {
    const now = new Date();

    // Find all pending notifications that are due to be sent
    const dueNotifications = await ScheduledNotification.find({
      status: 'pending',
      scheduledFor: { $lte: now }
    });

    if (dueNotifications.length > 0) {
      console.log(`[Scheduler] Processing ${dueNotifications.length} due notification(s)...`);

      for (const notif of dueNotifications) {
        try {
          // Build deep link data
          let dataPayload = { page: 'home' };

          if (notif.targetType === 'business' && notif.targetId) {
            dataPayload = { page: 'directory', id: notif.targetId };
          } else if (notif.targetType === 'app' && notif.targetId) {
            dataPayload = { page: notif.targetId };
          } else if (notif.targetType === 'external' && notif.targetId) {
            dataPayload = { page: 'external', url: notif.targetId };
          }

          // Send the push notification
          // We call broadcastPush from the api router
          const api = require('./routes/api');
          if (typeof api.broadcastPush === 'function') {
            await api.broadcastPush(
              notif.title,
              notif.body,
              dataPayload,
              { 
                imageUrl: notif.image || null,
                type: 'custom'
              }
            );
          } else {
            console.log('[Scheduler] broadcastPush not available, skipping send');
          }

          // Mark as sent
          notif.status = 'sent';
          notif.sentAt = new Date();
          await notif.save();

          console.log(`[Scheduler] ✅ Sent: ${notif.title}`);
        } catch (sendErr) {
          console.error(`[Scheduler] Failed to send notification ${notif._id}:`, sendErr.message);
          notif.status = 'failed';
          await notif.save();
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler] Background job error:', err.message);
  }
}, 60 * 1000); // Check every 60 seconds

console.log('✅ Scheduled Notification background job is running');

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MSConnect running at http://localhost:${PORT}`);
  console.log('📱 Open in any browser — works great on phones!');
});