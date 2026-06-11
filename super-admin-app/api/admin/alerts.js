/**
 * Alert Center (ADR-016) — a single feed of actionable alerts computed from existing data.
 *   GET → { alerts: [{ severity, type, message }], generatedAt }
 *
 * Covers: AI budget (warning/critical/over), expired-premium count, stale duel rooms,
 * archived-past-hold pending purges. (Payment-failure / Firestore-growth alerts are deferred —
 * they need new instrumentation; see ROADMAP.)
 */
const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

const BUDGET_DEFAULTS = { monthlyBudgetUSD: 25, warnPct: 80, critPct: 90 };

async function handler(req, res) {
  if (methodGuard(req, res, 'GET')) return;
  const db = admin.firestore();
  const alerts = [];
  const nowIso = new Date().toISOString();

  try {
    /* 1. AI budget. */
    const cfgSnap = await db.collection('config').doc('aiBudget').get();
    const cfg = Object.assign({}, BUDGET_DEFAULTS, cfgSnap.exists ? cfgSnap.data() : {});
    const now = new Date();
    const prefix = 'ai_daily_' + now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0') + '-';
    const mtdSnap = await db.collection('systemMetrics')
      .where(admin.firestore.FieldPath.documentId(), '>=', prefix + '01')
      .where(admin.firestore.FieldPath.documentId(), '<=', prefix + '31')
      .get();
    let mtd = 0;
    mtdSnap.forEach(function (d) { mtd += (d.data().estimatedCostUSD || 0); });
    const budget = cfg.monthlyBudgetUSD || 0;
    const usedPct = budget > 0 ? (mtd / budget) * 100 : 0;
    if (usedPct >= 100) alerts.push({ severity: 'critical', type: 'ai_budget', message: 'AI budget EXCEEDED — $' + mtd.toFixed(2) + ' of $' + budget + ' (' + usedPct.toFixed(0) + '%).' });
    else if (usedPct >= cfg.critPct) alerts.push({ severity: 'critical', type: 'ai_budget', message: 'AI spend at ' + usedPct.toFixed(0) + '% of budget (critical ' + cfg.critPct + '%).' });
    else if (usedPct >= cfg.warnPct) alerts.push({ severity: 'warning', type: 'ai_budget', message: 'AI spend at ' + usedPct.toFixed(0) + '% of budget (warning ' + cfg.warnPct + '%).' });

    /* 2. Expired premium (bounded scan). */
    const premSnap = await db.collection('users').where('plan', '==', 'premium').limit(1000).get();
    let expired = 0;
    premSnap.forEach(function (d) { const e = d.data().planExpiry; if (e && typeof e === 'string' && e < nowIso) expired++; });
    if (expired > 0) alerts.push({ severity: 'warning', type: 'expired_premium', message: expired + ' user(s) show premium but have an expired timestamp — run the entitlement sweep.' });

    /* 3. Stale duel rooms. */
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const duelSnap = await db.collection('duels').where('status', 'in', ['waiting', 'active']).where('createdAt', '<', thirtyMinAgo).limit(200).get();
    if (!duelSnap.empty) alerts.push({ severity: 'info', type: 'orphan_duels', message: duelSnap.size + '+ stale duel room(s) — run duel cleanup.' });

    /* 4. Archived accounts past their hold (pending purge). */
    const purgeSnap = await db.collection('users').where('accountStatus', '==', 'archived').where('purgeAfter', '<', nowIso).limit(200).get();
    if (!purgeSnap.empty) alerts.push({ severity: 'info', type: 'pending_purge', message: purgeSnap.size + '+ archived account(s) past their hold — the cleanup-sweep cron will purge them.' });

    return res.status(200).json({ alerts: alerts, generatedAt: nowIso });
  } catch (err) {
    console.error('Error in alerts:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
