const { withAdminAuth, formatError } = require('../_lib/middleware');
const { computeDailySnapshot, PREMIUM_PRICE_PAISE } = require('../_lib/metrics');
const { writeAuditLog } = require('../_lib/audit');
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

function _safeTS(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') { try { return val.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof val === 'string') { var d = new Date(val); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if (val instanceof Date) { return isNaN(val.getTime()) ? null : val.toISOString(); }
  if (typeof val === 'number' && isFinite(val)) { return new Date(val < 1e12 ? val * 1000 : val).toISOString(); }
  if (typeof val === 'object' && val._seconds != null) { try { return new Date(val._seconds * 1000).toISOString(); } catch (_) { return null; } }
  return null;
}

function _csv(rows) {
  return rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
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
      if (!orphanDuelsSnap.empty) { issues.push({ type: 'ORPHANED_DUELS', severity: 'medium', message: `Found ${orphanDuelsSnap.size} stale duel rooms clogging the database.`, actionPayload: { fixEndpoint: '/api/admin/system?action=duels-cleanup', method: 'POST' } }); }
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

    /* ── alerts (ADR-016, was admin/alerts) ── */
    if (action === 'alerts' && req.method === 'GET') {
      const alerts = [];
      const nowIso = new Date().toISOString();
      const cfgSnap = await db.collection('config').doc('aiBudget').get();
      const cfg = Object.assign({ monthlyBudgetUSD: 25, warnPct: 80, critPct: 90 }, cfgSnap.exists ? cfgSnap.data() : {});
      const nowD = new Date();
      const prefix = 'ai_daily_' + nowD.getUTCFullYear() + '-' + String(nowD.getUTCMonth() + 1).padStart(2, '0') + '-';
      const mtdSnap = await db.collection('systemMetrics').where(admin.firestore.FieldPath.documentId(), '>=', prefix + '01').where(admin.firestore.FieldPath.documentId(), '<=', prefix + '31').get();
      let mtd = 0; mtdSnap.forEach(d => { mtd += (d.data().estimatedCostUSD || 0); });
      const budget = cfg.monthlyBudgetUSD || 0;
      const usedPct = budget > 0 ? (mtd / budget) * 100 : 0;
      if (usedPct >= 100) alerts.push({ severity: 'critical', type: 'ai_budget', message: 'AI budget EXCEEDED — $' + mtd.toFixed(2) + ' of $' + budget + ' (' + usedPct.toFixed(0) + '%).' });
      else if (usedPct >= cfg.critPct) alerts.push({ severity: 'critical', type: 'ai_budget', message: 'AI spend at ' + usedPct.toFixed(0) + '% of budget (critical ' + cfg.critPct + '%).' });
      else if (usedPct >= cfg.warnPct) alerts.push({ severity: 'warning', type: 'ai_budget', message: 'AI spend at ' + usedPct.toFixed(0) + '% of budget (warning ' + cfg.warnPct + '%).' });
      const premSnap = await db.collection('users').where('plan', '==', 'premium').limit(1000).get();
      let expired = 0; premSnap.forEach(d => { const e = d.data().planExpiry; if (e && typeof e === 'string' && e < nowIso) expired++; });
      if (expired > 0) alerts.push({ severity: 'warning', type: 'expired_premium', message: expired + ' user(s) show premium but have an expired timestamp — run the entitlement sweep.' });
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const duelSnap = await db.collection('duels').where('status', 'in', ['waiting', 'active']).where('createdAt', '<', thirtyMinAgo).limit(200).get();
      if (!duelSnap.empty) alerts.push({ severity: 'info', type: 'orphan_duels', message: duelSnap.size + '+ stale duel room(s) — run duel cleanup.' });
      const purgeSnap = await db.collection('users').where('accountStatus', '==', 'archived').where('purgeAfter', '<', nowIso).limit(200).get();
      if (!purgeSnap.empty) alerts.push({ severity: 'info', type: 'pending_purge', message: purgeSnap.size + '+ archived account(s) past their hold — the cleanup-sweep cron will purge them.' });
      /* Firestore-growth-spike (Phase 5, ADR-018) — compare metrics/latest.collectionCounts vs yesterday's. */
      try {
        const latestSnap = await db.collection('metrics').doc('latest').get();
        const latest = latestSnap.exists ? latestSnap.data() : {};
        const yKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const prevSnap = await db.collection('metrics').doc(yKey).get();
        const prev = prevSnap.exists ? prevSnap.data() : {};
        const lc = latest.collectionCounts, pc = prev.collectionCounts;
        if (lc && pc) {
          Object.keys(lc).forEach(function (c) {
            const a = lc[c], b = pc[c];
            if (typeof a === 'number' && typeof b === 'number') {
              const delta = a - b;
              const pct = b > 0 ? (delta / b) * 100 : (a > 0 ? 100 : 0);
              if (delta >= 200 && pct >= 50) alerts.push({ severity: 'warning', type: 'firestore_growth', message: '`' + c + '` grew +' + delta + ' docs (+' + pct.toFixed(0) + '%) since yesterday — check for runaway writes.' });
            }
          });
        }
      } catch (_) { /* non-fatal — growth history may not exist yet */ }
      /* payment-failure-spike + login-failure-spike (Phase 5, ADR-018) — from securityEvents 24h counts. */
      const secCut = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      try {
        const pf = (await db.collection('securityEvents').where('type', '==', 'payment_failure').where('createdAt', '>=', secCut).count().get()).data().count;
        if (pf >= 5) alerts.push({ severity: 'warning', type: 'payment_failures', message: pf + ' payment failure(s) in the last 24h — check Razorpay / webhook health.' });
      } catch (_) { /* securityEvents collection/index may not exist yet */ }
      try {
        const fl = (await db.collection('securityEvents').where('type', '==', 'failed_login').where('createdAt', '>=', secCut).count().get()).data().count;
        if (fl >= 20) alerts.push({ severity: 'warning', type: 'login_failures', message: fl + ' failed login(s) in the last 24h — possible brute-force; review the Security Center.' });
      } catch (_) { /* securityEvents collection/index may not exist yet */ }
      return res.status(200).json({ alerts: alerts, generatedAt: nowIso });
    }

    /* ── security (Phase 5, ADR-018) — Security Center read: recent feed + 24h per-type counts + posture ── */
    if (action === 'security' && req.method === 'GET') {
      const cut24 = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      /* Recent feed (newest 50) — single-field auto-index on createdAt. */
      let events = [];
      try {
        const feedSnap = await db.collection('securityEvents').orderBy('createdAt', 'desc').limit(50).get();
        feedSnap.forEach(function (doc) {
          const x = doc.data();
          events.push({ id: doc.id, type: x.type || 'unknown', app: x.app || null, emailHash: x.emailHash || null, reason: x.reason || null, errorCode: x.errorCode || null, uid: x.uid || null, createdAt: _safeTS(x.createdAt) });
        });
      } catch (_) { events = []; }
      /* Per-type counts over the last 24h — composite (type, createdAt). */
      const types = ['failed_login', 'suspicious_access', 'admin_login', 'payment_failure'];
      const counts24 = {};
      await Promise.all(types.map(async function (t) {
        try { counts24[t] = (await db.collection('securityEvents').where('type', '==', t).where('createdAt', '>=', cut24).count().get()).data().count; }
        catch (_) { counts24[t] = null; }
      }));
      /* Account-posture signals (Firestore-observable). */
      let suspendedUsers = null, archivedUsers = null, expiredPremium = null;
      try { suspendedUsers = (await db.collection('users').where('accountStatus', '==', 'suspended').count().get()).data().count; } catch (_) { /* ignore */ }
      try { archivedUsers = (await db.collection('users').where('accountStatus', '==', 'archived').count().get()).data().count; } catch (_) { /* ignore */ }
      try {
        const nowIso2 = new Date().toISOString();
        const premSnap = await db.collection('users').where('plan', '==', 'premium').limit(1000).get();
        let exp = 0; premSnap.forEach(function (d) { const e = d.data().planExpiry; if (e && typeof e === 'string' && e < nowIso2) exp++; });
        expiredPremium = exp;
      } catch (_) { /* ignore */ }
      return res.status(200).json({ events: events, counts24: counts24, posture: { suspendedUsers: suspendedUsers, archivedUsers: archivedUsers, expiredPremium: expiredPremium }, generatedAt: new Date().toISOString() });
    }

    /* ── firestore-ops (Phase 5, ADR-018) — live collection sizes + daily growth series ── */
    if (action === 'firestore-ops' && req.method === 'GET') {
      const cols = ['users', 'questions', 'duels', 'payments', 'coachings', 'auditLogs', 'securityEvents', 'metrics', 'systemMetrics', 'notificationLogs'];
      const live = {};
      await Promise.all(cols.map(async function (c) {
        try { live[c] = (await db.collection(c).count().get()).data().count; }
        catch (_) { live[c] = null; }
      }));
      /* Growth series from recent daily metrics docs (skip the 'latest' alias + docs without collectionCounts). */
      const series = [];
      try {
        const histSnap = await db.collection('metrics').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(21).get(); /* +1 for the always-first 'latest' alias which is skipped below */
        histSnap.forEach(function (doc) {
          if (doc.id === 'latest') return;
          const d = doc.data();
          if (d.collectionCounts) series.push({ date: doc.id, totalUsers: d.totalUsers || 0, collectionCounts: d.collectionCounts });
        });
      } catch (_) { /* non-fatal */ }
      series.reverse(); /* oldest → newest for charting */
      return res.status(200).json({ live: live, series: series, generatedAt: new Date().toISOString() });
    }

    /* ── payments-logs (was admin/payments) — entitlement actions from the immutable audit log ── */
    if (action === 'payments-logs' && req.method === 'GET') {
      const snapshot = await db.collection('auditLogs').where('category', '==', 'entitlement').orderBy('ts', 'desc').limit(50).get();
      const logs = [];
      snapshot.forEach(doc => { const data = doc.data(); logs.push({ id: doc.id, uid: data.targetId || null, action: data.action || 'unknown', adminUid: data.actorUid || null, adminEmail: data.actorEmail || null, timestamp: _safeTS(data.ts) }); });
      return res.status(200).json(logs);
    }

    /* ── export (ADR-016, was admin/export) — authenticated CSV ── */
    if (action === 'export' && req.method === 'GET') {
      const type = req.query.type || 'users';
      let rows, filename;
      if (type === 'users' || type === 'premium') {
        const q = (type === 'premium') ? db.collection('users').where('plan', '==', 'premium') : db.collection('users');
        const snap = await q.limit(10000).get();
        rows = [['uid', 'email', 'name', 'plan', 'planType', 'planExpiry', 'planSource', 'coachingId', 'accountStatus', 'createdAt']];
        snap.forEach(d => { const u = d.data(); rows.push([d.id, u.email || '', (u.profile && u.profile.name) || '', u.plan || 'free', u.planType || '', _safeTS(u.planExpiry) || '', u.planSource || '', u.coachingId || '', u.accountStatus || 'active', _safeTS(u.createdAt) || '']); });
        filename = type + '-users.csv';
      } else if (type === 'coachings') {
        const snap = await db.collection('coachings').limit(5000).get();
        rows = [['coachingId', 'name', 'status', 'studentCount', 'ownerEmail', 'createdAt']];
        snap.forEach(d => { const c = d.data(); rows.push([d.id, c.name || '', c.status || '', c.studentCount || 0, c.ownerEmail || '', _safeTS(c.createdAt) || '']); });
        filename = 'coachings.csv';
      } else if (type === 'revenue') {
        const snap = await db.collection('payments').limit(20000).get();
        rows = [['paymentId', 'uid', 'plan', 'amountINR', 'status', 'claimedAt', 'orderId']];
        snap.forEach(d => { const p = d.data(); const amt = (typeof p.amount === 'number' && p.amount > 0) ? p.amount : (PREMIUM_PRICE_PAISE[p.plan] || 0); rows.push([d.id, p.uid || '', p.plan || '', (amt / 100), p.status || 'paid', _safeTS(p.claimedAt) || '', p.orderId || '']); });
        filename = 'revenue.csv';
      } else if (type === 'ai-usage') {
        const snap = await db.collectionGroup('usage').where(admin.firestore.FieldPath.documentId(), '==', 'ai').get();
        rows = [['uid', 'wordProblemsLifetime', 'explanationsUsed', 'gptCalls', 'gptTokensInput', 'gptTokensOutput', 'gptCostUSD']];
        snap.forEach(d => { const a = d.data(); const uid = d.ref.parent.parent.id; rows.push([uid, a.wordProblemsUsedLifetime || 0, a.explanationsUsed || 0, a.gptCalls || 0, a.gptTokensInput || 0, a.gptTokensOutput || 0, a.gptCostUSD || 0]); });
        filename = 'ai-usage.csv';
      } else {
        return res.status(400).json({ error: { code: 'INVALID_TYPE', message: 'Unknown export type: ' + type } });
      }
      return res.status(200).json({ filename: filename, csv: _csv(rows), rowCount: rows.length - 1 });
    }

    /* ── duels-cleanup (was admin/duels) ── */
    if (action === 'duels-cleanup' && req.method === 'POST') {
      const now = Date.now();
      const waitingThreshold = now - (24 * 60 * 60 * 1000);
      const activeThreshold = now - (4 * 60 * 60 * 1000);
      const snapshot = await db.collection('duels').where('status', 'in', ['waiting', 'active']).get();
      let deletedCount = 0;
      const batch = db.batch();
      snapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt ? (typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.parse(data.createdAt)) : 0;
        let shouldDelete = false;
        if (data.status === 'waiting' && createdAt < waitingThreshold) shouldDelete = true;
        else if (data.status === 'active' && createdAt < activeThreshold) shouldDelete = true;
        if (shouldDelete) { batch.delete(doc.ref); deletedCount++; }
      });
      if (deletedCount > 0) {
        await batch.commit();
        await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'cleanup_duels', category: 'system', targetType: 'bulk', targetId: null, summary: 'deleted ' + deletedCount + ' stale duel room(s)' });
      }
      return res.status(200).json({ success: true, deletedCount: deletedCount });
    }

    return res.status(404).json({ error: 'System action not found' });
  } catch (err) {
    console.error('System Route Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
