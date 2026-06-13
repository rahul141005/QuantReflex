/**
 * AI domain API (ADR-017) — consolidates the former ai-usage + ai-budget endpoints.
 *   GET  ?action=usage   → per-user AI analytics + abuse flags + flaggedCount
 *   GET  ?action=budget  → budget config + month-to-date spend + used%/projected/remaining/status
 *   POST ?action=budget  → update budget config { monthlyBudgetUSD, warnPct, critPct } (audit-logged)
 * Budget is ADVISORY (alerting), not request-blocking. (ADR-015.)
 */
const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

const BUDGET_DEFAULTS = { monthlyBudgetUSD: 25, warnPct: 80, critPct: 90 };

async function _monthToDate(db, now) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const prefix = 'ai_daily_' + yyyy + '-' + mm + '-';
  const snap = await db.collection('systemMetrics')
    .where(admin.firestore.FieldPath.documentId(), '>=', prefix + '01')
    .where(admin.firestore.FieldPath.documentId(), '<=', prefix + '31')
    .get();
  let cost = 0, tokensIn = 0, tokensOut = 0, calls = 0;
  snap.forEach(function (d) {
    const x = d.data();
    cost += (x.estimatedCostUSD || 0);
    tokensIn += (x.totalTokensInput || 0);
    tokensOut += (x.totalTokensOutput || 0);
    calls += (x.gptCalls || 0);
  });
  return { cost: cost, tokensIn: tokensIn, tokensOut: tokensOut, calls: calls };
}

/* ── ?action=usage (GET) ── */
async function _usage(db, res) {
  /* ADR-023: cap the two full-collection scans so this endpoint degrades (truncates) instead of
     OOM (512 MB) / timeout (15 s) at scale. The durable fix is per-user/per-coaching AI-cost
     pre-aggregation into the daily snapshot (tracked in ROADMAP). */
  const AI_USAGE_CAP = 5000;
  const systemMetrics = {};
  /* ADR-030 perf: the three scans are independent — fire them in PARALLEL (was three sequential awaits).
     The users scan is field-masked to the 4 fields this view shows (drops the responseTimes ring,
     dailyHistory map, settings, etc. from every user doc). */
  const [metricsSnapshot, usageQuery, usersSnapshot] = await Promise.all([
    db.collection('systemMetrics').where(admin.firestore.FieldPath.documentId(), '>=', 'ai_daily_').get(),
    db.collectionGroup('usage').where(admin.firestore.FieldPath.documentId(), '==', 'ai').limit(AI_USAGE_CAP).get(),
    db.collection('users').select('profile.name', 'email', 'coachingId', 'plan').limit(AI_USAGE_CAP).get()
  ]);
  metricsSnapshot.forEach(function (doc) { systemMetrics[doc.id] = doc.data(); });

  const analytics = [];
  const userIds = [];
  const usageDataMap = {};
  usageQuery.forEach(function (doc) {
    const userId = doc.ref.parent.parent.id;
    userIds.push(userId);
    usageDataMap[userId] = doc.data();
  });

  const usersMap = {};
  usersSnapshot.forEach(function (doc) { usersMap[doc.id] = doc.data(); });

  userIds.forEach(function (uid) {
    const user = usersMap[uid];
    if (!user) return;
    const usage = usageDataMap[uid];
    const wp = usage.wordProblemsUsedLifetime || 0;
    const exp = usage.explanationsUsed || 0;

    const realTokens = (usage.gptTokensInput || 0) + (usage.gptTokensOutput || 0);
    const realCost = usage.gptCostUSD || 0;
    let totalTokens, estCost;
    if (realTokens > 0 || realCost > 0) { totalTokens = realTokens; estCost = realCost; }
    else { totalTokens = wp * 1400 + exp * 700; estCost = totalTokens * (0.375 / 1000000); }

    const wpToday = usage.wordProblemsUsedToday || 0;
    const gptCalls = usage.gptCalls || 0;
    const abuseFlags = [];
    if (wpToday >= 25) abuseFlags.push('high-daily-usage');
    if (gptCalls > 300) abuseFlags.push('heavy-gpt-user');
    if (Number(estCost) > 1.0) abuseFlags.push('high-cost');
    if (user.plan !== 'premium' && wp > 5) abuseFlags.push('over-free-cap');

    analytics.push({
      uid: uid,
      displayName: (user.profile && user.profile.name) || user.email || 'Unknown',
      email: user.email || 'N/A',
      coachingId: user.coachingId || 'Independent',
      isPremium: user.plan === 'premium',
      totalWP: wp,
      totalExp: exp,
      totalCalls: wp + exp,
      wordProblemsToday: wpToday,
      gptCalls: gptCalls,
      totalEstimatedTokens: totalTokens,
      totalEstimatedCost: Number(estCost).toFixed(6),
      abuseFlags: abuseFlags
    });
  });

  const flaggedCount = analytics.filter(function (a) { return a.abuseFlags && a.abuseFlags.length; }).length;
  const truncated = usageQuery.size >= AI_USAGE_CAP || usersSnapshot.size >= AI_USAGE_CAP;
  return res.status(200).json({ analytics: analytics, systemMetrics: systemMetrics, flaggedCount: flaggedCount, truncated: truncated });
}

