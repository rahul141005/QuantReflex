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

// OpenAI prompt caching bills cached INPUT tokens at half the normal input rate (e.g. gpt-4o-mini $0.075 vs $0.15/1M).
// `usage.prompt_tokens` INCLUDES the cached portion; `usage.prompt_tokens_details.cached_tokens` is that portion.
var CACHED_INPUT_MULT = 0.5;

/** Rates ({in,out} USD per 1M tokens) for a model, falling back to the default so callers never get undefined. */
function ratesFor(model) {
  return MODELS[model] || MODELS[DEFAULT_MODEL];
}

/**
 * Estimated USD cost of a call. inTokens = TOTAL prompt tokens (incl. cached), outTokens = completion tokens,
 * cachedInTokens = the cached portion of the prompt (billed at half). Cached is clamped to [0, inTokens].
 */
function costOf(model, inTokens, outTokens, cachedInTokens) {
  var r = ratesFor(model);
  var i = Number(inTokens) || 0;
  var o = Number(outTokens) || 0;
  var cached = Number(cachedInTokens) || 0;
  if (cached < 0) cached = 0; if (cached > i) cached = i;
  var inCost = ((i - cached) * r.in + cached * r.in * CACHED_INPUT_MULT) / 1000000;
  return inCost + (o / 1000000) * r.out;
}

module.exports = { MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL, CACHED_INPUT_MULT: CACHED_INPUT_MULT, ratesFor: ratesFor, costOf: costOf };
