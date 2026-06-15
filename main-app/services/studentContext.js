/**
 * studentContext.js — the Student Context Engine (ADR-039).
 *
 * The keystone of the AI ecosystem. Builds ONE rich, server-authoritative "student model" from the
 * unused goldmine (dailyHistory, practiceSessions, responseTimes, mistakes, categoryStats) using PURE
 * ARITHMETIC — no LLM. Every AI feature consumes this instead of the shallow client-sent totals.
 *
 * Doctrine (AI_INTERACTION_SYSTEM §0): move the *analysis* out of the model. Deterministic math can't
 * hallucinate. The model only writes language; this module does the thinking.
 *
 * Reads: users/{uid} (stats + aiMemory, 1 doc) + last ~20 practiceSessions (1 query). All goldmine fields
 * live inside `stats`, so ~2 logical reads total. Result cached 6h in aiContext/{uid} (shared across
 * Coach / Insights / Today / Plan → three features = one build).
 */
const admin = require('firebase-admin');
const topics = require('./quantTopics');
const aiMath = require('./aiMath');   // shared round/clamp/todayIso (ADR-047)

if (!admin.apps.length) {
  var cfg = { projectId: 'quant-reflex-trainer' };
  var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) { try { cfg.credential = admin.credential.cert(JSON.parse(sa)); } catch (e) { console.error('[studentContext] bad FIREBASE_SERVICE_ACCOUNT:', e.message); } }
  admin.initializeApp(cfg);
}
function db() { return admin.firestore(); }

var COLD_START_ATTEMPTS = 20;   // lifetime floor to unlock full personalization
var COACH_MIN_TODAY = 8;        // …OR enough activity TODAY — a fresh grind is coached, never gated (ADR-045)
var CONTEXT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
// Topic vocabulary is defined ONCE in quantTopics.js (ADR-045) — the single source of truth.
var CATEGORY_LABELS = topics.CATEGORY_LABELS;
var label = topics.label;

function _ms(dateKey) {
  if (!dateKey) return 0;
  var t = new Date(dateKey).getTime();
  return isNaN(t) ? 0 : t;
}
var _round = aiMath.round;
function _todayKey() { return new Date().toDateString(); }

/** Live "today" signal (ADR-045) — date-keyed so it never bleeds across days. Reads the same goldmine
 *  (stats.dailyHistory{toDateString → {attempted,correct,sumTimes,count}}) the practice path writes, with a
 *  fallback to the running todayAttempted/todayCorrect counters. This is what lets QuanAI say "26 done today"
 *  and what feeds the cold-start "coach, don't gate" unlock + the planner's pace forecast. */
function _deriveToday(stats) {
  var hist = stats.dailyHistory || {};
  var e = hist[_todayKey()] || {};
  var att = Number(e.attempted) || 0, cor = Number(e.correct) || 0;
  if (!att) { att = Number(stats.todayAttempted) || 0; cor = Number(stats.todayCorrect) || 0; }
  var avgMs = (e.count > 0 && e.sumTimes) ? Math.round(Number(e.sumTimes) / Number(e.count)) : null;
  return { attempted: att, correct: cor, accuracy: att > 0 ? _round(cor / att, 2) : null, avgMsPerQ: avgMs };
}

/**
 * Merge a client-sent stats snapshot into the server stats as a FLOOR — every field only ever RISES, so a
 * tampered client can't lower its own counts, and a stale server doc can't hide a live local session. Used
 * only by the QuanAI Planner path (ADR-046); analytics shared elsewhere stay server-authoritative. This is
 * the root-cause fix for the planner reading false-zero accuracy right after a fresh session (syncStats is
 * debounced ~2s and the user doc is zero-initialised at login). Sanitized/size-capped upstream in api/ai.js.
 */
