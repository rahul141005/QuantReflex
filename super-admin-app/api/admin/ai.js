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

    // Tokens + cost come straight from tracked telemetry (recordAiRequest). No second pricing constant here —
    // main-app/services/aiPricing.js is the single source of truth (removed the old 0.375/1M fallback). Legacy
    // users predating cost tracking show 0 tracked cost.
    const realTokens = (usage.gptTokensInput || 0) + (usage.gptTokensOutput || 0);
    const realCost = usage.gptCostUSD || 0;
    const totalTokens = realTokens;
    const estCost = realCost;

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

/* ── helpers for the Command Center rollup reads ── */
function _dayKey(d) { return d.toISOString().split('T')[0]; }
function _addAgg(into, src) {                   // sum a nested { [key]: {numeric...} } map into an accumulator
  if (!src) return;
  Object.keys(src).forEach(function (k) {
    var s = src[k] || {}; var t = into[k] || (into[k] = {});
    Object.keys(s).forEach(function (f) { if (typeof s[f] === 'number') t[f] = (t[f] || 0) + s[f]; });
  });
}
/** Read every ai_daily_{date} rollup doc (bounded by #days the system has run) into a date→data map. */
async function _readDailies(db) {
  const snap = await db.collection('systemMetrics')
    .where(admin.firestore.FieldPath.documentId(), '>=', 'ai_daily_')
    .where(admin.firestore.FieldPath.documentId(), '<', 'ai_daily_')
    .get();
  const byDate = {};
  snap.forEach(function (doc) { byDate[doc.id.slice('ai_daily_'.length)] = doc.data(); });
  return byDate;
}

/* ── ?action=command (GET) — the AI Command Center overview, built ONLY from small ai_daily rollup docs (no
   collection scans). Returns KPIs + range trend + by-feature/by-model breakdowns + a documented health score. ── */
