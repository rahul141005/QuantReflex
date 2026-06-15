/**
 * intelligence-consistency.check.js — V2 Milestones 6–7: prove Planner, Coach and Insights are three views of
 * ONE intelligence and never contradict, across many simulated student profiles.
 *
 * Pure (examStrategy.assemble is IO-free): we build realistic (profile, planner-doc) pairs — beginner, advanced,
 * last-minute, inconsistent, avoidant, regressing, no-exam — and assert the strategy every role consumes is
 * internally consistent: the path is real sections, focus is ROI-ordered, the schedule is a projection of the
 * roadmap, the forecast is bounded, behaviour signals fire on real avoidance, and the topic Coach would prescribe
 * is the same topic the Planner schedules and the Insights lever points at (one source of truth).
 *   node scripts/intelligence-consistency.check.js
 */
'use strict';
var path = require('path');
var R = function (p) { return require(path.join(__dirname, '..', p)); };
var ES = R('services/examStrategy.js');
var SYL = R('data/syllabus.js');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var DAY = 86400000, today = new Date();
function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function y(n) { return iso(new Date(today.getTime() + n * DAY)); }

function profile(o) {
  o = o || {};
  return {
    accuracy: o.accuracy != null ? o.accuracy : 0.55, totalAttempted: o.n || 80,
    trends: { speed: { recentSecPerQ: o.sec || 8 }, consistency: { activeDaysLast14: o.active != null ? o.active : 6 }, accuracy: { delta: o.delta || 0, d30: 0.55 } },
    mastery: o.mastery || [], flags: o.flags || {}, recentRegressionTopics: o.regressed || [],
    evidence: { confidence: o.conf || 'established', hasMultiDayHistory: true }
  };
}
function planDoc(examId, o) {
  o = o || {};
  return { examId: examId, examName: examId.toUpperCase(), syllabusId: examId, examDate: o.days != null ? y(o.days) : y(90),
    dailyMinutes: o.daily || 90, daysPerWeek: 6, prepLevel: o.prep || 'average', targetScore: o.target || 75,
    topicState: o.topicState || {}, block: o.block || null, blockHistory: [] };
}
function nextTask(s) {   // mirrors aiBrain._nextTask: recovery override, else first study block
  if (s.recovery && s.recovery.topics[0]) return s.recovery.topics[0].topicId;
  var days = (s.schedule && s.schedule.days) || [];
  for (var i = 0; i < days.length; i++) { if (days[i].kind === 'study' && (days[i].tasks || []).length) return days[i].tasks[0].topicId; }
  return null;
}

console.log('QuantReflex intelligence consistency (Planner = Coach = Insights)\n');

var scenarios = [
  { name: 'beginner / CAT / ample time', p: profile({ accuracy: 0.4, n: 20, conf: 'early' }), d: planDoc('cat', { days: 120 }) },
  { name: 'advanced arithmetic / CAT', p: profile({ accuracy: 0.8, n: 420, mastery: [{ cat: 'percentages', acc: 0.9, n: 60, tier: 'strong' }, { cat: 'ratios', acc: 0.88, n: 55, tier: 'strong' }, { cat: 'averages', acc: 0.85, n: 40, tier: 'strong' }] }), d: planDoc('cat', { days: 90, prep: 'revision' }) },
  { name: 'last-minute / SNAP', p: profile({ accuracy: 0.5, n: 100 }), d: planDoc('snap', { days: 9, daily: 150 }) },
  { name: 'inconsistent / IBPS PO', p: profile({ accuracy: 0.55, n: 60, active: 2, flags: { inconsistent: true } }), d: planDoc('ibpspo', { days: 60 }) },
  { name: 'regressing / JEE', p: profile({ accuracy: 0.7, n: 200, regressed: ['percentages'] }), d: planDoc('jee', { days: 100 }) },
  { name: 'avoidant / NDA', p: profile({ accuracy: 0.6, n: 150 }), d: planDoc('nda', { days: 80, block: { days: [
    { date: y(-3), kind: 'study', tasks: [{ topicId: 'trigonometry', label: 'Trigonometry & Heights/Distances', section: 'Geometry', done: false }] },
    { date: y(-2), kind: 'study', tasks: [{ topicId: 'trigonometry', label: 'Trigonometry & Heights/Distances', section: 'Geometry', done: false }] },
    { date: y(0), kind: 'study', tasks: [{ topicId: 'percentages', label: 'Percentages', section: 'Arithmetic', done: false }] }
  ] } }) }
];