function _floorStats(server, client) {
  if (!client || typeof client !== 'object') return server;
  var s = Object.assign({}, server);
  if ((Number(client.totalAttempted) || 0) > (Number(server.totalAttempted) || 0)) {
    s.totalAttempted = Number(client.totalAttempted) || 0;
    s.totalCorrect = Math.max(Number(server.totalCorrect) || 0, Number(client.totalCorrect) || 0);
  }
  if ((Number(client.todayAttempted) || 0) > (Number(server.todayAttempted) || 0)) {
    s.todayAttempted = Number(client.todayAttempted) || 0;
    s.todayCorrect = Number(client.todayCorrect) || 0;
  }
  if ((Number(client.dailyStreak) || 0) > (Number(server.dailyStreak) || 0)) s.dailyStreak = Number(client.dailyStreak) || 0;

  var cs = Object.assign({}, server.categoryStats || {}), ccs = client.categoryStats || {};
  Object.keys(ccs).forEach(function (cat) {
    var sv = cs[cat] || { attempted: 0, correct: 0 }, cv = ccs[cat] || {};
    if ((Number(cv.attempted) || 0) > (Number(sv.attempted) || 0)) cs[cat] = { attempted: Number(cv.attempted) || 0, correct: Number(cv.correct) || 0 };
  });
  s.categoryStats = cs;

  var dh = Object.assign({}, server.dailyHistory || {}), cdh = client.dailyHistory || {};
  Object.keys(cdh).forEach(function (k) {
    var sv = dh[k] || {}, cv = cdh[k] || {};
    if ((Number(cv.attempted) || 0) > (Number(sv.attempted) || 0)) {
      dh[k] = { attempted: Number(cv.attempted) || 0, correct: Number(cv.correct) || 0,
        sumTimes: Number(cv.sumTimes) || Number(sv.sumTimes) || 0, count: Number(cv.count) || Number(sv.count) || 0 };
    }
  });
  s.dailyHistory = dh;
  return s;
}

/**
 * Build the student model. Returns a plain object (see AI_INTERACTION_SYSTEM §4 / the redesign plan).
 * @param {string} uid
 * @param {{force?:boolean, clientStats?:object}} [opts]
 */