async function _command(db, res, query) {
  const days = Math.min(90, Math.max(1, parseInt(query.days || '30', 10)));
  const byDate = await _readDailies(db);
  const now = new Date();
  const todayKey = _dayKey(now);
  const yesterdayKey = _dayKey(new Date(now.getTime() - 86400000));

  // Lifetime totals + per-day series (range) + by-feature/by-model sums (range).
  let lifetimeCost = 0, lifetimeRequests = 0;
  const series = [];                       // [{date, cost, requests, errors, cacheHits, latAvg}]
  const range = { cost: 0, requests: 0, gptCalls: 0, errors: 0, cacheHits: 0, inTok: 0, outTok: 0, latSumMs: 0, latCount: 0 };
  const byFeature = {}, byModel = {};
  let cost7 = 0, cost30 = 0, costToday = 0, costYesterday = 0, oldestAge = 0;

  const rangeStart = new Date(now.getTime() - (days - 1) * 86400000);
  Object.keys(byDate).forEach(function (date) {
    const d = byDate[date] || {};
    const cost = Number(d.estimatedCostUSD || 0);
    lifetimeCost += cost; lifetimeRequests += Number(d.requests || d.gptCalls || 0);
    const dt = new Date(date + 'T00:00:00Z');
    const ageDays = Math.floor((now.getTime() - dt.getTime()) / 86400000);
    if (ageDays >= 0 && ageDays > oldestAge) oldestAge = ageDays;   // for an honest early-life burn-rate divisor
    if (ageDays >= 0 && ageDays < 7) cost7 += cost;
    if (ageDays >= 0 && ageDays < 30) cost30 += cost;
    if (date === todayKey) costToday = cost;
    if (date === yesterdayKey) costYesterday = cost;
    if (dt >= new Date(_dayKey(rangeStart) + 'T00:00:00Z')) {
      range.cost += cost; range.requests += Number(d.requests || 0); range.gptCalls += Number(d.gptCalls || 0);
      range.errors += Number(d.errors || 0); range.cacheHits += Number(d.cacheHits || 0);
      range.inTok += Number(d.totalTokensInput || 0); range.outTok += Number(d.totalTokensOutput || 0);
      range.latSumMs += Number(d.latSumMs || 0); range.latCount += Number(d.latCount || 0);
      _addAgg(byFeature, d.byFeature); _addAgg(byModel, d.byModel);
      series.push({ date: date, cost: cost, requests: Number(d.requests || 0), errors: Number(d.errors || 0), cacheHits: Number(d.cacheHits || 0), latAvg: d.latCount ? Math.round(d.latSumMs / d.latCount) : 0 });
    }
  });
  series.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  // Rates (range). successRate over billable calls; cacheHitRate over all requests.
  const reqs = range.requests || 0;
  const errorRate = range.gptCalls > 0 ? (range.errors / range.gptCalls) * 100 : 0;
  const successRate = 100 - errorRate;
  const cacheHitRate = reqs > 0 ? (range.cacheHits / reqs) * 100 : 0;
  const avgLatencyMs = range.latCount > 0 ? Math.round(range.latSumMs / range.latCount) : 0;
  const avgCostPerReq = range.gptCalls > 0 ? range.cost / range.gptCalls : 0;
  // Burn rate = avg $/day over the trailing 7 days, divided by how many days the system has actually been
  // collecting (capped at 7) — so a 2-day-old system isn't understated by dividing a 2-day total by 7.
  const days7 = Math.max(1, Math.min(7, oldestAge + 1));
  const avgCostPerDay = cost7 / days7;
  const projectedMonthly = avgCostPerDay * 30;

  // Budget + credits context.
  const cfgSnap = await db.collection('config').doc('aiBudget').get();
  const cfg = Object.assign({}, BUDGET_DEFAULTS, cfgSnap.exists ? cfgSnap.data() : {});
  const mtd = await _monthToDate(db, now);
  // Credits, computed from the dailies ALREADY read here (so the dashboard needs ONE full ai_daily read, not two).
  const creditSnap = await db.collection('config').doc('aiCredits').get();
  const credit = creditSnap.exists ? creditSnap.data() : {};
  const startingBal = Number(credit.startingBalanceUSD || 0);
  let spentSince = 0;
  if (credit.setAt) { const setDay = String(credit.setAt).split('T')[0]; Object.keys(byDate).forEach(function (date) { if (date >= setDay) spentSince += Number(byDate[date].estimatedCostUSD || 0); }); }

  // Most-expensive feature / most-used model (range).
  let topFeature = null, topModel = null;
  Object.keys(byFeature).forEach(function (f) { if (!topFeature || (byFeature[f].costUSD || 0) > (byFeature[topFeature].costUSD || 0)) topFeature = f; });
  Object.keys(byModel).forEach(function (m) { if (!topModel || (byModel[m].requests || 0) > (byModel[topModel].requests || 0)) topModel = m; });

  // Health score (0–100, documented): success 40, latency 25 (<2s ideal, >8s = 0), cache 15, budget headroom 20.
  const latScore = avgLatencyMs <= 2000 ? 1 : avgLatencyMs >= 8000 ? 0 : (8000 - avgLatencyMs) / 6000;
  const budgetPct = cfg.monthlyBudgetUSD > 0 ? Math.min(1, mtd.cost / cfg.monthlyBudgetUSD) : 0;
  // No activity in the window → don't score (a zero-data system must not look "85/100 healthy"). null → view shows "—".
  const health = reqs > 0 ? Math.round((successRate / 100) * 40 + latScore * 25 + (cacheHitRate / 100) * 15 + (1 - budgetPct) * 20) : null;

  return res.status(200).json({
    days: days,
    kpis: {
      costToday: +costToday.toFixed(4), costYesterday: +costYesterday.toFixed(4),
      cost7d: +cost7.toFixed(4), cost30d: +cost30.toFixed(4), lifetimeCost: +lifetimeCost.toFixed(4),
      projectedMonthlyUSD: +projectedMonthly.toFixed(2), burnRatePerDayUSD: +avgCostPerDay.toFixed(4),
      avgCostPerRequestUSD: +avgCostPerReq.toFixed(6), avgLatencyMs: avgLatencyMs,
      totalRequests: reqs, billableCalls: range.gptCalls, errors: range.errors, cacheHits: range.cacheHits,
      inputTokens: range.inTok, outputTokens: range.outTok, totalTokens: range.inTok + range.outTok,
      successRate: +successRate.toFixed(1), errorRate: +errorRate.toFixed(1), cacheHitRate: +cacheHitRate.toFixed(1),
      lifetimeRequests: lifetimeRequests, topFeature: topFeature, topModel: topModel, healthScore: health
    },
    byFeature: byFeature, byModel: byModel, series: series,
    budget: { monthlyBudgetUSD: cfg.monthlyBudgetUSD || 0, mtdCostUSD: +mtd.cost.toFixed(4), warnPct: cfg.warnPct, critPct: cfg.critPct },
    credits: {
      startingBalanceUSD: startingBal, setAt: credit.setAt || null, setBy: credit.setBy || null,
      spentSinceUSD: +spentSince.toFixed(4), estimatedRemainingUSD: +(startingBal - spentSince).toFixed(4),
      note: 'Estimate: OpenAI exposes no credit-balance API. Remaining = Starting Balance − tracked spend since it was set.',
      billingUrl: 'https://platform.openai.com/usage'
    }
  });
}

/* ── ?action=credits (GET/POST) — manual Starting Balance; estimated remaining = balance − spend since it was set.
   OpenAI has no prepaid-credit API, so this is an explicit, clearly-labelled estimate (never a fabricated balance). ── */
