/**
 * aiBrain.js — the one AI brain (ADR-039).
 *
 * Orchestrates studentProfile (the one canonical profile) + aiMemory (continuity) + aiPrompts (language) +
 * llmProvider (the single gpt-4o-mini call) into AIResponse block envelopes (AI_INTERACTION_SYSTEM §2).
 * The model writes only small language objects; THIS module assembles the UI blocks + chips deterministically
 * from real data — the reliability lever that makes gpt-4o-mini punch above its weight.
 *
 * Every feature: consumes context + memory, ends in chips, deep-links real drills, and NEVER throws to the
 * user (hard model failure → a deterministic, still-useful fallback envelope). Cold-start users skip the LLM.
 */
const admin = require('firebase-admin');
const ctxEngine = require('./studentProfile');
const llm = require('./llmProvider');
const prompts = require('./aiPrompts');
const aiService = require('./aiService');
const SYL = require('../data/syllabus');             // bundled syllabus DB (ADR-046)
const plannerEngine = require('./plannerEngine');    // mechanical schedule helpers (applyCompletion/rebalance)
const planningEngine = require('./planningEngine');  // ADR-056/057: the marks-maximizing strategy engine (sole planner)
const projector = require('./scheduleProjector');    // ADR-057: pure roadmap→days projection
const examStrategy = require('./examStrategy');       // ADR-057: Layer-2 exam strategy (null when no exam)
const readinessLib = require('./readiness');         // readiness score + completion forecast
const aiMath = require('./aiMath');                  // shared round/clamp/todayIso (ADR-047)

function db() { return admin.firestore(); }
function _examOf(ctx) { return (ctx && ctx.memory && ctx.memory.examName) || ''; }
/* ADR-051: deterministic "how this concept shows up in YOUR exam" — grounded in the bundled syllabus metadata
   (frequency/difficulty), never invented by the LLM. examName → exam (in-memory) → matching drillable topics. */
function _examInsight(category, examName) {
  if (!category || !examName) return null;
  try {
    var exam = (SYL.searchExams(examName) || [])[0];
    if (!exam) return null;
    var syl = SYL.resolveSyllabus(exam.id);
    var topics = ((syl && syl.topics) || []).filter(function (t) { return t.drillable === category; });
    if (!topics.length) return null;
    topics.sort(function (a, b) { return (b.importance || 0) - (a.importance || 0); });
    var top = topics[0];
    var freq = top.frequency || (top.importance >= 0.75 ? 'high' : top.importance >= 0.5 ? 'medium' : 'low');
    var diff = top.difficulty >= 0.66 ? 'a tougher area' : top.difficulty >= 0.4 ? 'moderate' : 'one of the friendlier topics';
    var target = top.difficulty >= 0.66 ? '~100s' : top.difficulty >= 0.4 ? '~75s' : '~45s';
    return { examName: exam.name, text: top.label + ' is ' + freq + '-frequency in ' + exam.name + ' and ' + diff + '. Aim for about ' + target + ' a question.' };
  } catch (_) { return null; }
}
function _promptId(p) { return p.id + '@' + p.version; }
/* Map a prompt id (e.g. 'coach.daily', 'wp.generate') → the Command-Center feature bucket for AI telemetry. */
function _featOf(promptId) {
  var id = String(promptId || '');
  if (id.indexOf('coach') === 0) return 'coach';
  if (id.indexOf('insights') === 0) return 'insights';
  if (id.indexOf('explain') === 0) return 'explain';
  if (id.indexOf('chat') === 0) return 'chat';
  if (id.indexOf('planner') === 0) return 'planner';
  if (id.indexOf('wp') === 0) return 'wordproblems';
  return 'unknown';
}
function _dateKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function _hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff; return h.toString(36); }

/* ---- block + envelope builders (the design-system vocabulary) ----
   _clip enforces field length server-side (ADR-040: schema maxLength was removed — strict mode rejects it). */
