/**
 * leaderboard.js — Coaching Leaderboard API
 *
 * GET ?period=daily|weekly|monthly|allTime&metric=accuracy|speed|streak|questions|consistency
 * Returns ranked students for the coaching institute.
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
    const period = req.query.period || 'weekly';
    const metric = req.query.metric || 'accuracy';

    const studentsSnap = await db.collection('users')
      .where('coachingId', '==', coachingId)
      .get();

    const now = Date.now();
    const periodMs = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      allTime: Infinity
    };
    const cutoff = period === 'allTime' ? 0 : now - (periodMs[period] || periodMs.weekly);

    const leaderboard = [];
    studentsSnap.forEach(doc => {
      const u = doc.data();
      const stats = u.stats || {};
      const lastActive = toMillis(stats.lastActiveDate || u.updatedAt);

      // For period-based filtering, we MUST calculate stats using dailyHistory
      let attempted = 0;
      let correct = 0;
      let times = [];

      if (period === 'allTime') {
        attempted = stats.totalAttempted || 0;
        correct = stats.totalCorrect || 0;
        times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];
      } else {
        if (lastActive < cutoff) return; // User wasn't active in this period

        const dailyHistory = stats.dailyHistory || {};
        for (const dateKey in dailyHistory) {
          if (!dailyHistory.hasOwnProperty(dateKey)) continue;
          const dayMs = Date.parse(dateKey);
          if (dayMs >= cutoff) {
            const dayData = dailyHistory[dateKey];
            attempted += (dayData.attempted || 0);
            correct += (dayData.correct || 0);
            // Since responseTimes are not stored historically per day, we have to fall back 
            // to recent responseTimes if they practiced in this period.
          }
        }
        times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];
      }

      let metricValue = 0;
      switch (metric) {
        case 'accuracy':
          metricValue = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
          break;
        case 'speed':
          metricValue = times.length > 0 ? parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 999;
          break;
        case 'streak':
          metricValue = stats.dailyStreak || 0;
          break;
        case 'questions':
          metricValue = attempted;
          break;
        case 'consistency': {
          // Consistency Score (0–100): streak (35%) + volume (35%) + accuracy (30%)
          const acc = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
          const streakComp = Math.min((stats.dailyStreak || 0) / 30, 1) * 35;
          const volumeComp = Math.min(attempted / 500, 1) * 35;
          const accuracyComp = (acc / 100) * 30;
          metricValue = Math.round(streakComp + volumeComp + accuracyComp);
          break;
        }
        default:
          metricValue = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      }

      leaderboard.push({
        uid: doc.id,
        name: (u.profile && u.profile.name) || u.email || 'Unknown',
        metricValue,
        accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
        speed: times.length > 0 ? parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0,
        streak: stats.dailyStreak || 0,
        totalAttempted: attempted,
        isPremium: !!u.isPremium,
        isPremiumPlus: !!u.isPremiumPlus
      });
    });

    // Sort: speed ascending (lower is better), everything else descending
    if (metric === 'speed') {
      leaderboard.sort((a, b) => a.metricValue - b.metricValue);
    } else {
      leaderboard.sort((a, b) => b.metricValue - a.metricValue);
    }

    // Add rank
    leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });

    return res.status(200).json({
      leaderboard: leaderboard.slice(0, 50),
      period,
      metric,
      total: leaderboard.length
    });

  } catch (err) {
    console.error('[Coaching Leaderboard] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withCoachingAuth(handler);
