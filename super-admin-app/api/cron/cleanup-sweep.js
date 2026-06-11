/**
 * Vercel-Cron account cleanup sweep (ADR-014). Spark-compatible (not a Cloud Function).
 * Gated by CRON_SECRET (NOT withAdminAuth). Two bounded steps per run:
 *   (1) FLAG still-active users inactive > 180d (sets inactiveFlaggedAt) for admin review.
 *   (2) PURGE archived users whose 30-day hold (`purgeAfter`) has expired.
 * Never auto-archives active users — that stays an explicit admin decision (safety).
 */
const admin = require('firebase-admin');
const { purgeUser, INACTIVE_FLAG_DAYS } = require('../_lib/user-lifecycle');
const { writeAuditLog } = require('../_lib/audit');

if (!admin.apps.length) {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp(sa ? { credential: admin.credential.cert(JSON.parse(sa)) } : undefined);
  } catch (e) {
    console.error('Firebase admin initialization failed:', e);
  }
}

function _safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

module.exports = async function (req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: { code: 'CRON_SECRET_MISSING', message: 'CRON_SECRET is not configured.' } });
  const header = req.headers['authorization'] || '';
  const provided = header.indexOf('Bearer ') === 0 ? header.substring(7) : header;
  if (!_safeEqual(provided, secret)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret.' } });
  }

  try {
    const db = admin.firestore();
    const nowIso = new Date().toISOString();
    const inactiveCutoff = new Date(Date.now() - INACTIVE_FLAG_DAYS * 24 * 60 * 60 * 1000).toISOString();

    /* (1) Flag inactive>180d still-active users not yet flagged (bounded). */
    let flagged = 0;
    const flagSnap = await db.collection('users')
      .where('stats.lastActiveDate', '<', inactiveCutoff)
      .orderBy('stats.lastActiveDate', 'asc')
      .limit(400).get();
    if (!flagSnap.empty) {
      const batch = db.batch();
      flagSnap.forEach(function (doc) {
        const d = doc.data();
        if ((d.accountStatus || 'active') === 'active' && !d.inactiveFlaggedAt) {
          batch.set(doc.ref, { inactiveFlaggedAt: nowIso }, { merge: true });
          flagged++;
        }
      });
      if (flagged > 0) await batch.commit();
    }

    /* (2) Purge archived users past their hold (bounded — purges are heavier). */
    let purged = 0;
    const purgeSnap = await db.collection('users')
      .where('accountStatus', '==', 'archived')
      .where('purgeAfter', '<', nowIso)
      .limit(25).get();
    for (const doc of purgeSnap.docs) {
      const uid = doc.id;
      await purgeUser(db, uid);
      await writeAuditLog(db, { actorUid: 'system:cron', actorEmail: 'cleanup-sweep', action: 'purge_user_auto', category: 'user', targetType: 'user', targetId: uid, summary: 'auto-purged archived user ' + uid + ' (30-day hold expired)' });
      purged++;
    }

    return res.status(200).json({ success: true, flagged: flagged, purged: purged });
  } catch (err) {
    console.error('[cron/cleanup-sweep] failed:', err);
    return res.status(500).json({ error: { code: 'SWEEP_FAILED', message: err.message } });
  }
};
