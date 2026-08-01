/**
 * duel-archive.check.js — pure-math tests for the Battle Archive aggregate engine (ADR-068).
 *
 * Drives services/duelStats.js (the SAME module api/duel.js folds into duelStats/summary inside the finalize
 * transaction) through scripted duel sequences and asserts personal aggregates, per-rival head-to-head, and
 * achievement unlocks. No firebase-admin — the math is pure, so this runs in `npm test`.
 *   node scripts/duel-archive.check.js
 */
'use strict';
var path = require('path');
var DS = require(path.join(__dirname, '..', 'services', 'duelStats.js'));

var pass = 0, fail = 0;
function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.error('  ✗ ' + label + '\n      got:  ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want)); }
}
function ok(label, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + label); } }

/* A duel "fact" from one player's POV → params for applyDuelToSummary. Defaults keep tests terse. */
function duel(o) {
  return Object.assign({
    outcome: 'win', opponentUid: 'opp', opponentName: 'Rival', myCorrect: 8, oppCorrect: 4, myAnswered: 10,
    questionCount: 10, myAccuracy: 80, oppAccuracy: 40, myAvgSolveSec: 4, myScore: 8200, oppScore: 4150,
    mySolveTotalSec: 40, durationSec: 60, completedAt: 1000
  }, o);
}
function fold(seq) { var s = null; seq.forEach(function (d) { s = DS.applyDuelToSummary(s, d); }); return s; }

console.log('duel-archive.check — Battle Archive aggregate math (ADR-068)');

/* ── 1. single win: aggregates + firstBlood/firstWin + perfect/lightning gating ── */
(function () {
  var s = fold([duel({ outcome: 'win', myCorrect: 8, questionCount: 10, myAvgSolveSec: 6 })]);
  var v = DS.deriveAggregateView(s);
  eq('1 totalDuels', v.totalDuels, 1);
  eq('1 wins', v.wins, 1);
  eq('1 winPct', v.winPct, 100);
  eq('1 currentStreak', v.currentStreak, 1);
  eq('1 avgAccuracy', v.avgAccuracy, 80);   // 8/10
  ok('1 firstBlood unlocked', !!s.achievements.firstBlood);
  ok('1 firstWin unlocked', !!s.achievements.firstWin);
  ok('1 NOT perfect (8/10)', !s.achievements.perfectDuel);
  ok('1 NOT lightning (6s avg)', !s.achievements.lightning);
  eq('1 highestScore', v.highestScore, 8200);
  eq('1 lowestScore', v.lowestScore, 8200);
})();

/* ── 2. perfect + lightning: all correct, fast win ── */
(function () {
  var s = fold([duel({ outcome: 'win', myCorrect: 10, questionCount: 10, myAvgSolveSec: 4 })]);
  ok('2 perfectDuel (10/10)', !!s.achievements.perfectDuel);
  ok('2 lightning (<5s win)', !!s.achievements.lightning);
})();

/* ── 3. loss does NOT unlock firstWin/perfect/lightning and resets streak ── */
(function () {
  var s = fold([
    duel({ outcome: 'win' }),
    duel({ outcome: 'loss', myCorrect: 3, oppCorrect: 9, myScore: 3000, oppScore: 9000 })
  ]);
  var v = DS.deriveAggregateView(s);
  eq('3 totalDuels', v.totalDuels, 2);
  eq('3 wins', v.wins, 1);
  eq('3 losses', v.losses, 1);
  eq('3 winPct', v.winPct, 50);
  eq('3 currentStreak reset', v.currentStreak, 0);
  eq('3 bestStreak', v.bestStreak, 1);
  eq('3 lowestScore', v.lowestScore, 3000);
  eq('3 highestScore', v.highestScore, 8200);
})();

