/**
 * students.js — Coaching Student List & Details API
 *
 * GET ?action=list — Paginated student list with key metrics
 * GET ?action=details&uid=... — Detailed student 360 view
 * All queries scoped by req.coachingId from JWT claims.
 */

const { withCoachingAuth, formatError, safeTimestamp, toMillis } = require('../_lib/middleware');
const admin = require('firebase-admin');

/* Field mask for the roster scan (ADR-030 — the real "Students is slow" fix; ADR-029 only added .limit(),
   which bounds row COUNT but not per-doc PAYLOAD). Selecting just these fields makes Firestore return ~15
   fields instead of the entire user document — it drops the 90-key `stats.dailyHistory` map (unused in the
   list) plus every other heavy field (settings, quickLinks, customTopics, customFormulas, bookmarks,
   stats.mistakes, fcmToken, …). `stats.responseTimes` + `stats.categoryStats` are kept because the row's speed
   and weak-topic are derived from them. Keep this in sync with the fields read in `_handleList`. */
const LIST_FIELDS = [
  'accountStatus', 'email', 'profile.name', 'plan', 'isTrial', 'createdAt',
  'stats.totalAttempted', 'stats.totalCorrect', 'stats.responseTimes', 'stats.categoryStats',
  'stats.dailyStreak', 'stats.bestDailyStreak', 'stats.lastActiveDate', 'stats.lastActiveMs',
  'stats.avgSessionImprovementPct'
];

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
  const cursor = req.query.cursor; // numeric stats.lastActiveMs of the last student seen (ADR-029)
  const search = (req.query.search || '').trim().toLowerCase();

  let query = db.collection('users').where('coachingId', '==', coachingId);

  // If there's a search term, we can't easily paginate on it without Algolia/Elasticsearch.
  // We'll fall back to fetching more or doing a simple client-side filter if search is used.
  if (!search) {
    // Order on the SORTABLE epoch-ms field, not the toDateString lastActiveDate (which sorts by weekday).
    query = query.orderBy('stats.lastActiveMs', 'desc');
    if (cursor) {
      var cursorMs = Number(cursor);
      if (!isNaN(cursorMs)) query = query.startAfter(cursorMs);
    }
    query = query.limit(limit);
  } else {
    // If searching, we have to fetch all and filter in JS (temporary workaround until full search index)
    // To prevent total OOM, we cap it at 1000 max.
    query = query.limit(1000);
  }

  query = query.select(...LIST_FIELDS); // field mask — return ~15 fields, not the whole user doc

  const studentsSnap = await query.get();

  let students = [];   // reassigned in the search branch below (was `const` — latent TypeError)
  studentsSnap.forEach(doc => {
    const u = doc.data();
    if ((u.accountStatus || 'active') !== 'active') return;   // hide offboarded students from the roster (ADR-029)
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
      // Honest cold-start speed signal (ADR-030) — rolling within-session improvement %, read cheaply off the
      // already-scanned root doc. null until the student finishes a first ≥6-question timed session.
      sessionImprovement: (typeof stats.avgSessionImprovementPct === 'number')
        ? parseFloat(stats.avgSessionImprovementPct.toFixed(1)) : null,
      createdAt: safeTimestamp(u.createdAt),
      /* Raw indexed value for keyset pagination — MUST equal the orderBy field (stats.lastActiveMs, a
         number) so startAfter compares like-for-like. Internal; the client passes it back verbatim. */
      _rawLastActive: (typeof stats.lastActiveMs === 'number') ? stats.lastActiveMs : 0
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

  const hasMore = !search && students.length === limit;
  const nextCursor = hasMore ? students[students.length - 1]._rawLastActive : null;

  return res.status(200).json({
    students,
    total: students.length,
    nextCursor,
    hasMore
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

  // Fetch subcollection data in parallel (duels removed — PvP outcomes are off-mission for an owner
  // judging speed, and the per-field map query was a needless failure surface; ADR-028).
  const [perfDoc, practiceDoc, sessionsSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('performance').doc('overall').get(),
    db.collection('users').doc(uid).collection('practice').doc('data').get(),
    db.collection('users').doc(uid).collection('practiceSessions')
      .orderBy('timestamp', 'desc').limit(15).get()
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

  // Daily history — now carries per-day {attempted, correct, sumTimes, count} (ADR-027), the basis for
  // the student's REAL speed curve in the 360 (the client derives per-day avg speed = sumTimes/count).
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
    dailyHistory
  });
}

module.exports = withCoachingAuth(handler);