/* ── ?action=budget (GET) ── */
async function _budgetGet(db, res) {
  const cfgSnap = await db.collection('config').doc('aiBudget').get();
  const cfg = Object.assign({}, BUDGET_DEFAULTS, cfgSnap.exists ? cfgSnap.data() : {});
  const now = new Date();
  const mtd = await _monthToDate(db, now);
  const budget = cfg.monthlyBudgetUSD || 0;
  const usedPct = budget > 0 ? (mtd.cost / budget) * 100 : 0;
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = dayOfMonth > 0 ? (mtd.cost / dayOfMonth) * daysInMonth : mtd.cost;
  const remaining = Math.max(0, budget - mtd.cost);
  let status = 'ok';
  if (usedPct >= 100) status = 'over';
  else if (usedPct >= cfg.critPct) status = 'critical';
  else if (usedPct >= cfg.warnPct) status = 'warning';

  return res.status(200).json({
    config: { monthlyBudgetUSD: budget, warnPct: cfg.warnPct, critPct: cfg.critPct, updatedAt: cfg.updatedAt || null, updatedBy: cfg.updatedBy || null },
    monthToDate: { costUSD: Number(mtd.cost.toFixed(4)), tokensInput: mtd.tokensIn, tokensOutput: mtd.tokensOut, gptCalls: mtd.calls },
    usedPct: Number(usedPct.toFixed(1)),
    projectedMonthlyUSD: Number(projected.toFixed(4)),
    remainingUSD: Number(remaining.toFixed(4)),
    status: status,
    daysElapsed: dayOfMonth,
    daysInMonth: daysInMonth
  });
}

/* ── ?action=budget (POST) ── */
async function _budgetPost(req, res, db) {
  const body = parseBody(req);
  const update = {};
  if (body.monthlyBudgetUSD != null) update.monthlyBudgetUSD = Math.max(0, Number(body.monthlyBudgetUSD) || 0);
  if (body.warnPct != null) update.warnPct = Math.min(100, Math.max(1, parseInt(body.warnPct, 10) || BUDGET_DEFAULTS.warnPct));
  if (body.critPct != null) update.critPct = Math.min(100, Math.max(1, parseInt(body.critPct, 10) || BUDGET_DEFAULTS.critPct));
  update.updatedAt = new Date().toISOString();
  update.updatedBy = req.adminEmail || req.userId;
  await db.collection('config').doc('aiBudget').set(update, { merge: true });
  await writeAuditLog(db, {
    actorUid: req.userId, actorEmail: req.adminEmail,
    action: 'set_ai_budget', category: 'system', targetType: 'config', targetId: 'aiBudget',
    summary: 'updated AI budget (cap $' + (update.monthlyBudgetUSD != null ? update.monthlyBudgetUSD : '—') + '/mo)', after: update
  });
  return res.status(200).json({ success: true, config: update });
}

async function handler(req, res) {
  const db = admin.firestore();
  const action = req.query.action || 'usage';
  try {
    if (action === 'usage' && req.method === 'GET') return _usage(db, res);
    if (action === 'budget' && req.method === 'GET') return _budgetGet(db, res);
    if (action === 'budget' && req.method === 'POST') return _budgetPost(req, res, db);
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown AI action: ' + action } });
  } catch (err) {
    console.error('Error in ai:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
