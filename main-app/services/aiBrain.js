/**
 * aiBrain.js — the one AI brain (ADR-039).
 *
 * Orchestrates studentContext (analysis) + aiMemory (continuity) + aiPrompts (versioned language) +
 * llmProvider (the single gpt-4o-mini call) into AIResponse block envelopes (AI_INTERACTION_SYSTEM §2).
 * The model writes only small language objects; THIS module assembles the UI blocks + chips deterministically
 * from real data — the reliability lever that makes gpt-4o-mini punch above its weight.
 *
 * Every feature: consumes context + memory, ends in chips, deep-links real drills, and NEVER throws to the
 * user (hard model failure → a deterministic, still-useful fallback envelope). Cold-start users skip the LLM.
 */
const admin = require('firebase-admin');
const ctxEngine = require('./studentContext');
const llm = require('./llmProvider');
const prompts = require('./aiPrompts');
const aiService = require('./aiService');
const SYL = require('../data/syllabus');             // bundled syllabus DB (ADR-046)
const plannerEngine = require('./plannerEngine');    // deterministic 14-day scheduler
const readinessLib = require('./readiness');         // readiness score + completion forecast

function db() { return admin.firestore(); }
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
/* A focus topic with a GUARANTEED non-empty category, so deep-link drills never silently no-op (ADR-045 bugfix:
   topWeakCategory could return {cat:''} for cold/all-unknown students → startDrillFromPractice('focus','') was a no-op). */
function _focus(ctx) {
  var w = ctxEngine.topWeakCategory(ctx);
  if (w && w.cat) return w;
  return { cat: 'percentages', label: ctxEngine.label('percentages') };
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
  db().collection('aiDaily').doc(uid + '_' + feature + '_' + _dateKey())
    .set({ uid: uid, feature: feature, date: _dateKey(), envelope: env, createdAt: admin.firestore.FieldValue.serverTimestamp() })
    .catch(function (e) { console.warn('[aiBrain] daily cache write failed:', e.message); });
}

/* ════════════════════════ AI COACH — daily mentor ════════════════════════ */
async function coachToday(uid, opts) {
  opts = opts || {};
  var ctx = await ctxEngine.buildContext(uid);

  if (ctxEngine.isColdStart(ctx)) {
    // Coach, don't gate (ADR-045): acknowledge what they HAVE done today instead of telling them to "go practice".
    var doneT = (ctx.today && ctx.today.attempted) || 0;
    var coldMsg = doneT > 0
      ? 'Nice — ' + doneT + ' done today. Push a little further and I\'ll start calling out your real patterns: your pace, your accuracy, the topics that slow you down.'
      : 'I\'m ' + prompts.PERSONA + ', your coach. Run a quick set and I\'ll start reading your real patterns — pace, accuracy, and the topics that trip you up.';
    return envelope('coach', [
      say(coldMsg),
      missionBlock(doneT > 0 ? 'Keep going — 10 more' : 'Warm up — 10 questions', 'Gives me a baseline to coach from.', 'practice', '', '', 5)
    ], [chipDeep(doneT > 0 ? 'Keep going' : 'Start a set', 'practice', '', ''), chipDismiss('Later')], { coldStart: true });
  }

  if (!opts.force) { var cached = await _getDaily(uid, 'coach'); if (cached) return cached; }

  var focus = _focus(ctx);
  var contextStr = ctxEngine.serialize(ctx);
  // ADR-040/046: read the active study plan so the Coach genuinely references it. Prefer the QuanAI Planner's
  // tasks for TODAY; fall back to the legacy Mission weekFocus for users not yet migrated.
  var planNote = '';
  try {
    var pd = await db().collection('aiPlanner').doc(uid).get();
    if (pd.exists) {
      var pdoc = pd.data();
      var todayKey = _todayIso();
      var td = ((pdoc.block && pdoc.block.days) || []).find(function (d) { return d.date === todayKey; });
      var labels = (td && (td.tasks || []).map(function (t) { return t.label; }).slice(0, 3).join(', ')) || '';
      if (labels) planNote = 'The student\'s study planner schedules today: ' + labels + '. Tie your advice to it.';
    }
    if (!planNote) {
      var md = await db().collection('aiMissions').doc(uid).get();
      if (md.exists) { var wf = ((md.data().weekFocus) || []).map(function (w) { return w.topicLabel; }).filter(Boolean).slice(0, 3).join(', '); if (wf) planNote = 'The student\'s active study plan focuses this week on: ' + wf + '. Tie your advice to it.'; }
    }
  } catch (_) {}
  var env;
  try {
    var p = prompts.get('coach.daily', { context: contextStr, focusLabel: focus.label, planNote: planNote });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    var d = r.data;
    env = envelope('coach', [
      say(d.say),
      d.celebrate ? celebrate(d.celebrate) : null,
      missionBlock('Drill ' + focus.label, d.missionWhy, 'focus', focus.cat, focus.label, 8)
    ], [
      chipDeep('Start that set', 'focus', focus.cat, focus.label, '⚡'),
      chipReply('Tell me more', 'coach_followup:' + (d.followup || 'tell me more')),
      chipDismiss('Not today')
    ].concat(helpfulChips()), { promptId: 'coach.daily@3', focus: focus.cat });
    aiService.updateMemory(uid, { timelineEntry: { feature: 'coach', summary: 'Prescribed ' + focus.label + '.' } }, 'coach');
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    env = _coachFallback(ctx, focus);
  }
  _putDaily(uid, 'coach', env);
  return env;
}
function _coachFallback(ctx, focus) {
  var line = 'You\'re ' + Math.round((ctx.accuracy || 0) * 100) + '% accurate over ' + ctx.totalAttempted + ' questions. ' +
    (focus.cat ? 'Tighten up ' + focus.label + ' next — that\'s your biggest lever right now.' : 'Keep your streak alive with a focused set.');
  return envelope('coach', [
    say(line),
    missionBlock('Drill ' + focus.label, 'Targeted practice on your weakest topic.', 'focus', focus.cat, focus.label, 8)
  ], [chipDeep('Start that set', 'focus', focus.cat, focus.label, '⚡'), chipDismiss('Not today')].concat(helpfulChips()), { fallback: true });
}

