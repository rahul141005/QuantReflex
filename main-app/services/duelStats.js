/**
 * duelStats.js — pure duel-aggregate math (ADR-068, Battle Archive).
 *
 * The SINGLE implementation of how a finished duel folds into a player's `users/{uid}/duelStats/summary`
 * doc (personal aggregates + per-rival head-to-head + unlocked achievements). Pure functions only — no
 * Firestore, no clock, no I/O — so the duel endpoint (`api/duel.js`, inside `_finalizeTxn`) and the
 * `scripts/duel-archive.check.js` harness share ONE source of truth and can't drift.
 *
 * Dual-export: CommonJS for the server (require) — the client never recomputes stats (it READS the
 * server-maintained doc), so there is no browser global to keep in sync here.
 */
'use strict';

/* avg-seconds-per-question below which a WIN earns the "Lightning" achievement. */
var LIGHTNING_SEC = 5;

function _round(n) { return Math.round(n); }
function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); }

/**
 * Fold ONE completed duel into a player's summary doc and return the NEW summary
 * (`{duelAggregates, rivals, achievements}`) to merge-write. Pure: given the prior summary + this duel's
 * facts, the output is deterministic (idempotency is the caller's job — only the single status→complete
 * transaction calls this, never a re-run after `complete`).
 *
 * `p` (this player's view of the duel):
 *   outcome 'win'|'loss'|'draw', opponentUid, opponentName,
 *   myCorrect, oppCorrect, myAnswered, questionCount,
 *   myAccuracy (0..100 int), oppAccuracy, myAvgSolveSec (sec/question), myScore, oppScore (duelScore),
 *   mySolveTotalSec (this player's OWN total solve time, sec — used for "fastest win"; falls back to
 *   myAvgSolveSec×questionCount), completedAt (ms). (durationSec/whole-duel wall time is stored on the history row
 *   for the card, not used here.)
 */
function applyDuelToSummary(prev, p) {
  prev = prev || {};
  var ag = Object.assign({
    totalDuels: 0, wins: 0, losses: 0, draws: 0,
    currentStreak: 0, bestStreak: 0,
    totalCorrect: 0, totalQuestions: 0, totalAnswered: 0,
    totalSolveSec: 0, solveSamples: 0,
    fastestWinSec: 0, highestScore: 0, lowestScore: 0,
    lastPlayedAt: 0, lastOutcome: null
  }, prev.duelAggregates || {});
  var rivals = Object.assign({}, prev.rivals || {});
  var ach = Object.assign({}, prev.achievements || {});

  var win = p.outcome === 'win', loss = p.outcome === 'loss';
  var avgSolve = _num(p.myAvgSolveSec);
  var qCount = _num(p.questionCount);
  // "fastest win" = the WINNER'S OWN total solve time, not the whole-duel wall clock (which is gated by the slower
  // player). Prefer the explicit mySolveTotalSec; fall back to avg×count for older callers.
  var mySolveTotalSec = _num(p.mySolveTotalSec) || (avgSolve * qCount);

  /* ---- rival BEFORE this duel (needed for the "Revenge" unlock) ---- */
  var rv = Object.assign({
    name: p.opponentName, count: 0, wins: 0, losses: 0, draws: 0,
    streak: 0, lastOutcome: null, fastestWinSec: 0, closestMargin: null,
    totalMargin: 0, sumAccuracy: 0, sumSolveSec: 0, lastPlayedAt: 0
  }, rivals[p.opponentUid] || {});
  var wasLosingToRival = rv.streak < 0;   // you were on a losing run vs this opponent

  /* ---- personal aggregates ---- */
  ag.totalDuels += 1;
  if (win) ag.wins += 1; else if (loss) ag.losses += 1; else ag.draws += 1;
  ag.currentStreak = win ? (ag.currentStreak > 0 ? ag.currentStreak + 1 : 1) : 0;   // win-streak; any non-win resets
  if (ag.currentStreak > ag.bestStreak) ag.bestStreak = ag.currentStreak;
  ag.totalCorrect += _num(p.myCorrect);
  ag.totalQuestions += qCount;
  ag.totalAnswered += _num(p.myAnswered);
  ag.totalSolveSec += avgSolve; ag.solveSamples += 1;   // rolling avg-of-per-duel-averages
  if (win && mySolveTotalSec > 0) ag.fastestWinSec = ag.fastestWinSec > 0 ? Math.min(ag.fastestWinSec, mySolveTotalSec) : mySolveTotalSec;
  ag.highestScore = ag.totalDuels === 1 ? _num(p.myScore) : Math.max(ag.highestScore, _num(p.myScore));
  ag.lowestScore = ag.totalDuels === 1 ? _num(p.myScore) : Math.min(ag.lowestScore, _num(p.myScore));
  ag.lastPlayedAt = _num(p.completedAt); ag.lastOutcome = p.outcome;

  /* ---- per-rival head-to-head ---- */
  rv.count += 1;
  if (win) rv.wins += 1; else if (loss) rv.losses += 1; else rv.draws += 1;
  // signed streak vs this rival: +n = you won the last n, -n = you lost the last n, 0 after a draw
  rv.streak = win ? (rv.streak > 0 ? rv.streak + 1 : 1) : (loss ? (rv.streak < 0 ? rv.streak - 1 : -1) : 0);
  rv.lastOutcome = p.outcome;
  if (win && mySolveTotalSec > 0) rv.fastestWinSec = rv.fastestWinSec > 0 ? Math.min(rv.fastestWinSec, mySolveTotalSec) : mySolveTotalSec;
  var margin = Math.abs(_num(p.myScore) - _num(p.oppScore));
  rv.closestMargin = rv.closestMargin == null ? margin : Math.min(rv.closestMargin, margin);
  rv.totalMargin += (_num(p.myScore) - _num(p.oppScore));   // signed → avg margin can be negative
  rv.sumAccuracy += _num(p.myAccuracy);
  rv.sumSolveSec += avgSolve;
  rv.lastPlayedAt = _num(p.completedAt);
  if (p.opponentName) rv.name = p.opponentName;
  rivals[p.opponentUid] = rv;

  /* ---- achievements (unlock-once; value = unlockedAt ms, so the UI can date the badge) ---- */
  function unlock(k) { if (!ach[k]) ach[k] = _num(p.completedAt); }
  unlock('firstBlood');
  if (win) unlock('firstWin');
  if (ag.wins >= 10) unlock('tenWins');
  if (ag.wins >= 50) unlock('fiftyWins');
  if (ag.wins >= 100) unlock('hundredWins');
  if (ag.bestStreak >= 5) unlock('streak5');
  if (ag.bestStreak >= 10) unlock('streak10');
  if (qCount > 0 && _num(p.myCorrect) === qCount) unlock('perfectDuel');
  if (win && avgSolve > 0 && avgSolve < LIGHTNING_SEC) unlock('lightning');
  if (win && wasLosingToRival) unlock('revenge');

  return { duelAggregates: ag, rivals: rivals, achievements: ach };
}

