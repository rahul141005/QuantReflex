/**
 * entitlement-parity.check.js — lockstep guard for the entitlement feature set + Learn premium map (ADR-109).
 *
 * paywall.js (browser IIFE) declares _LOCKED_FEATURES; shared/constants/entitlements.js declares the canonical
 * PREMIUM_FEATURES (values) and PREMIUM_LEARN. main-app/js/learn-entitlements.js is the client copy of PREMIUM_LEARN.
 * These must never drift — a feature gated on the client but absent from the shared source (or vice-versa) is exactly
 * the kind of silent inconsistency this phase set out to eliminate. Mirrors daily-limit.check / free-explain.check.
 *
 *   node scripts/entitlement-parity.check.js   (run from main-app/)
 */
'use strict';
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function sortedEq(a, b) { var x = a.slice().sort(), y = b.slice().sort(); return x.length === y.length && x.every(function (v, i) { return v === y[i]; }); }

console.log('Entitlement feature-set + Learn premium-map lockstep (ADR-109)\n');

var entitlements = require('../../shared/constants/entitlements');
var learnClient = require('../js/learn-entitlements');

// ── 1. _LOCKED_FEATURES (paywall.js) key set === PREMIUM_FEATURES (shared) value set ──
var pw = fs.readFileSync(path.join(__dirname, '..', 'js', 'paywall.js'), 'utf8');
var block = pw.match(/var\s+_LOCKED_FEATURES\s*=\s*\{([\s\S]*?)\};/);
ok(!!block, 'paywall.js declares _LOCKED_FEATURES');
var lockedKeys = [];
if (block) {
  var re = /([a-z_]+)\s*:\s*true/g, m;
  while ((m = re.exec(block[1])) !== null) lockedKeys.push(m[1]);
}
var sharedFeatures = Object.keys(entitlements.PREMIUM_FEATURES).map(function (k) { return entitlements.PREMIUM_FEATURES[k]; });
ok(lockedKeys.length >= 19, 'parsed _LOCKED_FEATURES keys (' + lockedKeys.length + ')');
ok(sortedEq(lockedKeys, sharedFeatures),
  'client _LOCKED_FEATURES set === shared PREMIUM_FEATURES set' +
  (sortedEq(lockedKeys, sharedFeatures) ? '' :
    '\n     client-only: ' + lockedKeys.filter(function (k) { return sharedFeatures.indexOf(k) < 0; }).join(',') +
    '\n     shared-only: ' + sharedFeatures.filter(function (k) { return lockedKeys.indexOf(k) < 0; }).join(',')));
// the ADR-109 additions must be present on BOTH sides
['mixed_aptitude', 'learn_premium', 'timed_mocks'].forEach(function (k) {
  ok(lockedKeys.indexOf(k) >= 0 && sharedFeatures.indexOf(k) >= 0, 'both sides gate "' + k + '"');
});

// ── 2. Learn premium map: client learn-entitlements === shared PREMIUM_LEARN ──
var sharedLearn = entitlements.PREMIUM_LEARN;
ok(!!sharedLearn, 'shared exports PREMIUM_LEARN');
ok(sortedEq(learnClient.PREMIUM_CATEGORIES, sharedLearn.PREMIUM_CATEGORIES),
  'PREMIUM_CATEGORIES match (client === shared)');
ok(sortedEq(learnClient.PREMIUM_TOPIC_IDS, sharedLearn.PREMIUM_TOPIC_IDS),
  'PREMIUM_TOPIC_IDS match (client === shared)');

// ── 2b. wiring guard (ADR-109 cert fix CERT-3): the ONLY realistic way LearnEntitlements goes missing (which would
//        fail the Learn gate open) is a removed script tag or precache entry — assert both, plus load order. ──
var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var swSrc = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
var idxEnt = indexHtml.indexOf('js/learn-entitlements.js');
var idxLearnView = indexHtml.indexOf('js/views/learn-view.js');
ok(idxEnt !== -1, 'index.html loads js/learn-entitlements.js');
ok(idxLearnView !== -1 && idxEnt < idxLearnView, 'learn-entitlements.js loads BEFORE views/learn-view.js');
ok(swSrc.indexOf("'./js/learn-entitlements.js'") !== -1, 'service worker precaches js/learn-entitlements.js');

// ── 2c. KB-existence guard (ADR-109 cert fix CERT-6): a typo replicated on BOTH sides would pass the mirror check
//        silently — assert every gated id exists in the real knowledge data. ──
var kbDir = path.join(__dirname, '..', 'data', 'knowledge');
var kbSrc = fs.readdirSync(kbDir).filter(function (f) { return /\.js$/.test(f); })
  .map(function (f) { return fs.readFileSync(path.join(kbDir, f), 'utf8'); }).join('\n');
learnClient.PREMIUM_TOPIC_IDS.forEach(function (id) {
  ok(new RegExp("id:\\s*'" + id + "'").test(kbSrc), 'gated topic id "' + id + '" exists in data/knowledge');
});
learnClient.PREMIUM_CATEGORIES.forEach(function (id) {
  ok(new RegExp("id:\\s*'" + id + "'").test(kbSrc), 'gated category id "' + id + '" exists in data/knowledge');
});

// ── 3. predicate sanity (real gated + free examples) ──
ok(learnClient.isPremiumLearnTopic('profit-loss', 'commercial-math') === true, 'commercial-math topic is premium (by category)');
ok(learnClient.isPremiumLearnTopic('di-bar-line') === true, 'di-bar-line is premium (by id)');
ok(learnClient.isPremiumLearnTopic('lr-critical-reasoning') === true, 'lr-critical-reasoning is premium (by id)');
ok(learnClient.isPremiumLearnTopic('di-foundations') === false, 'di-foundations stays free');
ok(learnClient.isPremiumLearnTopic('lr-syllogisms') === false, 'lr-syllogisms stays free');
ok(learnClient.isPremiumLearnTopic('number-system', 'numbers') === false, 'numbers category stays free');
ok(learnClient.isPremiumLearnTopic('') === false && learnClient.isPremiumLearnTopic(null) === false, 'empty/null topic → not premium (no false wall)');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
