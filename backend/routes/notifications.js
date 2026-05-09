/**
 * Push Notifications Routes — Phase 7
 *
 * GET  /api/push/vapid-key   — return VAPID public key for client subscription
 * POST /api/push/subscribe   — save push subscription to DB
 * DELETE /api/push/unsubscribe — remove subscription
 * POST /api/push/test        — send a test notification to the requesting user
 */

const express = require('express');
const webpush = require('web-push');
const { requireAuth } = require('../middleware/authMiddleware');
const { pool } = require('../db/index');

const router = express.Router();

// ─── VAPID Setup ─────────────────────────────────────────────────────────────

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

let vapidReady = false;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(
      'mailto:admin@billionaireai.app',
      VAPID_PUBLIC,
      VAPID_PRIVATE,
    );
    vapidReady = true;
    console.log('[Push] VAPID configured successfully.');
  } catch (err) {
    console.warn('[Push] VAPID setup failed:', err.message);
  }
} else {
  console.warn('[Push] VAPID keys not set. Push notifications will be disabled.');
}

// ─── Helper: send notification to a subscription ─────────────────────────────

async function sendPushToSubscription(subscription, payload) {
  if (!vapidReady) return false;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — clean up from DB
      await pool.query(
        'DELETE FROM push_subscriptions WHERE endpoint = $1',
        [subscription.endpoint],
      ).catch(() => {});
    }
    return false;
  }
}

// ─── GET /api/push/vapid-key ──────────────────────────────────────────────────

router.get('/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
  }
  res.json({ publicKey: VAPID_PUBLIC });
});

// ─── POST /api/push/subscribe ────────────────────────────────────────────────

router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object. endpoint, keys.p256dh, and keys.auth are required.' });
    }

    // Upsert subscription (same endpoint = same device)
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
      [req.userId, endpoint, keys.p256dh, keys.auth],
    );

    console.log(`[Push] Subscription saved for user ${req.userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save push subscription.' });
  }
});

// ─── DELETE /api/push/unsubscribe ────────────────────────────────────────────

router.delete('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint is required.' });
    }
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.userId, endpoint],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err.message);
    res.status(500).json({ error: 'Failed to remove subscription.' });
  }
});

// ─── POST /api/push/test ─────────────────────────────────────────────────────

router.post('/test', requireAuth, async (req, res) => {
  if (!vapidReady) {
    return res.status(503).json({ error: 'Push notifications not configured.' });
  }

  try {
    const subs = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 LIMIT 5',
      [req.userId],
    );
    if (subs.rows.length === 0) {
      return res.status(404).json({ error: 'No push subscriptions found. Enable notifications first.' });
    }

    let sent = 0;
    for (const row of subs.rows) {
      const ok = await sendPushToSubscription(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        {
          title: 'Billionaire AI',
          body:  'Push notifications are working. Market alerts will appear here.',
          icon:  '/favicon.ico',
          badge: '/favicon.ico',
          tag:   'test-notification',
        },
      );
      if (ok) sent++;
    }

    res.json({ success: true, sent, total: subs.rows.length });
  } catch (err) {
    console.error('[Push] Test error:', err.message);
    res.status(500).json({ error: 'Failed to send test notification.' });
  }
});

// ─── Exported helper: send to all subscriptions of a user ────────────────────
// Used internally by cron job and market alert triggers.

async function sendToUser(userId, payload) {
  if (!vapidReady) return 0;
  try {
    const subs = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId],
    );
    let sent = 0;
    for (const row of subs.rows) {
      const ok = await sendPushToSubscription(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      if (ok) sent++;
    }
    return sent;
  } catch {
    return 0;
  }
}

// ─── Exported helper: send to ALL users ──────────────────────────────────────

async function broadcastToAllUsers(payload) {
  if (!vapidReady) return 0;
  try {
    const subs = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions',
    );
    let sent = 0;
    for (const row of subs.rows) {
      const ok = await sendPushToSubscription(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      if (ok) sent++;
    }
    return sent;
  } catch {
    return 0;
  }
}

module.exports = router;
module.exports.sendToUser         = sendToUser;
module.exports.broadcastToAllUsers = broadcastToAllUsers;
