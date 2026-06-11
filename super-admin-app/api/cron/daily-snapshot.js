/**
 * Vercel-Cron daily platform snapshot (ADR-013). Spark-compatible substitute for a
 * scheduled Cloud Function. Gated by CRON_SECRET (NOT withAdminAuth — no admin user
 * is present). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 *
 * Writes the pre-aggregated metrics/{date} + metrics/latest that the dashboard reads O(1).
 */
const admin = require('firebase-admin');
const { computeDailySnapshot } = require('../_lib/metrics');

if (!admin.apps.length) {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp(sa ? { credential: admin.credential.cert(JSON.parse(sa)) } : undefined);
  } catch (e) {
    console.error('Firebase admin initialization failed:', e);
  }
}

/* Constant-time string compare (avoid timing oracles on the cron secret). */
function _safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

module.exports = async function (req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: { code: 'CRON_SECRET_MISSING', message: 'CRON_SECRET is not configured.' } });
  }
  const header = req.headers['authorization'] || '';
  const provided = header.indexOf('Bearer ') === 0 ? header.substring(7) : header;
  if (!_safeEqual(provided, secret)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret.' } });
  }

  try {
    const db = admin.firestore();
    const payload = await computeDailySnapshot(db);
    await db.collection('metrics').doc(payload.date).set(payload, { merge: true });
    await db.collection('metrics').doc('latest').set(payload, { merge: true });
    return res.status(200).json({ success: true, metrics: payload });
  } catch (err) {
    console.error('[cron/daily-snapshot] failed:', err);
    return res.status(500).json({ error: { code: 'SNAPSHOT_FAILED', message: err.message } });
  }
};
