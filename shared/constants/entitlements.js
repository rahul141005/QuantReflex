/**
 * entitlements.js — Canonical Entitlement Constants (v2)
 *
 * Single source of truth for the QuantReflex v2 monetization model.
 *
 * MODEL: one paid tier. A user's access resolves entirely through `plan`:
 *   plan = 'free' | 'premium'
 * Premium is time-limited (6 or 12 months) or a custom-duration admin trial.
 * There is NO lifetime plan and NO second "plus" tier — everything premium
 * lives in the single `premium` plan.
 *
 * STATUS: Reference constants only (apps inline-copy these; no bundler).
 */

// ══════════════════════════════════════════════
// PLANS (the only tiers)
// ══════════════════════════════════════════════

var PLANS = {
  FREE: 'free',
  PREMIUM: 'premium'
};

// ══════════════════════════════════════════════
// PLAN TYPES (purchasable products)
// ══════════════════════════════════════════════

var PLAN_TYPES = {
  PREMIUM_6M: 'premium_6m',
  PREMIUM_12M: 'premium_12m'
};

// ══════════════════════════════════════════════
// PLAN SOURCES (how the current premium was granted)
// ══════════════════════════════════════════════

var PLAN_SOURCES = {
  PURCHASE: 'purchase',   // paid via Razorpay
  TRIAL: 'trial',         // admin-granted custom-duration trial
  ADMIN: 'admin',         // admin-granted premium
  COACHING: 'coaching'    // granted via coaching institute
};

// ══════════════════════════════════════════════
// FIRESTORE FIELD NAMES (users/{uid} root doc)
// ══════════════════════════════════════════════

var ENTITLEMENT_FIELDS = {
  PLAN: 'plan',                 // 'free' | 'premium'
  PLAN_TYPE: 'planType',        // 'premium_6m' | 'premium_12m' | null
  PLAN_EXPIRY: 'planExpiry',    // ISO 8601 string | null
  PLAN_SOURCE: 'planSource',    // 'purchase' | 'trial' | 'admin' | 'coaching' | null
  IS_TRIAL: 'isTrial',          // boolean — true while current premium is a trial
  TRIAL_END: 'trialEnd',        // ISO 8601 string | null (mirrors planExpiry during a trial)
  PLAN_UPDATED_AT: 'planUpdatedAt', // ISO 8601 string
  LAST_PAYMENT_ID: 'lastPaymentId', // string | null
  COACHING_ID: 'coachingId'     // string | null
};

// ══════════════════════════════════════════════
// PRICING (INR, paise) + DURATIONS (days)
// ══════════════════════════════════════════════

var PRICING = {
  PREMIUM_6M: 34900,   // ₹349
  PREMIUM_12M: 59900   // ₹599
};

var DURATIONS_DAYS = {
  PREMIUM_6M: 182,
  PREMIUM_12M: 365
};

// ══════════════════════════════════════════════
// FREE TIER LIMITS
// ══════════════════════════════════════════════

var FREE_TIER_LIMITS = {
  DAILY_QUESTION_LIMIT: 20,
  AI_EXPLANATION_CREDITS: 5
};

// ══════════════════════════════════════════════
// PREMIUM FEATURES (all included in the single premium plan)
// ══════════════════════════════════════════════
// Every gated feature now requires `plan === 'premium'`. There is no AI-only
// sub-tier — AI features and Math Duel are part of premium like everything else.

var PREMIUM_FEATURES = {
  CUSTOM_TRAINING: 'custom_training',
  REVIEW_MISTAKES: 'review_mistakes',
  ADD_FORMULA: 'add_formula',
  ADD_TOPIC: 'add_topic',
  PERFORMANCE_INSIGHTS: 'performance_insights',
  CATEGORY_ACCURACY: 'category_accuracy',
  HARD_MODE: 'hard_mode',
  SKIP_QUESTION: 'skip_question',
  ADVANCED_THEME: 'advanced_theme',
  DAILY_GOAL_LIMIT: 'daily_goal_limit',
  FOCUS_TIMER: 'focus_timer',
  TABLE_MODAL: 'table_modal',
  ADAPTIVE_TRAINING: 'adaptive_training',
  AI_EXPLAIN: 'ai_explain',
  AI_COACH: 'ai_coach',
  AI_STUDY_PLAN: 'ai_study_plan',
  MATH_DUEL: 'math_duel'
};

// ══════════════════════════════════════════════
// RESOLUTION RULE
// ══════════════════════════════════════════════
//
//   premium ⟺ plan === 'premium' && (planExpiry == null || planExpiry > now)
//
// A trial is plan:'premium' with planSource:'trial', isTrial:true,
// trialEnd === planExpiry. On expiry, state self-heals to free:
//   plan:'free', planType:null, planExpiry:null, planSource:null,
//   isTrial:false, trialEnd:null
//
// TIMESTAMPS: ISO 8601 strings (new Date().toISOString()); parse via Date.parse().

// Export for future use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PLANS: PLANS,
    PLAN_TYPES: PLAN_TYPES,
    PLAN_SOURCES: PLAN_SOURCES,
    ENTITLEMENT_FIELDS: ENTITLEMENT_FIELDS,
    PRICING: PRICING,
    DURATIONS_DAYS: DURATIONS_DAYS,
    FREE_TIER_LIMITS: FREE_TIER_LIMITS,
    PREMIUM_FEATURES: PREMIUM_FEATURES
  };
}
