const { withAdminAuth, formatError } = require('../_lib/middleware');
const { computeDailySnapshot } = require('../_lib/metrics');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

function _ms(ts) {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  return 0;
}

async function handler(req, res) {
  const action = req.query.action || 'dashboard';

  try {
    const db = admin.firestore();

    if (action === 'dashboard' && req.method === 'GET') {
      const usersSnap = await db.collection('users').count().get();
      const totalUsers = usersSnap.data().count;

      /* v2: a trial is plan:'premium' with isTrial:true, so premiumTotal
         already includes trials. paidPremium = premiumTotal - trials. */
      const premiumTotalSnap = await db.collection('users').where('plan', '==', 'premium').count().get();
      const premiumTotal = premiumTotalSnap.data().count;

      const trialSnap = await db.collection('users').where('isTrial', '==', true).count().get();
      const trialUsers = trialSnap.data().count;

      const premiumUsers = Math.max(0, premiumTotal - trialUsers);
      const freeUsers = Math.max(0, totalUsers - premiumTotal);

      const metricsSnap = await db.collection('metrics').doc('latest').get();
      const latestMetrics = metricsSnap.exists ? metricsSnap.data() : {};

      /* AI cost for TODAY is read LIVE from the incremental counter (not the daily snapshot)
         so the GPT Cost Center is real-time, not frozen at the last cron run. */
      const aiDayKey = new Date().toISOString().split('T')[0];
      const aiTodaySnap = await db.collection('systemMetrics').doc('ai_daily_' + aiDayKey).get();
      const aiToday = aiTodaySnap.exists ? aiTodaySnap.data() : {};

      const now = Date.now();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
      const orphanDuelsSnap = await db.collection('duels').where('status', 'in', ['waiting', 'active']).where('createdAt', '<', thirtyMinutesAgo).limit(100).get();

      return res.status(200).json({
        metrics: {
          totalUsers: totalUsers,
          freeUsers: freeUsers,
          trialUsers: trialUsers,
          premiumUsers: premiumUsers,
          dau: latestMetrics.dau || 0,
          mau: latestMetrics.mau || 0,
          newToday: latestMetrics.newToday || 0,
          orphanDuels: orphanDuelsSnap.size,
          revenueTotalINR: latestMetrics.revenueTotalINR || 0,
          revenueTodayINR: latestMetrics.revenueTodayINR || 0,
          revenue6mCount: latestMetrics.revenue6mCount || 0,
          revenue12mCount: latestMetrics.revenue12mCount || 0
        },
        ai: {
          tokensInput: aiToday.totalTokensInput || 0,
          tokensOutput: aiToday.totalTokensOutput || 0,
          gptCalls: aiToday.gptCalls || 0,
          costUSD: Number(aiToday.estimatedCostUSD || 0).toFixed(4)
        },
        health: {
          firebaseAuth: 'green',
          firestore: 'green',
          aiApi: 'green',
          webhooks: 'green'
        }
      });
    }

    if (action === 'health' && req.method === 'GET') {
      const now = Date.now();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
      const issues = [];
      /* Premium users whose planExpiry (ISO string) is in the past but plan still
         shows 'premium'. Filter in code (ISO-string compare) to avoid a composite index. */
      const nowIso = new Date().toISOString();
      const premiumSnap = await db.collection('users').where('plan', '==', 'premium').limit(500).get();
      let expiredCount = 0;
      premiumSnap.forEach(d => { const e = d.data().planExpiry; if (e && typeof e === 'string' && e < nowIso) expiredCount++; });
      if (expiredCount > 0) { issues.push({ type: 'EXPIRED_PREMIUM', severity: 'high', message: `Found ${expiredCount} users with active premium but expired timestamps.`, actionPayload: { fixEndpoint: '/api/admin/entitlements', action: 'revoke' } }); }
      const orphanDuelsSnap = await db.collection('duels').where('status', 'in', ['waiting', 'active']).where('createdAt', '<', thirtyMinutesAgo).limit(100).get();
      if (!orphanDuelsSnap.empty) { issues.push({ type: 'ORPHANED_DUELS', severity: 'medium', message: `Found ${orphanDuelsSnap.size} stale duel rooms clogging the database.`, actionPayload: { fixEndpoint: '/api/admin/duels/cleanup' } }); }
      const recentUsers = await db.collection('users').orderBy('createdAt', 'desc').limit(50).get();

      return res.status(200).json({ status: issues.length > 0 ? 'issues_found' : 'healthy', issues: issues, scannedAt: new Date().toISOString() });
    }

    if (action === 'auditLogs' && req.method === 'GET') {
      /* Unified immutable audit trail (ADR-012) + notification broadcasts. */
      const [auditSnaps, notifSnaps] = await Promise.all([
        db.collection('auditLogs').orderBy('ts', 'desc').limit(50).get(),
        db.collection('notificationLogs').orderBy('timestamp', 'desc').limit(25).get()
      ]);
      const auditLogs = [];
      auditSnaps.forEach(doc => { const d = doc.data(); auditLogs.push({ id: doc.id, type: d.category || 'admin', action: d.action || 'unknown', target: d.targetId || d.targetType || null, admin: d.actorEmail || d.actorUid || 'System', summary: d.summary || null, timestamp: _ms(d.ts) }); });
      notifSnaps.forEach(doc => { const d = doc.data(); auditLogs.push({ id: doc.id, type: 'notification', action: `Broadcast to ${d.segment || 'unknown'}`, target: `Sent: ${d.successCount || 0}, Failed: ${d.failureCount || 0}`, admin: d.adminUid || 'System', timestamp: _ms(d.timestamp) }); });
      auditLogs.sort((a, b) => b.timestamp - a.timestamp);
      auditLogs.forEach(l => { l.timestamp = new Date(l.timestamp).toISOString(); });
      return res.status(200).json(auditLogs);
    }

    if (action === 'aggregate-metrics' && req.method === 'POST') {
      /* Manual on-demand refresh — same computor as the Vercel-Cron daily-snapshot (ADR-013). */
      const payload = await computeDailySnapshot(db);
      await db.collection('metrics').doc(payload.date).set(payload, { merge: true });
      await db.collection('metrics').doc('latest').set(payload, { merge: true });
      return res.status(200).json({ success: true, metrics: payload });
    }

    return res.status(404).json({ error: 'System action not found' });
  } catch (err) {
    console.error('System Route Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
