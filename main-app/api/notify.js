/**
 * /api/notify — the ONE internal notification endpoint (ADR-066).
 *
 * The single authenticated entry into the canonical pipeline (services/notificationService). EVERY app that wants
 * to send a notification — Coaching Admin, Super Admin, and main-app callers that can't run in-process — POSTs
 * here; they NEVER write notifications themselves. main-app's own in-process producers (reminderCron, duel,
 * entitlement expiry) call notificationService.notify() directly (no HTTP hop).
 *
 * Auth: server-to-server shared secret `NOTIFY_INTERNAL_SECRET` (Bearer), constant-time compared. The calling
 * server has already authorized its user (e.g. withCoachingAuth / withAdminAuth) before relaying here.
 *
 * Body: {
 *   recipients: { uids[] } | { all, segment? } | { segment } | { coachingId, segment?, audience?, topic? },
 *   notification: { title, body, type?, category?, priority?, icon?, deepLink?, sender?, coachingId?, expiresAt?, metadata? },
 *   push?: boolean (default true), adminUid?: string, logSegment?: string
 * }
 * → { ok, reached, recipients, pushed, failed, cleaned }
 */
'use strict';

const admin = require('firebase-admin');
const { parseBody, formatError } = require('./_lib/middleware');
const notificationService = require('../services/notificationService');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) { console.error('[api/notify] Firebase admin init failed:', err); }
}

function _safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } });

  const secret = process.env.NOTIFY_INTERNAL_SECRET;
  if (!secret) return res.status(500).json({ error: { code: 'NOT_CONFIGURED', message: 'NOTIFY_INTERNAL_SECRET is not set.' } });
  const header = req.headers['authorization'] || '';
  const provided = header.indexOf('Bearer ') === 0 ? header.substring(7) : header;
  if (!_safeEqual(provided, secret)) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid internal secret.' } });

  const body = parseBody(req) || {};
  if (!body.notification || !body.notification.title) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'notification.title is required.' } });
  }

  try {
    const db = admin.firestore();
    const result = await notificationService.notify(db, admin.messaging(), {
      recipients: body.recipients || {},
      notification: body.notification,
      push: body.push,
      adminUid: body.adminUid,
      logSegment: body.logSegment
    });
    return res.status(200).json(Object.assign({ ok: true }, result));
  } catch (err) {
    console.error('[api/notify] failed:', err);
    return res.status(500).json({ error: formatError(err) });
  }
};