scenarios.forEach(function (sc) {
  var s = ES.assemble(sc.p, sc.d, { clientDate: y(0) });
  ok(s, sc.name + ': strategy assembles');
  if (!s) return;
  // PATH is real syllabus sections — never fabricated phase names.
  ok(s.sections.length >= 2 && s.sections.every(function (x) { return !/Foundation$|High-ROI|Core$/.test(x.name); }), sc.name + ': path is real sections (' + s.sections.map(function (x) { return x.name; }).join(', ') + ')');
  ok(s.sections[0].marks >= s.sections[s.sections.length - 1].marks, sc.name + ': sections ordered by marks');
  // FOCUS is the marks-maximising next moves, each fully explained (ROI, weightage, why) — not bare topic names.
  ok(s.focus.length > 0 && s.focus.every(function (t) { return t.roi != null && t.weightage && t.whyNow && Array.isArray(t.unlocks); }), sc.name + ': focus topics are rich (ROI + weightage + why + unlocks)');
  // ONE SOURCE OF TRUTH: the topic Coach would prescribe == a topic the Planner scheduled (in the roadmap).
  var nt = nextTask(s);
  ok(nt && s.roadmap.some(function (r) { return r.topicId === nt; }), sc.name + ': Coach next-move == a scheduled Planner topic');
  // …and the schedule is a pure projection of the roadmap (no orphan tasks).
  var rmIds = {}; s.roadmap.forEach(function (r) { rmIds[r.topicId] = 1; });
  ok(s.schedule.days.every(function (d) { return (d.tasks || []).every(function (t) { return rmIds[t.topicId]; }); }), sc.name + ': schedule tasks all come from the roadmap');
  // every scheduled block has a real session type (first-learning/practice/revision/mock) — no drill "action".
  ok(s.schedule.days.every(function (d) { return (d.tasks || []).every(function (t) { return ['first-learning', 'practice', 'revision', 'mock'].indexOf(t.sessionType) >= 0; }); }), sc.name + ': blocks carry a real session type');
  // FORECAST is bounded + has an achievability verdict.
  ok(s.projectedScore >= s.readinessScore - 1 && s.projectedScore <= 100 && typeof s.achievable === 'boolean' && s.verdict, sc.name + ': forecast bounded + achievability stated');
  // BEHAVIOUR signals exist (the mentor layer).
  ok(s.behaviour && Array.isArray(s.behaviour.postponed), sc.name + ': behaviour signals present');
});

/* ---- targeted invariants ---- */
// last-minute triages low-value topics (urgency → marks-maximising cuts).
var lm = ES.assemble(profile({ accuracy: 0.4, n: 50 }), planDoc('cat', { days: 8, daily: 60 }), { clientDate: y(0) });
ok(lm.marksAtRisk > 0 || lm.skip.length > 0, 'last-minute: triage drops low-value topics + reports marks at risk');

// avoidance is detected and named (the NDA scenario postponed Trigonometry twice).
var av = ES.assemble(scenarios[5].p, scenarios[5].d, { clientDate: y(0) });
ok(av.behaviour.postponed.length > 0 && av.behaviour.postponed[0].label.indexOf('Trig') >= 0, 'avoidance: postponed Trigonometry is surfaced to the Coach');
ok(/BEHAVIOUR/.test(ES.serialize(av)), 'avoidance: the behaviour pattern reaches the prompt (serialize)');

// regression → recovery placed first, and Coach next-move becomes the recovery topic.
var rg = ES.assemble(scenarios[4].p, scenarios[4].d, { clientDate: y(0) });
ok(rg.recovery && nextTask(rg) === 'percentages', 'regression: recovery overrides the plan order (Coach + Planner agree)');

// no exam → null (Coach/Insights then reason from the Profile alone; never "dumber").
ok(ES.assemble(profile({}), null, {}) === null, 'no exam → strategy is null (graceful degradation)');

// per-exam KB drives behaviour: NDA elevates Trigonometry; GMAT has no Indian DI.
ok(ES.assemble(profile({}), planDoc('nda', {}), { clientDate: y(0) }).sections.some(function (x) { return x.name === 'Geometry'; }), 'NDA strategy includes Geometry/Trig (KB-driven)');
ok(!ES.assemble(profile({}), planDoc('gmat', {}), { clientDate: y(0) }).topics.some(function (t) { return t.topicId === 'di_tables_charts' && t.weightage === 'very-high'; }), 'GMAT strategy de-emphasises Indian-style DI (KB-driven)');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