async function _creditsGet(db, res) {
  const snap = await db.collection('config').doc('aiCredits').get();
  const c = snap.exists ? snap.data() : {};
  const starting = Number(c.startingBalanceUSD || 0);
  const setAt = c.setAt || null;
  let spentSince = 0;
  if (setAt) {
    const setDay = String(setAt).split('T')[0];
    const byDate = await _readDailies(db);
    Object.keys(byDate).forEach(function (date) { if (date >= setDay) spentSince += Number(byDate[date].estimatedCostUSD || 0); });
  }
  return res.status(200).json({
    startingBalanceUSD: starting, setAt: setAt, setBy: c.setBy || null,
    spentSinceUSD: +spentSince.toFixed(4),
    estimatedRemainingUSD: +(starting - spentSince).toFixed(4),
    note: 'Estimate: OpenAI exposes no credit-balance API. Remaining = Starting Balance − tracked spend since it was set. Verify on the OpenAI billing page.',
    billingUrl: 'https://platform.openai.com/usage'
  });
}
async function _creditsPost(req, res, db) {
  const body = parseBody(req);
  const starting = Math.max(0, Number(body.startingBalanceUSD) || 0);
  const update = { startingBalanceUSD: starting, setAt: new Date().toISOString(), setBy: req.adminEmail || req.userId };
  await db.collection('config').doc('aiCredits').set(update, { merge: true });
  await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'set_ai_credits', category: 'system', targetType: 'config', targetId: 'aiCredits', summary: 'set AI starting balance $' + starting, after: update });
  return res.status(200).json({ success: true, config: update });
}

/* ── ?action=openai-usage (GET) — reconcile against OpenAI's OFFICIAL Costs API when an org admin key is set.
   Requires OPENAI_ADMIN_KEY (an org admin key, distinct from the project OPENAI_API_KEY). Without it → not
   configured (the dashboard then shows tracked estimates only). Never fabricates. ── */
async function _openaiUsage(db, res, query) {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) return res.status(200).json({ configured: false, reason: 'OPENAI_ADMIN_KEY not set', billingUrl: 'https://platform.openai.com/usage' });
  const days = Math.min(90, Math.max(1, parseInt(query.days || '30', 10)));
  const startTime = Math.floor((Date.now() - days * 86400000) / 1000);
  const baseUrl = 'https://api.openai.com/v1/organization/costs?start_time=' + startTime + '&bucket_width=1d&limit=180';
  // Each request is time-boxed (AbortController ~6s) so a slow OpenAI call can't hang toward Vercel's 15s limit;
  // follow next_page so multi-page cost histories aren't silently truncated/undercounted.
  function _fetchPage(url) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 6000);
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + adminKey }, signal: ctrl.signal })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; }); })
      .finally(function () { clearTimeout(t); });
  }
  try {
    const buckets = [];
    let url = baseUrl, pages = 0;
    while (url && pages < 12) {                 // hard cap: ≤12 pages (defensive against a runaway cursor)
      const page = await _fetchPage(url);
      if (!page.ok) return res.status(200).json({ configured: true, ok: false, error: (page.json.error && page.json.error.message) || ('HTTP ' + page.status), billingUrl: 'https://platform.openai.com/usage' });
      (page.json.data || []).forEach(function (b) {
        let amt = 0; (b.results || []).forEach(function (r) { amt += (r.amount && r.amount.value) || 0; });
        buckets.push({ startTime: b.start_time, amountUSD: +amt.toFixed(4) });
      });
      pages++;
      url = page.json.has_more && page.json.next_page ? (baseUrl + '&page=' + encodeURIComponent(page.json.next_page)) : null;
    }
    const totalUSD = buckets.reduce(function (s, b) { return s + b.amountUSD; }, 0);
    return res.status(200).json({ configured: true, ok: true, days: days, totalUSD: +totalUSD.toFixed(4), buckets: buckets, truncated: pages >= 12, billingUrl: 'https://platform.openai.com/usage' });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'OpenAI usage request timed out' : err.message;
    return res.status(200).json({ configured: true, ok: false, error: msg, billingUrl: 'https://platform.openai.com/usage' });
  }
}

async function handler(req, res) {
  const db = admin.firestore();
  const action = req.query.action || 'usage';
  try {
    if (action === 'usage' && req.method === 'GET') return _usage(db, res);
    if (action === 'budget' && req.method === 'GET') return _budgetGet(db, res);
    if (action === 'budget' && req.method === 'POST') return _budgetPost(req, res, db);
    if (action === 'command' && req.method === 'GET') return _command(db, res, req.query);
    if (action === 'credits' && req.method === 'GET') return _creditsGet(db, res);
    if (action === 'credits' && req.method === 'POST') return _creditsPost(req, res, db);
    if (action === 'openai-usage' && req.method === 'GET') return _openaiUsage(db, res, req.query);
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown AI action: ' + action } });
  } catch (err) {
    console.error('Error in ai:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
