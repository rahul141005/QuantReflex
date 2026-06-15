/**
 * studentProfile.js — the canonical Student Intelligence Profile (ADR-039, materialized in ADR-053).
 *
 * The keystone of the AI ecosystem. `build(uid, opts)` returns ONE object that IS the student's entire
 * learning state — identity, accuracy, today, trends, mastery, weak/strong, flags, memory, the study
 * planner (readiness/forecast/today's tasks/adherence), the next recommendation, and the experience tier.
 * EVERY AI feature (Coach, Insights, Explanation, Chat, Planner, and future features) consumes this same
 * object; no feature re-assembles its own understanding. The derived numbers come from ONE shared layer
 * (`data/statMath.js`), so Analytics and QuanAI can never disagree. Built with PURE ARITHMETIC — no LLM.
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
const statMath = require('../data/statMath');   // ADR-053: the ONE derivation layer (shared client+server)

if (!admin.apps.length) {
  var cfg = { projectId: 'quant-reflex-trainer' };
  var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) { try { cfg.credential = admin.credential.cert(JSON.parse(sa)); } catch (e) { console.error('[studentProfile] bad FIREBASE_SERVICE_ACCOUNT:', e.message); } }
  admin.initializeApp(cfg);
}
function db() { return admin.firestore(); }

var CONTEXT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
// Topic vocabulary is defined ONCE in quantTopics.js (ADR-045) — the single source of truth.
var CATEGORY_LABELS = topics.CATEGORY_LABELS;
var label = topics.label;

var _round = aiMath.round;
var _todayIso = aiMath.todayIso;   // ADR-053: local-date fallback for the folded-in planner read

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
async function build(uid, opts) {
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
    } catch (e) { console.warn('[studentProfile] cache read failed:', e.message); }
  }

  var userDoc, readOk = true;
  try {
    userDoc = await db().collection('users').doc(uid)
      .select('stats', 'aiMemory', 'plan', 'profile').get();
  } catch (e) {
    // ADR-054: a Firestore read hiccup (e.g. admin creds) must NEVER discard the client's authoritative live
    // data. Degrade to empty server stats and fall through — the clientStats floor below still rebuilds a real
    // profile, so QuanAI can't disown a student who has data. (Was: `return _coldContext(uid, {})`, the bug.)
    console.warn('[studentProfile] user read failed (uid ' + uid + '):', e.message);
    userDoc = null; readOk = false;
  }
  var data = (userDoc && userDoc.exists) ? (userDoc.data() || {}) : {};
  var stats = data.stats || {};
  // ADR-046: raise (never lower) the server stats with the planner's live local snapshot, so a debounced/
  // zero-initialised Firestore doc can't misread a real session as cold-start.
  if (opts.clientStats) stats = _floorStats(stats, opts.clientStats);
  var memory = data.aiMemory || null;
  var name = (data.profile && data.profile.name) || '';

  var totalAttempted = Number(stats.totalAttempted) || 0;
  var totalCorrect = Number(stats.totalCorrect) || 0;
  var today = statMath.today(stats);   // live session signal (ADR-045) — from the one derivation layer

  // ADR-052: NO cold-start gate. buildContext is the ONE canonical profile and ALWAYS returns the real student —
  // computed from whatever data exists (even zero). Data richness (the `_tier` scale) decides how rich the AI
  // response is, never whether a feature works; QuanAI never disowns a student Analytics can already see.
  var noData = (totalAttempted === 0 && today.attempted === 0);

  // ADR-054 tripwire: it is an INVARIANT that a positive client floor can never produce a zero/cold profile.
  // If this ever fires, it names the exact divergence (read failure vs floor not applied) in the server logs.
  var _cTotal = Number(opts.clientStats && opts.clientStats.totalAttempted) || 0;
  if (_cTotal > 0 && noData) {
    console.warn('[studentProfile] INVARIANT VIOLATION — client reported data but profile is cold:',
      JSON.stringify({ uid: uid, clientTotal: _cTotal, serverTotal: Number((data.stats || {}).totalAttempted) || 0, flooredTotal: totalAttempted, readOk: readOk }));
  }

  // ---- recent sessions (1 query; skipped for a brand-new user — nothing to read) ----
  var sessions = [];
  if (!noData) {
    try {
      var snap = await db().collection('users').doc(uid).collection('practiceSessions')
        .orderBy('timestamp', 'desc').limit(20)
        .select('mode', 'category', 'score', 'total', 'duration', 'sessionImprovementPct', 'firstHalfAvg', 'secondHalfAvg', 'timestamp')
        .get();
      snap.forEach(function (d) { sessions.push(d.data()); });
    } catch (e) { console.warn('[studentProfile] sessions read failed:', e.message); }
  }

  var accuracy = totalAttempted > 0 ? totalCorrect / totalAttempted : null;   // null (not 0) = "no data yet"

  var trends = _deriveTrends(stats);
  var mastery = _deriveMastery(stats);
  var errorPatterns = _deriveErrors(stats, mastery);
  var flags = _deriveFlags({ trends: trends, errorPatterns: errorPatterns, totalAttempted: totalAttempted });

  var ctx = {
    v: 1,
    uid: uid,
    name: name,
    plan: data.plan === 'premium' ? 'premium' : 'free',
    coldStart: noData,            // ADR-052: zero-data FRAMING flag only — never a feature gate
    accuracy: accuracy == null ? null : _round(accuracy, 3),
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

  // ADR-053: materialize the WHOLE picture on the one profile so no feature re-assembles its own understanding.
  ctx.tier = _tierOf(totalAttempted);                 // experience tier (gates richness, never access)
  ctx.recommendation = _recommendation(ctx);          // the single "what to work on next"
  ctx.masteryByCat = _masteryByCat(stats);            // any category's mastery (Explanation looks itself up here)
  ctx.planner = await _plannerData(uid, opts.clientDate);   // study-plan readiness/forecast/today's tasks (one read)

  _cache(cacheRef, ctx);
  return ctx;
}

/* Experience tier from lifetime volume (ADR-050/053) — the single definition, consumed by every feature. */
function _tierOf(n) { n = Number(n) || 0; return n >= 500 ? 4 : n >= 100 ? 3 : n >= 30 ? 2 : n >= 6 ? 1 : 0; }

