/**
 * onboarding.check.js (ADR-106) — guards the onboarding flow's navigation math + the ONB-1 resumability invariant.
 *
 * onboarding.js is DOM-coupled, so this exercises the PURE nav helpers it exports (Onboarding._nav) and asserts a few
 * structural invariants on the source (the completion flag must be set only on a genuine finish, not on show). Run:
 *   node scripts/onboarding.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var Onboarding = require('../js/onboarding.js');

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

console.log('onboarding.check — flow navigation + resumability (ADR-106)\n');

var nav = Onboarding._nav;
var S = nav.SCREENS, FINISH = nav.FINISH;

// ── screen map is the expected 7-screen sequence ──
ok('7 named screens INTRO..WARMUP', S.INTRO === 0 && S.EXAM === 1 && S.PRACTICE === 2 && S.STATS === 3 && S.GOAL === 4 && S.READY === 5 && S.WARMUP === 6);

// ── forward nav (Next) ──
ok('intro → exam', nav.next(S.INTRO, false) === S.EXAM);
ok('exam → practice', nav.next(S.EXAM, false) === S.PRACTICE);
ok('practice → stats', nav.next(S.PRACTICE, false) === S.STATS);
ok('stats → goal', nav.next(S.STATS, false) === S.GOAL);
ok('goal → ready (normal flow)', nav.next(S.GOAL, false) === S.READY);
ok('goal → FINISH (skip mode ends after goal)', nav.next(S.GOAL, true) === FINISH);
ok('ready → warm-up', nav.next(S.READY, false) === S.WARMUP);
ok('warm-up is the last screen (Next → FINISH)', nav.next(S.WARMUP, false) === FINISH);

// ── back nav (global Back) ──
ok('no Back from the intro screen', nav.back(S.INTRO, false, 'tier') === null);
ok('stats → practice on Back', nav.back(S.STATS, false, 'tier').index === S.PRACTICE);
ok('ready → goal on Back', nav.back(S.READY, false, 'tier').index === S.GOAL);
ok('skip-mode goal → intro on Back (and clears skip)', (function () { var b = nav.back(S.GOAL, true, 'tier'); return b.index === S.INTRO && b.resetSkip === true; })());
ok('exam sub-stage Back returns to the tier stage', nav.back(S.EXAM, false, 'exam').stage === 'tier');
ok('exam tier-stage Back goes to intro', nav.back(S.EXAM, false, 'tier').index === S.INTRO);

// ── round-trip: Next then Back returns to where you were ──
ok('practice →Next→ stats →Back→ practice', nav.back(nav.next(S.PRACTICE, false), false, 'tier').index === S.PRACTICE);

// ── global Back is offered on the middle screens, not intro/warm-up ──
ok('no Back button on intro', nav.shouldShowBack(S.INTRO) === false);
ok('no Back button on warm-up', nav.shouldShowBack(S.WARMUP) === false);
ok('Back button on stats/goal/ready', nav.shouldShowBack(S.STATS) && nav.shouldShowBack(S.GOAL) && nav.shouldShowBack(S.READY));

// ── ONB-1 structural invariant: onboardingCompleted is set ONLY on a genuine finish, never on show/start ──
var src = fs.readFileSync(path.join(__dirname, '../js/onboarding.js'), 'utf8');
// (2 writes = the AppState + localStorage branches inside _markCompleted; none on show/start)
var completedWrites = (src.match(/\.onboardingCompleted\s*=\s*true/g) || []).length;
ok('onboardingCompleted=true written only in _markCompleted (its 2 branches)', completedWrites === 2);
ok('_markCompleted owns the completion write', /function _markCompleted[\s\S]*?\.onboardingCompleted\s*=\s*true/.test(src));
ok('no _markStarted persisting completion on show (ONB-1)', !/function _markStarted\s*\(/.test(src));
ok('show() does not persist onboardingCompleted', !/function show[\s\S]{0,600}onboardingCompleted\s*=\s*true/.test(src));

// ── ONB-3: the warm-up pool includes a data-interpretation-flavoured item ──
ok('warm-up has a DI-flavoured item (survey/chart)', /survey of|pie chart|budget pie/i.test(src));

// ── a11y: the Stats spotlight hides the nav from the accessibility tree and restores it ──
ok('Stats spotlight sets aria-hidden', /setAttribute\('aria-hidden',\s*'true'\)/.test(src));
ok('Stats spotlight restores aria-hidden', /removeAttribute\('aria-hidden'\)/.test(src));

console.log('\nonboarding.check.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
