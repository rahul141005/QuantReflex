/**
 * studentProfile.js — the canonical Student Intelligence Profile (ADR-039, materialized in ADR-053).
 *
 * Layer 1 of the decision model (ADR-057): the permanent, exam-AGNOSTIC source of truth. `build(uid, opts)`
 * returns ONE object that IS the student's entire learning state — identity, accuracy, today, trends, mastery,
 * weak/strong, behavioural flags + signals (burnout/regression), evidence, memory, the next recommendation, and
 * the experience tier. EVERY AI feature (Coach, Insights, Explanation, Chat, and future features) consumes this
 * same object; no feature re-assembles its own understanding. The OPTIONAL exam strategy lives in Layer 2
 * (`examStrategy.js`) and is built FROM this profile, so the AI never feels "dumber" without an exam. The derived
 * numbers come from ONE shared layer (`data/statMath.js`), so Analytics and QuanAI can never disagree. PURE — no LLM.
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
// DI categories (ADR-074) are labelled by the DI engine so QuanAI (Coach/Insights/Explain) names them properly —
// e.g. a weak "di-line" surfaces as "Line Graphs", not "General Math". Required in node only; safe (no side effects).
var _diLabels = {};
try { _diLabels = require('../js/di-engine').CATEGORY_LABELS || {}; } catch (_) {}
// LR categories (ADR-075) labelled by the LR engine, same pattern — so QuanAI names "Syllogisms", not "Lr Syllogism".
var _lrLabels = {};
try { _lrLabels = require('../js/lr-engine').CATEGORY_LABELS || {}; } catch (_) {}
function label(cat) { return CATEGORY_LABELS[cat] || _diLabels[cat] || _lrLabels[cat] || (topics.label ? topics.label(cat) : cat); }

var _round = aiMath.round;

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
      return { mode: s.mode || 'practice', category: s.category || '', n: Number(s.total) || 0,
        acc: (s.total ? _round((s.score || 0) / s.total, 2) : null), improvedPct: _round(s.sessionImprovementPct, 0) };
    }),
    today: today,              // live session signal (ADR-045)
    memory: _publicMemory(memory)
  };

  // ADR-053/055/057: materialize the WHOLE picture on the one profile so no feature re-assembles its own
  // understanding. This is Layer 1 — exam-AGNOSTIC; the optional exam strategy lives in examStrategy.js (Layer 2).
  ctx.tier = _tierOf(totalAttempted);                 // experience tier (gates richness, never access)
  ctx.evidence = statMath.evidence(stats);            // ADR-055: how much the AI is ALLOWED to claim (anti-fabrication)
  ctx.lastChange = _lastChange(ctx);                  // ADR-055: what actually changed last session (for real reasoning)
  ctx.recommendation = _recommendation(ctx);          // the single "what to work on next"
  ctx.masteryByCat = _masteryByCat(stats);            // any category's mastery (Explanation looks itself up here)
  // ADR-057: behavioural signals the Strategy consumes (the Profile is the one evolving picture; features never
  // message each other). Strong topics now showing up in recent mistakes = a regression to recover before new work.
  ctx.recentRegressionTopics = (errorPatterns && errorPatterns.regressedStrong) || [];

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

/* ADR-055: what actually changed in the latest session vs the previous one — the basis for REAL coaching
   ("more questions but accuracy dipped → harder set"), not template substitution. Null until there are 2 sessions. */
function _lastChange(ctx) {
  var rs = ctx.recentSessions || [];
  if (rs.length < 2 || rs[0].acc == null || rs[1].acc == null) return null;
  var a0 = rs[0], a1 = rs[1];
  return {
    accuracyDelta: Math.round((a0.acc - a1.acc) * 100),                 // latest vs previous, %-points
    attemptsDelta: (a0.n && a1.n) ? (a0.n - a1.n) : null,               // more/fewer questions
    latestAcc: Math.round(a0.acc * 100), latestN: a0.n || 0,
    withinSessionImprovedPct: a0.improvedPct || 0                       // warmed up within the set?
  };
}