async function buildContext(uid, opts) {
  opts = opts || {};
  var cacheRef = db().collection('aiContext').doc(uid);

  // A clientStats floor (ADR-046) bypasses the cache — it carries the live local session the planner needs.
  if (!opts.force && !opts.clientStats) {
    try {
      var cached = await cacheRef.get();
      if (cached.exists) {
        var c = cached.data();
        if (c.ttlExp && c.ttlExp > Date.now() && c.ctx) return c.ctx;
      }
    } catch (e) { console.warn('[studentContext] cache read failed:', e.message); }
  }

  var userDoc;
  try {
    userDoc = await db().collection('users').doc(uid)
      .select('stats', 'aiMemory', 'plan', 'profile').get();
  } catch (e) {
    console.warn('[studentContext] user read failed (uid ' + uid + '):', e.message);
    return _coldContext(uid, {});
  }
  var data = userDoc.exists ? (userDoc.data() || {}) : {};
  var stats = data.stats || {};
  // ADR-046: raise (never lower) the server stats with the planner's live local snapshot, so a debounced/
  // zero-initialised Firestore doc can't misread a real session as cold-start.
  if (opts.clientStats) stats = _floorStats(stats, opts.clientStats);
  var memory = data.aiMemory || null;
  var name = (data.profile && data.profile.name) || '';

  var totalAttempted = Number(stats.totalAttempted) || 0;
  var totalCorrect = Number(stats.totalCorrect) || 0;
  var today = _deriveToday(stats);   // live session signal (ADR-045) — also drives the cold-start unlock below

  // Cold-start: deterministic shape, NO downstream LLM call (AI_INTERACTION_SYSTEM §4). A student is "cold" only
  // if they have too little data BOTH lifetime AND today — so someone who grinds a session today is coached, not
  // gated. The cold envelope still carries `today` so QuanAI can acknowledge the current session.
  if (totalAttempted < COLD_START_ATTEMPTS && today.attempted < COACH_MIN_TODAY) {
    var cold = _coldContext(uid, { name: name, memory: memory, totalAttempted: totalAttempted, plan: data.plan, today: today });
    _cache(cacheRef, cold);
    return cold;
  }

  // ---- recent sessions (1 query) ----
  var sessions = [];
  try {
    var snap = await db().collection('users').doc(uid).collection('practiceSessions')
      .orderBy('timestamp', 'desc').limit(20)
      .select('mode', 'category', 'score', 'total', 'duration', 'sessionImprovementPct', 'firstHalfAvg', 'secondHalfAvg', 'timestamp')
      .get();
    snap.forEach(function (d) { sessions.push(d.data()); });
  } catch (e) { console.warn('[studentContext] sessions read failed:', e.message); }

  var accuracy = totalAttempted > 0 ? totalCorrect / totalAttempted : 0;

  var trends = _deriveTrends(stats);
  var mastery = _deriveMastery(stats);
  var errorPatterns = _deriveErrors(stats, mastery);
  var flags = _deriveFlags({ trends: trends, errorPatterns: errorPatterns, totalAttempted: totalAttempted });

  var ctx = {
    v: 1,
    uid: uid,
    name: name,
    plan: data.plan === 'premium' ? 'premium' : 'free',
    coldStart: false,
    accuracy: _round(accuracy, 3),
    totalAttempted: totalAttempted,
    dailyStreak: Number(stats.dailyStreak) || 0,
    trends: trends,
    mastery: mastery,          // sorted; top ~8
    errorPatterns: errorPatterns,
    flags: flags,
    recentSessions: sessions.slice(0, 8).map(function (s) {
      return { mode: s.mode || 'practice', category: s.category || '', acc: (s.total ? _round((s.score || 0) / s.total, 2) : null), improvedPct: _round(s.sessionImprovementPct, 0) };
    }),
    today: today,              // live session signal (ADR-045)
    memory: _publicMemory(memory)
  };

  _cache(cacheRef, ctx);
  return ctx;
}

function _coldContext(uid, o) {
  return {
    v: 1, uid: uid, name: o.name || '', plan: o.plan === 'premium' ? 'premium' : 'free',
    coldStart: true, accuracy: 0, totalAttempted: o.totalAttempted || 0,
    dailyStreak: 0,
    trends: null, mastery: [], errorPatterns: { recentMistakeCats: [], carelessSignal: false },
    flags: { burnout: false, plateau: false, inconsistent: false, speedRegression: false, careless: false, coldStart: true },
    recentSessions: [],
    today: o.today || { attempted: 0, correct: 0, accuracy: null, avgMsPerQ: null },
    memory: _publicMemory(o.memory)
  };
}

function _publicMemory(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    goal: m.goal || '', examName: m.examName || '', examDate: m.examDate || '',
    confidence: m.confidence || 'medium', preferredDepth: m.preferredDepth || 'standard',
    knownWeakConcepts: Array.isArray(m.knownWeakConcepts) ? m.knownWeakConcepts.slice(0, 8) : [],
    wins: Array.isArray(m.wins) ? m.wins.slice(0, 5) : [],
    recentTopicsExplained: Array.isArray(m.recentTopicsExplained) ? m.recentTopicsExplained.slice(0, 8) : [],
    timeline: Array.isArray(m.timeline) ? m.timeline.slice(-6) : []
  };
}