/* ════════════════════════ AI INSIGHTS — performance intelligence → missions ════════════════════════ */
async function insights(uid, opts) {
  opts = opts || {};
  var ctx = await ctxEngine.buildContext(uid);

  if (ctxEngine.isColdStart(ctx)) {
    var doneT = (ctx.today && ctx.today.attempted) || 0;
    var coldMsg = doneT > 0
      ? 'You\'ve done ' + doneT + ' today — a little more and I\'ll surface real trends: accuracy, speed, and exactly which topics to fix first.'
      : 'Run a set and I\'ll surface real trends — accuracy, speed, and exactly which topics to fix first.';
    return envelope('insights', [
      say(coldMsg),
      missionBlock('Practice to unlock insights', 'I need a bit more data to find your patterns.', 'practice', '', '', 5)
    ], [chipDeep(doneT > 0 ? 'Keep going' : 'Practice now', 'practice', '', '')], { coldStart: true });
  }

  if (!opts.force) { var cached = await _getDaily(uid, 'insights'); if (cached) return cached; }

  var t = ctx.trends || {};
  var blocks = [];
  // deterministic, REAL metric blocks (no model)
  if (t.accuracy && t.accuracy.d7 != null) blocks.push(metric('Accuracy (7d)', Math.round(t.accuracy.d7 * 100) + '%', t.accuracy.direction === 'improving' ? 'up' : (t.accuracy.direction === 'declining' ? 'down' : 'flat'), t.accuracy.direction !== 'declining'));
  if (t.speed && t.speed.recentMsPerQ != null) blocks.push(metric('Speed', (t.speed.recentMsPerQ / 1000).toFixed(1) + 's/Q', t.speed.direction === 'faster' ? 'up' : (t.speed.direction === 'slower' ? 'down' : 'flat'), t.speed.direction !== 'slower'));
  if (t.consistency) blocks.push(metric('Consistency', t.consistency.activeDaysLast14 + '/14 days', t.consistency.streakHealth === 'strong' ? 'up' : (t.consistency.streakHealth === 'broken' ? 'down' : 'flat'), t.consistency.streakHealth !== 'broken'));

  var weak = _focus(ctx);
  var env;
  try {
    var p = prompts.get('insights.analyze', { context: ctxEngine.serialize(ctx), weakLabel: weak.label });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    var d = r.data;
    var weakCats = (ctx.mastery || []).filter(function (m) { return m.tier === 'weak'; }).slice(0, 2);
    var missions = weakCats.map(function (m) { return missionBlock('Fix ' + m.label, Math.round(m.acc * 100) + '% accuracy — high-impact to improve.', 'focus', m.cat, m.label, 8); });
    env = envelope('insights',
      [say(d.headline)].concat(blocks).concat([card('Your biggest weakness', d.weaknessInsight, 'rose', '🎯')]).concat(missions),
      weakCats.map(function (m) { return chipDeep('Fix ' + m.label, 'focus', m.cat, m.label, '⚡'); })
        .concat([chipReply(d.nextStepLabel || 'Ask why', 'insights_why')]).concat(helpfulChips()),
      { promptId: 'insights.analyze@3' });
    aiService.updateMemory(uid, { addWeakConcepts: weakCats.map(function (m) { return m.cat; }), timelineEntry: { feature: 'insights', summary: 'Flagged ' + weak.label + ' as top weakness.' } }, 'insights');
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    env = envelope('insights', [say('Here\'s where you stand. Your highest-impact move is tightening up ' + weak.label + '.')].concat(blocks).concat([missionBlock('Fix ' + weak.label, 'Your weakest topic by accuracy.', 'focus', weak.cat, weak.label, 8)]),
      [chipDeep('Fix ' + weak.label, 'focus', weak.cat, weak.label, '⚡')].concat(helpfulChips()), { fallback: true });
  }
  _putDaily(uid, 'insights', env);
  return env;
}