function _clip(s, n) { s = (s == null ? '' : String(s)); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function say(text) { return { type: 'say', text: _clip(text, 240) }; }
function card(title, body, accent, icon) { return { type: 'card', title: _clip(title, 80), body: _clip(body, 280), accent: accent || 'slate', icon: icon || '' }; }
function metric(label, value, trend, good) { return { type: 'metric', label: label, value: value, trend: trend || 'flat', good: good !== false }; }
function steps(items, title) { return { type: 'steps', title: title || '', items: (items || []).slice(0, 8).map(function (s) { return _clip(s, 220); }), collapsible: false }; }
function callout(tone, text) { return { type: 'callout', tone: tone || 'info', text: _clip(text, 220) }; }
function celebrate(text) { return { type: 'celebrate', text: _clip(text, 180) }; }
/* Dashboard blocks (ADR-050): a readiness ring (reuses the planner ring CSS) + a labelled progress bar. */
function ring(score, label, sub) { return { type: 'ring', score: Math.max(0, Math.min(100, Math.round(Number(score) || 0))), label: _clip(label || '', 40), sub: _clip(sub || '', 60) }; }
function progress(label, pct, sub) { return { type: 'progress', label: _clip(label || '', 40), pct: Math.max(0, Math.min(100, Math.round(Number(pct) || 0))), sub: _clip(sub || '', 60) }; }
function missionBlock(title, why, mode, category, label, estMin) {
  return { type: 'mission', title: _clip(title, 80), why: _clip(why, 200), estMin: estMin || 5,
    deepLink: { mode: mode || 'focus', category: category || '', label: label || '' } };
}
function chipReply(label, value, icon) { return { label: label, value: value, kind: 'reply', icon: icon || '' }; }
function chipDeep(label, mode, category, catLabel, icon) { return { label: label, kind: 'deeplink', icon: icon || '', deepLink: { mode: mode, category: category, label: catLabel } }; }
/* In-place micro-drill chip (ADR-045): runs 5 adaptive questions INSIDE the modal and returns to the
   conversation — never navigates to the Practice page (vs chipDeep). Used by Explain so the learning flow is unbroken. */
function chipDrill(label, category, catLabel, icon) { return { label: label, kind: 'drill', icon: icon || '', drill: { category: category, label: catLabel } }; }
function chipDismiss(label) { return { label: label, value: 'dismiss', kind: 'dismiss' }; }
function helpfulChips() { return [chipReply('👍 Helpful', 'helpful_yes'), chipReply('👎 Not really', 'helpful_no')]; }
function envelope(feature, blocks, chips, meta) {
  return { v: 1, feature: feature, blocks: (blocks || []).filter(Boolean), chips: (chips || []).filter(Boolean), meta: meta || {} };
}
/* The dominant behavioural flag, as a one-word note the prompt is told to address (ADR-050) — burnout, careless,
   plateau, speedRegression and inconsistent are computed in studentProfile but were never acted on. */
function _flagsNote(ctx) {
  var f = (ctx && ctx.flags) || {};
  var order = ['burnout', 'careless', 'speedRegression', 'plateau', 'inconsistent'];
  var hit = order.filter(function (k) { return f[k]; });
  return hit.length ? hit.join(', ') : '';
}

/* ---- daily cache (consolidates the old aiCoachV2 / aiInsightsV2) ---- */
async function _getDaily(uid, feature) {
  try {
    var d = await db().collection('aiDaily').doc(uid + '_' + feature + '_' + _dateKey()).get();
    if (d.exists && d.data().envelope) { var env = d.data().envelope; env.meta = env.meta || {}; env.meta.cached = true; return env; }
  } catch (e) { console.warn('[aiBrain] daily cache read failed:', e.message); }
  return null;
}
function _putDaily(uid, feature, env) {
  // expiresAt (epoch ms) bounds the per-day cache so it can't accumulate forever — the doc is only ever read by its
  // exact same-day key, so a 48h buffer comfortably covers same-day reads across timezones. The super-admin cron
  // sweep prunes expired aiDaily docs (mirrors the aiRequests retention pattern; ADR-071).
  db().collection('aiDaily').doc(uid + '_' + feature + '_' + _dateKey())
    .set({ uid: uid, feature: feature, date: _dateKey(), envelope: env, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + 2 * 86400000 })
    .catch(function (e) { console.warn('[aiBrain] daily cache write failed:', e.message); });
}

/* ════════════════════════ AI COACH — daily living dashboard (ADR-050) ════════════════════════ */
async function coachToday(uid, opts) {
  opts = opts || {};
  // ADR-049 + perf: serve the per-day envelope cache FIRST — BEFORE building the (expensive) profile + strategy —
  // so a normal re-open with no new activity returns in ~1 read, with no profile rebuild and no LLM call. The cache
  // is bypassed only when clientStats proves fresh activity (mirrors the profile's rule) or on an explicit refresh.
  if (!opts.force && !opts.clientStats) { var cached = await _getDaily(uid, 'coach'); if (cached) { await aiService.recordAiRequest(uid, { feature: 'coach', status: 'cache_hit', cacheHit: true }); return cached; } }

  var ctx = await ctxEngine.build(uid, { force: !!opts.force, clientStats: opts.clientStats });
  var tier = ctx.tier;                       // ADR-053: from the one profile (no re-derivation)
  var focus = ctx.recommendation;            // the single "what to work on next"
  // ADR-057: Layer 2 — the exam strategy, built FROM the Profile. null when no exam (Coach then reasons from
  // the Profile alone and must never feel "dumber"). Coach is a ROLE reading the shared state, not a producer.
  var strategy = await examStrategy.build(uid, ctx, { clientDate: opts.clientDate });

  // ADR-052: NEVER lock the coach. With little data (tier 0 = 0–5 lifetime) render a deterministic, helpful read
  // of whatever exists — no LLM (controlled copy avoids generic output near zero data), never "I don't know you".
  if (tier === 0) {
    var lowEnv = _coachLowData(ctx, focus, strategy);
    _putDaily(uid, 'coach', lowEnv);
    return lowEnv;
  }

  var contextStr = ctxEngine.serialize(ctx);
  var flagsNote = _flagsNote(ctx);
  var env;
  try {
    var p = prompts.get('coach.daily', { context: contextStr, focusLabel: focus.label,
      planNote: examStrategy.serialize(strategy), brief: examStrategy.coachBrief(strategy), hasPlan: !!strategy, examName: _examOf(ctx), flagsNote: flagsNote });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.recordAiRequest(uid, { feature: _featOf(p.id), promptId: p.id, version: p.version, usage: r.usage, latencyMs: r.latencyMs, model: r.model, attempts: r.attempts });
    env = _coachDashboard(ctx, focus, strategy, r.data, tier, opts, _promptId(p));
    aiService.updateMemory(uid, { timelineEntry: { feature: 'coach', summary: 'Prescribed ' + focus.label + (strategy ? ' (readiness ' + strategy.readinessScore + ')' : '') + '.' } }, 'coach');
    _maybeWriteWin(uid, ctx);
  } catch (e) {
    if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
    env = _coachFallback(ctx, focus, strategy);
  }
  if (!(env.meta && env.meta.fallback)) _putDaily(uid, 'coach', env);
  return env;
}

/* ADR-057 helpers shared by the roles. */
function _band(score) { return score >= 80 ? 'Exam ready' : score >= 60 ? 'On track' : score >= 40 ? 'Building' : 'Early days'; }
/* The next concrete task: a recovery override first (recent analytics conflict with the plan), else the first
   undone task on the projected schedule. Returns null when there's no exam strategy. */
function _nextTask(strategy) {
  if (!strategy) return null;
  if (strategy.recovery && strategy.recovery.topics[0]) {
    var rt = strategy.recovery.topics[0];
    return { label: rt.label, drillable: rt.drillable, kind: 'revise', estMin: 10, reason: 'Recent accuracy slipped here — a short recovery before new work.' };
  }
  var days = (strategy.schedule && strategy.schedule.days) || [];
  for (var i = 0; i < days.length; i++) {
    if (days[i].kind !== 'study') continue;
    var t = (days[i].tasks || []).find(function (x) { return !x.done; });
    if (t) return t;
  }
  return null;
}

/* The warm Coach dashboard. With an exam it renders the strategy (readiness → plan → next move) and REASONS with
   it; without one it stays a rich Profile-only mentor (never "dumber"). The LLM writes only the prose fields. */
function _coachDashboard(ctx, focus, strategy, d, tier, opts, promptId) {
  d = d || {};
  var name = (ctx.name || '').split(' ')[0];
  var blocks = [];
  blocks.push(say(d.greeting || ('Welcome back' + (name ? ', ' + name : '') + '.')));
  if (strategy) {
    var sub = (strategy.daysToExam != null ? strategy.daysToExam + ' days to ' + strategy.examName : _band(strategy.readinessScore));
    blocks.push(ring(strategy.readinessScore, 'Exam readiness', sub));
  }
  // ADR-061: the long-form mentor note — the heart of the coaching (behaviour + analytics + plan, reasoned).
  if (d.mentorNote) blocks.push(card('Your coach', _clip(d.mentorNote, 820), 'blue', '🧭'));
  if (d.biggestWin) blocks.push(celebrate(d.biggestWin));
  if (d.oneWorry) blocks.push(card('One thing I\'m watching', d.oneWorry, 'amber', '👀'));
  if (tier >= 2) {
    // ADR-055: honest, evidence-aware metrics (windowed only with real multi-day history; speed in seconds).
    blocks = blocks.concat(_metricCluster(ctx));
    if (ctx.dailyStreak) blocks.push(metric('Streak', ctx.dailyStreak + 'd', ctx.dailyStreak >= 3 ? 'up' : 'flat', ctx.dailyStreak >= 1));
  }
  if (strategy) {
    var pr = strategy.progress || {};
    if (pr.adherencePct != null) blocks.push(progress('This week\'s plan', pr.adherencePct, pr.adherencePct >= 80 ? 'On track — keep it up' : 'Let\'s close the gap'));
    if (strategy.daysToExam != null) blocks.push(callout(pr.onTrack === false ? 'warn' : 'info',
      strategy.daysToExam + ' days to ' + strategy.examName +
      (pr.bufferDays != null ? (pr.onTrack !== false ? ' — on track, ' + pr.bufferDays + 'd buffer' : ' — ' + Math.abs(pr.bufferDays) + 'd behind, plan rebalanced') : '.')));
  }
  var topTask = _nextTask(strategy);
  if (topTask && topTask.label) {
    blocks.push(missionBlock((topTask.kind === 'revise' ? 'Revise: ' : 'Today: ') + topTask.label, d.todayRecommendation || topTask.reason || 'From your study plan.', topTask.drillable ? 'focus' : 'practice', topTask.drillable || '', topTask.label, topTask.estMin || 10));
  } else {
    blocks.push(missionBlock('Today: drill ' + focus.label, d.todayRecommendation || d.missionWhy || 'Your highest-impact topic right now.', 'focus', focus.cat, focus.label, 8));
  }
  if (d.motivation) blocks.push(say(d.motivation));
  if (opts.force) blocks.push(callout('success', 'Updated from your latest practice.'));

  var drill = (topTask && topTask.drillable) ? { cat: topTask.drillable, label: topTask.label } : { cat: focus.cat, label: focus.label };
  var chips = [
    chipDeep('Start today\'s set', 'focus', drill.cat, drill.label, '⚡'),
    chipReply('Speed or accuracy?', 'coach_speed_accuracy'),
    strategy ? chipReply('Open my planner', 'planner_open_calendar', '🗓️') : chipReply('Set an exam goal', 'planner_open_calendar', '🎯')
  ].concat(helpfulChips());
  return envelope('coach', blocks, chips, { promptId: promptId, focus: focus.cat, tier: tier, hasPlan: !!strategy });
}

/* ADR-052: low-data coach (tier 0 = 0–5 lifetime). Deterministic + genuinely helpful — reads whatever data
   exists and frames it as growth. NEVER a lock: no "I don't know you", no "10 questions to unlock". */
function _coachLowData(ctx, focus, strategy) {
  var name = (ctx.name || '').split(' ')[0];
  var n = (ctx && ctx.totalAttempted) || 0;
  var hi = name ? 'Hey ' + name + ' 👋 ' : 'Hey there 👋 ';
  var blocks = [];
  blocks.push(say(n > 0
    ? hi + 'I\'ve analysed your first ' + n + ' question' + (n === 1 ? '' : 's') + ' — here\'s the early read. The more you practise, the sharper my coaching gets.'
    : hi + 'I don\'t know much about you yet, but that\'s the fun part — every set you do makes my coaching sharper. Here\'s where we\'ll start.'));
  if (strategy && strategy.readinessScore != null) blocks.push(ring(strategy.readinessScore, 'Exam readiness', ''));
  // any real signal we already have
  if (ctx.today && ctx.today.attempted && ctx.today.accuracy != null) {
    blocks.push(metric('Today', Math.round(ctx.today.accuracy * 100) + '% (' + ctx.today.attempted + ' done)', 'flat', ctx.today.accuracy >= 0.6));
  } else if (ctx.accuracy != null && n > 0) {
    blocks.push(metric('So far', Math.round(ctx.accuracy * 100) + '% (' + n + ' done)', 'flat', ctx.accuracy >= 0.6));
  }
  if (focus.cat) {
    blocks.push(missionBlock('Sharpen ' + focus.label, 'Early signal says this is your highest-impact topic to nudge first.', 'focus', focus.cat, focus.label, 8));
  } else {
    blocks.push(missionBlock('Start a mixed set', 'A short, varied set lets me read your pace, accuracy, and first weak spots.', 'practice', '', '', 6));
  }
  blocks.push(say('Every question teaches me something about how you think — let\'s build the picture together.'));
  var chips = [
    focus.cat ? chipDeep('Practise ' + focus.label, 'focus', focus.cat, focus.label, '⚡') : chipDeep('Start a set', 'practice', '', '', '⚡')
  ].concat(helpfulChips());
  return envelope('coach', blocks, chips, { lowData: true, focus: focus.cat, tier: 0 });
}

function _coachFallback(ctx, focus, strategy) {
  var blocks = [say('You\'re ' + Math.round((ctx.accuracy || 0) * 100) + '% accurate over ' + ctx.totalAttempted + ' questions. ' +
    (focus.cat ? 'Tighten up ' + focus.label + ' next — that\'s your biggest lever right now.' : 'Keep your streak alive with a focused set.'))];
  if (strategy && strategy.readinessScore != null) blocks.push(ring(strategy.readinessScore, 'Exam readiness', ''));
  blocks.push(missionBlock('Drill ' + focus.label, 'Targeted practice on your weakest topic.', 'focus', focus.cat, focus.label, 8));
  return envelope('coach', blocks, [chipDeep('Start that set', 'focus', focus.cat, focus.label, '⚡'), chipDismiss('Not today')].concat(helpfulChips()), { fallback: true });
}

/* Populate aiMemory.wins on a genuine improvement so the Coach can show continuity next time (ADR-050). */
function _maybeWriteWin(uid, ctx) {
  try {
    var t = ctx.trends || {}, win = null;
    if (ctx.today && ctx.today.accuracy != null && ctx.today.attempted >= 8 && ctx.today.accuracy >= 0.85) {
      win = Math.round(ctx.today.accuracy * 100) + '% today over ' + ctx.today.attempted + ' questions';
    } else if (t.accuracy && t.accuracy.direction === 'improving' && (t.accuracy.delta || 0) >= 0.05) {
      win = 'Accuracy up ' + Math.round(t.accuracy.delta * 100) + '% this week';
    } else {
      var strong = (ctx.mastery || []).find(function (m) { return m.tier === 'strong'; });
      if (strong && (ctx.dailyStreak || 0) >= 5) win = strong.label + ' is now a strong topic';
    }
    if (win) aiService.updateMemory(uid, { addWin: win }, 'coach');
  } catch (_) {}
}

/* ════════════════════════ AI INSIGHTS — an analyst, not a report (ADR-050) ════════════════════════ */
/* Deterministic pattern detection from the behavioural flags + error patterns + trends that ctx already
   computes but were never surfaced. Each pattern is a card; the dashboard pairs them with an action. */
function _detectPatterns(ctx) {
  var f = ctx.flags || {}, t = ctx.trends || {}, out = [];
  if (f.careless) out.push({ title: 'Careless slips', body: 'You\'re missing questions in topics you\'ve already mastered — slow down on the ones you know.', accent: 'amber', icon: '⚠️' });
  if (f.speedRegression && t.speed && t.speed.recentSecPerQ != null && t.speed.baselineSecPerQ != null) out.push({ title: 'You\'re slowing down', body: 'Your pace drifted to ' + t.speed.recentSecPerQ.toFixed(1) + 's/Q from ' + t.speed.baselineSecPerQ.toFixed(1) + 's/Q — let\'s do speed reps.', accent: 'rose', icon: '🐢' });
  if (f.plateau) out.push({ title: 'You\'ve plateaued', body: 'Your accuracy has held flat for a month — time to raise the difficulty and break through.', accent: 'slate', icon: '➖' });
  if (f.inconsistent && t.consistency) out.push({ title: 'Practice is sporadic', body: 'Only ' + t.consistency.activeDaysLast14 + '/14 active days — you improve fastest with a steady streak.', accent: 'amber', icon: '📅' });
  if (f.burnout) out.push({ title: 'Rebuild your momentum', body: 'A break plus a dip in accuracy — ease back in on a topic you already know well.', accent: 'blue', icon: '🌱' });
  if ((t.sessionImprovementPct || 0) >= 5) out.push({ title: 'You warm up well', body: 'You get ~' + Math.round(t.sessionImprovementPct) + '% faster within a session — longer sets really pay off for you.', accent: 'green', icon: '🔥' });
  return out.slice(0, 3);
}

async function insights(uid, opts) {
  opts = opts || {};
  // ADR-049 + perf: serve the per-day envelope cache FIRST (see coachToday) — a re-open with no new activity is
  // ~1 read, no profile rebuild, no LLM. Bypassed only when clientStats proves activity or on an explicit refresh.
  if (!opts.force && !opts.clientStats) { var cached = await _getDaily(uid, 'insights'); if (cached) { await aiService.recordAiRequest(uid, { feature: 'insights', status: 'cache_hit', cacheHit: true }); return cached; } }

  var ctx = await ctxEngine.build(uid, { force: !!opts.force, clientStats: opts.clientStats });
  var tier = ctx.tier;                       // ADR-053: from the one profile
  var strategy = await examStrategy.build(uid, ctx, { clientDate: opts.clientDate });   // ADR-057: Layer 2 (null = no exam)

  // ADR-052: never lock Insights. With little data render a deterministic early read (no LLM), never "practice to unlock".
  if (tier === 0) {
    var lowIns = _insightsLowData(ctx);
    _putDaily(uid, 'insights', lowIns);
    return lowIns;
  }

  var weak = ctxEngine.topWeakCategory(ctx) || { cat: '', label: 'mixed practice' };
  var flagsNote = _flagsNote(ctx);
  var env;
  try {
    var topDiscovery = (strategy && strategy.discoveries && strategy.discoveries[0]) ? strategy.discoveries[0].text : '';
    var p = prompts.get('insights.analyze', { context: ctxEngine.serialize(ctx), weakLabel: weak.label, examName: _examOf(ctx), planNote: examStrategy.serialize(strategy), discovery: topDiscovery, hasPlan: !!strategy, flagsNote: flagsNote });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.recordAiRequest(uid, { feature: _featOf(p.id), promptId: p.id, version: p.version, usage: r.usage, latencyMs: r.latencyMs, model: r.model, attempts: r.attempts });
    env = _insightsDashboard(ctx, weak, strategy, r.data, tier, opts, _promptId(p));
    var weakCats0 = (ctx.mastery || []).filter(function (m) { return m.tier === 'weak'; }).slice(0, 2);
    aiService.updateMemory(uid, { addWeakConcepts: weakCats0.map(function (m) { return m.cat; }), timelineEntry: { feature: 'insights', summary: 'Flagged ' + weak.label + ' as top weakness.' } }, 'insights');
  } catch (e) {
    if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
    env = _insightsFallback(ctx, weak);
  }
  if (!(env.meta && env.meta.fallback)) _putDaily(uid, 'insights', env);
  return env;
}

/* ADR-055: honest metrics — windowed "7d" stats ONLY with real multi-day history; otherwise today's numbers,
   labelled as today. Speed is SECONDS/Q (never /1000 → 0.0). Never fabricates a window that doesn't exist. */
function _metricCluster(ctx) {
  var t = ctx.trends || {}, td = ctx.today || {}, multi = !!(ctx.evidence && ctx.evidence.hasMultiDayHistory), b = [];
  if (multi && t.accuracy && t.accuracy.d7 != null && t.accuracy.direction) {
    b.push(metric('Accuracy (7d)', Math.round(t.accuracy.d7 * 100) + '%', t.accuracy.direction === 'improving' ? 'up' : (t.accuracy.direction === 'declining' ? 'down' : 'flat'), t.accuracy.direction !== 'declining'));
  } else if (td.accuracy != null) {
    b.push(metric('Accuracy today', Math.round(td.accuracy * 100) + '%', 'flat', td.accuracy >= 0.6));
  } else if (ctx.accuracy != null) {
    b.push(metric('Accuracy', Math.round(ctx.accuracy * 100) + '%', 'flat', ctx.accuracy >= 0.6));
  }
  if (multi && t.speed && t.speed.recentSecPerQ != null && t.speed.direction) {
    b.push(metric('Speed', t.speed.recentSecPerQ.toFixed(1) + 's/Q', t.speed.direction === 'faster' ? 'up' : (t.speed.direction === 'slower' ? 'down' : 'flat'), t.speed.direction !== 'slower'));
  } else if (td.avgSecPerQ != null) {
    b.push(metric('Speed today', td.avgSecPerQ.toFixed(1) + 's/Q', 'flat', true));
  }
  if (multi && t.consistency) b.push(metric('Consistency', t.consistency.activeDaysLast14 + '/14 days', t.consistency.streakHealth === 'strong' ? 'up' : (t.consistency.streakHealth === 'broken' ? 'down' : 'flat'), t.consistency.streakHealth !== 'broken'));
  return b;
}

function _insightsDashboard(ctx, weak, strategy, d, tier, opts, promptId) {
  d = d || {};
  var patterns = _detectPatterns(ctx);
  var blocks = [];
  blocks.push(say(d.patternsIntro || 'Here\'s what your data is really saying.'));
  // ADR-062: lead with DISCOVERIES (relationships the student wouldn't spot). The LLM phrases the top one
  // (headline); the rest render as deterministic supporting cards. Insights ≠ a restatement of the planner.
  var discoveries = (strategy && strategy.discoveries) || [];
  if (d.headline) blocks.push(card('The big discovery', d.headline, 'blue', '💡'));
  else if (discoveries[0]) blocks.push(card('The big discovery', discoveries[0].text, 'blue', '💡'));
  discoveries.slice(1).forEach(function (disc) { blocks.push(card('Worth knowing', disc.text, 'slate', '🔎')); });
  blocks = blocks.concat(_metricCluster(ctx));
  if (opts.force) blocks.push(callout('success', 'Updated from your latest practice.'));
  patterns.forEach(function (pt) { blocks.push(card(pt.title, pt.body, pt.accent, pt.icon)); });
  blocks.push(card('Your biggest weakness', d.weaknessInsight || ('Tighten up ' + weak.label + ' — it\'s your highest-impact fix.'), 'rose', '🎯'));
  // ADR-057: Insights REASONS with the strategy (when an exam exists) — adherence, recovery override, forecast.
  if (strategy) {
    var pr = strategy.progress || {}, fc = pr.forecast;
    if (pr.adherencePct != null && pr.adherencePct < 60) blocks.push(callout('warn', 'You\'ve done ' + pr.adherencePct + '% of your planned work lately — the plan only helps if you run it.'));
    if (strategy.recovery) blocks.push(card('Plan vs. your data', 'Your plan moves on, but recent accuracy slipped on ' + strategy.recovery.topics.map(function (x) { return x.label; }).join(', ') + ' — do a short recovery set first.', 'amber', '🔁'));
    if (fc && fc.daysToExam != null) {
      if (fc.onTrack !== false && (fc.bufferDays || 0) > 0) blocks.push(callout('success', 'At this pace you\'ll be exam-ready ' + fc.bufferDays + ' days early.'));
      else if (fc.onTrack === false) blocks.push(callout('warn', 'You\'re ' + Math.abs(fc.bufferDays || 0) + ' days behind' + (fc.ifPlusMinutes && fc.ifPlusMinutes.daysSaved ? ' — +15 min/day claws back ' + fc.ifPlusMinutes.daysSaved + '.' : '.')));
      else if (fc.ifPlusMinutes && fc.ifPlusMinutes.daysSaved > 0) blocks.push(callout('info', '+15 min/day → finish ' + fc.ifPlusMinutes.daysSaved + ' days sooner.'));
    }
    // ADR-061 (M5): the analyst's evidence-backed reads — forecast confidence, opportunity cost, dependency
    // bottleneck, revision debt. All deterministic numbers (the prose comes from the LLM; figures never hallucinated).
    var conf = (ctx.evidence && ctx.evidence.confidence) || 'early';
    if (strategy.projectedScore != null) blocks.push(callout('info', 'Forecast: on the optimal path you reach ~' + strategy.projectedScore + '/100 (target ' + strategy.targetScore + ') — ' + (strategy.achievable ? 'achievable' : 'short for now') + '. Confidence: ' + conf + '.'));
    if (strategy.marksAtRisk > 0 && strategy.skip && strategy.skip.length) blocks.push(card('Opportunity cost', 'Parking ' + strategy.skip.slice(0, 2).map(function (t) { return t.label; }).join(' & ') + ' leaves about +' + strategy.marksAtRisk + ' readiness points unclaimed. If you free up time, ' + strategy.skip[0].label + ' is the highest-value add-back.', 'amber', '💰'));
    // de-dup: suppress ADR-061 cards already covered by a discovery above (leverage↔bottleneck, momentum↔stale).
    var dk = {}; ((strategy.discoveries) || []).forEach(function (x) { dk[x.kind] = 1; });
    var bottleneck = dk.leverage ? null : (strategy.topics || []).filter(function (t) { return t.readiness < 0.4 && (t.unlocks || []).length >= 2; }).sort(function (a, b) { return (b.unlocks.length) - (a.unlocks.length); })[0];
    if (bottleneck) blocks.push(card('Dependency bottleneck', bottleneck.label + ' is weak but unlocks ' + bottleneck.unlocks.slice(0, 3).join(', ') + ' — clearing it lifts several downstream topics at once.', 'blue', '🔓'));
    if (pr.revisionDue && pr.revisionDue.length >= 2) blocks.push(card('Revision debt', pr.revisionDue.length + ' topics are past their revision date — retention decays fastest right after you learn, so this is quietly costing you earned marks.', 'rose', '📉'));
    if (!dk.momentum && strategy.behaviour && strategy.behaviour.stale && strategy.behaviour.stale.length) { var st = strategy.behaviour.stale[0]; blocks.push(card('Going stale', 'You haven\'t touched ' + st.label + ' in ' + st.days + ' days — a 15-minute brush-up now beats relearning it later.', 'slate', '🧊')); }
  }
  // every insight leads to an action
  var weakCats = (ctx.mastery || []).filter(function (m) { return m.tier === 'weak'; }).slice(0, 2);
  weakCats.forEach(function (m) { blocks.push(missionBlock('Fix ' + m.label, Math.round(m.acc * 100) + '% accuracy — high-impact to improve.', 'focus', m.cat, m.label, 8)); });
  if (!weakCats.length && weak.cat) blocks.push(missionBlock('Sharpen ' + weak.label, 'Your highest-impact topic to push next.', 'focus', weak.cat, weak.label, 8));

  var chips = weakCats.map(function (m) { return chipDeep('Fix ' + m.label, 'focus', m.cat, m.label, '⚡'); });
  if (!chips.length && weak.cat) chips.push(chipDeep('Practice ' + weak.label, 'focus', weak.cat, weak.label, '⚡'));
  chips.push(chipReply(d.nextStepLabel || 'What first?', 'insights_why'));
  chips.push(chipReply('Open my planner', 'planner_open_calendar', '🗓️'));
  chips = chips.concat(helpfulChips());
  return envelope('insights', blocks, chips, { promptId: promptId, tier: tier });
}

/* ADR-052: low-data Insights (tier 0). A real early read from whatever exists — never "practice to unlock". */
function _insightsLowData(ctx) {
  var n = (ctx && ctx.totalAttempted) || 0;
  var weak = ctxEngine.topWeakCategory(ctx);   // null until a category has ≥3 attempts
  var blocks = [];
  blocks.push(say(n > 0
    ? 'Early read from your first ' + n + ' question' + (n === 1 ? '' : 's') + ': the picture sharpens with every set — here\'s what I can already see.'
    : 'I haven\'t seen you solve yet, so here\'s how this works: every question feeds your accuracy, speed, and topic patterns — and I\'ll surface them the moment they appear.'));
  if (ctx.today && ctx.today.attempted && ctx.today.accuracy != null) {
    blocks.push(metric('Today', Math.round(ctx.today.accuracy * 100) + '% (' + ctx.today.attempted + ' done)', 'flat', ctx.today.accuracy >= 0.6));
  } else if (ctx.accuracy != null && n > 0) {
    blocks.push(metric('Accuracy so far', Math.round(ctx.accuracy * 100) + '% (' + n + ' done)', 'flat', ctx.accuracy >= 0.6));
  }
  if (weak && weak.cat) {
    blocks.push(card('First pattern', 'Your early numbers point to ' + weak.label + ' as the topic to tighten first.', 'rose', '🎯'));
    blocks.push(missionBlock('Fix ' + weak.label, 'Your highest-impact topic on the data so far.', 'focus', weak.cat, weak.label, 8));
  } else {
    blocks.push(missionBlock('Run a mixed set', 'A short, varied set is all I need to surface your first real patterns.', 'practice', '', '', 6));
  }
  var chips = [
    (weak && weak.cat) ? chipDeep('Fix ' + weak.label, 'focus', weak.cat, weak.label, '⚡') : chipDeep('Start a set', 'practice', '', '', '⚡')
  ].concat(helpfulChips());
  return envelope('insights', blocks, chips, { lowData: true, tier: 0 });
}

function _insightsFallback(ctx, weak) {
  var blocks = [say('Here\'s where you stand. Your highest-impact move is tightening up ' + weak.label + '.')].concat(_metricCluster(ctx));
  blocks.push(missionBlock('Fix ' + weak.label, 'Your weakest topic by accuracy.', 'focus', weak.cat, weak.label, 8));
  return envelope('insights', blocks, [chipDeep('Fix ' + weak.label, 'focus', weak.cat, weak.label, '⚡')].concat(helpfulChips()), { fallback: true });
}

/* ════════════════════════ AI EXPLAIN — a premium learning document (ADR-051) ════════════════════════ */
/* Every explanation is a teaching document, not a one-liner: concept → solution → common mistakes → shortcut →
   how it shows up in YOUR exam → your mastery here → the recommended next step. The question-specific prose
   (concept/steps/mistakes/shortcut) is shared-cached per question; the per-student sections (exam insight,
   mastery, next step) are layered on deterministically from the SAME canonical mastery the other features use. */
async function explainBase(question, answer, category, uid) {
  var catLabel = ctxEngine.label(category) || 'General Math';
  // Cache key is namespaced by the prompt version so a prompt bump busts the shared cache instead of
  // serving an explanation generated by an older, off-voice prompt forever (trust/consistency, ADR-045).
  var explainVersion = prompts.REGISTRY['explain.base'].version;
  var hash = _hash(String(question) + ':' + String(answer));
  var cacheRef = db().collection('explanations').doc(hash + '_v' + explainVersion);

  // ADR-053: Explanation consumes the ONE canonical profile like every other feature (cached; no bespoke read),
  // so its mastery + recent mistakes + exam + plan are the SAME the Coach sees — truly personal, never divergent.
  var ctx = await ctxEngine.build(uid);
  var mem = (ctx && ctx.memory) || {};
  var mastery = (ctx.masteryByCat && ctx.masteryByCat[category]) || null;
  var recentMistake = !!(ctx.errorPatterns && (ctx.errorPatterns.recentMistakeCats || []).indexOf(category) >= 0);
  var struggledHint = recentMistake
    || (Array.isArray(mem.recentTopicsExplained) && mem.recentTopicsExplained.indexOf(category) >= 0)
    || (Array.isArray(mem.knownWeakConcepts) && mem.knownWeakConcepts.indexOf(category) >= 0)
    || (mastery && mastery.tier === 'weak');

  var promptId = 'explain.base@' + explainVersion;
  var usedModel = null;   // ADR-097: the model that generated THIS explanation — surfaced in meta so a report can capture it
  var pieces = null;
  try {
    var cached = await cacheRef.get();
    if (cached.exists) { var c = cached.data(); pieces = { concept: c.concept, steps: c.steps, mistakes: c.mistakes, shortcut: c.shortcut }; usedModel = c.model || null; cacheRef.update({ usageCount: (c.usageCount || 0) + 1 }).catch(function () {}); await aiService.recordAiRequest(uid, { feature: 'explain', status: 'cache_hit', cacheHit: true }); }
  } catch (e) { console.warn('[aiBrain] explain cache read failed:', e.message); }

  if (!pieces) {
    var depth = mem.preferredDepth || 'standard';   // ADR-045: honor the depth the student asked for via Simpler/Deeper
    // ADR-062: ground the explanation in the canonical KB topic — feed the REAL common mistakes (don't invent),
    // the prerequisite it builds on, and whether the pattern rewards heavy drilling.
    var kbTopic = SYL.getTopicForCat ? SYL.getTopicForCat(category) : null;
    var knownMistakes = (kbTopic && (kbTopic.commonMistakes || []).slice(0, 3).join('; ')) || '';
    var prereqLabel = '';
    if (kbTopic && kbTopic.prereqs && kbTopic.prereqs.length) { var pq = SYL.getCanonicalTopic(kbTopic.prereqs[0]); prereqLabel = pq ? pq.label : ''; }
    var heavyPractice = !!(kbTopic && kbTopic.practiceIntensity === 'high');
    try {
      var p = prompts.get('explain.base', { question: llm.wrapData(question, 400), answer: String(answer).slice(0, 50), catLabel: catLabel, depth: depth, struggledBefore: !!struggledHint, examName: mem.examName || '', knownMistakes: knownMistakes, prereqLabel: prereqLabel, heavyPractice: heavyPractice });
      promptId = _promptId(p);
      var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature, validate: p.validate });
      aiService.recordAiRequest(uid, { feature: _featOf(p.id), promptId: p.id, version: p.version, usage: r.usage, latencyMs: r.latencyMs, model: r.model, attempts: r.attempts });
      usedModel = r.model || null;
      pieces = r.data;
      cacheRef.set({ questionId: hash, promptVersion: explainVersion, question: String(question), answer: String(answer), category: category || '', concept: pieces.concept, steps: pieces.steps, mistakes: pieces.mistakes, shortcut: pieces.shortcut, model: r.model || null, usageCount: 1, createdAt: admin.firestore.FieldValue.serverTimestamp() }).catch(function (e) { console.warn('[aiBrain] explain cache write failed:', e.message); });
    } catch (e) {
      if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
      return envelope('explain', [say('I couldn\'t generate a full explanation just now.'), callout('warn', 'The correct answer is ' + answer + '. Tap retry to try again.')],
        [chipReply('Retry', 'explain_retry'), chipDeep('Drill this topic', 'focus', category, catLabel, '⚡')], { fallback: true });
    }
  }

  aiService.updateMemory(uid, { addExplainedTopic: category, timelineEntry: { feature: 'explain', summary: 'Explained a ' + catLabel + ' question.' } }, 'explain');

  // ── assemble the learning document ──
  var blocks = [say(pieces.concept), steps(pieces.steps, 'Step-by-step solution')];
  // Common mistakes (always visible), personalized when this is a live weak spot.
  var mistakes = Array.isArray(pieces.mistakes) ? pieces.mistakes.filter(Boolean) : (pieces.mistakes ? [String(pieces.mistakes)] : []);
  if (mistakes.length) {
    var lead = struggledHint ? 'You\'ve slipped here before — watch these:\n' : '';
    blocks.push(card('Common mistakes', lead + '• ' + mistakes.slice(0, 3).join('\n• '), 'amber', '⚠️'));
  }
  // Faster method (always visible).
  if (pieces.shortcut) blocks.push(card('Faster method', pieces.shortcut, 'blue', '⚡'));
  // Exam insight (always visible when the exam is known) — deterministic from the syllabus.
  var exam = _examInsight(category, mem.examName);
  if (exam) blocks.push(card('In ' + exam.examName, exam.text, 'slate', '🎯'));
  // Mastery status (always visible when there's real data) — the canonical number, never invented.
  if (mastery) {
    blocks.push(metric('Your ' + catLabel + ' accuracy', Math.round(mastery.acc * 100) + '% (' + mastery.n + ' done)',
      mastery.tier === 'strong' ? 'up' : (mastery.tier === 'weak' ? 'down' : 'flat'), mastery.tier !== 'weak'));
  }
  // Recommended next step (always visible) — from the mastery tier; reuses the focus-drill deep link.
  var nextNote, nextTitle, nextWhy, nextMin;
  if (!mastery || mastery.tier === 'weak') {
    nextNote = mastery ? 'This is one of your focus areas — let\'s turn it around.' : 'Let\'s build a base here.';
    nextTitle = 'Drill ' + catLabel + ' now'; nextWhy = 'A focused set is the fastest way to fix this.'; nextMin = 8;
  } else if (mastery.tier === 'strong') {
    nextNote = struggledHint ? 'You\'re strong here — that looks like a slip, not a gap.' : 'You\'ve got this topic down.';
    nextTitle = 'Quick 5 to keep it sharp'; nextWhy = 'A short set locks in a topic you already own.'; nextMin = 5;
  } else {
    nextNote = 'You\'re developing this well — keep the momentum.';
    nextTitle = 'Add ' + catLabel + ' to today\'s practice'; nextWhy = 'A bit more reps moves this into a strength.'; nextMin = 6;
  }
  blocks.push(callout('info', nextNote));
  blocks.push(missionBlock(nextTitle, nextWhy, 'focus', category, catLabel, nextMin));

  return envelope('explain', blocks, [
    chipReply('Got it ✓', 'helpful_yes'),
    chipReply('Simpler', 'explain_simpler'),
    chipReply('Go deeper', 'explain_deeper'),
    chipReply('Another like this', 'explain_another'),
    chipDrill('Drill this', category, catLabel, '⚡')
  ], { promptId: promptId, topic: category, question: String(question).slice(0, 300), answer: String(answer).slice(0, 50), model: usedModel, provider: 'openai' });
}

