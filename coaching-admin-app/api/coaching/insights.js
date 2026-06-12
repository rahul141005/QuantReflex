/**
 * insights.js — Coaching Insights/Analytics API
 *
 * GET — Lightweight coaching analytics
 * All queries scoped by req.coachingId from JWT claims.
 */

const { withCoachingAuth, formatError, safeTimestamp, toMillis } = require('../_lib/middleware');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) { 
    console.error('Firebase admin init failed:', err);
    throw new Error('FATAL: Firebase Admin could not be initialized.');
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Only GET is allowed' });
  }

  try {
    const db = admin.firestore();
    const coachingId = req.coachingId;

    const studentsSnap = await db.collection('users')
      .where('coachingId', '==', coachingId)
      .get();

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    /* Performance trends from REAL dated data only (ADR-027/028): week-over-week accuracy (from
       dailyHistory) + week-over-week participation (from lastActive). No fabricated speed trend, no
       last-200-question "improvement" heuristic (removed), no always-zero avgPracticeTime, no
       dashboard-duplicated topic/inactive lists. The real speed trend + improvers come from the
       per-coaching daily rollup (coachingMetrics), read separately by the client. */
    let accuracyThisWeek = { total: 0, count: 0 };
    let accuracyLastWeek = { total: 0, count: 0 };
    let activeThisWeek = 0;
    let activeLastWeek = 0;

    studentsSnap.forEach(doc => {
      const u = doc.data();
      const stats = u.stats || {};
      const lastActive = toMillis(stats.lastActiveDate || u.updatedAt);

      // Participation: distinct students active in each 7-day window
      if (lastActive >= sevenDaysAgo) activeThisWeek++;
      else if (lastActive >= fourteenDaysAgo) activeLastWeek++;

      // Accuracy trend (this week vs last week) from dailyHistory {attempted, correct}
      const dailyHistory = stats.dailyHistory || {};
      let twA = 0, twC = 0, lwA = 0, lwC = 0;
      for (const dateKey in dailyHistory) {
        if (!dailyHistory.hasOwnProperty(dateKey)) continue;
        const dayMs = Date.parse(dateKey);
        const d = dailyHistory[dateKey] || {};
        if (dayMs >= sevenDaysAgo) { twA += (d.attempted || 0); twC += (d.correct || 0); }
        else if (dayMs >= fourteenDaysAgo) { lwA += (d.attempted || 0); lwC += (d.correct || 0); }
      }
      if (twA > 0) { accuracyThisWeek.total += Math.round((twC / twA) * 100); accuracyThisWeek.count++; }
      if (lwA > 0) { accuracyLastWeek.total += Math.round((lwC / lwA) * 100); accuracyLastWeek.count++; }
    });

    const accThis = accuracyThisWeek.count > 0 ? Math.round(accuracyThisWeek.total / accuracyThisWeek.count) : null;
    const accLast = accuracyLastWeek.count > 0 ? Math.round(accuracyLastWeek.total / accuracyLastWeek.count) : null;
    const partChange = activeLastWeek > 0 ? Math.round(((activeThisWeek - activeLastWeek) / activeLastWeek) * 100) : null;

    return res.status(200).json({
      accuracyTrend: {
        thisWeek: accThis,
        lastWeek: accLast,
        change: (accThis != null && accLast != null && accLast > 0) ? Math.round(((accThis - accLast) / accLast) * 100) : null
      },
      participation: {
        activeThisWeek: activeThisWeek,
        activeLastWeek: activeLastWeek,
        change: partChange
      },
      totalStudents: studentsSnap.size
    });

  } catch (err) {
    console.error('[Coaching Insights] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withCoachingAuth(handler);