/* ════════════════════════ AI EXPLAIN — interactive concept learning ════════════════════════ */
async function explainBase(question, answer, category, uid) {
  var catLabel = ctxEngine.label(category) || 'General Math';
  var hash = _hash(String(question) + ':' + String(answer));
  var cacheRef = db().collection('explanations').doc(hash);

  var pieces = null;
  try {
    var cached = await cacheRef.get();
    if (cached.exists) { var c = cached.data(); pieces = { concept: c.concept, steps: c.steps, mistake: c.mistake, tip: c.tip }; cacheRef.update({ usageCount: (c.usageCount || 0) + 1 }).catch(function () {}); }
  } catch (e) { console.warn('[aiBrain] explain cache read failed:', e.message); }

  if (!pieces) {
    var mem = await aiService.getMemory(uid);
    var struggled = !!(mem && Array.isArray(mem.recentTopicsExplained) && mem.recentTopicsExplained.indexOf(category) >= 0);
    var depth = (mem && mem.preferredDepth) || 'standard';   // ADR-045: honor the depth the student asked for via Simpler/Deeper (was hardcoded 'standard')
    try {
      var p = prompts.get('explain.base', { question: llm.wrapData(question, 400), answer: String(answer).slice(0, 50), catLabel: catLabel, depth: depth, struggledBefore: struggled });
      var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature, validate: p.validate });
      aiService.trackGptCost(uid, r.usage);
      pieces = r.data;
      cacheRef.set({ questionId: hash, question: String(question), answer: String(answer), category: category || '', concept: pieces.concept, steps: pieces.steps, mistake: pieces.mistake, tip: pieces.tip, usageCount: 1, createdAt: admin.firestore.FieldValue.serverTimestamp() }).catch(function (e) { console.warn('[aiBrain] explain cache write failed:', e.message); });
    } catch (e) {
      if (e && e.usage) aiService.trackGptCost(uid, e.usage);
      return envelope('explain', [say('I couldn\'t generate a full explanation just now.'), callout('warn', 'The correct answer is ' + answer + '. Tap retry to try again.')],
        [chipReply('Retry', 'explain_retry'), chipDeep('Drill this topic', 'focus', category, catLabel, '⚡')], { fallback: true });
    }
  }

  aiService.updateMemory(uid, { addExplainedTopic: category, timelineEntry: { feature: 'explain', summary: 'Explained a ' + catLabel + ' question.' } }, 'explain');

  var blocks = [say(pieces.concept), steps(pieces.steps, 'Solution')];
  if (pieces.mistake) blocks.push(callout('warn', 'Common slip: ' + pieces.mistake));
  if (pieces.tip) blocks.push(card('Shortcut', pieces.tip, 'blue', '💡'));

  return envelope('explain', blocks, [
    chipReply('Got it ✓', 'helpful_yes'),
    chipReply('Simpler', 'explain_simpler'),
    chipReply('Go deeper', 'explain_deeper'),
    chipReply('Another like this', 'explain_another'),
    chipDrill('Drill this', category, catLabel, '⚡')
  ], { promptId: 'explain.base@3', topic: category, question: String(question).slice(0, 300), answer: String(answer).slice(0, 50) });
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
    : userTurn.indexOf('insights_why') === 0 ? 'Explain in plain terms why this is the student\'s weakness and the single best fix.'
    : userTurn;

  var ctx = await ctxEngine.buildContext(uid);

  // EXPLAIN FOLLOW-UPS (ADR-045): anchor to the EXACT question + the prior explanation the client carries forward,
  // so "Simpler / Go deeper / Another" deepen THIS problem instead of drifting to the student's weak topic.
  var anchorQ = String(body.question || '').slice(0, 500);
  if (feature === 'explain' && anchorQ) {
    try {
      var pf = prompts.get('explain.followup', {
        question: llm.wrapData(anchorQ, 500),
        lastExplanation: llm.wrapData(String(body.lastExplanation || '').slice(0, 900), 900),
        userTurn: llm.wrapData(hint, 400)
      });
      var rf = await llm.complete({ system: pf.system, user: pf.user, schema: pf.schema, schemaName: pf.schemaName, maxTokens: pf.maxTokens, temperature: pf.temperature });
      aiService.trackGptCost(uid, rf.usage);
      var df = rf.data;
      var fb = [say(df.say)];
      if (Array.isArray(df.steps) && df.steps.length) fb.push(steps(df.steps));
      return envelope('explain', fb, [
        chipReply('Got it ✓', 'helpful_yes'), chipReply('Simpler', 'explain_simpler'),
        chipReply('Go deeper', 'explain_deeper'), chipReply('Another like this', 'explain_another'),
        chipDrill('Drill this', topic, catLabel, '⚡')
      ], { promptId: 'explain.followup@1', topic: topic });
    } catch (e) {
      if (e && e.usage) aiService.trackGptCost(uid, e.usage);
      return envelope('explain', [callout('warn', 'I couldn\'t expand on that just now — try again in a moment.')], [chipReply('Retry', userTurn)], { fallback: true });
    }
  }

  var history = Array.isArray(body.history) ? body.history.slice(-6).map(function (h) { return (h.role === 'user' ? 'Student: ' : 'You: ') + String(h.content || '').slice(0, 200); }).join('\n') : '';
  try {
    var p = prompts.get('chat.turn', { topic: catLabel, context: ctxEngine.serialize(ctx, 700), history: llm.wrapData(history, 900), userTurn: llm.wrapData(hint, 400) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    var d = r.data;
    var blocks = [say(d.say)];
    if (Array.isArray(d.steps) && d.steps.length) blocks.push(steps(d.steps));
    var chips = (feature === 'explain')
      ? [chipReply('Got it ✓', 'helpful_yes'), chipReply('Another', 'explain_another'), chipDrill('Drill this', topic, catLabel, '⚡')]
      : [chipReply('Got it ✓', 'helpful_yes')];
    return envelope(feature, blocks, chips, { promptId: 'chat.turn@2', topic: topic });
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    return envelope(feature, [callout('warn', 'I couldn\'t answer that just now — try again in a moment.')], [chipReply('Retry', userTurn)], { fallback: true });
  }
}

/* ════════════════════════ AI STUDY PLAN — living mission ════════════════════════ */
async function missionGet(uid) {
  try {
    var d = await db().collection('aiMissions').doc(uid).get();
    if (d.exists) return { plan: d.data() };
  } catch (e) { console.warn('[aiBrain] missionGet failed:', e.message); }
  return { plan: null };
}

async function missionGenerate(uid, params) {
  var ctx = await ctxEngine.buildContext(uid);
  var examName = String(params.examName || 'CAT').slice(0, 60);
  var examDate = String(params.examDate || '').slice(0, 10);
  var dailyMinutes = Math.max(15, Math.min(360, parseInt(params.dailyMinutes) || 45));
  var goal = String(params.goal || '').slice(0, 120);
  var daysRemaining = examDate ? Math.max(1, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)) : 60;

  // memory write (interview → memory)
  aiService.updateMemory(uid, { examName: examName, examDate: examDate, goal: goal, dailyMinutes: dailyMinutes, confidence: params.confidence, timelineEntry: { feature: 'plan', summary: 'Started a mission for ' + examName + '.' } }, 'interview');

  var plan;
  try {
    var p = prompts.get('plan.generate', { examName: llm.wrapData(examName, 60), daysRemaining: daysRemaining, dailyMinutes: dailyMinutes, goal: llm.wrapData(goal || 'improve overall', 120), context: ctxEngine.serialize(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    plan = r.data;
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    var weakLabels = (ctx.mastery || []).filter(function (m) { return m.tier !== 'strong'; }).slice(0, 3).map(function (m) { return { topicLabel: m.label, goal: 'Lift accuracy above 70%' }; });
    plan = { rationale: 'A focused plan built around your weakest topics, with daily targeted practice.', weekFocus: weakLabels.length ? weakLabels : [{ topicLabel: 'Mixed practice', goal: 'Build consistency' }], phases: [{ name: 'Build accuracy', durationDays: Math.min(daysRemaining, 21) }, { name: 'Build speed', durationDays: Math.max(0, daysRemaining - 21) }] };
  }

  var doc = { uid: uid, examName: examName, examDate: examDate, dailyMinutes: dailyMinutes, goal: goal,
    rationale: plan.rationale, weekFocus: plan.weekFocus, phases: plan.phases,
    weekStartedAt: new Date().toISOString(), progress: {}, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  db().collection('aiMissions').doc(uid).set(doc, { merge: true }).catch(function (e) { console.warn('[aiBrain] mission write failed:', e.message); });

  return _missionEnvelope(ctx, doc);
}

async function missionToday(uid) {
  var ctx = await ctxEngine.buildContext(uid);
  var got = await missionGet(uid);
  if (!got.plan) return { plan: null };
  return _missionEnvelope(ctx, got.plan);
}

function _missionEnvelope(ctx, plan) {
  var weak = _focus(ctx);
  var focusList = (plan.weekFocus || []).map(function (w) { return w.topicLabel + (w.goal ? ' — ' + w.goal : ''); });
  var phaseDays = (plan.phases || []).map(function (ph, i) { return { day: i + 1, label: ph.name, items: [ph.durationDays + ' days'], done: false }; });
  var daysToExam = plan.examDate ? Math.max(0, Math.ceil((new Date(plan.examDate).getTime() - Date.now()) / 86400000)) : null;

  var blocks = [
    say(plan.rationale || 'Here\'s your living plan — it adapts every week from your real progress.'),
    missionBlock('Today: drill ' + weak.label, 'Your highest-impact topic this week.', 'focus', weak.cat, weak.label, plan.dailyMinutes ? Math.min(plan.dailyMinutes, 15) : 10)
  ];
  if (focusList.length) blocks.push(card('This week\'s focus', focusList.join('\n'), 'blue', '🎯'));
  if (phaseDays.length) blocks.push({ type: 'timeline', days: phaseDays });
  if (daysToExam != null) blocks.push(callout('info', daysToExam + ' days to ' + (plan.examName || 'your exam') + '.'));

  return { plan: plan, envelope: envelope('plan', blocks, [
    chipDeep('Start today\'s drill', 'focus', weak.cat, weak.label, '⚡'),
    chipReply('Adjust my plan', 'plan_regen')
  ].concat(helpfulChips()), { promptId: 'plan.generate@3' }) };
}

/* ════════════════════════ QuanAI PLANNER — living, adaptive study planner (ADR-046) ════════════════════════
   A deterministic engine (plannerEngine + readiness + signals) schedules the next 14 days day-by-day from the
   real exam syllabus + the student's analytics; the LLM only narrates. Stored at aiPlanner/{uid} (v2). The old
   one-shot Mission (aiMissions) remains for back-compat until P7. */
function _todayIso() { return new Date().toISOString().slice(0, 10); }
function _clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
function _daysRemaining(examDate) {
  if (!examDate) return 90;
  var t = Date.parse(examDate + 'T00:00:00Z');
  return isNaN(t) ? 90 : Math.max(1, Math.ceil((t - Date.now()) / 86400000));
}
/** Estimate the student's real recent pace (min/day) so the forecast can project from behaviour, not just the plan. */
function _recentDailyMinutes(ctx) {
  var t = ctx && ctx.trends;
  if (!t || !t.speed || t.speed.recentMsPerQ == null || !t.consistency) return null;
  var active = Math.max(1, t.consistency.activeDaysLast14 || 0);
  var q7 = (ctx.today && ctx.today.attempted) ? ctx.today.attempted * Math.min(active, 7) : null; // rough
  if (!q7) return null;
  return Math.round((q7 / 7) * (t.speed.recentMsPerQ / 60000));
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

async function plannerGet(uid) {
  var doc = await plannerGetDoc(uid);
  if (!doc) return { plan: null };
  var ctx = await ctxEngine.buildContext(uid);
  return { plan: doc, envelope: _plannerEnvelope(ctx, doc, null) };
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
    var p = prompts.get('planner.narrate', { seed: llm.wrapData(JSON.stringify(seed), 700) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    return { rationale: r.data.rationale || fallback.rationale, encouragement: r.data.encouragement || fallback.encouragement };
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    return fallback;
  }
}

/** Create (or re-configure) a plan from the setup answers and generate block 0. */
async function plannerSetup(uid, params, opts) {
  opts = opts || {};
  var ctx = await ctxEngine.buildContext(uid, { force: true, clientStats: opts.clientStats });

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

  // keep prior coverage if re-configuring the SAME syllabus (don't throw away real progress)
  var prev = await plannerGetDoc(uid);
  var topicState = (prev && prev.syllabusId === syllabus.id && prev.topicState) ? prev.topicState : {};

  var startDate = _todayIso();
  var gen = plannerEngine.generateBlock({
    syllabus: syllabus, ctx: ctx, topicState: topicState, prepLevel: prepLevel,
    dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, preferredTime: preferredTime,
    startDate: startDate, blockIndex: 0, examName: examName, examDate: examDate,
    daysRemaining: _daysRemaining(examDate), recentDailyMinutes: _recentDailyMinutes(ctx)
  });
  var narrated = await _narratePlan(uid, ctx, gen.rationaleSeed);

  var doc = {
    v: 2, uid: uid, examId: examId, examName: examName, examLabel: examName, syllabusId: syllabus.id,
    examDate: examDate, dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, prepLevel: prepLevel,
    preferredTime: preferredTime, goal: goal,
    block: { index: 0, startDate: startDate, endDate: plannerEngine.addDays(startDate, 13),
      generatedAt: new Date().toISOString(), rationale: narrated.rationale, days: gen.days },
    topicState: _mergeTopicState(topicState, gen.topicStatePatch),
    blockHistory: (prev && prev.blockHistory) || [],
    readiness: gen.examReadiness, forecast: gen.forecast,
    createdAt: (prev && prev.createdAt) || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  db().collection('aiPlanner').doc(uid).set(doc, { merge: true }).catch(function (e) { console.warn('[aiBrain] planner write failed:', e.message); });
  aiService.updateMemory(uid, { examName: examName, examDate: examDate, goal: goal, dailyMinutes: dailyMinutes,
    timelineEntry: { feature: 'planner', summary: 'Started a study plan for ' + examName + '.' } }, 'interview');

  return { plan: doc, envelope: _plannerEnvelope(ctx, doc, narrated.encouragement) };
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

  doc.block.days = plannerEngine.rebalanceMissed(doc.block.days, _todayIso(), doc.dailyMinutes);

  var ctx = await ctxEngine.buildContext(uid, { clientStats: opts.clientStats });
  doc.readiness = readinessLib.examReadinessScore(syllabus, ctx, doc.topicState, _blockStats(doc));
  doc.forecast = readinessLib.completionForecast(syllabus, doc.topicState, {
    dailyMinutes: doc.dailyMinutes, daysPerWeek: doc.daysPerWeek, examDate: doc.examDate, recentDailyMinutes: _recentDailyMinutes(ctx)
  });
  doc.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  db().collection('aiPlanner').doc(uid).set(
    { block: doc.block, topicState: doc.topicState, readiness: doc.readiness, forecast: doc.forecast, updatedAt: doc.updatedAt },
    { merge: true }
  ).catch(function (e) { console.warn('[aiBrain] planner toggle write failed:', e.message); });

  return { plan: doc };
}

/** End-of-block (or on-demand) regeneration: archive the block, then build the next 14 days from fresh progress. */
async function plannerRegenBlock(uid, opts) {
  opts = opts || {};
  var doc = await plannerGetDoc(uid);
  if (!doc || !doc.block) return { error: 'no_plan' };
  var syllabus = SYL.getSyllabus(doc.syllabusId) || SYL.resolveSyllabus(doc.examId);
  var ctx = await ctxEngine.buildContext(uid, { force: true, clientStats: opts.clientStats });

  var stats = _blockStats(doc);
  doc.blockHistory = (doc.blockHistory || []).concat([{
    index: doc.block.index, startDate: doc.block.startDate, endDate: doc.block.endDate,
    completedTasks: stats.completedTasks, scheduledTasks: stats.scheduledTasks,
    adherencePct: stats.adherencePct, readiness: doc.readiness || null
  }]).slice(-12);

  var startDate = _todayIso();
  var gen = plannerEngine.generateBlock({
    syllabus: syllabus, ctx: ctx, topicState: doc.topicState, prepLevel: doc.prepLevel,
    dailyMinutes: doc.dailyMinutes, daysPerWeek: doc.daysPerWeek, preferredTime: doc.preferredTime,
    startDate: startDate, blockIndex: doc.block.index + 1, examName: doc.examName, examDate: doc.examDate,
    daysRemaining: _daysRemaining(doc.examDate), recentDailyMinutes: _recentDailyMinutes(ctx)
  });
  var narrated = await _narratePlan(uid, ctx, gen.rationaleSeed);

  doc.topicState = _mergeTopicState(doc.topicState, gen.topicStatePatch);
  doc.block = { index: doc.block.index + 1, startDate: startDate, endDate: plannerEngine.addDays(startDate, 13),
    generatedAt: new Date().toISOString(), rationale: narrated.rationale, days: gen.days };
  doc.readiness = gen.examReadiness; doc.forecast = gen.forecast;
  doc.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  db().collection('aiPlanner').doc(uid).set(
    { block: doc.block, topicState: doc.topicState, blockHistory: doc.blockHistory, readiness: doc.readiness, forecast: doc.forecast, updatedAt: doc.updatedAt },
    { merge: true }
  ).catch(function (e) { console.warn('[aiBrain] planner regen write failed:', e.message); });

  return { plan: doc, envelope: _plannerEnvelope(ctx, doc, narrated.encouragement) };
}

/** Build the companion envelope: today's tasks + readiness + forecast, linking out to the calendar view. */
function _plannerEnvelope(ctx, doc, encouragement) {
  var today = _todayIso();
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

  return envelope('planner', blocks, chips, { promptId: 'planner.narrate@1', readiness: rd.score });
}

/* ════════════════════════ WORD PROBLEMS — context-aware generation (future-ready) ════════════════════════ */
async function wordProblem(uid, category, difficulty, isPremium) {
  var granted = await aiService.consumeWordProblemQuota(uid, isPremium, 1);
  if (granted <= 0) {
    return { error: isPremium ? 'daily_limit_reached' : 'free_limit_reached' };
  }
  var ctx = await ctxEngine.buildContext(uid);
  var target = category || (ctxEngine.topWeakCategory(ctx) || {}).cat || 'percentages';
  var topicLabel = ctxEngine.label(target);
  try {
    var p = prompts.get('wp.generate', { topicLabel: topicLabel, difficulty: difficulty || 'medium' });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature, validate: p.validate });
    aiService.trackGptCost(uid, r.usage);
    return { problem: { question: r.data.question, answer: r.data.answer, options: r.data.options, explanation: r.data.explanation, category: target } };
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    return { error: 'generation_failed' };
  }
}

module.exports = { coachToday, insights, explainBase, chatTurn, missionGet, missionGenerate, missionToday, wordProblem,
  plannerGet, plannerSetup, plannerToggle, plannerRegenBlock };
