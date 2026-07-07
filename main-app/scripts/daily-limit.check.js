/**
 * daily-limit.check.js — lockstep guard for the free-tier daily question cap (ADR-107, Phase 5E).
 *
 * paywall.js is a browser IIFE (not require-able under node), so it declares its own FREE_DAILY_QUESTION_LIMIT
 * constant for the client. This check source-scans that declaration and asserts it never drifts from the canonical
 * shared/constants/entitlements.js → FREE_TIER_LIMITS.DAILY_QUESTION_LIMIT. Mirrors free-explain.check.js.
 *
 *   node scripts/daily-limit.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('Free-tier daily question-cap lockstep (ADR-107)\n');

var entitlements = require('../../shared/constants/entitlements');
var canonical = entitlements.FREE_TIER_LIMITS.DAILY_QUESTION_LIMIT;
ok(canonical === 20, 'canonical entitlements DAILY_QUESTION_LIMIT is 20 (= ' + canonical + ')');

var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'paywall.js'), 'utf8');

// The named client-side declaration: var FREE_DAILY_QUESTION_LIMIT = <n>;
var m = src.match(/var\s+FREE_DAILY_QUESTION_LIMIT\s*=\s*(\d+)\s*;/);
ok(!!m, 'paywall.js declares a named FREE_DAILY_QUESTION_LIMIT constant');
if (m) {
  var declared = parseInt(m[1], 10);
  ok(declared === canonical,
    'paywall.js FREE_DAILY_QUESTION_LIMIT (' + declared + ') === entitlements DAILY_QUESTION_LIMIT (' + canonical + ')');
}

// The magic literal must be gone from getDailyQuestionLimit — it now references the named const.
var fnMatch = src.match(/function\s+getDailyQuestionLimit\s*\(\)\s*\{[^}]*\}/);
ok(!!fnMatch, 'getDailyQuestionLimit() is present');
if (fnMatch) {
  ok(/FREE_DAILY_QUESTION_LIMIT/.test(fnMatch[0]),
    'getDailyQuestionLimit() uses the named constant, not a magic literal');
  ok(!/:\s*20\b/.test(fnMatch[0]) && !/\b20\b/.test(fnMatch[0]),
    'getDailyQuestionLimit() no longer hardcodes 20');
}

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
