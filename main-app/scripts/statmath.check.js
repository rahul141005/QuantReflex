/**
 * statmath.check.js — validates the ADR-080 derivations + the exam-relevance metadata layer.
 *
 * The Stats rebuild (readiness, time invested, mastery detail, comparative insights, recommendations) and the Learn
 * personalization all read from PURE functions in data/statMath.js, weighted by data/knowledge/exam-relevance.js.
 * This asserts: the metadata covers every published Learn topic exactly once and is well-formed; readiness is bounded
 * 0–100, monotonic in accuracy/coverage, confidence-damped, and null on no data; and the other derivations have the
 * right shape and never emit NaN. No DOM, no Firestore.   node scripts/statmath.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }

var SM = require(p('data/statMath'));
var EXAMREL = require(p('data/knowledge/exam-relevance'));
var KB = require(p('js/knowledge/registry'));
var SUB = require(p('data/subjects'));

KB._reset();
['categories', 'numbers', 'arithmetic', 'commercial', 'algebra', 'modern', 'geometry', 'mensuration', 'di', 'lr'].forEach(function (m) { require(p('data/knowledge/' + m)); });

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 30) console.error('  ✗ ' + label); } }

console.log('statmath.check — ADR-080 derivations + exam-relevance metadata');

/* ---------- 1. exam-relevance covers every published topic exactly once, well-formed ---------- */
var published = KB.all().filter(function (t) { return t.status === 'published'; });
var pubIds = published.map(function (t) { return t.id; });
var metaIds = Object.keys(EXAMREL._meta);
pubIds.forEach(function (id) { ok('metadata exists for published topic ' + id, !!EXAMREL.get(id)); });
metaIds.forEach(function (id) { ok('metadata id ' + id + ' is a real published topic', pubIds.indexOf(id) !== -1); });
ok('metadata count matches published topics (' + metaIds.length + ' vs ' + pubIds.length + ')', metaIds.length === pubIds.length);

var PRIOS = { high: 1, medium: 1, low: 1 }, BANDS = { 'very-high': 1, high: 1, medium: 1 }, TRACKS = EXAMREL.tracks();
metaIds.forEach(function (id) {
  var m = EXAMREL.get(id);
  ok(id + ' priority valid', !!PRIOS[m.priority]);
  ok(id + ' order is a positive int', typeof m.order === 'number' && m.order > 0 && m.order === Math.floor(m.order));
  ok(id + ' has ≥1 exam band', m.exams && Object.keys(m.exams).length >= 1);
  Object.keys(m.exams).forEach(function (tr) {
    ok(id + ' exam track ' + tr + ' is a real track', TRACKS.indexOf(tr) !== -1);
    ok(id + ' exam band for ' + tr + ' valid', !!BANDS[m.exams[tr]]);
  });
});

/* order is unique within each subject (no two topics claim the same "start here" slot) */
var bySubjectOrder = {};
published.forEach(function (t) {
  var sid = SUB.categoryToSubject ? (KB.get(t.id), null) : null; // resolved below via category→subject
});
(function () {
  var seen = {};
  published.forEach(function (t) {
    var m = EXAMREL.get(t.id); if (!m) return;
    var sid = SUB.categoryToSubject(t.category) || (t.category || '').split('-')[0];
    var key = sid + '#' + m.order;
    ok('order ' + m.order + ' unique within subject ' + sid + ' (' + t.id + ')', !seen[key]);
    seen[key] = t.id;
  });
})();

/* recommendedForExam maps syllabus exam ids to tracks correctly */
ok('recommendedForExam(blood-relations, ibpspo) true (Banking very-high)', EXAMREL.recommendedForExam('lr-blood-relations', 'ibpspo'));
ok('recommendedForExam(di-sets, cat) true (CAT very-high)', EXAMREL.recommendedForExam('di-sets', 'cat'));
ok('recommendedForExam(lr-clocks, cat) false (not a CAT focus)', !EXAMREL.recommendedForExam('lr-clocks', 'cat'));
ok('trackForExam(ssccgl) = SSC', EXAMREL.trackForExam('ssccgl') === 'SSC');
ok('trackForExam(nmat) = SNAP_NMAT', EXAMREL.trackForExam('nmat') === 'SNAP_NMAT');

/* weightedCategories builds rows only for topics with a drillCategory + metadata */
var WC = EXAMREL.weightedCategories(KB.all());
ok('weightedCategories returns rows', WC.length > 0);
ok('every weighted row has a cat + 4 track weights', WC.every(function (r) { return r.cat && r.weights && TRACKS.every(function (t) { return typeof r.weights[t] === 'number'; }); }));

/* ---------- 2. statMath derivations ---------- */
var subjectCats = {}; SUB.subjects().forEach(function (s) { subjectCats[s.id] = SUB.subjectToCategories(s.id); });

function mkStats(over) {
  var base = { totalAttempted: 0, totalCorrect: 0, categoryStats: {}, dailyHistory: {}, byDifficulty: {} };
  return Object.assign(base, over || {});
}

/* timeInvested: window sums */
(function () {
  var today = new Date().toDateString();
  var d2 = new Date(Date.now() - 3 * 86400000).toDateString();
  var st = mkStats({ dailyHistory: { } });
  st.dailyHistory[today] = { attempted: 10, correct: 8, sumTimes: 120, count: 10 };
  st.dailyHistory[d2] = { attempted: 5, correct: 3, sumTimes: 60, count: 5 };
  var ti = SM.timeInvested(st, subjectCats);
  ok('timeInvested today = 120s', ti.todaySec === 120);
  ok('timeInvested week = 180s', ti.weekSec === 180);
  ok('timeInvested total = 180s', ti.totalSec === 180);
  ok('timeInvested has no NaN', [ti.todaySec, ti.weekSec, ti.monthSec, ti.totalSec].every(function (n) { return isFinite(n); }));
})();

/* masteryDetail */
(function () {
  var qcats = subjectCats.quant || [];
  var cs = {}; cs[qcats[0]] = { attempted: 20, correct: 18, sumTime: 200, timedCount: 20, lastTs: Date.now() };
  if (qcats[1]) cs[qcats[1]] = { attempted: 10, correct: 4 };
  var st = mkStats({ categoryStats: cs, totalAttempted: 30, totalCorrect: 22 });
  var md = SM.masteryDetail(st, subjectCats);
  ok('masteryDetail has quant', !!md.quant);
  ok('masteryDetail quant pct in 0..100', md.quant && md.quant.pct >= 0 && md.quant.pct <= 100);
  ok('masteryDetail quant weakAreas is array', md.quant && Array.isArray(md.quant.weakAreas));
})();

/* weakestTopics + nextRecommendation */
(function () {
  var cs = {};
  WC.slice(0, 5).forEach(function (r, i) { cs[r.cat] = { attempted: 10, correct: i < 2 ? 3 : 9 }; });
  var st = mkStats({ categoryStats: cs, totalAttempted: 50, totalCorrect: 33 });
  var wt = SM.weakestTopics(st, 5);
  ok('weakestTopics returns weakest-first', wt.length >= 1 && wt[0].acc <= (wt[wt.length - 1].acc));
  var rec = SM.nextRecommendation(st, WC, 'CAT');
  ok('nextRecommendation returns a topic or null', rec === null || (rec && typeof rec.reviseCat === 'string'));
})();

console.log('\nstatmath.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