/* Labeled per-category mastery map (any category) — so Explanation gets its topic's mastery from the profile. */
function _masteryByCat(stats) {
  var raw = statMath.masteryMap(stats), out = {};
  Object.keys(raw).forEach(function (cat) { var m = raw[cat]; out[cat] = { cat: cat, label: label(cat), acc: m.acc, n: m.n, tier: m.tier }; });
  return out;
}

/* The one "next recommendation": the weakest real topic, else a sensible foundation. */
function _recommendation(ctx) {
  var w = topWeakCategory(ctx);
  if (w && w.cat) return { cat: w.cat, label: w.label || label(w.cat), why: 'weakest by accuracy' };
  return { cat: 'percentages', label: label('percentages'), why: 'high-impact foundation' };
}

/* The study planner grounding, folded into the profile (ADR-053; was aiBrain._plannerData). One aiPlanner read
   yields today's tasks + the persisted exam readiness + forecast + adherence, so Coach/Insights/Explain/Chat all
   speak from the same plan with no second read. Returns an empty shape when there's no plan. */
async function _plannerData(uid, clientDate) {
  var empty = { has: false, note: '', readiness: null, forecast: null, todayTasks: [], adherencePct: null };
  try {
    var pd = await db().collection('aiPlanner').doc(uid).get();
    if (!pd.exists) return empty;
    var pdoc = pd.data();
    var todayKey = clientDate || _todayIso();
    var td = ((pdoc.block && pdoc.block.days) || []).find(function (d) { return d.date === todayKey; });
    var tasks = (td && td.tasks) || [];
    var labels = tasks.map(function (t) { return t.label; }).slice(0, 3).join(', ');
    var rd = pdoc.readiness || {}, fc = pdoc.forecast || {};
    var adh = null, bh = pdoc.blockHistory || [];
    if (bh.length && typeof bh[bh.length - 1].adherencePct === 'number') adh = bh[bh.length - 1].adherencePct;
    else if (pdoc.block) {
      var sched = 0, done = 0;
      ((pdoc.block.days) || []).forEach(function (d) { (d.tasks || []).forEach(function (x) { sched++; if (x.done) done++; }); });
      if (sched) adh = Math.round(done / sched * 100);
    }
    var note = '';
    if (labels) note += 'The student\'s study planner schedules today: ' + labels + '. ';
    if (typeof rd.score === 'number') {
      note += 'Their exam readiness is ' + rd.score + '/100' +
        (fc.onTrack === false ? ' and they\'re behind pace' : (fc.daysToExam != null ? ', ' + fc.daysToExam + ' days out' : '')) + '. ';
    }
    return { has: true, note: note ? note + 'Tie your advice to the plan.' : '',
      readiness: (typeof rd.score === 'number' ? rd : null), forecast: fc, todayTasks: tasks, adherencePct: adh };
  } catch (_) { return empty; }
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
/* ADR-053: trends are composed from the ONE derivation layer (statMath) — same numbers the client Analytics
   shows, so QuanAI and Analytics can never disagree. This module only adds the server-only memory-backed field. */
function _deriveTrends(stats) {
  return {
    accuracy: statMath.accuracyWindows(stats),
    speed: statMath.speed(stats),
    consistency: statMath.consistency(stats),
    sessionImprovementPct: _round(stats.avgSessionImprovementPct, 1)
  };
}

/** Canonical mastery for ONE category, with the human label attached (the pure tiering lives in statMath). */
function masteryForCat(stats, cat) {
  var m = statMath.masteryForCat(stats, cat);
  return m ? { cat: m.cat, label: label(m.cat), acc: m.acc, n: m.n, tier: m.tier } : null;
}

/** Per-category mastery list (weakest-first, top 8), labels attached. */
function _deriveMastery(stats) {
  return statMath.deriveMastery(stats).map(function (m) {
    return { cat: m.cat, label: label(m.cat), acc: m.acc, n: m.n, tier: m.tier };
  });
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
    .catch(function (e) { console.warn('[studentProfile] cache write failed:', e.message); });
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

module.exports = { build, serialize, isColdStart, topWeakCategory, label, CATEGORY_LABELS,
  // ADR-051: the canonical mastery resolvers, shared so every feature agrees on weak/strong (no drift).
  masteryForCat: masteryForCat, _deriveMastery: _deriveMastery,
  _tierOf: _tierOf };   // ADR-053: the single experience-tier definition (exposed for the harness)
