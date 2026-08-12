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
/* ADR-149: THE entitlement rule (generated mirror — scripts/sync-entitlement-core.js). A raw
   `plan === 'premium'` counts users whose term has already lapsed, because the document keeps
   `plan:'premium'` until the server next self-heals it. */
const entitlement = require('./entitlement-core');

/* The payment statuses that represent money that ACTUALLY MOVED (ADR-149). A reserved Play row is
   `status:'pending'` with no `amount`, so without this gate the historical fallback below priced an
   uncaptured purchase at a retired launch price and wrote it into the append-only daily snapshot.
   `refunded` / `partially_refunded` ARE counted here: they were real sales, and the refund is
   subtracted separately below so gross and net both stay truthful. So is `revoked` — an admin
   withdrawing an entitlement does NOT return the money, so the sale is still revenue; that is
   precisely why it is a distinct status from `refunded`. */
const CAPTURED_STATUS = { paid: true, refunded: true, partially_refunded: true, revoked: true };

/* HISTORICAL fallback only — used exclusively for legacy payments docs written before the `amount`
   field existed (pre 2026-06-11), which were all sold at the launch prices below. Every modern doc
   carries its own `amount`, so this map must NOT track live price changes (₹299/₹399 since Phase 4)
   or historical revenue would be misreported. Deliberately exempt from payment-parity.check.js.
   It is now reached ONLY by a captured row, per CAPTURED_STATUS above. */
const PREMIUM_PRICE_PAISE = { premium_6m: 34900, premium_12m: 49900 };

