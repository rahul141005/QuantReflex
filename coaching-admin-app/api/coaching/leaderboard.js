/**
 * leaderboard.js — Coaching Leaderboard API
 *
 * GET ?period=daily|weekly|monthly|allTime&metric=accuracy|speed|streak|questions|xp
 * Returns ranked students for the coaching institute.
 */

const { withCoachingAuth, formatError, safeTimestamp } = require('../_lib/middleware');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) { console.error('Firebase admin init failed:', err); }
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
      const lastActive = _toMillis(stats.lastActiveDate || u.updatedAt);

      // For period-based filtering (except allTime), only include recently active students
      if (period !== 'allTime' && lastActive < cutoff) return;

      const attempted = stats.totalAttempted || 0;
      const correct = stats.totalCorrect || 0;
      const times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];

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
        case 'xp':
          // XP approximation: correct answers weighted
          metricValue = correct * 10 + (stats.dailyStreak || 0) * 5;
          break;
        default:
          metricValue = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      }

      leaderboard.push({
        uid: doc.id,
        name: (u.profile && u.profile.name) || u.username || 'Unknown',
        username: u.username || (u.profile && u.profile.username) || '',
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

function _toMillis(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') { const p = Date.parse(val); return isNaN(p) ? 0 : p; }
  if (typeof val.toDate === 'function') { try { return val.toDate().getTime(); } catch (_) { return 0; } }
  if (val instanceof Date) return val.getTime();
  return 0;
}

module.exports = withCoachingAuth(handler);
