/**
 * Shared daily-snapshot computor for the Super Admin Control Center (ADR-013).
 *
 * Scales to 1M+ users: user figures use Firestore count() AGGREGATION queries
 * (server-side counters, not document reads). AI token/cost is already
 * pre-aggregated at write time (aiService.trackGptCost → systemMetrics/ai_daily_*),
 * so it is a single doc read. Only `payments` is scanned for revenue (one doc per lifetime
 * sale; see ROADMAP for a day-bucketed incremental counter before payment volume grows large).
 *
 * Returns the payload WITHOUT writing — callers (the Vercel-Cron daily-snapshot and the
 * manual `aggregate-metrics` admin action) persist it to metrics/{date} + metrics/latest.
 */
const admin = require('firebase-admin');

const PREMIUM_PRICE_PAISE = { premium_6m: 29900, premium_12m: 49900 };

/**
 * Count docs whose MIXED-type timestamp field (`updatedAt`/`createdAt` can be a Firestore
 * Timestamp OR an ISO string across the codebase — drift M9) is >= `since`. Firestore range
 * filters never cross value-type boundaries, so a single Timestamp (or string) bound silently
 * drops the other type. We run BOTH bounds and SUM: each doc's field is exactly one type, so
 * the two count() queries are disjoint and the sum is exact.
 */
async function _countSince(col, field, since) {
  const [tsSnap, isoSnap] = await Promise.all([
    col.where(field, '>=', admin.firestore.Timestamp.fromDate(since)).count().get(),
    col.where(field, '>=', since.toISOString()).count().get()
  ]);
  return tsSnap.data().count + isoSnap.data().count;
}

async function computeDailySnapshot(db) {
  const now = Date.now();
  const dayKey = new Date().toISOString().split('T')[0];
  const startOfDayUTC = new Date(dayKey + 'T00:00:00.000Z');
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const usersCol = db.collection('users');

  /* User counts — count() aggregation (server-side; not document reads). Single-type fields
     (plan, isTrial) use one query; mixed-type timestamp fields (updatedAt, createdAt) use the
     disjoint-union helper so neither Timestamp- nor string-typed docs are silently dropped. */
  const [totalSnap, premiumSnap, trialSnap, dau, mau, newToday] = await Promise.all([
    usersCol.count().get(),
    usersCol.where('plan', '==', 'premium').count().get(),
    usersCol.where('isTrial', '==', true).count().get(),
    _countSince(usersCol, 'updatedAt', oneDayAgo),
    _countSince(usersCol, 'updatedAt', thirtyDaysAgo),
    _countSince(usersCol, 'createdAt', startOfDayUTC)
  ]);
  const totalUsers = totalSnap.data().count;
  const premiumTotal = premiumSnap.data().count;
  const trialUsers = trialSnap.data().count;
  const premiumUsers = Math.max(0, premiumTotal - trialUsers);
  const freeUsers = Math.max(0, totalUsers - premiumTotal);

  /* Revenue — full scan of payments (one doc per lifetime sale; sum `amount`, fall back to
     plan→price for historical docs). Recomputed each run; ROADMAP tracks an incremental
     counter before payment volume grows large. */
  let revenueTotalPaise = 0, revenueTodayPaise = 0, revenue6mCount = 0, revenue12mCount = 0;
  /* Safety cap (ADR-023): the daily cron must never be sunk by an enormous payments collection.
     50k lifetime sales is far beyond Spark/Hobby scale; the durable fix is a day-bucketed incremental
     revenue counter (ROADMAP). If the cap is hit, revenueTotal under-reports → `revenueTruncated`. */
  const PAYMENTS_CAP = 50000;
  const paymentsSnap = await db.collection('payments').limit(PAYMENTS_CAP).get();
  const revenueTruncated = paymentsSnap.size >= PAYMENTS_CAP;
  paymentsSnap.forEach(function (doc) {
    const p = doc.data();
    const amt = (typeof p.amount === 'number' && p.amount > 0) ? p.amount : (PREMIUM_PRICE_PAISE[p.plan] || 0);
    revenueTotalPaise += amt;
    if (p.plan === 'premium_12m') revenue12mCount++;
    else if (p.plan === 'premium_6m') revenue6mCount++;
    const claimedMs = p.claimedAt ? (Date.parse(p.claimedAt) || 0) : 0;
    if (claimedMs >= startOfDayUTC.getTime()) revenueTodayPaise += amt;
  });

  /* AI cost — already pre-aggregated for today (single doc read). */
  const aiSnap = await db.collection('systemMetrics').doc('ai_daily_' + dayKey).get();
  const ai = aiSnap.exists ? aiSnap.data() : {};

  /* Per-collection sizes for the Firestore-Ops growth series (Phase 5, ADR-018).
     count() aggregation — server-side, not document reads. Each wrapped so a missing
     or denied collection yields null instead of failing the whole snapshot. */
  const opsCols = ['users', 'questions', 'duels', 'payments', 'coachings', 'auditLogs', 'securityEvents'];
  const collectionCounts = {};
  await Promise.all(opsCols.map(async function (c) {
    try { collectionCounts[c] = (await db.collection(c).count().get()).data().count; }
    catch (_) { collectionCounts[c] = null; }
  }));

  return {
    date: dayKey,
    totalUsers: totalUsers,
    premiumUsers: premiumUsers,
    trialUsers: trialUsers,
    freeUsers: freeUsers,
    dau: dau,
    mau: mau,
    newToday: newToday,
    revenueTotalINR: Math.round(revenueTotalPaise / 100),
    revenueTodayINR: Math.round(revenueTodayPaise / 100),
    revenueTruncated: revenueTruncated,
    revenue6mCount: revenue6mCount,
    revenue12mCount: revenue12mCount,
    totalTokensInput: ai.totalTokensInput || 0,
    totalTokensOutput: ai.totalTokensOutput || 0,
    estimatedCostUSD: Number(ai.estimatedCostUSD || 0),
    gptCalls: ai.gptCalls || 0,
    collectionCounts: collectionCounts,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

module.exports = { computeDailySnapshot, PREMIUM_PRICE_PAISE };
