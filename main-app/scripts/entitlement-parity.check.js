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
/* Anchored so a field merely ENDING in "id" (e.g. a hypothetical parentid:) can't false-pass. */
function kbHasId(id) { return new RegExp("(?:^|[^\\w])id:\\s*'" + id + "'").test(kbSrc); }
learnClient.PREMIUM_TOPIC_IDS.forEach(function (id) {
  ok(kbHasId(id), 'gated topic id "' + id + '" exists in data/knowledge');
});
learnClient.PREMIUM_CATEGORIES.forEach(function (id) {
  ok(kbHasId(id), 'gated category id "' + id + '" exists in data/knowledge');
});

// ── 3. predicate sanity (real gated + free examples) ──
ok(learnClient.isPremiumLearnTopic('profit-loss', 'commercial-math') === true, 'commercial-math topic is premium (by category)');
ok(learnClient.isPremiumLearnTopic('di-bar-line') === true, 'di-bar-line is premium (by id)');
ok(learnClient.isPremiumLearnTopic('lr-critical-reasoning') === true, 'lr-critical-reasoning is premium (by id)');
ok(learnClient.isPremiumLearnTopic('di-foundations') === false, 'di-foundations stays free');
ok(learnClient.isPremiumLearnTopic('lr-syllogisms') === false, 'lr-syllogisms stays free');
ok(learnClient.isPremiumLearnTopic('number-system', 'numbers') === false, 'numbers category stays free');
ok(learnClient.isPremiumLearnTopic('') === false && learnClient.isPremiumLearnTopic(null) === false, 'empty/null topic → not premium (no false wall)');

// ── 4/5. NO ROOT RE-DERIVES THE PREMIUM TEST, AND NO PROJECTION SHIPS `plan` WITHOUT `planExpiry` (ADR-149) ──
// `plan === 'premium'` is not an entitlement: under ADR-115 a premium document with a lapsed, null or
// unparseable expiry is NOT premium. Every root must therefore ask entitlement-core rather than
// compare the raw field. This was found in coaching-admin-app, whose student/dashboard endpoints
// projected the raw `plan` and so showed a Premium badge for subscriptions that had already ended.
// Scoped to SERVER code across every deploy root. Excluded on purpose: entitlement-core itself (it IS
// the rule), and the projections it produces (`plan: 'premium'` as an OUTPUT value is not a test).
(function () {
  var ROOT = path.join(__dirname, '..', '..');
  /* A COMPARISON against the literal — not an assignment, and not the rule's own definition. */
  var RAW_TEST = /(\w[\w.\[\]']*)\s*(===|==|!==|!=)\s*['"]premium['"]|['"]premium['"]\s*(===|==|!==|!=)/;
  var offenders = [], naked = [];
  function walk(dir) {
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git') return;
      var full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); return; }
      if (!/\.js$/.test(e.name)) return;
      var rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (/entitlement-core\.js$/.test(rel)) return;            /* the rule itself */
      /* Line-accurate on purpose: stripping block comments first would renumber every line after the
         first one, and a ratchet that reports the wrong location is worse than no ratchet. Comment
         lines are skipped individually instead. */
      var src = fs.readFileSync(full, 'utf8');
      var inBlock = false;
      src.split('\n').forEach(function (line, i) {
        var trimmed = line.trim();
        if (inBlock) { if (/\*\//.test(line)) inBlock = false; return; }
        if (/^\/\*/.test(trimmed) && !/\*\//.test(trimmed)) { inBlock = true; return; }
        if (/^(\/\/|\*|\/\*)/.test(trimmed)) return;
        if (!RAW_TEST.test(line)) return;
        /* Legitimately NOT an entitlement decision:
           · `planType`/`planSource`/`PLAN_PREMIUM` — which plan, not whether it is live;
           · `segment`/`type` — a notification segment or an export selector, a plain string match;
           · a Firestore `.where('plan','==','premium')` — a server-side pre-filter, which cannot
             express the derived rule; its RESULTS are resolved by the reader;
           · `plan: x === 'premium' ? 'premium' : 'free'` — a PROJECTION producing a value, checked
             instead by the planExpiry-companion assertion below. */
        if (/planType|planSource|PLAN_PREMIUM|planTypeFor/.test(line)) return;
        if (/\b(segment|type)\s*===?\s*['"]premium['"]/.test(line)) return;
        if (/\.where\(/.test(line)) return;
        if (/plan:\s*[^,]*\?\s*['"]premium['"]\s*:\s*['"]free['"]/.test(line)) return;
        offenders.push(rel + ':' + (i + 1));
      });

      /* A USER-ENTITLEMENT projection with no `planExpiry` beside it is an entitlement claim with no
         term. Every reader resolves through entitlement-core, and the rule treats an absent expiry as
         NOT premium — so such a payload renders a live Premium account as "Expired" in the Super
         Admin. Found exactly that way on the inactive-users list.
         Scoped by the SHAPE of the value, deliberately: `plan: x === 'premium' ? 'premium' : 'free'`
         is a user's entitlement derived from the raw field. A bare `plan: p.plan` on a payments row
         is a PRODUCT id (`premium_6m`), and a coaching's `entitlementPlan` is a different concept
         entirely — neither has, or wants, an expiry. A ±14-line window covers both the one-line and
         the multi-line object literals in these files. */
      var RAW_PLAN_PROJECTION = /plan:\s*[^,;]*===?\s*['"]premium['"]\s*\?\s*['"]premium['"]\s*:\s*['"]free['"]/;
      var lines = src.split('\n');
      var inBlock2 = false;
      lines.forEach(function (line, i) {
        var t = line.trim();
        if (inBlock2) { if (/\*\//.test(line)) inBlock2 = false; return; }
        if (/^\/\*/.test(t) && !/\*\//.test(t)) { inBlock2 = true; return; }
        if (/^(\/\/|\*|\/\*)/.test(t)) return;
        if (!RAW_PLAN_PROJECTION.test(line)) return;
        var lo = Math.max(0, i - 14), hi = Math.min(lines.length, i + 15);
        if (lines.slice(lo, hi).join('\n').indexOf('planExpiry') !== -1) return;
        naked.push(rel + ':' + (i + 1));
      });
    });
  }
  ['coaching-admin-app/api', 'super-admin-app/api', 'functions'].forEach(function (d) { walk(path.join(ROOT, d)); });
  ok(offenders.length === 0,
    '★★ no deploy root re-derives the premium test from a raw `plan` comparison — ' + (offenders.join(', ') || 'none'));
  ok(naked.length === 0,
    '★★ no API projection ships `plan` without `planExpiry` (the reader would render it as expired) — ' + (naked.join(', ') || 'none'));
})();

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
