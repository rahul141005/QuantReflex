/**
 * test-ai.js — deterministic unit tests for QuanAI's non-LLM logic (ADR-045).
 *
 * Plain Node + assert (no framework, no new tooling — runs with `npm test` in main-app). We test the
 * deterministic SURROUND of the AI (topic grounding, plan feasibility, live progress) — never the model's
 * prose. Run: `node scripts/test-ai.js`. Exits non-zero on any failure.
 */
var assert = require('assert');
var topics = require('../services/quantTopics');
var planLogic = require('../services/planLogic');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}

/* ───────────────── quantTopics.nearestCategory ───────────────── */
console.log('quantTopics.nearestCategory');
test('exact category key resolves', function () {
  assert.strictEqual(topics.nearestCategory('ratios'), 'ratios');
});
test('"Time & Speed" → time-speed-distance', function () {
  assert.strictEqual(topics.nearestCategory('Time & Speed'), 'time-speed-distance');
});
test('"Profit & Loss" → profit-loss (phrase beats token)', function () {
  assert.strictEqual(topics.nearestCategory('Profit & Loss'), 'profit-loss');
});
test('"P&L tricks" → profit-loss', function () {
  assert.strictEqual(topics.nearestCategory('P&L tricks'), 'profit-loss');
});
test('"Squares and Roots" → squares', function () {
  assert.strictEqual(topics.nearestCategory('Squares and Roots'), 'squares');
});
test('"Pipes and Cisterns" → time-and-work', function () {
  assert.strictEqual(topics.nearestCategory('Pipes and Cisterns'), 'time-and-work');
});
test('unknown topic → null (no hallucinated mapping)', function () {
  assert.strictEqual(topics.nearestCategory('underwater basket weaving'), null);
  assert.strictEqual(topics.nearestCategory(''), null);
  assert.strictEqual(topics.nearestCategory(null), null);
});

/* ───────────────── planLogic.normalizePlan ───────────────── */
console.log('planLogic.normalizePlan');
test('phase durations are scaled to sum to daysRemaining', function () {
  var out = planLogic.normalizePlan({ phases: [{ name: 'A', durationDays: 10 }, { name: 'B', durationDays: 10 }] }, { daysRemaining: 30, weakCats: [] });
  var sum = out.phases.reduce(function (a, p) { return a + p.durationDays; }, 0);
  assert.strictEqual(sum, 30);
  out.phases.forEach(function (p) { assert.ok(p.durationDays >= 1 && Number.isInteger(p.durationDays)); });
});
test('odd totals distribute remainder without losing days', function () {
  var out = planLogic.normalizePlan({ phases: [{ durationDays: 1 }, { durationDays: 1 }, { durationDays: 1 }] }, { daysRemaining: 100, weakCats: [] });
  assert.strictEqual(out.phases.reduce(function (a, p) { return a + p.durationDays; }, 0), 100);
});
test('free-text focus topics are grounded to real categories; junk dropped', function () {
  var out = planLogic.normalizePlan({
    weekFocus: [{ topicLabel: 'Time & Speed', goal: 'g1' }, { topicLabel: 'Astrophysics', goal: 'g2' }, { topicLabel: 'Ratios', goal: 'g3' }],
    phases: [{ name: 'P', durationDays: 5 }]
  }, { daysRemaining: 20, weakCats: [] });
  var cats = out.weekFocus.map(function (f) { return f.cat; });
  assert.deepStrictEqual(cats, ['time-speed-distance', 'ratios']);
  out.weekFocus.forEach(function (f) { assert.ok(f.cat && topics.CATEGORY_LABELS[f.cat]); });
});
test('empty/all-junk focus backfills from weak categories', function () {
  var out = planLogic.normalizePlan({ weekFocus: [{ topicLabel: 'qwerty', goal: 'x' }], phases: [] },
    { daysRemaining: 40, weakCats: [{ cat: 'ratios', label: 'Ratios' }, { cat: 'averages', label: 'Averages' }] });
  assert.strictEqual(out.weekFocus.length, 2);
  assert.deepStrictEqual(out.weekFocus.map(function (f) { return f.cat; }), ['ratios', 'averages']);
});
test('caps: <=5 focus, <=4 phases', function () {
  var many = [];
  for (var i = 0; i < 9; i++) many.push({ topicLabel: 'Ratios', goal: 'g' });
  var phs = [];
  for (var j = 0; j < 9; j++) phs.push({ name: 'P' + j, durationDays: 3 });
  var out = planLogic.normalizePlan({ weekFocus: many, phases: phs }, { daysRemaining: 30, weakCats: [{ cat: 'averages', label: 'Averages' }] });
  assert.ok(out.weekFocus.length <= 5);
  assert.ok(out.phases.length <= 4);
  // duplicate ratios collapse to one unique cat
  assert.strictEqual(out.weekFocus.filter(function (f) { return f.cat === 'ratios'; }).length, 1);
});
test('no phases → sane default summing to days', function () {
  var out = planLogic.normalizePlan({}, { daysRemaining: 14, weakCats: [{ cat: 'fractions', label: 'Fractions' }] });
  assert.ok(out.phases.length >= 1);
  assert.strictEqual(out.phases.reduce(function (a, p) { return a + p.durationDays; }, 0), 14);
  assert.ok(out.weekFocus.length >= 1);
});

/* ───────────────── planLogic.missionProgress ───────────────── */
console.log('planLogic.missionProgress');
var DAY = 86400000;
test('phases mark done / current from elapsed days', function () {
  var plan = { phases: [{ name: 'A', durationDays: 10 }, { name: 'B', durationDays: 20 }], weekStartedAt: new Date(Date.now() - 12 * DAY).toISOString(), weekFocus: [] };
  var p = planLogic.missionProgress(plan, { mastery: [], weekCats: [], todayCats: [] });
  assert.strictEqual(p.daysIntoWeek, 12);
  assert.strictEqual(p.phases[0].done, true);
  assert.strictEqual(p.phases[1].current, true);
  assert.strictEqual(p.phases[1].done, false);
  assert.strictEqual(p.weekStale, true);
});
test('focus gets real accuracy, practicedThisWeek, met, todayDoneCat', function () {
  var plan = { phases: [{ name: 'A', durationDays: 30 }], weekStartedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    weekFocus: [{ topicLabel: 'Ratios', cat: 'ratios', goal: 'g' }] };
  var p = planLogic.missionProgress(plan, { mastery: [{ cat: 'ratios', acc: 0.82 }], weekCats: ['ratios'], todayCats: ['ratios'] });
  assert.strictEqual(p.focus[0].acc, 0.82);
  assert.strictEqual(p.focus[0].practicedThisWeek, true);
  assert.strictEqual(p.focus[0].met, true);
  assert.strictEqual(p.todayDoneCat, 'ratios');
  assert.strictEqual(p.weekStale, false);
});
test('not practiced today → todayDoneCat null; legacy focus without cat resolves', function () {
  var plan = { phases: [{ name: 'A', durationDays: 30 }], weekStartedAt: new Date().toISOString(),
    weekFocus: [{ topicLabel: 'Time & Speed', goal: 'g' }] };
  var p = planLogic.missionProgress(plan, { mastery: [{ cat: 'time-speed-distance', acc: 0.5 }], weekCats: [], todayCats: [] });
  assert.strictEqual(p.focus[0].cat, 'time-speed-distance');
  assert.strictEqual(p.focus[0].met, false);
  assert.strictEqual(p.todayDoneCat, null);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