/** Accuracy 7d-vs-30d + speed trajectory + consistency, from stats.dailyHistory{dateKey:{attempted,correct,sumTimes,count}}. */
function _deriveTrends(stats) {
  var hist = stats.dailyHistory || {};
  var now = Date.now(), DAY = 86400000;
  var w7 = { att: 0, cor: 0, sum: 0, cnt: 0 }, w30 = { att: 0, cor: 0, sum: 0, cnt: 0 }, prior = { att: 0, cor: 0, sum: 0, cnt: 0 };
  var activeDays14 = 0, lastActiveMs = 0;

  Object.keys(hist).forEach(function (k) {
    var t = _ms(k); if (!t) return;
    var e = hist[k] || {};
    var att = Number(e.attempted) || 0, cor = Number(e.correct) || 0, sum = Number(e.sumTimes) || 0, cnt = Number(e.count) || 0;
    var ageDays = (now - t) / DAY;
    if (t > lastActiveMs) lastActiveMs = t;
    if (ageDays <= 14 && att > 0) activeDays14++;
    if (ageDays <= 7) { w7.att += att; w7.cor += cor; w7.sum += sum; w7.cnt += cnt; }
    if (ageDays <= 30) { w30.att += att; w30.cor += cor; w30.sum += sum; w30.cnt += cnt; }
    if (ageDays > 7 && ageDays <= 30) { prior.att += att; prior.cor += cor; prior.sum += sum; prior.cnt += cnt; }
  });

  var acc7 = w7.att > 0 ? w7.cor / w7.att : null;
  var acc30 = w30.att > 0 ? w30.cor / w30.att : null;
  var accDelta = (acc7 != null && acc30 != null) ? acc7 - acc30 : 0;

  var spdRecent = w7.cnt > 0 ? w7.sum / w7.cnt : null;       // avg ms/q last 7d
  var spdBaseline = prior.cnt > 0 ? prior.sum / prior.cnt : null;
  var spdDelta = (spdRecent != null && spdBaseline != null) ? spdRecent - spdBaseline : 0;

  var gapDays = lastActiveMs ? Math.floor((now - lastActiveMs) / DAY) : 99;

  return {
    accuracy: { d7: _round(acc7, 3), d30: _round(acc30, 3), delta: _round(accDelta, 3),
      direction: accDelta > 0.02 ? 'improving' : (accDelta < -0.02 ? 'declining' : 'flat') },
    speed: { recentMsPerQ: spdRecent != null ? Math.round(spdRecent) : null, baselineMsPerQ: spdBaseline != null ? Math.round(spdBaseline) : null,
      deltaMs: Math.round(spdDelta), direction: spdDelta < -300 ? 'faster' : (spdDelta > 300 ? 'slower' : 'flat') },
    consistency: { activeDaysLast14: activeDays14, gapDays: gapDays,
      streakHealth: gapDays >= 3 ? 'broken' : (activeDays14 >= 8 ? 'strong' : 'fragile') },
    sessionImprovementPct: _round(stats.avgSessionImprovementPct, 1)
  };
}

/** The canonical mastery for ONE category (acc, n, tier) — same thresholds as _deriveMastery, but not sliced to
 *  the top-8, so a feature (e.g. Explanation) can ask about any category. Returns null when too little data.
 *  This is the SINGLE weak/strong resolver every feature shares (ADR-051) — no second computation, no drift. */
function masteryForCat(stats, cat) {
  var d = ((stats && stats.categoryStats) || {})[cat] || {};
  var att = Number(d.attempted) || 0, cor = Number(d.correct) || 0;
  if (att < 3) return null;
  var acc = cor / att;
  return { cat: cat, label: label(cat), acc: _round(acc, 2), n: att,
    tier: acc < 0.6 ? 'weak' : (acc >= 0.8 ? 'strong' : 'developing') };
}

/** Per-category current mastery (acc, n, tier) from categoryStats. */
function _deriveMastery(stats) {
  var cs = stats.categoryStats || {};
  var out = [];
  Object.keys(cs).forEach(function (cat) {
    var d = cs[cat] || {};
    var att = Number(d.attempted) || 0, cor = Number(d.correct) || 0;
    if (att < 3) return;
    var acc = cor / att;
    out.push({
      cat: cat, label: label(cat), acc: _round(acc, 2), n: att,
      tier: acc < 0.6 ? 'weak' : (acc >= 0.8 ? 'strong' : 'developing')
    });
  });
  // weakest first (so prescriptions target them), then by sample size
  out.sort(function (a, b) { return a.acc - b.acc || b.n - a.n; });
  return out.slice(0, 8);
}

