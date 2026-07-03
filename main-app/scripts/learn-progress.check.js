/**
 * learn-progress.check.js — unit tests for the Learn progress / spaced-revision module (ADR-069, Phase 4).
 *
 * learn-progress.js is localStorage-driven, so we give it a tiny localStorage stub (no jsdom) and exercise the full
 * public surface plus the PURE recency/due helpers (computeRecent/computeDue) that drive the Continue & Due-for-
 * revision strips. No DOM, no Firestore — the module degrades to localStorage-only when neither is present.
 *   node scripts/learn-progress.check.js
 */
'use strict';
var path = require('path');

/* ---- minimal localStorage stub ---- */
var _store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};

var LP = require(path.join(__dirname, '..', 'js', 'learn', 'learn-progress.js'));
var DAY = 86400000;

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }
function reset() { _store = {}; }

console.log('learn-progress.check — Learn progress & spaced revision (ADR-069 Phase 4)');

/* ---- progress: view / complete ---- */
reset();
ok('unseen topic is not viewed', LP.isViewed('percentages') === false);
LP.markViewed('percentages');
ok('markViewed flips isViewed', LP.isViewed('percentages') === true);
ok('viewedAt is a positive timestamp', LP.viewedAt('percentages') > 0);
ok('markViewed does not auto-complete', LP.isComplete('percentages') === false);
ok('toggleComplete returns true on first call', LP.toggleComplete('percentages') === true);
ok('isComplete true after toggle', LP.isComplete('percentages') === true);
ok('completedCount counts it', LP.completedCount() === 1);
ok('toggleComplete returns false on second call', LP.toggleComplete('percentages') === false);
ok('isComplete false after un-toggle', LP.isComplete('percentages') === false);
ok('completedCount back to 0', LP.completedCount() === 0);
ok('toggleComplete on never-viewed topic still works', LP.toggleComplete('ratio-proportion') === true && LP.isComplete('ratio-proportion'));
ok('markViewed(falsy) is a no-op', (function () { LP.markViewed(''); return LP.isViewed('') === false; })());

/* ---- topic bookmarks ---- */
reset();
ok('topic not bookmarked initially', LP.isBookmarked('averages') === false);
ok('toggleBookmark returns true when adding', LP.toggleBookmark('averages') === true);
ok('isBookmarked true after add', LP.isBookmarked('averages') === true);
ok('bookmarkedIds contains it', LP.bookmarkedIds().indexOf('averages') !== -1);
ok('toggleBookmark returns false when removing', LP.toggleBookmark('averages') === false);
ok('isBookmarked false after remove', LP.isBookmarked('averages') === false);

/* ---- pure: computeRecent ---- */
var rmap = {
  a: { viewedAt: 1000, completedAt: null },
  b: { viewedAt: 3000, completedAt: null },
  c: { viewedAt: 2000, completedAt: null },
  d: { completedAt: 5000 }                     // no viewedAt → excluded
};
var rec = LP.computeRecent(rmap, 2);
ok('computeRecent newest-first', rec[0] === 'b' && rec[1] === 'c');
ok('computeRecent honours limit', rec.length === 2);
ok('computeRecent drops entries without viewedAt', LP.computeRecent(rmap, 10).indexOf('d') === -1);
ok('computeRecent on empty map → []', LP.computeRecent({}, 5).length === 0);

/* ---- pure: computeDue (spaced revision) ---- */
var now = 100 * DAY;
var topics = [
  { id: 'p', revisionIntervalDays: 3 },
  { id: 'q', revisionIntervalDays: 10 },
  { id: 'r', revisionIntervalDays: 5 }
];
var dmap = {
  p: { viewedAt: now - 4 * DAY },   // 4 >= 3 → due
  q: { viewedAt: now - 4 * DAY },   // 4 <  10 → not due
  r: { viewedAt: now - 20 * DAY },  // 20 >= 5 → due (most overdue)
  z: { viewedAt: now - 99 * DAY }   // unknown topic → excluded
};
var due = LP.computeDue(dmap, topics, now);
ok('computeDue includes overdue topics', due.indexOf('p') !== -1 && due.indexOf('r') !== -1);
ok('computeDue excludes not-yet-due', due.indexOf('q') === -1);
ok('computeDue excludes unknown topics', due.indexOf('z') === -1);
ok('computeDue oldest-first (most overdue leads)', due[0] === 'r');
ok('computeDue defaults interval when missing', (function () {
  var d = LP.computeDue({ x: { viewedAt: now - 6 * DAY } }, [{ id: 'x' }], now); // default 5 → 6>=5 due
  return d.length === 1 && d[0] === 'x';
})());
ok('computeDue on empty map → []', LP.computeDue({}, topics, now).length === 0);

/* ---- live recent()/due() read from localStorage ---- */
reset();
LP.markViewed('t1');
LP.markViewed('t2');
ok('recent() reflects live store', (function () { var r = LP.recent(5); return r.length === 2 && r.indexOf('t1') !== -1 && r.indexOf('t2') !== -1; })());
ok('due() with far-future interval → none', LP.due([{ id: 't1', revisionIntervalDays: 999 }, { id: 't2', revisionIntervalDays: 999 }]).length === 0);

/* ---- resilience: corrupt storage never throws ---- */
reset();
_store[LP.PROGRESS_KEY] = '{not json';
ok('corrupt progress JSON degrades to empty', LP.isViewed('x') === false && LP.completedCount() === 0);
_store[LP.BOOKMARK_KEY] = '{not an array';
ok('corrupt bookmark JSON degrades to empty', LP.bookmarkedIds().length === 0);

/* ---- guided revision flow: pure queue builder (ADR-092) ---- */
var RF = require(path.join(__dirname, '..', 'js', 'learn', 'revise-flow.js'));
ok('buildQueue preserves due order', (function () {
  var q = RF.buildQueue(['r', 'p', 'q'], 10); return q.length === 3 && q[0] === 'r' && q[2] === 'q';
})());
ok('buildQueue caps a long backlog', RF.buildQueue(['a', 'b', 'c', 'd'], 2).length === 2);
ok('buildQueue defaults its cap to 10', RF.buildQueue('abcdefghijklm'.split('')).length === 10);
ok('buildQueue on empty/undefined → []', RF.buildQueue([]).length === 0 && RF.buildQueue(undefined).length === 0);
ok('buildQueue does not mutate its input', (function () {
  var input = ['a', 'b', 'c']; RF.buildQueue(input, 2); return input.length === 3;
})());

console.log('\nlearn-progress.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
