/**
 * aiPricing.js — the SINGLE source of truth for model pricing + cost math (AI Command Center, Phase 1).
 *
 * Every cost calculation in the ecosystem derives from this table. Previously the rate {in:0.15,out:0.60} lived
 * inline in aiService.trackGptCost AND a flat 0.375/1M fallback lived in the super-admin AI view — two sources that
 * could silently drift. Centralizing here means a price change is one edit. Rates are USD per 1,000,000 tokens.
 *
 * Sources: OpenAI public pricing. Keep entries for every model the codebase can call (gpt-4o-mini = student AI,
 * gpt-4o = admin question generation). Unknown models fall back to gpt-4o-mini so cost is never NaN/undefined.
 */
'use strict';

var MODELS = {
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4o':      { in: 2.50, out: 10.00 }
};

var DEFAULT_MODEL = 'gpt-4o-mini';

/** Rates ({in,out} USD per 1M tokens) for a model, falling back to the default so callers never get undefined. */
function ratesFor(model) {
  return MODELS[model] || MODELS[DEFAULT_MODEL];
}

/** Estimated USD cost of a call. inTokens = prompt tokens, outTokens = completion tokens. */
function costOf(model, inTokens, outTokens) {
  var r = ratesFor(model);
  var i = Number(inTokens) || 0;
  var o = Number(outTokens) || 0;
  return (i / 1000000) * r.in + (o / 1000000) * r.out;
}

module.exports = { MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL, ratesFor: ratesFor, costOf: costOf };