/* ════════════════════════ Conversational turn (explain follow-ups + generic) ════════════════════════ */
async function chatTurn(uid, body) {
  var feature = body.feature || 'chat';
  var topic = body.topic || '';
  var catLabel = ctxEngine.label(topic) || 'this topic';
  var userTurn = String(body.userTurn || '').slice(0, 400);

  // depth nudges + helpful acks handled WITHOUT an LLM call
  if (userTurn === 'helpful_yes' || userTurn === 'helpful_no') {
    if (userTurn === 'helpful_no') aiService.updateMemory(uid, { preferredDepth: 'deep' }, 'feedback');
    var ackChip = feature === 'explain' ? chipDrill('Drill ' + catLabel, topic, catLabel, '⚡') : chipDeep('Drill ' + catLabel, 'focus', topic, catLabel, '⚡');
    return envelope(feature, [say(userTurn === 'helpful_yes' ? 'Great — keep that momentum.' : 'Got it, I\'ll go more thorough next time.')], [ackChip], { ack: true });
  }
  if (userTurn === 'explain_simpler') aiService.updateMemory(uid, { preferredDepth: 'concise' }, 'feedback');
  if (userTurn === 'explain_deeper') aiService.updateMemory(uid, { preferredDepth: 'deep' }, 'feedback');

  var hint = userTurn === 'explain_simpler' ? 'Re-explain this SAME question much more simply, in 2-3 big steps.'
    : userTurn === 'explain_deeper' ? 'Explain this SAME question more deeply, with the reasoning behind each step.'
    : userTurn === 'explain_another' ? 'Give one fresh worked example of the SAME concept and difficulty as this question (new numbers, same idea — do NOT change the shape/topic).'
    : userTurn === 'drill_result' ? (String(body.drill || '').slice(0, 400) || 'The student just finished a quick drill on this concept. React in one short, specific line and give the single best next step.')
    : userTurn.indexOf('coach_followup:') === 0 ? userTurn.slice(15)
    : userTurn === 'coach_speed_accuracy' ? 'Given this student\'s data, should they prioritise SPEED or ACCURACY today? Pick one, say why in one line, and name the single best drill to do it.'
    : userTurn.indexOf('insights_why') === 0 ? 'Explain in plain terms why this is the student\'s weakness and the single best fix.'
    : userTurn;

  // ADR-051: floor with the live local stats so a conversational coach turn ("Speed or accuracy?") and chat
  // reason from the SAME fresh "today" the Coach dashboard shows — never a staler number.
  var ctx = await ctxEngine.build(uid, { clientStats: body.clientStats });

  // EXPLAIN FOLLOW-UPS (ADR-045): anchor to the EXACT question + the prior explanation the client carries forward,
  // so "Simpler / Go deeper / Another" deepen THIS problem instead of drifting to the student's weak topic.
  var anchorQ = String(body.question || '').slice(0, 500);
  if (feature === 'explain' && anchorQ) {
    try {
      var pf = prompts.get('explain.followup', {
        question: llm.wrapData(anchorQ, 500),
        lastExplanation: llm.wrapData(String(body.lastExplanation || '').slice(0, 900), 900),
        userTurn: llm.wrapData(hint, 400), examName: _examOf(ctx)
      });
      var rf = await llm.complete({ system: pf.system, user: pf.user, schema: pf.schema, schemaName: pf.schemaName, maxTokens: pf.maxTokens, temperature: pf.temperature });
      aiService.recordAiRequest(uid, { feature: 'explain', promptId: pf.id, version: pf.version, usage: rf.usage, latencyMs: rf.latencyMs, model: rf.model, attempts: rf.attempts });
      var df = rf.data;
      var fb = [say(df.say)];
      if (Array.isArray(df.steps) && df.steps.length) fb.push(steps(df.steps));
      return envelope('explain', fb, [
        chipReply('Got it ✓', 'helpful_yes'), chipReply('Simpler', 'explain_simpler'),
        chipReply('Go deeper', 'explain_deeper'), chipReply('Another like this', 'explain_another'),
        chipDrill('Drill this', topic, catLabel, '⚡')
      ], { promptId: _promptId(pf), topic: topic });
    } catch (e) {
      if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
      return envelope('explain', [callout('warn', 'I couldn\'t expand on that just now — try again in a moment.')], [chipReply('Retry', userTurn)], { fallback: true });
    }
  }

  var history = Array.isArray(body.history) ? body.history.slice(-6).map(function (h) { return (h.role === 'user' ? 'Student: ' : 'You: ') + String(h.content || '').slice(0, 200); }).join('\n') : '';
  try {
    var p = prompts.get('chat.turn', { topic: catLabel, context: ctxEngine.serialize(ctx, 700), history: llm.wrapData(history, 900), userTurn: llm.wrapData(hint, 400), examName: _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.recordAiRequest(uid, { feature: _featOf(p.id), promptId: p.id, version: p.version, usage: r.usage, latencyMs: r.latencyMs, model: r.model, attempts: r.attempts });
    var d = r.data;
    var blocks = [say(d.say)];
    if (Array.isArray(d.steps) && d.steps.length) blocks.push(steps(d.steps));
    var chips = (feature === 'explain')
      ? [chipReply('Got it ✓', 'helpful_yes'), chipReply('Another', 'explain_another'), chipDrill('Drill this', topic, catLabel, '⚡')]
      : [chipReply('Got it ✓', 'helpful_yes')];
    return envelope(feature, blocks, chips, { promptId: _promptId(p), topic: topic });
  } catch (e) {
    if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
    return envelope(feature, [callout('warn', 'I couldn\'t answer that just now — try again in a moment.')], [chipReply('Retry', userTurn)], { fallback: true });
  }
}

/* ════════════════════════ QuanAI STUDY PLANNER — the single authoritative planner (ADR-046/047) ════════════════════════
   A deterministic engine (plannerEngine + readiness + signals) schedules the next 14 days day-by-day from the
   real exam syllabus + the student's analytics; the LLM only narrates. Stored at aiPlanner/{uid} (v2). This is
   the ONLY planner — the legacy one-shot Mission (aiMissions/planLogic) was removed in ADR-047. */
var _todayIso = aiMath.todayIso;
var _clamp = aiMath.clamp;
function _daysRemaining(examDate) {
  if (!examDate) return 90;
  var t = Date.parse(examDate + 'T00:00:00Z');
  return isNaN(t) ? 90 : Math.max(1, Math.ceil((t - Date.now()) / 86400000));
}
/** Estimate the student's real recent pace (min/day) so the forecast can project from behaviour, not just the plan. */
function _recentDailyMinutes(ctx) {
  var t = ctx && ctx.trends;
  if (!t || !t.speed || t.speed.recentSecPerQ == null || !t.consistency) return null;
  var active = Math.max(1, t.consistency.activeDaysLast14 || 0);
  var q7 = (ctx.today && ctx.today.attempted) ? ctx.today.attempted * Math.min(active, 7) : null; // rough
  if (!q7) return null;
  return Math.round((q7 / 7) * (t.speed.recentSecPerQ / 60));   // ADR-055: seconds → minutes
}
function _mergeTopicState(base, patch) {
  var out = Object.assign({}, base || {});
  Object.keys(patch || {}).forEach(function (id) { out[id] = Object.assign({}, out[id] || {}, patch[id]); });
  return out;
}
function _blockStats(doc) {
  var scheduled = 0, completed = 0, revDue = 0, revOnTime = 0;
  ((doc.block && doc.block.days) || []).forEach(function (d) {
    (d.tasks || []).forEach(function (t) {
      scheduled++; if (t.done) completed++;
      if (t.kind === 'revise') { revDue++; if (t.done) revOnTime++; }
    });
  });
  return { scheduledTasks: scheduled, completedTasks: completed, revisionsDue: revDue, revisionsOnTime: revOnTime,
    adherencePct: scheduled ? Math.round(completed / scheduled * 100) : 0 };
}

async function plannerGetDoc(uid) {
  try { var d = await db().collection('aiPlanner').doc(uid).get(); if (d.exists) return d.data(); }
  catch (e) { console.warn('[aiBrain] plannerGetDoc failed:', e.message); }
  return null;
}

/** Persist a planner update, AWAITING the write so the client is never told "saved" on a failed write
 *  (ADR-048: prevents silent loss of a checked task on a flaky connection). Returns true on success. */
async function _writePlanner(uid, data) {
  try { await db().collection('aiPlanner').doc(uid).set(data, { merge: true }); return true; }
  catch (e) { console.warn('[aiBrain] planner write failed:', e.message); return false; }
}

/** Start Over: a fully destructive planner reset. Deletes the persisted plan (schedule, exam config, setup answers,
 *  topic coverage, block history) and clears ONLY the mirrored exam-config fields from aiMemory (examName/examDate/
 *  goal/dailyMinutes) so Coach/Insights stop reasoning about a now-deleted exam (they degrade to exam-agnostic by
 *  design — ADR-057). Practice stats and the durable learning memory (wins/timeline/preferredDepth/knownWeakConcepts/
 *  recentTopicsExplained) are deliberately preserved. Best-effort: never throws into the caller. */
async function plannerReset(uid) {
  if (!uid) return { ok: false };
  var ok = true;
  try { await db().collection('aiPlanner').doc(uid).delete(); }
  catch (e) { console.warn('[aiBrain] planner reset (delete) failed:', e.message); ok = false; }
  // Fail fast: if the plan wasn't deleted, do NOT clear the exam-config mirror — that would leave Coach/Insights
  // exam-blind while the plan still exists. Report failure so the client can cleanly retry (nothing changed).
  if (!ok) return { ok: false };
  // Clear the exam-config mirror so QuanAI stops referencing the deleted plan; learning memory is untouched.
  try {
    await aiService.updateMemory(uid, { examName: '', examDate: '', goal: '', dailyMinutes: 0,
      timelineEntry: { feature: 'planner', summary: 'Reset the study planner.' } }, 'system');
  } catch (e) { console.warn('[aiBrain] planner reset (memory) failed:', e.message); }
  return { ok: ok };
}

async function plannerGet(uid, opts) {
  opts = opts || {};
  var doc = await plannerGetDoc(uid);
  if (!doc) return { plan: null };
  // ADR-051: floor the (debounced, stale) server stats with the live local snapshot — same as setup/toggle/regen —
  // so the on-load forecast/readiness/Smart-Catch-up reflect a session finished moments ago (the client sends it).
  var ctx = await ctxEngine.build(uid, { clientStats: opts.clientStats });

  // Auto Smart Catch-up on load: if past study/buffer days were fully missed, rebalance their tasks into the
  // remaining days and recompute the forecast — so a student who skipped never opens to a stale, broken plan.
  if (doc.block && doc.block.days) {
    var today = opts.clientDate || _todayIso();   // ADR-049: LOCAL date
    var needsRebalance = doc.block.days.some(function (d) {
      return d.date < today && (d.kind === 'study' || d.kind === 'buffer') && (d.tasks || []).length && (d.tasks || []).every(function (t) { return !t.done; });
    });
    if (needsRebalance) {
      var syllabus = SYL.getSyllabus(doc.syllabusId) || SYL.resolveSyllabus(doc.examId);
      doc.block.days = plannerEngine.rebalanceMissed(doc.block.days, today, doc.dailyMinutes);
      doc.forecast = readinessLib.completionForecast(syllabus, doc.topicState, {
        dailyMinutes: doc.dailyMinutes, daysPerWeek: doc.daysPerWeek, examDate: doc.examDate, recentDailyMinutes: _recentDailyMinutes(ctx)
      });
      doc.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      // Await so a concurrent toggle can't clobber the rebalance with a stale pre-rebalance write.
      await _writePlanner(uid, { block: doc.block, forecast: doc.forecast, updatedAt: doc.updatedAt });
    }
  }
  // ADR-057: re-derive the live strategy (milestones/readiness/projection/recovery) over current progress so the
  // dashboard is always current. The persisted block (with completion state) remains the schedule.
  var liveStrategy = examStrategy.assemble(ctx, doc, { clientDate: opts.clientDate });
  if (liveStrategy) {
    doc.strategy = _persistStrategy(liveStrategy);
    doc.readiness = { score: liveStrategy.readinessScore, band: _bandKey(liveStrategy.readinessScore) };
    doc.forecast = liveStrategy.progress.forecast;
  }
  return { plan: doc, envelope: _plannerEnvelope(ctx, doc, null, opts.clientDate) };
}

/** Ask the LLM to narrate a block the engine already built. Cold-start / failure → deterministic copy. */
async function _narratePlan(uid, ctx, seed) {
  var fallback = {
    rationale: 'This block focuses on ' + (seed.focusTopics || []).slice(0, 3).map(function (f) { return f.label; }).join(', ')
      + ' — your highest-impact topics right now, ordered so each builds on the last.',
    encouragement: seed.onTrack === false
      ? "You're a little behind — I've added a recovery day so the plan still lands before your exam."
      : 'Stay consistent and you\'re on track. Readiness ' + seed.readinessScore + '/100 and climbing.'
  };
  if (ctxEngine.isColdStart(ctx)) return fallback;
  try {
    var p = prompts.get('planner.narrate', { seed: llm.wrapData(JSON.stringify(seed), 700), examName: seed.examName || _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.recordAiRequest(uid, { feature: _featOf(p.id), promptId: p.id, version: p.version, usage: r.usage, latencyMs: r.latencyMs, model: r.model, attempts: r.attempts });
    return { rationale: r.data.rationale || fallback.rationale, encouragement: r.data.encouragement || fallback.encouragement };
  } catch (e) {
    if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
    return fallback;
  }
}

/* ADR-057: readiness band from the 0..100 score (mirrors examStrategy._band). */
function _bandKey(score) { return score >= 80 ? 'exam-ready' : score >= 60 ? 'on-track' : score >= 40 ? 'building' : 'early'; }
/* A persistable, UI-ready subset of the strategy (the heavy roadmap lives in the block; topic detail in milestones). */
function _persistStrategy(s) {
  if (!s) return null;
  return {
    readinessScore: s.readinessScore, readinessBreakdown: s.readinessBreakdown, projectedScore: s.projectedScore, achievable: s.achievable, marksAtRisk: s.marksAtRisk,
    daysToExam: s.daysToExam, targetScore: s.targetScore, verdict: s.verdict, workload: s.workload,
    examName: s.examName, examDate: s.examDate, totalHours: s.totalHours, plannedHours: s.plannedHours,
    sections: (s.sections || []).map(function (sec) {
      return { name: sec.name, weightage: sec.weightage, status: sec.status, topicCount: sec.topicCount, progressPct: sec.progressPct, marks: sec.marks,
        topics: (sec.topics || []).map(function (t) { return { topicId: t.topicId, label: t.label, sessionType: t.sessionType, readiness: t.readiness, weightage: t.weightage, roi: t.roi, drillable: t.drillable, durationMin: t.durationMin, action: t.action }; }) };
    }),
    focus: s.focus, revise: s.revise, skip: s.skip, recovery: s.recovery, progress: s.progress
  };
}

/** Create (or re-configure) a plan from the setup answers and build block 0 via the strategy engine (ADR-057). */
async function plannerSetup(uid, params, opts) {
  opts = opts || {};
  var ctx = await ctxEngine.build(uid, { force: true, clientStats: opts.clientStats });

  var examId = String(params.examId || 'other');
  var exam = SYL.getExam(examId);
  var syllabus = SYL.resolveSyllabus(examId);
  var examName = (examId === 'other' && params.examName) ? String(params.examName).slice(0, 100) : (exam ? exam.name : 'Custom');
  var examDate = /^\d{4}-\d{2}-\d{2}$/.test(params.examDate || '') ? params.examDate : '';
  var dailyMinutes = _clamp(parseInt(params.dailyMinutes, 10) || 45, 15, 480);
  var daysPerWeek = _clamp(parseInt(params.daysPerWeek, 10) || 6, 1, 7);
  var prepLevel = ['scratch', 'revision', 'average', 'confident', 'ready'].indexOf(params.prepLevel) >= 0 ? params.prepLevel : 'average';
  var preferredTime = ['morning', 'afternoon', 'evening', 'night'].indexOf(params.preferredTime) >= 0 ? params.preferredTime : null;
  var goal = String(params.goal || '').slice(0, 160);
  var targetScore = params.targetScore != null ? _clamp(parseInt(params.targetScore, 10) || 0, 1, 100) : null;

  // keep prior coverage if re-configuring the SAME syllabus (don't throw away real progress)
  var prev = await plannerGetDoc(uid);
  var topicState = (prev && prev.syllabusId === syllabus.id && prev.topicState) ? prev.topicState : {};

  var startDate = opts.clientDate || _todayIso();   // ADR-049: anchor the block to the student's LOCAL today
  // The strategy engine is the SOLE planner; the block is a PROJECTION of its roadmap (ADR-057).
  var draft = { examId: examId, examName: examName, examLabel: examName, syllabusId: syllabus.id, examDate: examDate,
    dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, prepLevel: prepLevel, targetScore: targetScore, topicState: topicState, block: null };
  var strategy = examStrategy.assemble(ctx, draft, { clientDate: startDate });
  var narrated = await _narratePlan(uid, ctx, { focusTopics: strategy.focus, onTrack: strategy.progress.onTrack, readinessScore: strategy.readinessScore, examName: examName });

  var doc = {
    v: 3, uid: uid, examId: examId, examName: examName, examLabel: examName, syllabusId: syllabus.id,
    examDate: examDate, dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, prepLevel: prepLevel,
    preferredTime: preferredTime, goal: goal, targetScore: strategy.targetScore,
    block: { index: 0, startDate: startDate, endDate: plannerEngine.addDays(startDate, 13),
      generatedAt: new Date().toISOString(), rationale: narrated.rationale, days: strategy.schedule.days },
    strategy: _persistStrategy(strategy),
    topicState: topicState,
    blockHistory: (prev && prev.blockHistory) || [],
    readiness: { score: strategy.readinessScore, band: _bandKey(strategy.readinessScore) }, forecast: strategy.progress.forecast,
    createdAt: (prev && prev.createdAt) || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  var ok = await _writePlanner(uid, doc);
  if (!ok) return { error: 'write_failed' };
  aiService.updateMemory(uid, { examName: examName, examDate: examDate, goal: goal, dailyMinutes: dailyMinutes,
    timelineEntry: { feature: 'planner', summary: 'Started a study plan for ' + examName + '.' } }, 'interview');

  return { plan: doc, envelope: _plannerEnvelope(ctx, doc, narrated.encouragement, opts.clientDate) };
}

/** Toggle a task's completion → credit coverage, run Smart Catch-up, recompute readiness + forecast. */
async function plannerToggle(uid, params, opts) {
  opts = opts || {};
  var doc = await plannerGetDoc(uid);
  if (!doc || !doc.block) return { error: 'no_plan' };
  var syllabus = SYL.getSyllabus(doc.syllabusId) || SYL.resolveSyllabus(doc.examId);

  var day = (doc.block.days || []).find(function (d) { return d.date === params.date; });
  var task = day && (day.tasks || []).find(function (t) { return t.topicId === params.topicId; });
  if (!task) return { error: 'no_task' };

  var done = !!params.done;
  task.done = done;
  task.completedAt = done ? new Date().toISOString() : null;
  if (done && params.result) task.result = params.result;

  if (done && task.topicId !== 'mock') {
    var comp = plannerEngine.applyCompletion(doc.topicState, syllabus, {
      topicId: task.topicId, estMin: task.estMin, kind: task.kind, result: params.result, dateIso: params.date
    });
    doc.topicState = _mergeTopicState(doc.topicState, comp.patch);
  }

  // Smart Catch-up keeps the persisted schedule honest within the block; the strategy re-derives the reasoning.
  doc.block.days = plannerEngine.rebalanceMissed(doc.block.days, opts.clientDate || _todayIso(), doc.dailyMinutes);

  var ctx = await ctxEngine.build(uid, { clientStats: opts.clientStats });
  // ADR-057: re-run the SOLE planner over the updated coverage so milestones/readiness/projection reflect the tick.
  var strategy = examStrategy.assemble(ctx, doc, { clientDate: opts.clientDate });
  doc.strategy = _persistStrategy(strategy);
  doc.readiness = { score: strategy.readinessScore, band: _bandKey(strategy.readinessScore) };
  doc.forecast = strategy.progress.forecast;
  doc.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  var okT = await _writePlanner(uid, { block: doc.block, strategy: doc.strategy, topicState: doc.topicState, readiness: doc.readiness, forecast: doc.forecast, updatedAt: doc.updatedAt });
  if (!okT) return { error: 'write_failed' };

  return { plan: doc };
}

/** End-of-block (or on-demand) regeneration: archive the block, then build the next 14 days from fresh progress. */
async function plannerRegenBlock(uid, opts) {
  opts = opts || {};
  var doc = await plannerGetDoc(uid);
  if (!doc || !doc.block) return { error: 'no_plan' };
  var syllabus = SYL.getSyllabus(doc.syllabusId) || SYL.resolveSyllabus(doc.examId);
  var ctx = await ctxEngine.build(uid, { force: true, clientStats: opts.clientStats });

  var stats = _blockStats(doc);
  doc.blockHistory = (doc.blockHistory || []).concat([{
    index: doc.block.index, startDate: doc.block.startDate, endDate: doc.block.endDate,
    completedTasks: stats.completedTasks, scheduledTasks: stats.scheduledTasks,
    adherencePct: stats.adherencePct, readiness: doc.readiness || null
  }]).slice(-12);

  var startDate = opts.clientDate || _todayIso();   // ADR-049: LOCAL today
  // ADR-057: regenerate the next block as a fresh PROJECTION of the strategy over current progress.
  var nextIndex = doc.block.index + 1;
  var strategy = examStrategy.assemble(ctx, doc, { clientDate: startDate });
  var narrated = await _narratePlan(uid, ctx, { focusTopics: strategy.focus, onTrack: strategy.progress.onTrack, readinessScore: strategy.readinessScore, examName: doc.examName });

  doc.block = { index: nextIndex, startDate: startDate, endDate: plannerEngine.addDays(startDate, 13),
    generatedAt: new Date().toISOString(), rationale: narrated.rationale, days: strategy.schedule.days };
  doc.strategy = _persistStrategy(strategy);
  doc.readiness = { score: strategy.readinessScore, band: _bandKey(strategy.readinessScore) }; doc.forecast = strategy.progress.forecast;
  doc.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  var okR = await _writePlanner(uid, { block: doc.block, strategy: doc.strategy, topicState: doc.topicState, blockHistory: doc.blockHistory, readiness: doc.readiness, forecast: doc.forecast, updatedAt: doc.updatedAt });
  if (!okR) return { error: 'write_failed' };

  return { plan: doc, envelope: _plannerEnvelope(ctx, doc, narrated.encouragement, opts.clientDate) };
}

/** Build the companion envelope: today's tasks + readiness + forecast, linking out to the calendar view. */
function _plannerEnvelope(ctx, doc, encouragement, clientDate) {
  var today = clientDate || _todayIso();   // ADR-049: LOCAL today
  var day = (doc.block && doc.block.days || []).find(function (d) { return d.date === today; });
  var tasks = (day && day.tasks) || [];
  var rd = doc.readiness || { score: 0, band: 'early' };
  var fc = doc.forecast || {};

  var blocks = [say(doc.block && doc.block.rationale || 'Your study planner adapts every two weeks from your real progress.')];
  blocks.push(metric('Exam readiness', rd.score + '/100', rd.band === 'exam-ready' ? 'up' : 'flat', rd.score >= 35));

  if (tasks.length) {
    tasks.slice(0, 3).forEach(function (t) {
      blocks.push(missionBlock(
        (t.kind === 'revise' ? 'Revise: ' : t.kind === 'mock' ? 'Mock: ' : 'Study: ') + t.label,
        t.reason, t.drillable ? 'focus' : 'practice', t.drillable || '', t.label, t.estMin));
    });
  } else if (day && day.kind === 'rest') {
    blocks.push(callout('info', 'Rest day — recovery is part of the plan. Back at it tomorrow.'));
  } else {
    blocks.push(callout('info', 'No tasks scheduled today. Open the calendar to see what\'s ahead.'));
  }

  if (fc.daysToExam != null) {
    blocks.push(callout(fc.onTrack === false ? 'warn' : 'info',
      fc.daysToExam + ' days to ' + (doc.examName || 'your exam') + (fc.bufferDays != null
        ? (fc.onTrack ? ' — on track with ' + fc.bufferDays + ' days of buffer.' : ' — ' + Math.abs(fc.bufferDays) + ' days behind; I rebalanced your plan.') : '.')));
  }
  if (encouragement) blocks.push(say(encouragement));

  var firstDrillable = tasks.find(function (t) { return t.drillable; });
  var chips = [];
  if (firstDrillable) chips.push(chipDeep('Start today\'s drill', 'focus', firstDrillable.drillable, firstDrillable.label, '⚡'));
  chips.push(chipReply('Open calendar', 'planner_open_calendar', '🗓️'));
  chips.push(chipReply('Adjust plan', 'planner_setup'));

  return envelope('planner', blocks, chips, { promptId: 'planner.narrate@' + prompts.REGISTRY['planner.narrate'].version, readiness: rd.score });
}

/* ════════════════════════ WORD PROBLEMS — context-aware generation (future-ready) ════════════════════════ */
async function wordProblem(uid, category, difficulty, isPremium, opts) {
  var granted = await aiService.consumeWordProblemQuota(uid, isPremium, 1);
  if (granted <= 0) {
    return { error: isPremium ? 'daily_limit_reached' : 'free_limit_reached' };
  }
  // ADR-051: floor with the live local stats so "your weakest topic" matches what Coach/Insights just showed.
  var ctx = await ctxEngine.build(uid, { clientStats: opts && opts.clientStats });
  var target = category || (ctxEngine.topWeakCategory(ctx) || {}).cat || 'percentages';
  var topicLabel = ctxEngine.label(target);
  try {
    var p = prompts.get('wp.generate', { topicLabel: topicLabel, difficulty: difficulty || 'medium', examName: _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature, validate: p.validate });
    aiService.recordAiRequest(uid, { feature: _featOf(p.id), promptId: p.id, version: p.version, usage: r.usage, latencyMs: r.latencyMs, model: r.model, attempts: r.attempts });
    return { problem: { question: r.data.question, answer: r.data.answer, options: r.data.options, explanation: r.data.explanation, category: target } };
  } catch (e) {
    if (e && e.usage) aiService.recordAiRequest(uid, { feature: _featOf(p && p.id), promptId: (p && p.id) || null, version: (p && p.version), usage: e.usage, latencyMs: e.latencyMs, model: e.model, attempts: e.attempts, status: 'error', errorCode: e.code });
    // ADR-062: generation failed → refund the quota unit we consumed up-front so the student isn't charged.
    try { await aiService.refundWordProblemQuota(uid, isPremium, 1); } catch (_) {}
    return { error: 'generation_failed' };
  }
}

module.exports = { coachToday, insights, explainBase, chatTurn, wordProblem,
  plannerGet, plannerSetup, plannerToggle, plannerRegenBlock, plannerReset,
  _detectPatterns };   // pure helper exposed for the brain harness (ADR-050)
