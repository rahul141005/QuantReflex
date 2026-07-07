/**
 * freeExplainPolicy.js — the pure free-tier AI-explanation allowance decision (ADR-103).
 *
 * Dependency-free (no OpenAI/Firebase) so the decision can be unit-tested directly and stays the single source of
 * truth for the "5 free lifetime explanations" rule. aiService.consumeFreeExplain wraps this in a Firestore
 * transaction; api/ai.js gates on it.
 */
'use strict';

/* Free accounts get this many lifetime real QuanAI "Explain" calls. Mirrors the canonical
   shared/constants/entitlements.js → FREE_TIER_LIMITS.AI_EXPLANATION_CREDITS (= 5). A serverless function CANNOT
   require('../shared/...') at runtime (each app deploys from its OWN root — see api/_lib/report-schema.js), so the
   value is declared here. Keep the two in lockstep if either changes. */
var FREE_EXPLAIN_LIMIT = 5;

/**
 * Given how many explanations a user has already spent, decide whether one more is granted.
 * @param {number} used  explanationsUsed so far
 * @param {number} [limit]  the cap (defaults to FREE_EXPLAIN_LIMIT)
 * @returns {{ ok:boolean, remaining:number }}  ok = grant this one; remaining = credits left AFTER this one
 */
function freeExplainDecision(used, limit) {
  var cap = (typeof limit === 'number' && limit > 0) ? limit : FREE_EXPLAIN_LIMIT;
  var n = (typeof used === 'number' && used > 0) ? Math.floor(used) : 0;
  if (n >= cap) return { ok: false, remaining: 0 };
  return { ok: true, remaining: cap - (n + 1) };
}

module.exports = { FREE_EXPLAIN_LIMIT: FREE_EXPLAIN_LIMIT, freeExplainDecision: freeExplainDecision };
