/**
 * dashboard.js — Coaching Dashboard Metrics API
 *
 * GET ?action=metrics
 * Returns aggregated performance data for all students in the coaching.
 * All queries scoped by req.coachingId from JWT claims.
 */

const { withCoachingAuth, formatError, safeTimestamp, toMillis } = require('../_lib/middleware');
const admin = require('firebase-admin');
/* ADR-149: the ONE entitlement rule (generated mirror — scripts/sync-entitlement-core.js).
   `plan` alone is not an entitlement: a lapsed student keeps `plan:'premium'` on their document
   until the server next self-heals it, so projecting the raw field showed their coaching a Premium
   badge for a subscription that had already ended. */
const entitlement = require('../_lib/entitlement-core');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin init failed:', err);
    throw new Error('FATAL: Firebase Admin could not be initialized.');
  }
}

/* Field mask for the dashboard aggregate scan (ADR-030) — return only what's aggregated, not the whole user
   doc. Drops the 90-key `stats.dailyHistory` map (not used here) + settings/bookmarks/customFormulas/mistakes/
   etc. Keep in sync with the fields read in the forEach below. */
const DASH_FIELDS = [
  'accountStatus', 'email', 'profile.name', 'plan', 'isTrial', 'updatedAt',
  'stats.lastActiveDate', 'stats.totalAttempted', 'stats.totalCorrect', 'stats.responseTimes',
  'stats.categoryStats', 'stats.dailyStreak', 'stats.todayAttempted', 'stats.todayCorrect',
  'stats.avgSessionImprovementPct'
];

/* Speed-distribution buckets (ADR-030). Honest fixed thresholds on mean solve time (seconds): a student is
   Fast if they average under 5s/question, On-track 5–10s, Slow at 10s+. Bucketing is a coaching-wide count
   only — raw responseTimes are NEVER shipped to the client. */