/* The one "next recommendation": the weakest real topic, else a sensible foundation. */
function _recommendation(ctx) {
  var w = topWeakCategory(ctx);
  if (w && w.cat) return { cat: w.cat, label: w.label || label(w.cat), why: 'weakest by accuracy' };
  return { cat: 'percentages', label: label('percentages'), why: 'high-impact foundation' };
}

/* ADR-057: the study-plan read moved OUT of the profile into examStrategy.js (Layer 2). The profile is now pure
   Layer 1 (exam-agnostic) so Coach/Insights/Explain/Chat still work fully when no exam exists. */

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
  var regressed = recentCats.filter(function (c) { return strongSet[c]; });   // ADR-057: strong topic slipping = regression
  return { recentMistakeCats: recentCats.slice(0, 6), carelessSignal: regressed.length > 0, regressedStrong: regressed.slice(0, 4) };
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
  // ADR-055: state the EVIDENCE level up front so the model never claims more history than exists.
  var ev = ctx.evidence || { activeDays: 0, confidence: 'first-session', hasMultiDayHistory: false };
  L.push('EVIDENCE: ' + ev.activeDays + ' active day(s), ' + ctx.totalAttempted + ' questions total, confidence=' + ev.confidence +
    '. Only claim trends/history this supports. With <2 active days, call it a "first read" — NEVER say "stuck", "held flat", "7-day" or "over a month".');
  // TODAY first — it is the live session and the highest-signal context (ADR-045).
  var td = ctx.today;
  if (td && td.attempted > 0) {
    L.push('TODAY: ' + td.attempted + ' done' + (td.accuracy != null ? ' at ' + Math.round(td.accuracy * 100) + '%' : '') +
      (td.avgSecPerQ != null ? ', ~' + td.avgSecPerQ.toFixed(1) + 's/Q' : '') + '. Reference today before lifetime; never tell them to "go practice".');
  }
  L.push('Accuracy ' + Math.round((ctx.accuracy || 0) * 100) + '% over ' + ctx.totalAttempted + ' Qs (lifetime); streak ' + ctx.dailyStreak + 'd.');
  var t = ctx.trends;
  // Multi-day trends ONLY when there is real multi-day history (ADR-055) — otherwise the model fabricates a week.
  if (t && ev.hasMultiDayHistory) {
    if (t.accuracy && t.accuracy.d7 != null && t.accuracy.direction) L.push('Accuracy last 7d ' + Math.round(t.accuracy.d7 * 100) + '% vs 30d ' + Math.round((t.accuracy.d30 || 0) * 100) + '% (' + t.accuracy.direction + ').');
    if (t.speed && t.speed.recentSecPerQ != null && t.speed.direction) L.push('Speed ' + t.speed.recentSecPerQ.toFixed(1) + 's/Q (' + t.speed.direction + ').');
    if (t.consistency) L.push('Active ' + t.consistency.activeDaysLast14 + '/14 days; streak ' + t.consistency.streakHealth + '; last gap ' + t.consistency.gapDays + 'd.');
    if (t.sessionImprovementPct) L.push('Within-session pace improves ~' + t.sessionImprovementPct + '% on average.');
  }
  // What actually changed last session — the basis for real reasoning (ADR-055).
  var lc = ctx.lastChange;
  if (lc) {
    L.push('LAST SESSION vs previous: accuracy ' + (lc.accuracyDelta >= 0 ? '+' : '') + lc.accuracyDelta + ' pts' +
      (lc.attemptsDelta != null ? ', ' + (lc.attemptsDelta >= 0 ? 'attempted ' + lc.attemptsDelta + ' more' : 'attempted ' + Math.abs(lc.attemptsDelta) + ' fewer') : '') +
      ' (latest set: ' + lc.latestN + ' Qs at ' + lc.latestAcc + '%). Reason about WHY this changed (harder topics? rushing? fatigue? warming up?), don\'t just restate the numbers.');
  } else if (ctx.recentSessions && ctx.recentSessions.length) {
    var rs = ctx.recentSessions.slice(0, 3).map(function (s) { return s.acc != null ? Math.round(s.acc * 100) + '%' : '—'; });
    L.push('Recent session accuracy: ' + rs.join(', ') + '.');
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
