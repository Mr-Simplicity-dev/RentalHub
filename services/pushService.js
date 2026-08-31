/**
 * Web Push (Web Push Protocol via VAPID) for public survey reminders.
 *
 * - VAPID keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 *   VAPID_SUBJECT). If missing, a keypair is generated in-memory with a
 *   warning (keys would change on restart — configure the env for production).
 * - Subscriptions are stored in push_subscriptions, linked to a user_id
 *   (when logged in) and/or a resume_token (anonymous public drafters).
 * - sendReminder pushes "Finish your survey" to all subscriptions whose
 *   resume_token points at an unfinished, non-superseded draft.
 */

const webpush = require('web-push');
const db = require('../config/middleware/database');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@rentalhub.com.ng';

let runtimeKeys = null;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  runtimeKeys = webpush.generateVAPIDKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, runtimeKeys.publicKey, runtimeKeys.privateKey);
  console.warn('[push] VAPID keys not configured in env — using runtime keys (resets on restart). Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.');
}

exports.getPublicKey = (req, res) => {
  return res.json({
    success: true,
    data: { public_key: VAPID_PUBLIC_KEY || runtimeKeys.publicKey },
  });
};

exports.subscribe = async (req, res) => {
  try {
    const { endpoint, keys, resume_token } = req.body;

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return res.status(400).json({ success: false, message: 'A valid push endpoint is required' });
    }
    if (!keys || typeof keys !== 'object' || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, message: 'Valid push keys are required' });
    }

    const userId = req.user?.id || null;
    const token = String(resume_token || '').trim().slice(0, 64) || null;

    await db.query(
      `INSERT INTO push_subscriptions (user_id, resume_token, endpoint, keys)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id),
         resume_token = COALESCE(EXCLUDED.resume_token, push_subscriptions.resume_token),
         keys = EXCLUDED.keys,
         last_seen_at = CURRENT_TIMESTAMP`,
      [userId, token, endpoint, JSON.stringify(keys)]
    );

    return res.json({ success: true, message: 'Push subscription saved' });
  } catch (error) {
    req.logger.error('Push subscribe error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save push subscription' });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'endpoint is required' });
    }
    await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    return res.json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
    req.logger.error('Push unsubscribe error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove push subscription' });
  }
};

// Send a push notification to one subscription (best-effort).
const sendToSubscription = async (subscription, payload) => {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys || {},
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 * 3 }
    );
    return { ok: true };
  } catch (error) {
    // 404/410 = subscription gone
    if (error.statusCode === 404 || error.statusCode === 410) {
      await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [subscription.id]);
      return { ok: false, removed: true };
    }
    return { ok: false, error: error.message };
  }
};

exports.sendSurveyReminders = async (req, res) => {
  try {
    const target = String(req.query.target || 'drafts').toLowerCase();

    let subs;
    if (target === 'test') {
      // Send a test push to the requesting admin's own subscriptions.
      subs = (await db.query(
        `SELECT * FROM push_subscriptions WHERE user_id = $1`,
        [req.user.id]
      )).rows;
    } else {
      // Subscriptions tied to unfinished, non-superseded drafts (or any user).
      subs = (await db.query(
        `SELECT ps.*
         FROM push_subscriptions ps
         LEFT JOIN survey_responses sr
           ON (sr.resume_token = ps.resume_token OR (ps.user_id IS NOT NULL AND sr.user_id = ps.user_id))
          AND sr.superseded_at IS NULL
          AND sr.completed_at IS NULL
         WHERE sr.id IS NOT NULL
         GROUP BY ps.id
         LIMIT 500`
      )).rows;
    }

    const payload = {
      title: 'Finish your RentalHub survey',
      body: 'You have an unfinished survey. Tap to continue where you left off.',
      icon: '/rentalhub-mark.svg',
      url: '/survey',
    };

    let sent = 0;
    let removed = 0;
    for (const sub of subs) {
      const result = await sendToSubscription(sub, payload);
      if (result.ok) sent++;
      if (result.removed) removed++;
    }

    return res.json({
      success: true,
      data: { sent, removed, total: subs.length },
      message: `Push reminders: ${sent} sent, ${removed} stale subscriptions removed`,
    });
  } catch (error) {
    req.logger.error('Push reminder error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send push reminders' });
  }
};

exports.sendToSubscription = sendToSubscription;