function _speedBucket(avgTime) {
  if (avgTime < 5) return 'fast';
  if (avgTime < 10) return 'onTrack';
  return 'slow';
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Only GET is allowed' });
  }

  try {
    const db = admin.firestore();
    const coachingId = req.coachingId;

    // Fetch coaching info (needed for denormalized studentCount)
    const coachingDoc = await db.collection('coachings').doc(coachingId).get();
    const coachingData = coachingDoc.exists ? coachingDoc.data() : {};

    // Fetch students for this coaching — BOUNDED (ADR-029) so a huge roster can't OOM/timeout the 15s
    // function. 5000 matches the daily rollup's cap; beyond it, headline aggregates are flagged truncated.
    const SCAN_CAP = 5000;
    const studentsSnap = await db.collection('users')
      .where('coachingId', '==', coachingId)
      .limit(SCAN_CAP)
      .select(...DASH_FIELDS)   // field mask — only the aggregated fields, not the whole user doc (ADR-030)
      .get();
    const rosterTruncated = studentsSnap.size >= SCAN_CAP;

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let totalStudents = coachingData.studentCount !== undefined ? coachingData.studentCount : 0;
    let fallbackCount = 0;
    let activeToday = 0;
    let activeThisWeek = 0;
    let totalAccuracy = 0;
    let accuracyCount = 0;
    let totalSpeed = 0;
    let speedCount = 0;
    let activeStreakUsers = 0;
    let totalQuestionsSolved = 0;
    let premiumUsers = 0;
    let sessionImpSum = 0;        // coaching-wide avg within-session improvement (ADR-030)
    let sessionImpCount = 0;
    const speedBuckets = { fast: 0, onTrack: 0, slow: 0 };   // speed distribution (ADR-030)
    const categoryAccuracyMap = {};
    const strongestStudents = [];
    const sessionImprovers = [];  // top same-session improvers (ADR-030)
    const inactiveStudents = [];
    const recentActivity = [];

    studentsSnap.forEach(doc => {
      const u = doc.data();
      /* Exclude offboarded students (ADR-029) — suspended/archived users can't practice, so they must not
         inflate active/at-risk/accuracy/speed aggregates or appear in the nudge list. */
      if ((u.accountStatus || 'active') !== 'active') return;
      fallbackCount++;

      const stats = u.stats || {};
      const lastActive = toMillis(stats.lastActiveDate || u.updatedAt);

      // Active today / this week
      if (lastActive >= oneDayAgo) activeToday++;
      if (lastActive >= sevenDaysAgo) activeThisWeek++;

      // Accuracy aggregation
      const attempted = stats.totalAttempted || 0;
      const correct = stats.totalCorrect || 0;
      if (attempted > 0) {
        const acc = Math.round((correct / attempted) * 100);
        totalAccuracy += acc;
        accuracyCount++;
      }

      // Speed aggregation + distribution bucket (ADR-030)
      const times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];
      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        totalSpeed += avgTime;
        speedCount++;
        speedBuckets[_speedBucket(avgTime)]++;
      }

      // Session Improvement (ADR-030) — honest cold-start speed signal, read off the root doc
      const sessImp = stats.avgSessionImprovementPct;
      if (typeof sessImp === 'number' && isFinite(sessImp)) {
        sessionImpSum += sessImp;
        sessionImpCount++;
      }

      // Streak users
      if ((stats.dailyStreak || 0) > 0) activeStreakUsers++;

      // Total questions
      totalQuestionsSolved += attempted;

      // Premium (v2: single tier) — PAID only; trials are tracked separately so they aren't double-counted.
      if (entitlement.isActivePremium(u) && !u.isTrial) premiumUsers++;

      // Category stats aggregation (for weak topics)
      const catStats = stats.categoryStats || {};
      for (const cat in catStats) {
        if (!catStats.hasOwnProperty(cat)) continue;
        const c = catStats[cat];
        if (!categoryAccuracyMap[cat]) {
          categoryAccuracyMap[cat] = { attempted: 0, correct: 0 };
        }
        categoryAccuracyMap[cat].attempted += (c.attempted || c.total || 0);
        categoryAccuracyMap[cat].correct += (c.correct || 0);
      }

      // Build student summaries for sorting
      const studentSummary = {
        uid: doc.id,
        name: (u.profile && u.profile.name) || u.email || 'Unknown',
        accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
        speed: times.length > 0 ? parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0,
        streak: stats.dailyStreak || 0,
        lastActive: safeTimestamp(stats.lastActiveDate || u.updatedAt),
        totalAttempted: attempted,
        plan: entitlement.isActivePremium(u) ? 'premium' : 'free',
        isTrial: !!u.isTrial,
        sessionImprovement: (typeof sessImp === 'number' && isFinite(sessImp))
          ? parseFloat(sessImp.toFixed(1)) : null
      };

      // Strongest students (by accuracy, min 10 questions)
      if (attempted >= 10) {
        strongestStudents.push(studentSummary);
      }

      // Top same-session improvers (positive within-session speed delta only)
      if (typeof sessImp === 'number' && isFinite(sessImp) && sessImp > 0) {
        sessionImprovers.push(studentSummary);
      }

      // Inactive students (no activity in 3+ days)
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
      if (lastActive < threeDaysAgo) {
        inactiveStudents.push(studentSummary);
      }

      // Recent activity (last active date with student info)
      if (lastActive >= sevenDaysAgo) {
        recentActivity.push({
          uid: doc.id,
          name: studentSummary.name,
          lastActive: studentSummary.lastActive,
          todayAttempted: stats.todayAttempted || 0,
          todayCorrect: stats.todayCorrect || 0
        });
      }
    });

    // Sort strongest by accuracy desc
    strongestStudents.sort((a, b) => b.accuracy - a.accuracy);

    // Sort session improvers by within-session improvement desc (ADR-030)
    sessionImprovers.sort((a, b) => (b.sessionImprovement || 0) - (a.sessionImprovement || 0));

    // Sort inactive by lastActive asc (most inactive first)
    inactiveStudents.sort((a, b) => {
      const aMs = toMillis(a.lastActive);
      const bMs = toMillis(b.lastActive);
      return aMs - bMs;
    });

    // Sort recent activity by last active desc
    recentActivity.sort((a, b) => {
      const aMs = toMillis(a.lastActive);
      const bMs = toMillis(b.lastActive);
      return bMs - aMs;
    });

    // Build weak topics (sorted by accuracy ascending)
    const weakTopics = [];
    for (const cat in categoryAccuracyMap) {
      const c = categoryAccuracyMap[cat];
      if (c.attempted >= 5) {
        weakTopics.push({
          topic: cat,
          accuracy: Math.round((c.correct / c.attempted) * 100),
          attempted: c.attempted
        });
      }
    }
    weakTopics.sort((a, b) => a.accuracy - b.accuracy);

    if (coachingData.studentCount === undefined || coachingData.studentCount < fallbackCount) {
      totalStudents = Math.max(coachingData.studentCount || 0, fallbackCount);
    }

    return res.status(200).json({
      coaching: {
        id: coachingId,
        name: coachingData.name || coachingId,
        status: coachingData.status || 'active',
        plan: coachingData.entitlementPlan || 'standard',
        capacity: coachingData.capacity || null,
        logoUrl: coachingData.logoUrl || null,   // optional institute logo (ADR-030)
        expiryDate: safeTimestamp(coachingData.expiryDate),
        createdAt: safeTimestamp(coachingData.createdAt)
      },
      metrics: {
        totalStudents: totalStudents,
        activeToday,
        activeThisWeek,
        avgAccuracy: accuracyCount > 0 ? Math.round(totalAccuracy / accuracyCount) : 0,
        avgSpeed: speedCount > 0 ? parseFloat((totalSpeed / speedCount).toFixed(1)) : 0,
        activeStreakUsers,
        totalQuestionsSolved,
        premiumUsers,
        inactiveCount: inactiveStudents.length,  /* true at-risk total (the list below is sliced to 10) */
        rosterTruncated: rosterTruncated,         /* aggregates cover the first 5000 students only */
        /* Session Improvement (ADR-030) — coaching-wide avg within-session speed delta + how many students it
           is based on (so the UI can label it honestly and hide it until there's data). */
        avgSessionImprovement: sessionImpCount > 0 ? parseFloat((sessionImpSum / sessionImpCount).toFixed(1)) : null,
        sessionImprovementSampleSize: sessionImpCount,
        /* Speed distribution buckets (counts only — raw times never leave the server). */
        speedDistribution: speedBuckets
      },
      weakTopics: weakTopics.slice(0, 5),
      strongestStudents: strongestStudents.slice(0, 5),
      topImprovers: sessionImprovers.slice(0, 5),   // top same-session speed improvers (ADR-030)
      inactiveStudents: inactiveStudents.slice(0, 10),
      recentActivity: recentActivity.slice(0, 10)
    });

  } catch (err) {
    console.error('[Coaching Dashboard] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withCoachingAuth(handler);