function _recentMistakeCats(stats) {
  var m = Array.isArray(stats.mistakes) ? stats.mistakes.slice(-12) : [];
  var map = {};
  m.forEach(function (x) { if (x && x.category) map[x.category] = (map[x.category] || 0) + 1; });
  return map;
}

function _deriveErrors(stats, mastery) {
  var recent = _recentMistakeCats(stats);
  var recentCats = Object.keys(recent);
  // careless = a STRONG category (acc>0.8) that nonetheless shows up in recent mistakes
  var strongSet = {}; mastery.forEach(function (m) { if (m.tier === 'strong') strongSet[m.cat] = true; });
  var careless = recentCats.some(function (c) { return strongSet[c]; });
  return { recentMistakeCats: recentCats.slice(0, 6), carelessSignal: careless };
}

function _deriveFlags(o) {
  var t = o.trends || {};
  var acc = t.accuracy || {}, spd = t.speed || {}, con = t.consistency || {};
  return {
    burnout: (con.gapDays >= 3) && (acc.delta < 0),
    plateau: (o.totalAttempted > 150) && Math.abs(acc.delta || 0) < 0.02 && acc.d30 != null,
    inconsistent: con.activeDaysLast14 != null && con.activeDaysLast14 < 4 && o.totalAttempted > 50,
    speedRegression: spd.direction === 'slower',
    careless: !!(o.errorPatterns && o.errorPatterns.carelessSignal),
    coldStart: false
  };
}

