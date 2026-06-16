/**
 * ai-cost.check.js — unit tests for the AI pricing engine (the single source of truth for cost).
 *
 * Locks down aiPricing.costOf() so the cost accounting that powers the AI Command Center can't silently regress —
 * including the OpenAI prompt-caching discount (cached input billed at half) added after the cost-center audit.
 *   node scripts/ai-cost.check.js
 */
'use strict';
var pricing = require('../services/aiPricing');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function near(a, b) { return Math.abs(a - b) < 1e-9; }

console.log('AI pricing engine (aiPricing.costOf)\n');

// ── base rates ──
ok(near(pricing.costOf('gpt-4o-mini', 1000000, 0), 0.15), 'mini: 1M input = $0.15');
ok(near(pricing.costOf('gpt-4o-mini', 0, 1000000), 0.60), 'mini: 1M output = $0.60');
ok(near(pricing.costOf('gpt-4o-mini', 1000000, 1000000), 0.75), 'mini: 1M in + 1M out = $0.75');
ok(near(pricing.costOf('gpt-4o', 1000000, 1000000), 12.50), 'gpt-4o: 1M in + 1M out = $12.50');

// ── unknown model falls back to the default (never NaN/undefined) ──
ok(near(pricing.costOf('made-up-model', 1000000, 0), 0.15), 'unknown model falls back to gpt-4o-mini');
ok(!isNaN(pricing.costOf('x', 'y', 'z')), 'garbage input never yields NaN');

// ── cached-token discount: cached input billed at half ──
ok(near(pricing.costOf('gpt-4o-mini', 1000000, 0, 1000000), 0.075), 'fully-cached 1M input = $0.075 (half)');
ok(near(pricing.costOf('gpt-4o-mini', 1000000, 0, 500000), (500000 * 0.15 + 500000 * 0.075) / 1000000), 'half-cached input billed correctly');
ok(near(pricing.costOf('gpt-4o-mini', 1000000, 0, 0), 0.15), 'no cache = full input price');

// ── cached clamp ──
ok(near(pricing.costOf('gpt-4o-mini', 1000, 0, 99999), pricing.costOf('gpt-4o-mini', 1000, 0, 1000)), 'cached > input is clamped to input');
ok(near(pricing.costOf('gpt-4o-mini', 1000, 0, -50), pricing.costOf('gpt-4o-mini', 1000, 0, 0)), 'negative cached treated as 0');

// ── caching never INCREASES cost ──
ok(pricing.costOf('gpt-4o-mini', 1000, 100, 800) <= pricing.costOf('gpt-4o-mini', 1000, 100, 0), 'caching can only reduce (or equal) cost');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