/* ── 4. streak achievements: 5 then 10 in a row ── */
(function () {
  var seq = []; for (var i = 0; i < 5; i++) seq.push(duel({ outcome: 'win' }));
  var s5 = fold(seq);
  ok('4 streak5 at 5 wins', !!s5.achievements.streak5);
  ok('4 NOT streak10 at 5 wins', !s5.achievements.streak10);
  for (var j = 0; j < 5; j++) seq.push(duel({ outcome: 'win' }));
  var s10 = fold(seq);
  ok('4 streak10 at 10 wins', !!s10.achievements.streak10);
  eq('4 bestStreak 10', DS.deriveAggregateView(s10).bestStreak, 10);
})();

/* ── 5. win-count milestones 10 / 50 / 100 ── */
(function () {
  function nWins(n) { var seq = []; for (var i = 0; i < n; i++) seq.push(duel({ outcome: 'win' })); return fold(seq); }
  ok('5 tenWins at 10', !!nWins(10).achievements.tenWins);
  ok('5 NOT fiftyWins at 10', !nWins(10).achievements.fiftyWins);
  ok('5 fiftyWins at 50', !!nWins(50).achievements.fiftyWins);
  ok('5 hundredWins at 100', !!nWins(100).achievements.hundredWins);
})();

/* ── 6. rivalry head-to-head + revenge ── */
(function () {
  // lose twice to A (streak -2), then beat A → revenge + signed streak flips to +1
  var s = fold([
    duel({ opponentUid: 'A', opponentName: 'Ann', outcome: 'loss', myScore: 3000, oppScore: 9000, myAccuracy: 30 }),
    duel({ opponentUid: 'A', opponentName: 'Ann', outcome: 'loss', myScore: 4000, oppScore: 9000, myAccuracy: 40 }),
    duel({ opponentUid: 'A', opponentName: 'Ann', outcome: 'win', myScore: 9000, oppScore: 8900, myAccuracy: 90, mySolveTotalSec: 25, durationSec: 99 })
  ]);
  var r = DS.deriveRivalView(s, 'A');
  eq('6 battles', r.battles, 3);
  eq('6 wins', r.wins, 1);
  eq('6 losses', r.losses, 2);
  eq('6 headToHeadPct', r.headToHeadPct, 33);
  eq('6 streak +1 (just won)', r.streak, 1);
  eq('6 lastOutcome', r.lastOutcome, 'win');
  eq('6 closestMargin (|9000-8900|)', r.closestMargin, 100);
  ok('6 revenge unlocked', !!s.achievements.revenge);
  eq('6 fastestWin = own solve time (25), NOT wall clock (99)', r.fastestWinSec, 25);
})();

/* ── 6b. fastestWin tracks the WINNER'S own solve time (min across wins), ignores durationSec ── */
(function () {
  var s = fold([
    duel({ outcome: 'win', mySolveTotalSec: 50, durationSec: 10 }),
    duel({ outcome: 'win', mySolveTotalSec: 18, durationSec: 80 }),
    duel({ outcome: 'loss', mySolveTotalSec: 5, durationSec: 5 })   // a loss never counts toward fastest WIN
  ]);
  var v = DS.deriveAggregateView(s);
  eq('6b fastestWinSec = min own win solve (18)', v.fastestWinSec, 18);
})();

/* ── 7. revenge NOT triggered when you were already winning the rivalry ── */
(function () {
  var s = fold([
    duel({ opponentUid: 'B', outcome: 'win' }),
    duel({ opponentUid: 'B', outcome: 'win' })
  ]);
  ok('7 no revenge (was winning)', !s.achievements.revenge);
})();

/* ── 8. top rivals: most played vs most defeated ── */
(function () {
  var s = fold([
    duel({ opponentUid: 'X', opponentName: 'Xavier', outcome: 'loss', myScore: 1, oppScore: 9 }),
    duel({ opponentUid: 'X', opponentName: 'Xavier', outcome: 'loss', myScore: 1, oppScore: 9 }),
    duel({ opponentUid: 'X', opponentName: 'Xavier', outcome: 'loss', myScore: 1, oppScore: 9 }),
    duel({ opponentUid: 'Y', opponentName: 'Yara', outcome: 'win' }),
    duel({ opponentUid: 'Y', opponentName: 'Yara', outcome: 'win' })
  ]);
  var top = DS.deriveTopRivals(s);
  eq('8 mostPlayed = X (3 battles)', top.mostPlayed.uid, 'X');
  eq('8 mostDefeated = Y (2 wins)', top.mostDefeated.uid, 'Y');
})();

