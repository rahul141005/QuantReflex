/**
 * students.js — Coaching Student List & Details API
 *
 * GET ?action=list — Paginated student list with key metrics
 * GET ?action=details&uid=... — Detailed student 360 view
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

  const action = req.query.action || 'list';

  try {
    const db = admin.firestore();
    const coachingId = req.coachingId;

    if (action === 'list' && req.method === 'GET') {
      return await _handleList(db, coachingId, req, res);
    }

    if (action === 'details' && req.method === 'GET') {
      return await _handleDetails(db, coachingId, req, res);
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[Coaching Students] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

async function _handleList(db, coachingId, req, res) {
  const limit = parseInt(req.query.limit, 10) || 50;
  const cursor = req.query.cursor; // The lastActiveDate string of the last student seen
  const search = (req.query.search || '').trim().toLowerCase();

  let query = db.collection('users').where('coachingId', '==', coachingId);

  // If there's a search term, we can't easily paginate on it without Algolia/Elasticsearch.
  // We'll fall back to fetching more or doing a simple client-side filter if search is used.
  if (!search) {
    query = query.orderBy('stats.lastActiveDate', 'desc');
    if (cursor) {
      query = query.startAfter(cursor);
    }
    query = query.limit(limit);
  } else {
    // If searching, we have to fetch all and filter in JS (temporary workaround until full search index)
    // To prevent total OOM, we cap it at 1000 max.
    query = query.limit(1000);
  }

  const studentsSnap = await query.get();

  const students = [];
  studentsSnap.forEach(doc => {
    const u = doc.data();
    const stats = u.stats || {};
    const attempted = stats.totalAttempted || 0;
    const correct = stats.totalCorrect || 0;
    const times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];
    const catStats = stats.categoryStats || {};

    // Find weakest topic
    let weakTopic = null;
    let worstAccuracy = 101;
    for (const cat in catStats) {
      if (!catStats.hasOwnProperty(cat)) continue;
      const c = catStats[cat];
      const catAttempted = c.attempted || c.total || 0;
      if (catAttempted >= 3) {
        const catAcc = Math.round(((c.correct || 0) / catAttempted) * 100);
        if (catAcc < worstAccuracy) {
          worstAccuracy = catAcc;
          weakTopic = cat;
        }
      }
    }

    students.push({
      uid: doc.id,
      name: (u.profile && u.profile.name) || u.email || 'Unknown',
      email: u.email || '',
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
      speed: times.length > 0 ? parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0,
      streak: stats.dailyStreak || 0,
      bestStreak: stats.bestDailyStreak || 0,
      lastActive: safeTimestamp(stats.lastActiveDate || u.updatedAt),
      totalAttempted: attempted,
      totalCorrect: correct,
      plan: u.plan === 'premium' ? 'premium' : 'free',
      isTrial: !!u.isTrial,
      weakTopic: weakTopic,
      createdAt: safeTimestamp(u.createdAt)
    });
  });

  // Sort by last active descending (if we fetched all for search)
  if (search) {
    students = students.filter(s => 
      s.name.toLowerCase().includes(search) || 
      (s.email && s.email.toLowerCase().includes(search))
    );
    students.sort((a, b) => {
      const aMs = a.lastActive ? Date.parse(a.lastActive) || 0 : 0;
      const bMs = b.lastActive ? Date.parse(b.lastActive) || 0 : 0;
      return bMs - aMs;
    });
  }

  const nextCursor = students.length > 0 && !search ? students[students.length - 1].lastActive : null;

  return res.status(200).json({ 
    students, 
    total: students.length,
    nextCursor,
    hasMore: !search && students.length === limit
  });
}

async function _handleDetails(db, coachingId, req, res) {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'Missing uid parameter' });

  // Verify student belongs to this coaching
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const userData = userDoc.data();
  if (userData.coachingId !== coachingId) {
    return res.status(403).json({ error: 'Student does not belong to your coaching' });
  }

  // Fetch subcollection data in parallel
  const [perfDoc, practiceDoc, sessionsSnap, duelsSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('performance').doc('overall').get(),
    db.collection('users').doc(uid).collection('practice').doc('data').get(),
    db.collection('users').doc(uid).collection('practiceSessions')
      .orderBy('timestamp', 'desc').limit(15).get(),
    db.collection('duels')
      .where(`participants.${uid}.status`, 'in', ['finished', 'exited'])
      .limit(10).get()
  ]);

  const stats = userData.stats || {};
  const performance = perfDoc.exists ? perfDoc.data() : {};
  const practiceData = practiceDoc.exists ? practiceDoc.data() : {};
  const times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];

  // Build category performance
  const categoryPerformance = [];
  const catStats = stats.categoryStats || {};
  for (const cat in catStats) {
    if (!catStats.hasOwnProperty(cat)) continue;
    const c = catStats[cat];
    const catAttempted = c.attempted || c.total || 0;
    if (catAttempted > 0) {
      categoryPerformance.push({
        topic: cat,
        accuracy: Math.round(((c.correct || 0) / catAttempted) * 100),
        attempted: catAttempted,
        correct: c.correct || 0
      });
    }
  }
  categoryPerformance.sort((a, b) => a.accuracy - b.accuracy);

  // Build recent sessions
  const recentSessions = [];
  sessionsSnap.forEach(doc => {
    const s = doc.data();
    recentSessions.push({
      id: doc.id,
      mode: s.mode || 'practice',
      category: s.category || 'mixed',
      score: s.score || 0,
      total: s.total || 0,
      duration: s.duration || 0,
      timestamp: safeTimestamp(s.timestamp)
    });
  });

  // Build duel stats
  const recentDuels = [];
  let duelWins = 0;
  let duelLosses = 0;
  let duelDraws = 0;
  duelsSnap.forEach(doc => {
    const d = doc.data();
    if (d.winner === uid) duelWins++;
    else if (d.result === 'draw') duelDraws++;
    else if (d.winner && d.winner !== uid) duelLosses++;

    recentDuels.push({
      id: doc.id,
      status: d.status || 'unknown',
      winner: d.winner || null,
      result: d.result || null,
      createdAt: safeTimestamp(d.createdAt)
    });
  });

  // Daily history for streak/activity heatmap
  const dailyHistory = stats.dailyHistory || {};

  // Engagement level
  const lastActiveMs = toMillis(stats.lastActiveDate || userData.updatedAt);
  const now = Date.now();
  let engagementLevel = 'inactive';
  if (lastActiveMs >= now - 24 * 60 * 60 * 1000) engagementLevel = 'active';
  else if (lastActiveMs >= now - 3 * 24 * 60 * 60 * 1000) engagementLevel = 'regular';

  return res.status(200).json({
    profile: {
      uid,
      name: (userData.profile && userData.profile.name) || userData.email || 'Unknown',
      email: userData.email || '',
      plan: userData.plan === 'premium' ? 'premium' : 'free',
      isTrial: !!userData.isTrial,
      createdAt: safeTimestamp(userData.createdAt),
      engagementLevel
    },
    stats: {
      totalAttempted: stats.totalAttempted || 0,
      totalCorrect: stats.totalCorrect || 0,
      accuracy: (stats.totalAttempted || 0) > 0 ? Math.round(((stats.totalCorrect || 0) / stats.totalAttempted) * 100) : 0,
      avgSpeed: times.length > 0 ? parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0,
      bestStreak: stats.bestStreak || 0,
      currentStreak: stats.currentStreak || 0,
      dailyStreak: stats.dailyStreak || 0,
      bestDailyStreak: stats.bestDailyStreak || 0,
      drillSessions: stats.drillSessions || 0,
      todayAttempted: stats.todayAttempted || 0,
      todayCorrect: stats.todayCorrect || 0
    },
    categoryPerformance,
    recentSessions,
    duelStats: { wins: duelWins, losses: duelLosses, draws: duelDraws, recent: recentDuels },
    dailyHistory,
    speedTrend: times.slice(-20)
  });
}

module.exports = withCoachingAuth(handler);
