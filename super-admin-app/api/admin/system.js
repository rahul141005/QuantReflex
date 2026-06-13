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
      /* Command Center landing data (ADR-030 perf): these seven reads are independent, so fire them in
         PARALLEL instead of seven sequential awaits (~7× round-trips → 1). The expired-premium count()
         needs the (plan, planExpiry) composite index; it's wrapped so a missing index degrades to null
         (→ 0) rather than rejecting the whole Promise.all and blanking the dashboard. */
      const nowIsoDash = new Date().toISOString();
      const aiDayKey = nowIsoDash.split('T')[0];
      const now = Date.now();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);

      const [usersSnap, premiumTotalSnap, trialSnap, expiredSnap, metricsSnap, aiTodaySnap, orphanDuelsSnap] = await Promise.all([
        db.collection('users').count().get(),
        /* v2: a trial is plan:'premium' with isTrial:true, so premiumTotal already includes trials;
           paidPremium = premiumTotal − trials − expired. */
        db.collection('users').where('plan', '==', 'premium').count().get(),
        db.collection('users').where('isTrial', '==', true).count().get(),
        db.collection('users').where('plan', '==', 'premium').where('planExpiry', '<', nowIsoDash).count().get().catch(function () { return null; }),
        db.collection('metrics').doc('latest').get(),
        /* AI cost for TODAY is read LIVE from the incremental counter (not the daily snapshot) so the GPT
           Cost Center is real-time, not frozen at the last cron run. */
        db.collection('systemMetrics').doc('ai_daily_' + aiDayKey).get(),
        db.collection('duels').where('status', 'in', ['waiting', 'active']).where('createdAt', '<', thirtyMinutesAgo).limit(100).get()
      ]);

      const totalUsers = usersSnap.data().count;
      const premiumTotal = premiumTotalSnap.data().count;
      const trialUsers = trialSnap.data().count;
      const expiredPremium = expiredSnap ? expiredSnap.data().count : 0;
      const premiumUsers = Math.max(0, premiumTotal - trialUsers - expiredPremium);
      const freeUsers = Math.max(0, totalUsers - premiumTotal);
      const latestMetrics = metricsSnap.exists ? metricsSnap.data() : {};
      const aiToday = aiTodaySnap.exists ? aiTodaySnap.data() : {};

      return res.status(200).json({
        metrics: {
          totalUsers: totalUsers,
          freeUsers: freeUsers,
          trialUsers: trialUsers,
          premiumUsers: premiumUsers,
          expiredPremium: expiredPremium,
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
      let _acks = {};
      try { const _aSnap = await db.collection('config').doc('alertAcks').get(); if (_aSnap.exists) _acks = _aSnap.data() || {}; } catch (_) { /* ignore */ }
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
      /* Expired-but-unswept premium via count() aggregation (ADR-023) — accurate at any scale,
         needs the (plan, planExpiry) index; degrades to 0 if the index isn't live yet. */
      let expired = 0;
      try { expired = (await db.collection('users').where('plan', '==', 'premium').where('planExpiry', '<', nowIso).count().get()).data().count; } catch (_) { /* index missing — degrade */ }
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
      const _visible = alerts.filter(function (al) { const ak = _acks[al.type]; return !(ak && ak.until && ak.until > nowIso); });
      return res.status(200).json({ alerts: _visible, suppressed: alerts.length - _visible.length, generatedAt: nowIso });
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
      /* Expired-unswept premium via count() aggregation (ADR-023) — accurate at scale, (plan,planExpiry) index. */
      try {
        const nowIso2 = new Date().toISOString();
        expiredPremium = (await db.collection('users').where('plan', '==', 'premium').where('planExpiry', '<', nowIso2).count().get()).data().count;
      } catch (_) { /* index missing — leave null */ }
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
      let rows, filename, cap; /* cap = per-type row ceiling; surfaced as `truncated` so the operator
                                  is never silently handed a partial export (ADR-023). */
      if (type === 'users' || type === 'premium') {
        cap = 10000;
        const q = (type === 'premium') ? db.collection('users').where('plan', '==', 'premium') : db.collection('users');
        const snap = await q.limit(cap).get();
        rows = [['uid', 'email', 'name', 'plan', 'planType', 'planExpiry', 'planSource', 'coachingId', 'accountStatus', 'createdAt']];
        snap.forEach(d => { const u = d.data(); rows.push([d.id, u.email || '', (u.profile && u.profile.name) || '', u.plan || 'free', u.planType || '', _safeTS(u.planExpiry) || '', u.planSource || '', u.coachingId || '', u.accountStatus || 'active', _safeTS(u.createdAt) || '']); });
        filename = type + '-users.csv';
      } else if (type === 'coachings') {
        cap = 5000;
        const snap = await db.collection('coachings').limit(cap).get();
        rows = [['coachingId', 'name', 'status', 'studentCount', 'ownerEmail', 'createdAt']];
        snap.forEach(d => { const c = d.data(); rows.push([d.id, c.name || '', c.status || '', c.studentCount || 0, c.ownerEmail || '', _safeTS(c.createdAt) || '']); });
        filename = 'coachings.csv';
      } else if (type === 'revenue') {
        cap = 20000;
        const snap = await db.collection('payments').limit(cap).get();
        rows = [['paymentId', 'uid', 'plan', 'amountINR', 'status', 'claimedAt', 'orderId']];
        snap.forEach(d => { const p = d.data(); const amt = (typeof p.amount === 'number' && p.amount > 0) ? p.amount : (PREMIUM_PRICE_PAISE[p.plan] || 0); rows.push([d.id, p.uid || '', p.plan || '', (amt / 100), p.status || 'paid', _safeTS(p.claimedAt) || '', p.orderId || '']); });
        filename = 'revenue.csv';
      } else if (type === 'ai-usage') {
        cap = 10000; /* ADR-023: was unbounded — a 1M-user collectionGroup scan would OOM the 512 MB function. */
        const snap = await db.collectionGroup('usage').where(admin.firestore.FieldPath.documentId(), '==', 'ai').limit(cap).get();
        rows = [['uid', 'wordProblemsLifetime', 'explanationsUsed', 'gptCalls', 'gptTokensInput', 'gptTokensOutput', 'gptCostUSD']];
        snap.forEach(d => { const a = d.data(); const uid = d.ref.parent.parent.id; rows.push([uid, a.wordProblemsUsedLifetime || 0, a.explanationsUsed || 0, a.gptCalls || 0, a.gptTokensInput || 0, a.gptTokensOutput || 0, a.gptCostUSD || 0]); });
        filename = 'ai-usage.csv';
      } else {
        return res.status(400).json({ error: { code: 'INVALID_TYPE', message: 'Unknown export type: ' + type } });
      }
      const rowCount = rows.length - 1;
      return res.status(200).json({ filename: filename, csv: _csv(rows), rowCount: rowCount, truncated: rowCount >= cap });
    }

    /* ── duels-cleanup (was admin/duels) ── */
    if (action === 'duels-cleanup' && req.method === 'POST') {
      const now = Date.now();
      const waitingThreshold = now - (24 * 60 * 60 * 1000);
      const activeThreshold = now - (4 * 60 * 60 * 1000);
      /* Bounded to 500/run (ADR-023): the single delete batch is within Firestore's 500-write
         limit, and an unbounded scan over a high-concurrency duels collection can't sink the call.
         `scanned === 500` signals more remain — re-run (or the next cron pass) drains the rest. */
      const snapshot = await db.collection('duels').where('status', 'in', ['waiting', 'active']).limit(500).get();
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
      return res.status(200).json({ success: true, deletedCount: deletedCount, scanned: snapshot.size, more: snapshot.size >= 500 });
    }

    /* ── search (Phase V2, ADR-020) — ecosystem prefix search: users + coachings (server-side, no client fetch-all) ── */
    if (action === 'search' && req.method === 'GET') {
      const q = (req.query.q || '').trim();
      if (q.length < 2) return res.status(200).json({ q: q, users: [], coachings: [] });
      const SENT = String.fromCharCode(0xf8ff); // U+F8FF prefix-range upper bound (ADR-020)
      const end = q + SENT;
      const qLower = q.toLowerCase();
      const endLower = qLower + SENT;
      const usersCol = db.collection('users');
      const coachCol = db.collection('coachings');
      const idPath = admin.firestore.FieldPath.documentId();
      /* Email matches CASE-INSENSITIVELY via the normalized `emailLower` field (ADR-020 + 2026-06-12
         migration). uid / profile.name / coachingId are matched as stored (case-sensitive).
         Field masks (ADR-030): user docs are large (responseTimes ring + dailyHistory map + …) — return
         only the 5 fields each result row shows, not the whole document. */
      const USER_SEL = ['profile.name', 'email', 'coachingId', 'plan', 'accountStatus'];
      const COACH_SEL = ['name', 'status', 'isActive', 'studentCount', 'ownerEmail'];
      const r = await Promise.all([
        usersCol.orderBy('emailLower').startAt(qLower).endAt(endLower).select(...USER_SEL).limit(8).get().catch(function () { return null; }),
        usersCol.orderBy('profile.name').startAt(q).endAt(end).select(...USER_SEL).limit(8).get().catch(function () { return null; }),
        usersCol.orderBy(idPath).startAt(q).endAt(end).select(...USER_SEL).limit(8).get().catch(function () { return null; }),
        usersCol.where('coachingId', '==', q).select(...USER_SEL).limit(8).get().catch(function () { return null; }),
        coachCol.orderBy(idPath).startAt(q).endAt(end).select(...COACH_SEL).limit(8).get().catch(function () { return null; }),
        coachCol.orderBy('name').startAt(q).endAt(end).select(...COACH_SEL).limit(8).get().catch(function () { return null; })
      ]);
      const userMap = {};
      [r[0], r[1], r[2], r[3]].forEach(function (snap) {
        if (!snap) return;
        snap.forEach(function (doc) {
          if (userMap[doc.id]) return;
          const d = doc.data();
          userMap[doc.id] = { uid: doc.id, name: (d.profile && d.profile.name) || d.email || 'Unknown', email: d.email || '', coachingId: d.coachingId || null, plan: d.plan === 'premium' ? 'premium' : 'free', accountStatus: d.accountStatus || 'active' };
        });
      });
      const coachMap = {};
      [r[4], r[5]].forEach(function (snap) {
        if (!snap) return;
        snap.forEach(function (doc) {
          if (coachMap[doc.id]) return;
          const d = doc.data();
          coachMap[doc.id] = { coachingId: doc.id, name: d.name || '', status: d.status || (d.isActive === false ? 'suspended' : 'active'), studentCount: d.studentCount || 0, ownerEmail: d.ownerEmail || null };
        });
      });
      return res.status(200).json({ q: q, users: Object.keys(userMap).map(function (k) { return userMap[k]; }).slice(0, 10), coachings: Object.keys(coachMap).map(function (k) { return coachMap[k]; }).slice(0, 10) });
    }

    /* ── config-get (Phase V2, ADR-021) — emergency control flags ── */
    if (action === 'config-get' && req.method === 'GET') {
      const keys = ['maintenance', 'aiKillSwitch', 'paymentKillSwitch'];
      const out = {};
      await Promise.all(keys.map(async function (k) {
        try { const s = await db.collection('config').doc(k).get(); out[k] = s.exists ? s.data() : { enabled: false }; }
        catch (_) { out[k] = { enabled: false }; }
      }));
      return res.status(200).json({ config: out, generatedAt: new Date().toISOString() });
    }

    /* ── config-set (Phase V2, ADR-021) — toggle an emergency control (audited; Admin SDK write) ── */
    if (action === 'config-set' && req.method === 'POST') {
      const body = req.body || {};
      const key = body.key;
      if (['maintenance', 'aiKillSwitch', 'paymentKillSwitch'].indexOf(key) === -1) {
        return res.status(400).json({ error: { code: 'INVALID_KEY', message: 'Unknown config key.' } });
      }
      const update = { enabled: !!body.enabled, updatedBy: req.adminEmail || req.userId, updatedAt: new Date().toISOString() };
      if (key === 'maintenance' && typeof body.message === 'string') update.message = body.message.slice(0, 300);
      await db.collection('config').doc(key).set(update, { merge: true });
      await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: (update.enabled ? 'enable_' : 'disable_') + key, category: 'system', targetType: 'config', targetId: key, summary: (update.enabled ? 'ENABLED ' : 'disabled ') + key + ' emergency control', after: update });
      return res.status(200).json({ success: true, key: key, config: update });
    }

    /* ── revenue-intel (Phase V2, ADR-019) — trend + expiring plans + premium share ── */
    if (action === 'revenue-intel' && req.method === 'GET') {
      const nowIso = new Date().toISOString();
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString();
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
      const trend = [];
      try {
        const snap = await db.collection('metrics').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(15).get();
        snap.forEach(function (doc) { if (doc.id === 'latest') return; const d = doc.data(); trend.push({ date: doc.id, revenueTotalINR: d.revenueTotalINR || 0, premiumUsers: d.premiumUsers || 0, totalUsers: d.totalUsers || 0 }); });
        trend.reverse();
      } catch (_) { /* non-fatal */ }
      let expiring7 = 0, expiring30 = 0;
      /* Accurate at scale via count() range aggregations (ADR-023) — (plan, planExpiry) index.
         expiring = active premium with planExpiry in (now, now+N]. Degrades to 0 if index absent. */
      try { expiring7 = (await db.collection('users').where('plan', '==', 'premium').where('planExpiry', '>', nowIso).where('planExpiry', '<=', in7).count().get()).data().count; } catch (_) { /* index missing — degrade */ }
      try { expiring30 = (await db.collection('users').where('plan', '==', 'premium').where('planExpiry', '>', nowIso).where('planExpiry', '<=', in30).count().get()).data().count; } catch (_) { /* index missing — degrade */ }
      let totalUsers = 0, premiumUsers = 0, premiumShare = 0, trialUsers = 0;
      try { const latest = await db.collection('metrics').doc('latest').get(); if (latest.exists) { const d = latest.data(); totalUsers = d.totalUsers || 0; premiumUsers = d.premiumUsers || 0; trialUsers = d.trialUsers || 0; premiumShare = totalUsers > 0 ? (premiumUsers / totalUsers) * 100 : 0; } } catch (_) { /* non-fatal */ }
      /* conversionRate = paid-premium share of all users (ADR-022). */
      const conversionRate = Number(premiumShare.toFixed(1));
      /* growth = % change vs the oldest point in the (≤14d) trend window, for revenue + premium base. */
      let growth = { revenuePct: null, premiumPct: null, windowDays: trend.length };
      if (trend.length >= 2) {
        const first = trend[0], last = trend[trend.length - 1];
        if (first.revenueTotalINR > 0) growth.revenuePct = Number((((last.revenueTotalINR - first.revenueTotalINR) / first.revenueTotalINR) * 100).toFixed(1));
        if (first.premiumUsers > 0) growth.premiumPct = Number((((last.premiumUsers - first.premiumUsers) / first.premiumUsers) * 100).toFixed(1));
      }
      /* failedGrants = payment failures in the last 30d (signal that intended grants did not land). */
      let failedGrants = null;
      try {
        const cut30 = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 86400000));
        failedGrants = (await db.collection('securityEvents').where('type', '==', 'payment_failure').where('createdAt', '>=', cut30).count().get()).data().count;
      } catch (_) { /* securityEvents/index may be absent — degrade */ }
      return res.status(200).json({ trend: trend, expiring7d: expiring7, expiring30d: expiring30, premiumShare: conversionRate, conversionRate: conversionRate, trialUsers: trialUsers, growth: growth, failedGrants: failedGrants, totalUsers: totalUsers, premiumUsers: premiumUsers, generatedAt: nowIso });
    }

    /* ── ack-alert (Phase V2, ADR-019) — suppress an alert type for N hours (audited) ── */
    if (action === 'ack-alert' && req.method === 'POST') {
      const body = req.body || {};
      const type = body.type;
      if (!type) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'alert type is required.' } });
      const hours = Math.min(168, Math.max(1, parseInt(body.hours || '24', 10)));
      const until = new Date(Date.now() + hours * 3600000).toISOString();
      const patch = {}; patch[type] = { until: until, by: req.adminEmail || req.userId, at: new Date().toISOString() };
      await db.collection('config').doc('alertAcks').set(patch, { merge: true });
      await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'ack_alert', category: 'system', targetType: 'alert', targetId: type, summary: 'acknowledged alert "' + type + '" for ' + hours + 'h' });
      return res.status(200).json({ success: true, type: type, until: until });
    }

    /* ── revoke-tokens (Settings Center, ADR-025) — "log out everywhere": revoke the CALLING admin's own
       refresh tokens. Existing sessions can no longer mint new ID tokens after their current one (≤1h) expires.
       Scoped to req.userId only (an admin can sign themselves out, not others). Audited. ── */
    if (action === 'revoke-tokens' && req.method === 'POST') {
      try { await admin.auth().revokeRefreshTokens(req.userId); }
      catch (e) { return res.status(500).json({ error: { code: 'REVOKE_FAILED', message: 'Could not revoke sessions: ' + (e && e.message ? e.message : 'error') } }); }
      await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'revoke_own_sessions', category: 'system', targetType: 'admin', targetId: req.userId, summary: 'admin revoked all of their own sessions (logout-all-devices)' });
      return res.status(200).json({ success: true, revokedAt: new Date().toISOString() });
    }

    return res.status(404).json({ error: 'System action not found' });
  } catch (err) {
    console.error('System Route Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