/* ── 9. avg accuracy + avg solve are exact (maintained sums, not client recompute) ── */
(function () {
  var s = fold([
    duel({ myCorrect: 6, questionCount: 10, myAvgSolveSec: 4 }),
    duel({ myCorrect: 9, questionCount: 10, myAvgSolveSec: 6 })
  ]);
  var v = DS.deriveAggregateView(s);
  eq('9 avgAccuracy (15/20)', v.avgAccuracy, 75);
  eq('9 avgSolveSec ((4+6)/2)', v.avgSolveSec, 5);
})();

/* ── 10. idempotent shape: applyDuelToSummary never mutates the prior summary object ── */
(function () {
  var s1 = fold([duel({ outcome: 'win' })]);
  var snapshot = JSON.stringify(s1);
  DS.applyDuelToSummary(s1, duel({ outcome: 'loss' }));   // fold a new duel from s1
  eq('10 prior summary not mutated', JSON.stringify(s1), snapshot);
})();

/* ── 11. the client render loop cannot re-enter forever (ADR-130) ──
   _renderTrigger() re-enters itself via `if (!have) _loadSummary().then(… _renderTrigger())`, where
   `have` is `_summary != null`. Every _loadSummary() return path must therefore ASSIGN _summary —
   otherwise the pair recurses through microtasks forever, rewriting innerHTML and attaching a listener
   each pass. Measured before the fix: it KILLS THE RENDERER (the tab dies; a page-level try/catch cannot
   intercept it, because nothing throws). The uid-guard was the one path that returned
   `Promise.resolve(null)` without assigning, and it is reachable because render()'s premium flag comes
   from the ENTITLEMENT cache (hasPremiumAccess, home-view.js) while _uid() comes from AUTH — two sources
   with no guarantee they agree. Executed coverage is impractical here (it needs a live Firestore handle),
   so this is a deliberate SOURCE assertion: it pins the shape that made the loop terminate. */
(function () {
  var fs = require('fs');
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'duel-archive.js'), 'utf8');
  /* Comments are stripped first: the fix's own explanatory comment quotes the old
     `return Promise.resolve(null)`, and a guard that a comment can satisfy is not a guard. */
  function strip(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
  var body = strip(src.slice(src.indexOf('function _loadSummary'), src.indexOf('function _loadPage')));
  eq('11 the re-entry guard still keys on _summary', /var have = _summary != null;/.test(src), true);
  eq('11 _renderTrigger still re-enters through _loadSummary', /if \(!have\) \{ _loadSummary\(\)/.test(src), true);
  /* The loop is broken at the CALL SITE: re-enter only when the promise actually produced a summary.
     Every path except the uid-guard assigns a truthy _summary, so this re-enters at most once. */
  eq('11 the re-entry is gated on the RESOLVED summary (loop terminates)',
    /if \(!have\) \{ _loadSummary\(\)\.then\(function \(s\) \{ if \(s && !_isOpen\(\)\) _renderTrigger\(\); \}\); \}/.test(strip(src)), true);
  /* …and NOT by assigning a placeholder here. _summary is the "have I loaded?" sentinel for both
     _renderTrigger (`have`) and _loadAndPaint (`needSummary`); poisoning it to break the loop would leave a
     premium user's archive stuck on the empty state with 0 rivals and 0 achievements for the session. */
  eq('11 the uid-guard resolves WITHOUT assigning _summary (lazy load survives)',
    /if \(!uid\) return Promise\.resolve\(null\);/.test(body), true);
  eq('11 _summary is assigned only inside the fetch then/catch',
    (body.match(/_summary =/g) || []).length, 2);
})();

console.log('\nduel-archive.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
