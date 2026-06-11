/**
 * AI Operations Center — GPT spend budget (ADR-015).
 *
 *   GET  → config + month-to-date spend (summed from systemMetrics/ai_daily_*) + used% +
 *          linear projected monthly spend + remaining + status (ok|warning|critical|over).
 *   POST → update config { monthlyBudgetUSD, warnPct, critPct } (audit-logged).
 *
 * Budget is ADVISORY (alerting/observability) — it does NOT block AI requests.
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

const DEFAULTS = { monthlyBudgetUSD: 25, warnPct: 80, critPct: 90 };

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

async function handler(req, res) {
  const db = admin.firestore();
  const cfgRef = db.collection('config').doc('aiBudget');

  try {
    if (req.method === 'POST') {
      const body = parseBody(req);
      const update = {};
      if (body.monthlyBudgetUSD != null) update.monthlyBudgetUSD = Math.max(0, Number(body.monthlyBudgetUSD) || 0);
      if (body.warnPct != null) update.warnPct = Math.min(100, Math.max(1, parseInt(body.warnPct, 10) || DEFAULTS.warnPct));
      if (body.critPct != null) update.critPct = Math.min(100, Math.max(1, parseInt(body.critPct, 10) || DEFAULTS.critPct));
      update.updatedAt = new Date().toISOString();
      update.updatedBy = req.adminEmail || req.userId;
      await cfgRef.set(update, { merge: true });
      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'set_ai_budget', category: 'system', targetType: 'config', targetId: 'aiBudget',
        summary: 'updated AI budget (cap $' + (update.monthlyBudgetUSD != null ? update.monthlyBudgetUSD : '—') + '/mo)', after: update
      });
      return res.status(200).json({ success: true, config: update });
    }

    /* GET — config + spend snapshot. */
    const cfgSnap = await cfgRef.get();
    const cfg = Object.assign({}, DEFAULTS, cfgSnap.exists ? cfgSnap.data() : {});
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
  } catch (err) {
    console.error('Error in ai-budget:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
