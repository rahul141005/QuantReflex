/**
 * Vercel-Cron daily sweep (ADR-017) — consolidates the former daily-snapshot + cleanup-sweep crons
 * into ONE function (Hobby plan: ≤12 functions, cron ≤ once/day). Gated by CRON_SECRET.
 *   (1) Snapshot: computeDailySnapshot → metrics/{date} + metrics/latest.
 *   (2) Cleanup: flag still-active users inactive>180d; purge archived users past their 30-day hold.
 */
const admin = require('firebase-admin');
const { computeDailySnapshot, writeCoachingRollups } = require('../_lib/metrics');
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

  const result = { snapshot: false, coachingRollups: 0, flagged: 0, purged: 0, aiRequestsPruned: 0, aiDailyPruned: 0 };
  try {
    const db = admin.firestore();

    /* (0) Prune the AI Command Center per-request log past its 30-day retention (expiresAt is epoch ms set at
       write time). Bounded pages of 300 so a backlog drains over successive daily runs without blowing the
       function window. Non-fatal. */
    try {
      const nowMs = Date.now();
      for (let page = 0; page < 10; page++) {   // ≤3000 deletions/day; the rest drains tomorrow
        const stale = await db.collection('aiRequests').where('expiresAt', '<', nowMs).limit(300).get();
        if (stale.empty) break;
        const batch = db.batch();
        stale.forEach(function (d) { batch.delete(d.ref); });
        await batch.commit();
        result.aiRequestsPruned += stale.size;
        if (stale.size < 300) break;
      }
    } catch (e) {
      console.error('[cron/sweep] aiRequests prune failed:', e);
      result.aiRequestsPruneError = e.message;
    }

    /* (0b) Prune expired aiDaily per-day Coach/Insights caches (expiresAt is epoch ms set at write time, ADR-071).
       Same bounded-page pattern as aiRequests — the doc is only ever read by its same-day key, so anything expired
       is dead weight. Single-field expiresAt range → auto-indexed (no composite). Non-fatal. */
    try {
      const nowMs = Date.now();
      for (let page = 0; page < 10; page++) {   // ≤3000 deletions/day; the rest drains tomorrow
        const stale = await db.collection('aiDaily').where('expiresAt', '<', nowMs).limit(300).get();
        if (stale.empty) break;
        const batch = db.batch();
        stale.forEach(function (d) { batch.delete(d.ref); });
        await batch.commit();
        result.aiDailyPruned += stale.size;
        if (stale.size < 300) break;
      }
    } catch (e) {
      console.error('[cron/sweep] aiDaily prune failed:', e);
      result.aiDailyPruneError = e.message;
    }

    /* (1) Daily metrics snapshot (non-fatal — cleanup still runs if it fails). */
    try {
      const payload = await computeDailySnapshot(db);
      await db.collection('metrics').doc(payload.date).set(payload, { merge: true });
      await db.collection('metrics').doc('latest').set(payload, { merge: true });
      result.snapshot = true;
    } catch (e) {
      console.error('[cron/sweep] snapshot failed:', e);
      result.snapshotError = e.message;
    }

    /* (1b) Per-coaching daily rollup → coachingMetrics/{id} (Analytics Foundation, ADR-027).
       Non-fatal; builds the honest per-coaching speed/accuracy/participation trend the Coaching App reads. */
    try {
      result.coachingRollups = await writeCoachingRollups(db);
    } catch (e) {
      console.error('[cron/sweep] coaching rollups failed:', e);
      result.coachingRollupsError = e.message;
    }

    /* (2) Account cleanup. */
    const nowIso = new Date().toISOString();
    /* Range on the SORTABLE epoch-ms field (ADR-029) — the prior ISO `<` compare against the toDateString
       lastActiveDate never matched, so no user was ever flagged inactive. */
    const inactiveCutoffMs = Date.now() - INACTIVE_FLAG_DAYS * 24 * 60 * 60 * 1000;

    const flagSnap = await db.collection('users')
      .where('stats.lastActiveMs', '<', inactiveCutoffMs)
      .orderBy('stats.lastActiveMs', 'asc')
      .limit(400).get();
    if (!flagSnap.empty) {
      const batch = db.batch();
      flagSnap.forEach(function (doc) {
        const d = doc.data();
        if ((d.accountStatus || 'active') === 'active' && !d.inactiveFlaggedAt) {
          batch.set(doc.ref, { inactiveFlaggedAt: nowIso }, { merge: true });
          result.flagged++;
        }
      });
      if (result.flagged > 0) await batch.commit();
    }

    const purgeSnap = await db.collection('users')
      .where('accountStatus', '==', 'archived')
      .where('purgeAfter', '<', nowIso)
      .limit(25).get();
    for (const doc of purgeSnap.docs) {
      const uid = doc.id;
      await purgeUser(db, uid);
      await writeAuditLog(db, { actorUid: 'system:cron', actorEmail: 'cron/sweep', action: 'purge_user_auto', category: 'user', targetType: 'user', targetId: uid, summary: 'auto-purged archived user ' + uid + ' (30-day hold expired)' });
      result.purged++;
    }

    return res.status(200).json(Object.assign({ success: true }, result));
  } catch (err) {
    console.error('[cron/sweep] failed:', err);
    return res.status(500).json({ error: { code: 'SWEEP_FAILED', message: err.message }, partial: result });
  }
};