/**
 * Derive the read-only view-model the UI shows, from a stored summary. Pure (no clock). Kept here so the
 * check harness asserts the SAME derivations the client will use (the client re-implements these trivially
 * for rendering, but the canonical math lives here).
 */
function deriveAggregateView(summary) {
  var ag = (summary && summary.duelAggregates) || {};
  var total = _num(ag.totalDuels);
  var winPct = total > 0 ? _round((_num(ag.wins) / total) * 100) : 0;
  var avgAccuracy = _num(ag.totalQuestions) > 0 ? _round((_num(ag.totalCorrect) / ag.totalQuestions) * 100) : 0;
  var avgSolveSec = _num(ag.solveSamples) > 0 ? Math.round((_num(ag.totalSolveSec) / ag.solveSamples) * 10) / 10 : 0;
  return {
    totalDuels: total, wins: _num(ag.wins), losses: _num(ag.losses), draws: _num(ag.draws),
    winPct: winPct, currentStreak: _num(ag.currentStreak), bestStreak: _num(ag.bestStreak),
    avgAccuracy: avgAccuracy, avgSolveSec: avgSolveSec,
    fastestWinSec: _num(ag.fastestWinSec), highestScore: _num(ag.highestScore), lowestScore: _num(ag.lowestScore),
    totalCorrect: _num(ag.totalCorrect), totalQuestions: _num(ag.totalQuestions), totalAnswered: _num(ag.totalAnswered)
  };
}

/** Derive a single rival's head-to-head view-model (the rivalry banner). Pure. */
function deriveRivalView(summary, oppUid) {
  var rv = (summary && summary.rivals && summary.rivals[oppUid]) || null;
  if (!rv) return null;
  var c = _num(rv.count);
  return {
    name: rv.name || 'Opponent', battles: c, wins: _num(rv.wins), losses: _num(rv.losses), draws: _num(rv.draws),
    headToHeadPct: c > 0 ? _round((_num(rv.wins) / c) * 100) : 0,
    streak: _num(rv.streak), lastOutcome: rv.lastOutcome || null,
    fastestWinSec: _num(rv.fastestWinSec), closestMargin: rv.closestMargin == null ? null : _num(rv.closestMargin),
    avgMargin: c > 0 ? Math.round((_num(rv.totalMargin) / c) * 10) / 10 : 0,
    avgAccuracy: c > 0 ? _round(_num(rv.sumAccuracy) / c) : 0,
    avgSolveSec: c > 0 ? Math.round((_num(rv.sumSolveSec) / c) * 10) / 10 : 0
  };
}

/** Most-played + most-defeated opponent across the rivals map. Pure (returns uids + view rows). */
function deriveTopRivals(summary) {
  var rivals = (summary && summary.rivals) || {};
  var mostPlayed = null, mostDefeated = null;
  Object.keys(rivals).forEach(function (uid) {
    var rv = rivals[uid];
    if (!mostPlayed || _num(rv.count) > _num(rivals[mostPlayed].count)) mostPlayed = uid;
    if (!mostDefeated || _num(rv.wins) > _num(rivals[mostDefeated].wins)) mostDefeated = uid;
  });
  return {
    mostPlayed: mostPlayed ? { uid: mostPlayed, name: rivals[mostPlayed].name, count: _num(rivals[mostPlayed].count) } : null,
    mostDefeated: (mostDefeated && _num(rivals[mostDefeated].wins) > 0)
      ? { uid: mostDefeated, name: rivals[mostDefeated].name, wins: _num(rivals[mostDefeated].wins) } : null
  };
}

module.exports = {
  LIGHTNING_SEC: LIGHTNING_SEC,
  applyDuelToSummary: applyDuelToSummary,
  deriveAggregateView: deriveAggregateView,
  deriveRivalView: deriveRivalView,
  deriveTopRivals: deriveTopRivals
};
