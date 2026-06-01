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

    // Aggregation containers
    const topicAccuracy = {};
    let totalPracticeTime = 0;
    let practiceTimeCount = 0;
    const improvingStudents = [];
    const decliningStudents = [];
    const inactiveStudents = [];
    let accuracyThisWeek = { total: 0, count: 0 };
    let accuracyLastWeek = { total: 0, count: 0 };

    studentsSnap.forEach(doc => {
      const u = doc.data();
      const stats = u.stats || {};
      const attempted = stats.totalAttempted || 0;
      const correct = stats.totalCorrect || 0;
      const lastActive = toMillis(stats.lastActiveDate || u.updatedAt);

      // Topic accuracy aggregation
      const catStats = stats.categoryStats || {};
      for (const cat in catStats) {
        if (!catStats.hasOwnProperty(cat)) continue;
        const c = catStats[cat];
        if (!topicAccuracy[cat]) topicAccuracy[cat] = { attempted: 0, correct: 0 };
        topicAccuracy[cat].attempted += (c.attempted || c.total || 0);
        topicAccuracy[cat].correct += (c.correct || 0);
      }

      // Practice time from daily history
      const dailyHistory = stats.dailyHistory || {};
      for (const day in dailyHistory) {
        if (!dailyHistory.hasOwnProperty(day)) continue;
        const dayData = dailyHistory[day];
        if (dayData && dayData.duration) {
          totalPracticeTime += dayData.duration;
          practiceTimeCount++;
        }
      }

      // Inactive detection (7+ days)
      if (lastActive < sevenDaysAgo && attempted > 0) {
        inactiveStudents.push({
          uid: doc.id,
          name: (u.profile && u.profile.name) || u.email || 'Unknown',
          lastActive: safeTimestamp(stats.lastActiveDate || u.updatedAt),
          daysSinceActive: Math.floor((now - lastActive) / (24 * 60 * 60 * 1000))
        });
      }

      // Improvement / decline detection using todayAttempted vs historical
      // Simple heuristic: compare this week's activity vs previous patterns
      if (attempted >= 20) {
        const currentAccuracy = Math.round((correct / attempted) * 100);
        const recentTimes = Array.isArray(stats.responseTimes) ? stats.responseTimes.slice(-10) : [];
        const olderTimes = Array.isArray(stats.responseTimes) ? stats.responseTimes.slice(-20, -10) : [];

        if (recentTimes.length >= 5 && olderTimes.length >= 5) {
          const recentAvg = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
          const olderAvg = olderTimes.reduce((a, b) => a + b, 0) / olderTimes.length;
          const improvement = ((olderAvg - recentAvg) / olderAvg) * 100;

          if (improvement > 10) {
            improvingStudents.push({
              uid: doc.id,
              name: (u.profile && u.profile.name) || u.email || 'Unknown',
              improvement: Math.round(improvement),
              currentSpeed: parseFloat(recentAvg.toFixed(1)),
              accuracy: currentAccuracy
            });
          } else if (improvement < -10) {
            decliningStudents.push({
              uid: doc.id,
              name: (u.profile && u.profile.name) || u.email || 'Unknown',
              decline: Math.round(Math.abs(improvement)),
              currentSpeed: parseFloat(recentAvg.toFixed(1)),
              accuracy: currentAccuracy
            });
          }
        }
      }

      // Accuracy trend (this week vs last week)
      if (lastActive >= sevenDaysAgo) {
        const acc = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
        accuracyThisWeek.total += acc;
        accuracyThisWeek.count++;
      } else if (lastActive >= fourteenDaysAgo) {
        const acc = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
        accuracyLastWeek.total += acc;
        accuracyLastWeek.count++;
      }
    });

    // Build topic rankings
    const topicRankings = [];
    for (const cat in topicAccuracy) {
      const c = topicAccuracy[cat];
      if (c.attempted >= 5) {
        topicRankings.push({
          topic: cat,
          accuracy: Math.round((c.correct / c.attempted) * 100),
          attempted: c.attempted
        });
      }
    }
    topicRankings.sort((a, b) => a.accuracy - b.accuracy);

    // Sort students
    improvingStudents.sort((a, b) => b.improvement - a.improvement);
    decliningStudents.sort((a, b) => b.decline - a.decline);
    inactiveStudents.sort((a, b) => b.daysSinceActive - a.daysSinceActive);

    return res.status(200).json({
      weakestTopics: topicRankings.slice(0, 5),
      strongestTopics: topicRankings.slice(-5).reverse(),
      avgPracticeTime: practiceTimeCount > 0 ? Math.round(totalPracticeTime / practiceTimeCount) : 0,
      improvingStudents: improvingStudents.slice(0, 5),
      decliningStudents: decliningStudents.slice(0, 5),
      inactiveStudents: inactiveStudents.slice(0, 10),
      accuracyTrend: {
        thisWeek: accuracyThisWeek.count > 0 ? Math.round(accuracyThisWeek.total / accuracyThisWeek.count) : 0,
        lastWeek: accuracyLastWeek.count > 0 ? Math.round(accuracyLastWeek.total / accuracyLastWeek.count) : 0
      },
      totalStudents: studentsSnap.size
    });

  } catch (err) {
    console.error('[Coaching Insights] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withCoachingAuth(handler);