/* Normalize any stored timestamp (Firestore Timestamp | ISO/locale string | number | {_seconds}) to ms. */
function _toMs(v) {
  if (v == null) return 0;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (_) { return 0; } }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
  if (typeof v === 'object' && v._seconds != null) return v._seconds * 1000;
  return 0;
}

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
  /* ADR-143 — GROSS, REFUNDED and NET are computed in this one pass. Definitions (also stated in
     PAYMENT_ARCHITECTURE.md §11, so reporting cannot silently drift from the business rule again):

       GROSS    every captured payment, whatever happened to it afterwards. Never decreases.
       REFUNDED money given back. A FULL refund subtracts the whole `amount`; a PARTIAL refund
                subtracts only `amountRefunded`, because the rest of that sale is still real revenue.
       NET      gross − refunded. This is realised revenue and the headline figure.

     `revenueTotalINR` deliberately KEEPS its original gross meaning. The daily snapshots form a
     historical series, and redefining an existing field would silently rewrite what every past row
     meant — a chart that changed shape retroactively is worse than one extra column. New readers use
     the explicit `revenueGrossINR` / `revenueRefundedINR` / `revenueNetINR`.

     Tombstones (`tombstone:true`) are refunds that arrived before their capture, so no money was ever
     recognised for them: excluded from gross entirely rather than counted and then subtracted. */
  let revenueTotalPaise = 0, revenueTodayPaise = 0, revenue6mCount = 0, revenue12mCount = 0;
  let revenueRefundedPaise = 0, revenueRefundedTodayPaise = 0, refundedCount = 0, partialRefundCount = 0;
  /* Safety cap (ADR-023): the daily cron must never be sunk by an enormous payments collection.
     50k lifetime sales is far beyond Spark/Hobby scale; the durable fix is a day-bucketed incremental
     revenue counter (ROADMAP). If the cap is hit, revenueTotal under-reports → `revenueTruncated`. */
  const PAYMENTS_CAP = 50000;
  const paymentsSnap = await db.collection('payments').limit(PAYMENTS_CAP).get();
  const revenueTruncated = paymentsSnap.size >= PAYMENTS_CAP;
  paymentsSnap.forEach(function (doc) {
    const p = doc.data();
    /* A refund-before-capture tombstone is not a sale — it never contributed revenue to undo. */
    if (p.tombstone === true) return;
    /* ADR-149: nor is a RESERVED row. `_reservePendingPlayRow` writes `status:'pending'` with a
       `plan` but deliberately NO `amount`, because nothing has been captured — so the historical
       fallback below valued a purchase that may never complete at the RETIRED ₹349/₹499 launch
       prices and wrote it into the append-only daily snapshot, where it can never be recomputed.
       Count only rows that represent money that actually moved. */
    if (!CAPTURED_STATUS[p.status || 'paid']) return;
    const amt = (typeof p.amount === 'number' && p.amount > 0) ? p.amount : (PREMIUM_PRICE_PAISE[p.plan] || 0);
    revenueTotalPaise += amt;
    if (p.plan === 'premium_12m') revenue12mCount++;
    else if (p.plan === 'premium_6m') revenue6mCount++;
    const claimedMs = p.claimedAt ? (Date.parse(p.claimedAt) || 0) : 0;
    const isToday = claimedMs >= startOfDayUTC.getTime();
    if (isToday) revenueTodayPaise += amt;

    /* Refunds are attributed to the day of the SALE, not the day of the refund, so today's net stays
       consistent with today's gross — otherwise refunding an old sale would push today's net below
       zero for reasons invisible in today's row. */
    if (p.status === 'refunded') {
      revenueRefundedPaise += amt;
      if (isToday) revenueRefundedTodayPaise += amt;
      refundedCount++;
    } else if (p.status === 'partially_refunded') {
      const back = (typeof p.amountRefunded === 'number' && p.amountRefunded > 0)
        ? Math.min(p.amountRefunded, amt)      /* never subtract more than was ever charged */
        : 0;
      revenueRefundedPaise += back;
      if (isToday) revenueRefundedTodayPaise += back;
      partialRefundCount++;
    }
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
    /* GROSS (unchanged meaning — the historical series depends on it) */
    revenueTotalINR: Math.round(revenueTotalPaise / 100),
    revenueTodayINR: Math.round(revenueTodayPaise / 100),
    /* ADR-143 — explicit gross / refunded / net. See the definitions above the scan. */
    revenueGrossINR: Math.round(revenueTotalPaise / 100),
    revenueRefundedINR: Math.round(revenueRefundedPaise / 100),
    revenueNetINR: Math.round((revenueTotalPaise - revenueRefundedPaise) / 100),
    revenueGrossTodayINR: Math.round(revenueTodayPaise / 100),
    revenueRefundedTodayINR: Math.round(revenueRefundedTodayPaise / 100),
    revenueNetTodayINR: Math.round((revenueTodayPaise - revenueRefundedTodayPaise) / 100),
    refundedCount: refundedCount,
    partialRefundCount: partialRefundCount,
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

/**
 * Per-coaching daily rollup (Analytics Foundation, ADR-027). Writes one `coachingMetrics/{coachingId}` doc
 * per coaching, each holding a date-keyed `days` map (90-day cap). Every day row is a snapshot of that
 * coaching's CURRENT averages — a real measurement taken that day — so the sequence of rows forms an honest
 * speed / accuracy / participation trend (no backfill, no synthetic data). This centralizes, into the
 * once-a-day cron, the full-roster aggregation the coaching dashboard used to run 3× per page load.
 * Bounded by COACHINGS_CAP × STUDENTS_CAP; each coaching is non-fatal (a failure skips just that doc).
 * Returns the number of coachingMetrics docs written.
 */
async function writeCoachingRollups(db) {
  const COACHINGS_CAP = 2000, STUDENTS_CAP = 5000, DAYS_CAP = 90;
  const dayKey = new Date().toISOString().split('T')[0];           // 'YYYY-MM-DD' (sorts chronologically)
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const CONCURRENCY = 10;   // bounded parallelism (ADR-029) so wall-clock scales with coaching COUNT/CONCURRENCY, not sequentially
  const coachingsSnap = await db.collection('coachings').limit(COACHINGS_CAP).get();

  async function processCoaching(cDoc) {
    const coachingId = cDoc.id;
    try {
      const studentsSnap = await db.collection('users')
        .where('coachingId', '==', coachingId).limit(STUDENTS_CAP).get();

      let totalStudents = 0, activeToday = 0, activeThisWeek = 0, premiumCount = 0, trialCount = 0;
      let sumSpeed = 0, speedN = 0, sumAcc = 0, accN = 0, attempts = 0;
      studentsSnap.forEach(function (doc) {
        const u = doc.data() || {};
        const s = u.stats || {};
        totalStudents++;
        const last = (typeof s.lastActiveMs === 'number' ? s.lastActiveMs : 0) || _toMs(s.lastActiveDate || u.updatedAt);
        if (last >= oneDayAgo) activeToday++;
        if (last >= sevenDaysAgo) activeThisWeek++;
        const times = Array.isArray(s.responseTimes) ? s.responseTimes : [];
        if (times.length) { sumSpeed += times.reduce(function (a, b) { return a + b; }, 0) / times.length; speedN++; }
        const att = s.totalAttempted || 0, cor = s.totalCorrect || 0;
        attempts += att;
        if (att > 0) { sumAcc += Math.round((cor / att) * 100); accN++; }
        if (entitlement.isActivePremium(u) && !u.isTrial) premiumCount++;   // PAID premium only (trials counted separately)
        if (u.isTrial) trialCount++;
      });

      const row = {
        avgSpeed: speedN ? Number((sumSpeed / speedN).toFixed(2)) : 0,   // seconds/question (lower = faster)
        avgAccuracy: accN ? Math.round(sumAcc / accN) : 0,
        activeToday: activeToday,
        activeThisWeek: activeThisWeek,
        totalStudents: totalStudents,
        premiumCount: premiumCount,
        trialCount: trialCount,
        participation: totalStudents ? Math.round((activeThisWeek / totalStudents) * 100) : 0,
        attempts: attempts
      };

      const ref = db.collection('coachingMetrics').doc(coachingId);
      const snap = await ref.get();
      const days = (snap.exists && snap.data() && snap.data().days) ? snap.data().days : {};
      days[dayKey] = row;
      const keys = Object.keys(days).sort();                              // ISO keys sort chronologically
      while (keys.length > DAYS_CAP) { delete days[keys.shift()]; }
      /* Full set (no merge) so the prune actually removes old keys. */
      await ref.set({ coachingId: coachingId, updatedAt: admin.firestore.FieldValue.serverTimestamp(), days: days });
      return true;
    } catch (e) {
      console.error('[coachingRollups] failed for', coachingId, e && e.message);
      return false;
    }
  }

  let written = 0;
  const docs = coachingsSnap.docs;
  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const results = await Promise.all(docs.slice(i, i + CONCURRENCY).map(processCoaching));
    written += results.filter(Boolean).length;
  }
  return written;
}

module.exports = {
  /* Exported so the CSV export in admin/system.js applies the SAME rule — two copies of "what counts
     as revenue" is how the dashboard and the export come to disagree. */
  CAPTURED_STATUS, computeDailySnapshot, writeCoachingRollups, PREMIUM_PRICE_PAISE };
