/**
 * dashboard.js — Coaching Dashboard Metrics API
 *
 * GET ?action=metrics
 * Returns aggregated performance data for all students in the coaching.
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

    // Fetch coaching info (needed for denormalized studentCount)
    const coachingDoc = await db.collection('coachings').doc(coachingId).get();
    const coachingData = coachingDoc.exists ? coachingDoc.data() : {};

    // Fetch all students for this coaching
    const studentsSnap = await db.collection('users')
      .where('coachingId', '==', coachingId)
      .get();

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
    const categoryAccuracyMap = {};
    const strongestStudents = [];
    const inactiveStudents = [];
    const recentActivity = [];

    studentsSnap.forEach(doc => {
      const u = doc.data();
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

      // Speed aggregation
      const times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];
      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        totalSpeed += avgTime;
        speedCount++;
      }

      // Streak users
      if ((stats.dailyStreak || 0) > 0) activeStreakUsers++;

      // Total questions
      totalQuestionsSolved += attempted;

      // Premium (v2: single tier)
      if (u.plan === 'premium') premiumUsers++;

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
        plan: u.plan === 'premium' ? 'premium' : 'free',
        isTrial: !!u.isTrial
      };

      // Strongest students (by accuracy, min 10 questions)
      if (attempted >= 10) {
        strongestStudents.push(studentSummary);
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
        premiumUsers
      },
      weakTopics: weakTopics.slice(0, 5),
      strongestStudents: strongestStudents.slice(0, 5),
      inactiveStudents: inactiveStudents.slice(0, 10),
      recentActivity: recentActivity.slice(0, 10)
    });

  } catch (err) {
    console.error('[Coaching Dashboard] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withCoachingAuth(handler);