function _cache(ref, ctx) {
  ref.set({ ctx: ctx, ttlExp: Date.now() + CONTEXT_TTL_MS, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    .catch(function (e) { console.warn('[studentContext] cache write failed:', e.message); });
}

/** True if the student has too little data to personalize — features must skip the LLM and use deterministic copy. */
function isColdStart(ctx) { return !ctx || ctx.coldStart === true; }

/**
 * Compact, token-bounded plain-text serialization for prompt injection (NOT JSON — terse labels save tokens).
 * Drops lowest-priority fields until under maxChars (AI_INTERACTION_SYSTEM §7).
 */
function serialize(ctx, maxChars) {
  maxChars = maxChars || 1400;
  if (!ctx) return '';
  var L = [];
  if (ctx.name) L.push('Student first name: ' + String(ctx.name).split(' ')[0] + ' (greet warmly, use sparingly).');
  // TODAY first — it is the live session and the highest-signal context (ADR-045).
  var td = ctx.today;
  if (td && td.attempted > 0) {
    L.push('TODAY: ' + td.attempted + ' done' + (td.accuracy != null ? ' at ' + Math.round(td.accuracy * 100) + '%' : '') +
      (td.avgMsPerQ != null ? ', ~' + (td.avgMsPerQ / 1000).toFixed(1) + 's/Q' : '') + '. Reference today before lifetime; never tell them to "go practice".');
  }
  L.push('Accuracy ' + Math.round((ctx.accuracy || 0) * 100) + '% over ' + ctx.totalAttempted + ' Qs (lifetime); streak ' + ctx.dailyStreak + 'd.');
  var t = ctx.trends;
  if (t) {
    if (t.accuracy && t.accuracy.d7 != null) L.push('Accuracy 7d ' + Math.round(t.accuracy.d7 * 100) + '% vs 30d ' + Math.round((t.accuracy.d30 || 0) * 100) + '% (' + t.accuracy.direction + ').');
    if (t.speed && t.speed.recentMsPerQ != null) L.push('Speed ' + (t.speed.recentMsPerQ / 1000).toFixed(1) + 's/Q (' + t.speed.direction + ').');
    if (t.consistency) L.push('Active ' + t.consistency.activeDaysLast14 + '/14 days; streak ' + t.consistency.streakHealth + '; last gap ' + t.consistency.gapDays + 'd.');
    if (t.sessionImprovementPct) L.push('Within-session pace improves ~' + t.sessionImprovementPct + '% on average.');
  }
  if (ctx.recentSessions && ctx.recentSessions.length) {
    var rs = ctx.recentSessions.slice(0, 3).map(function (s) { return s.acc != null ? Math.round(s.acc * 100) + '%' : '—'; });
    L.push('Last sessions accuracy: ' + rs.join(', ') + '.');
  }
  var weak = (ctx.mastery || []).filter(function (m) { return m.tier === 'weak'; }).map(function (m) { return m.label + ' ' + Math.round(m.acc * 100) + '%'; });
  var strong = (ctx.mastery || []).filter(function (m) { return m.tier === 'strong'; }).map(function (m) { return m.label; });
  if (weak.length) L.push('Weak: ' + weak.slice(0, 4).join(', ') + '.');
  if (strong.length) L.push('Strong: ' + strong.slice(0, 4).join(', ') + '.');
  var f = ctx.flags || {};
  var flagList = Object.keys(f).filter(function (k) { return f[k] && k !== 'coldStart'; });
  if (flagList.length) L.push('Flags: ' + flagList.join(', ') + '.');
  if (ctx.errorPatterns && ctx.errorPatterns.recentMistakeCats.length) L.push('Recent misses: ' + ctx.errorPatterns.recentMistakeCats.map(label).slice(0, 4).join(', ') + '.');
  var m = ctx.memory;
  if (m) {
    if (m.goal) L.push('Goal: ' + m.goal + '.');
    if (m.examName) L.push('Exam: ' + m.examName + (m.examDate ? ' on ' + m.examDate : '') + '.');
    if (m.knownWeakConcepts && m.knownWeakConcepts.length) L.push('Known weak concepts: ' + m.knownWeakConcepts.slice(0, 5).join(', ') + '.');
    // ADR-050: Explain writes recentTopicsExplained; surface it so Coach/Insights notice "keeps asking about X".
    if (m.recentTopicsExplained && m.recentTopicsExplained.length) L.push('Recently asked to explain: ' + m.recentTopicsExplained.slice(-4).map(label).join(', ') + ' (a struggle signal).');
    if (m.wins && m.wins.length) L.push('Recent win: ' + m.wins[m.wins.length - 1] + '.');
    if (m.timeline && m.timeline.length) L.push('Last AI note: ' + (m.timeline[m.timeline.length - 1].summary || '') + '.');
    L.push('Preferred depth: ' + (m.preferredDepth || 'standard') + '; confidence: ' + (m.confidence || 'medium') + '.');
  }
  var s = L.join(' ');
  if (s.length > maxChars) s = s.slice(0, maxChars - 1) + '…';
  return s;
}

/** Pick the single best weak category to prescribe (for missions / word problems). */
function topWeakCategory(ctx) {
  if (!ctx) return null;
  if (ctx.memory && ctx.memory.knownWeakConcepts && ctx.memory.knownWeakConcepts.length) {
    var fromMem = (ctx.mastery || []).find(function (m) { return ctx.memory.knownWeakConcepts.indexOf(m.cat) >= 0; });
    if (fromMem) return fromMem;
  }
  var weak = (ctx.mastery || []).filter(function (m) { return m.tier !== 'strong'; });
  return weak.length ? weak[0] : ((ctx.mastery || [])[0] || null);
}

module.exports = { buildContext, serialize, isColdStart, topWeakCategory, label, CATEGORY_LABELS,
  // ADR-051: the canonical mastery resolvers, shared so every feature agrees on weak/strong (no drift).
  masteryForCat: masteryForCat, _deriveMastery: _deriveMastery };
