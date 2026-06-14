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
const planLogic = require('./planLogic');

function db() { return admin.firestore(); }
function _examOf(ctx) { return (ctx && ctx.memory && ctx.memory.examName) || ''; }
function _promptId(p) { return p.id + '@' + p.version; }
/** The drillable categories, as a prompt-friendly list (keeps the planner from inventing topics). */
function _topicList() { return Object.keys(ctxEngine.CATEGORY_LABELS).map(function (k) { return ctxEngine.CATEGORY_LABELS[k]; }).join(', '); }
/** Weak (non-strong) categories for plan backfill / grounding. */
function _weakCats(ctx) { return (ctx.mastery || []).filter(function (m) { return m.tier !== 'strong'; }).map(function (m) { return { cat: m.cat, label: m.label }; }); }
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
function chipDismiss(label) { return { label: label, value: 'dismiss', kind: 'dismiss' }; }
function helpfulChips() { return [chipReply('👍 Helpful', 'helpful_yes'), chipReply('👎 Not really', 'helpful_no')]; }
function envelope(feature, blocks, chips, meta) {
  return { v: 1, feature: feature, blocks: (blocks || []).filter(Boolean), chips: (chips || []).filter(Boolean), meta: meta || {} };
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
  var ctx = await ctxEngine.buildContext(uid, { force: !!opts.force });

  if (ctxEngine.isColdStart(ctx)) {
    return envelope('coach', [
      say('I\'m ' + prompts.PERSONA + ', your coach. Do a quick 10-question set and I\'ll start coaching you on your real patterns — speed, accuracy, the topics that trip you up.'),
      missionBlock('Warm up — 10 questions', 'Gives me a baseline to coach from.', 'practice', '', '', 5)
    ], [chipDeep('Start warm-up', 'practice', '', ''), chipDismiss('Later')], { coldStart: true });
  }

  if (!opts.force) { var cached = await _getDaily(uid, 'coach'); if (cached) return cached; }

  var focus = ctxEngine.topWeakCategory(ctx) || { cat: '', label: 'mixed practice' };
  var contextStr = ctxEngine.serialize(ctx);
  // ADR-040: read today's mission so the Coach genuinely references the plan (a real cross-feature link, not just memory).
  var planNote = '';
  try {
    var md = await db().collection('aiMissions').doc(uid).get();
    if (md.exists) { var wf = ((md.data().weekFocus) || []).map(function (w) { return w.topicLabel; }).filter(Boolean).slice(0, 3).join(', '); if (wf) planNote = 'The student\'s active study plan focuses this week on: ' + wf + '. Tie your advice to it.'; }
  } catch (_) {}
  var env;
  try {
    var p = prompts.get('coach.daily', { context: contextStr, focusLabel: focus.label, planNote: planNote, examName: _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    var d = r.data;
    env = envelope('coach', [
      say(d.say),
      d.celebrate ? celebrate(d.celebrate) : null,
      missionBlock('Drill ' + focus.label, d.missionWhy, 'focus', focus.cat, focus.label, 8),
      opts.force ? callout('success', 'Updated from your latest practice.') : null
    ], [
      chipDeep('Start that set', 'focus', focus.cat, focus.label, '⚡'),
      chipReply('Tell me more', 'coach_followup:' + (d.followup || 'tell me more')),
      chipDismiss('Not today')
    ].concat(helpfulChips()), { promptId: _promptId(p), focus: focus.cat });
    aiService.updateMemory(uid, { timelineEntry: { feature: 'coach', summary: 'Prescribed ' + focus.label + '.' } }, 'coach');
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    env = _coachFallback(ctx, focus);
  }
  // Never cache a degraded fallback — a transient model failure must not pin bad advice for the whole day.
  if (!(env.meta && env.meta.fallback)) _putDaily(uid, 'coach', env);
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
  var ctx = await ctxEngine.buildContext(uid, { force: !!opts.force });

  if (ctxEngine.isColdStart(ctx)) {
    return envelope('insights', [
      say('Once you\'ve done ~20 questions I can show you real trends — accuracy, speed, and exactly which topics to fix first.'),
      missionBlock('Practice to unlock insights', 'I need a bit more data to find your patterns.', 'practice', '', '', 5)
    ], [chipDeep('Practice now', 'practice', '', '')], { coldStart: true });
  }

  if (!opts.force) { var cached = await _getDaily(uid, 'insights'); if (cached) return cached; }

  var t = ctx.trends || {};
  var blocks = [];
  // deterministic, REAL metric blocks (no model)
  if (t.accuracy && t.accuracy.d7 != null) blocks.push(metric('Accuracy (7d)', Math.round(t.accuracy.d7 * 100) + '%', t.accuracy.direction === 'improving' ? 'up' : (t.accuracy.direction === 'declining' ? 'down' : 'flat'), t.accuracy.direction !== 'declining'));
  if (t.speed && t.speed.recentMsPerQ != null) blocks.push(metric('Speed', (t.speed.recentMsPerQ / 1000).toFixed(1) + 's/Q', t.speed.direction === 'faster' ? 'up' : (t.speed.direction === 'slower' ? 'down' : 'flat'), t.speed.direction !== 'slower'));
  if (t.consistency) blocks.push(metric('Consistency', t.consistency.activeDaysLast14 + '/14 days', t.consistency.streakHealth === 'strong' ? 'up' : (t.consistency.streakHealth === 'broken' ? 'down' : 'flat'), t.consistency.streakHealth !== 'broken'));

  var weak = ctxEngine.topWeakCategory(ctx) || { cat: '', label: 'mixed practice' };
  if (opts.force) blocks.push(callout('success', 'Updated from your latest practice.'));
  var env;
  try {
    var p = prompts.get('insights.analyze', { context: ctxEngine.serialize(ctx), weakLabel: weak.label, examName: _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    var d = r.data;
    var weakCats = (ctx.mastery || []).filter(function (m) { return m.tier === 'weak'; }).slice(0, 2);
    var missions = weakCats.map(function (m) { return missionBlock('Fix ' + m.label, Math.round(m.acc * 100) + '% accuracy — high-impact to improve.', 'focus', m.cat, m.label, 8); });
    env = envelope('insights',
      [say(d.headline)].concat(blocks).concat([card('Your biggest weakness', d.weaknessInsight, 'rose', '🎯')]).concat(missions),
      weakCats.map(function (m) { return chipDeep('Fix ' + m.label, 'focus', m.cat, m.label, '⚡'); })
        .concat([chipReply(d.nextStepLabel || 'Ask why', 'insights_why')]).concat(helpfulChips()),
      { promptId: _promptId(p) });
    aiService.updateMemory(uid, { addWeakConcepts: weakCats.map(function (m) { return m.cat; }), timelineEntry: { feature: 'insights', summary: 'Flagged ' + weak.label + ' as top weakness.' } }, 'insights');
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    env = envelope('insights', [say('Here\'s where you stand. Your highest-impact move is tightening up ' + weak.label + '.')].concat(blocks).concat([missionBlock('Fix ' + weak.label, 'Your weakest topic by accuracy.', 'focus', weak.cat, weak.label, 8)]),
      [chipDeep('Fix ' + weak.label, 'focus', weak.cat, weak.label, '⚡')].concat(helpfulChips()), { fallback: true });
  }
  // Never cache a degraded fallback (transient model failure shouldn't pin a bad answer all day).
  if (!(env.meta && env.meta.fallback)) _putDaily(uid, 'insights', env);
  return env;
}

/* ════════════════════════ AI EXPLAIN — interactive concept learning ════════════════════════ */
async function explainBase(question, answer, category, uid) {
  var catLabel = ctxEngine.label(category) || 'General Math';
  // Cache key is namespaced by the prompt version so a prompt bump busts the shared cache instead of
  // serving an explanation generated by an older, off-voice prompt forever (trust/consistency, ADR-045).
  var explainVersion = prompts.REGISTRY['explain.base'].version;
  var hash = _hash(String(question) + ':' + String(answer));
  var cacheRef = db().collection('explanations').doc(hash + '_v' + explainVersion);

  var promptId = 'explain.base@' + explainVersion;
  var pieces = null;
  try {
    var cached = await cacheRef.get();
    if (cached.exists) { var c = cached.data(); pieces = { concept: c.concept, steps: c.steps, mistake: c.mistake, tip: c.tip }; cacheRef.update({ usageCount: (c.usageCount || 0) + 1 }).catch(function () {}); }
  } catch (e) { console.warn('[aiBrain] explain cache read failed:', e.message); }

  if (!pieces) {
    var mem = await aiService.getMemory(uid);
    var struggled = !!(mem && Array.isArray(mem.recentTopicsExplained) && mem.recentTopicsExplained.indexOf(category) >= 0);
    try {
      var p = prompts.get('explain.base', { question: llm.wrapData(question, 400), answer: String(answer).slice(0, 50), catLabel: catLabel, depth: 'standard', struggledBefore: struggled, examName: (mem && mem.examName) || '' });
      promptId = _promptId(p);
      var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature, validate: p.validate });
      aiService.trackGptCost(uid, r.usage);
      pieces = r.data;
      cacheRef.set({ questionId: hash, promptVersion: explainVersion, question: String(question), answer: String(answer), category: category || '', concept: pieces.concept, steps: pieces.steps, mistake: pieces.mistake, tip: pieces.tip, usageCount: 1, createdAt: admin.firestore.FieldValue.serverTimestamp() }).catch(function (e) { console.warn('[aiBrain] explain cache write failed:', e.message); });
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
    chipDeep('Drill this', 'focus', category, catLabel, '⚡')
  ], { promptId: promptId, topic: category, question: String(question).slice(0, 300), answer: String(answer).slice(0, 50) });
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
    return envelope(feature, [say(userTurn === 'helpful_yes' ? 'Great — keep that momentum.' : 'Got it, I\'ll go more thorough next time.')], [chipDeep('Drill ' + catLabel, 'focus', topic, catLabel, '⚡')], { ack: true });
  }
  if (userTurn === 'explain_simpler') aiService.updateMemory(uid, { preferredDepth: 'concise' }, 'feedback');
  if (userTurn === 'explain_deeper') aiService.updateMemory(uid, { preferredDepth: 'deep' }, 'feedback');

  var hint = userTurn === 'explain_simpler' ? 'Re-explain this much more simply, in 2-3 big steps.'
    : userTurn === 'explain_deeper' ? 'Explain this more deeply, with the reasoning behind each step.'
    : userTurn === 'explain_another' ? 'Give one fresh worked example of the same concept (different numbers).'
    : userTurn.indexOf('coach_followup:') === 0 ? userTurn.slice(15)
    : userTurn.indexOf('insights_why') === 0 ? 'Explain in plain terms why this is the student\'s weakness and the single best fix.'
    : userTurn;

  var ctx = await ctxEngine.buildContext(uid);
  var history = Array.isArray(body.history) ? body.history.slice(-6).map(function (h) { return (h.role === 'user' ? 'Student: ' : 'You: ') + String(h.content || '').slice(0, 200); }).join('\n') : '';
  try {
    var p = prompts.get('chat.turn', { topic: catLabel, context: ctxEngine.serialize(ctx, 700), history: llm.wrapData(history, 900), userTurn: llm.wrapData(hint, 400), examName: _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    var d = r.data;
    var blocks = [say(d.say)];
    if (Array.isArray(d.steps) && d.steps.length) blocks.push(steps(d.steps));
    var chips = (feature === 'explain')
      ? [chipReply('Got it ✓', 'helpful_yes'), chipReply('Another', 'explain_another'), chipDeep('Drill this', 'focus', topic, catLabel, '⚡')]
      : [chipReply('Got it ✓', 'helpful_yes')];
    return envelope(feature, blocks, chips, { promptId: _promptId(p), topic: topic });
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
  var ctx = await ctxEngine.buildContext(uid, { force: true }); // a re-plan must use the freshest data
  var examName = String(params.examName || 'CAT').slice(0, 60);
  var examDate = String(params.examDate || '').slice(0, 10);
  var dailyMinutes = Math.max(15, Math.min(360, parseInt(params.dailyMinutes) || 45));
  var goal = String(params.goal || '').slice(0, 120);
  var daysRemaining = examDate ? Math.max(1, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)) : 60;
  var weakCats = _weakCats(ctx);

  // memory write (interview → memory)
  aiService.updateMemory(uid, { examName: examName, examDate: examDate, goal: goal, dailyMinutes: dailyMinutes, confidence: params.confidence, timelineEntry: { feature: 'plan', summary: 'Started a mission for ' + examName + '.' } }, 'interview');

  var plan;
  try {
    var p = prompts.get('plan.generate', { examName: examName, daysRemaining: daysRemaining, dailyMinutes: dailyMinutes, goal: llm.wrapData(goal || 'improve overall', 120), context: ctxEngine.serialize(ctx), topicList: _topicList() });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature });
    aiService.trackGptCost(uid, r.usage);
    plan = r.data;
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    var weakLabels = weakCats.slice(0, 3).map(function (m) { return { topicLabel: m.label, goal: 'Lift accuracy above 70%.' }; });
    plan = { rationale: 'A focused plan built around your weakest topics, with daily targeted practice.', weekFocus: weakLabels, phases: [{ name: 'Build accuracy', durationDays: Math.min(daysRemaining, 21) }, { name: 'Build speed', durationDays: Math.max(1, daysRemaining - 21) }] };
  }

  // Ground topics to real categories + force a feasible timeline (deterministic — the model can't hallucinate a syllabus).
  plan = planLogic.normalizePlan(plan, { daysRemaining: daysRemaining, weakCats: weakCats });

  var doc = { uid: uid, examName: examName, examDate: examDate, dailyMinutes: dailyMinutes, goal: goal,
    rationale: plan.rationale, weekFocus: plan.weekFocus, phases: plan.phases,
    weekStartedAt: new Date().toISOString(), progress: {}, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  db().collection('aiMissions').doc(uid).set(doc, { merge: true }).catch(function (e) { console.warn('[aiBrain] mission write failed:', e.message); });

  return _missionEnvelope(ctx, doc);
}

async function missionToday(uid, opts) {
  opts = opts || {};
  var ctx = await ctxEngine.buildContext(uid, { force: !!opts.force });
  var got = await missionGet(uid);
  if (!got.plan) return { plan: null };
  return _missionEnvelope(ctx, got.plan);
}

function _missionEnvelope(ctx, plan) {
  // Live progress derived deterministically from real practice (no LLM) — this is what makes the plan feel alive.
  var prog = planLogic.missionProgress(plan, {
    mastery: ctx.mastery || [], weekCats: ctx.weekCats || [],
    todayCats: (ctx.today && ctx.today.cats) || [], weekStartedAt: plan.weekStartedAt, now: Date.now()
  });
  var todaySet = {}; ((ctx.today && ctx.today.cats) || []).forEach(function (c) { todaySet[c] = true; });

  // Drive "today's drill" from the plan's own weekly focus (first topic not yet done today) so the stated plan
  // and the launched drill never diverge. Fall back to the top weak category for legacy/empty plans.
  var dailyFocus = null, dailyDone = false;
  for (var i = 0; i < prog.focus.length; i++) { if (prog.focus[i].cat && !todaySet[prog.focus[i].cat]) { dailyFocus = prog.focus[i]; break; } }
  if (!dailyFocus && prog.focus.length) { dailyFocus = prog.focus[0]; dailyDone = true; }
  var weak = ctxEngine.topWeakCategory(ctx) || { cat: '', label: 'mixed practice' };
  var driveCat = dailyFocus ? dailyFocus.cat : weak.cat;
  var driveLabel = dailyFocus ? dailyFocus.label : weak.label;
  var estMin = plan.dailyMinutes ? Math.min(plan.dailyMinutes, 15) : 10;

  var daysToExam = plan.examDate ? Math.max(0, Math.ceil((new Date(plan.examDate).getTime() - Date.now()) / 86400000)) : null;

  var blocks = [
    say(plan.rationale || 'Here\'s your living plan — it adapts every week from your real progress.'),
    dailyDone
      ? missionBlock('Done today ✓ — extra set: ' + driveLabel, 'You\'ve hit your focus today. One more set locks it in.', 'focus', driveCat, driveLabel, estMin)
      : missionBlock('Today: drill ' + driveLabel, 'Your highest-impact topic this week.', 'focus', driveCat, driveLabel, estMin)
  ];

  // This week's focus — annotated with the student's REAL accuracy and what they've already practiced.
  var focusLines = prog.focus.map(function (f) {
    var accTxt = f.acc != null ? Math.round(f.acc * 100) + '%' : 'new';
    return (f.practicedThisWeek ? '✓ ' : '') + f.label + ' (' + accTxt + ')' + (f.goal ? ' — ' + f.goal : '');
  });
  if (focusLines.length) blocks.push(card('This week\'s focus', focusLines.join('\n'), 'blue', '🎯'));

  // Phase timeline with real done / in-progress state.
  var phaseDays = prog.phases.map(function (ph, i) {
    return { day: i + 1, label: ph.name, items: [ph.durationDays + ' days' + (ph.current ? ' · in progress' : '')], done: ph.done };
  });
  if (phaseDays.length) blocks.push({ type: 'timeline', days: phaseDays });

  if (prog.weekStale) blocks.push(callout('warn', 'This week\'s plan is ' + prog.daysIntoWeek + ' days old — tap "Adjust my plan" to refresh it from your latest progress.'));
  if (daysToExam != null) blocks.push(callout('info', daysToExam + ' days to ' + (plan.examName || 'your exam') + '.'));

  return { plan: plan, envelope: envelope('plan', blocks, [
    chipDeep(dailyDone ? 'Extra set' : 'Start today\'s drill', 'focus', driveCat, driveLabel, '⚡'),
    chipReply('Adjust my plan', 'plan_regen')
  ].concat(helpfulChips()), { promptId: 'plan.generate@' + prompts.REGISTRY['plan.generate'].version }) };
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
    var p = prompts.get('wp.generate', { topicLabel: topicLabel, difficulty: difficulty || 'medium', examName: _examOf(ctx) });
    var r = await llm.complete({ system: p.system, user: p.user, schema: p.schema, schemaName: p.schemaName, maxTokens: p.maxTokens, temperature: p.temperature, validate: p.validate });
    aiService.trackGptCost(uid, r.usage);
    return { problem: { question: r.data.question, answer: r.data.answer, options: r.data.options, explanation: r.data.explanation, category: target } };
  } catch (e) {
    if (e && e.usage) aiService.trackGptCost(uid, e.usage);
    return { error: 'generation_failed' };
  }
}

module.exports = { coachToday, insights, explainBase, chatTurn, missionGet, missionGenerate, missionToday, wordProblem };
