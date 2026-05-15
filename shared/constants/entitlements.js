/**
 * entitlements.js — Canonical Entitlement Constants
 *
 * Single source of truth for entitlement tier definitions,
 * field names, and precedence rules across the QuantReflex ecosystem.
 *
 * STATUS: Reference constants only. Not yet imported by apps.
 * Apps currently define these inline. This file documents the canonical
 * contract to prevent drift during future centralization.
 */

// ══════════════════════════════════════════════
// ENTITLEMENT TIERS
// ══════════════════════════════════════════════

var ENTITLEMENT_TIERS = {
  FREE: 'free',
  TRIAL: 'trial',
  PREMIUM: 'premium',
  PREMIUM_PLUS: 'premium_plus'
};

// ══════════════════════════════════════════════
// FIRESTORE FIELD NAMES (users/{uid} root doc)
// ══════════════════════════════════════════════

var ENTITLEMENT_FIELDS = {
  // Premium (Lifetime)
  IS_PREMIUM: 'isPremium',         // boolean
  HAS_PAID: 'hasPaid',             // boolean
  LAST_PAYMENT_ID: 'lastPaymentId', // string | null

  // Trial
  IS_TRIAL: 'isTrial',             // boolean
  TRIAL_END: 'trialEnd',           // ISO 8601 string | null

  // Premium+
  IS_PREMIUM_PLUS: 'isPremiumPlus',                 // boolean
  PREMIUM_PLUS_PLAN: 'premiumPlusPlan',             // 'plus_6month' | 'plus_yearly' | null
  PREMIUM_PLUS_EXPIRY: 'premiumPlusExpiry',         // ISO 8601 string | null
  PREMIUM_PLUS_STATUS: 'premiumPlusStatus',         // 'active' | 'expired' | null
  LAST_PREMIUM_PLUS_PAYMENT_ID: 'lastPremiumPlusPaymentId', // string | null

  // Legacy (deprecated but preserved for backward compat)
  IS_EARLY_USER: 'isEarlyUser',    // boolean — always false for new users

  // Coaching
  COACHING_ID: 'coachingId'        // string | null
};

// ══════════════════════════════════════════════
// PLAN IDENTIFIERS
// ══════════════════════════════════════════════

var PLAN_IDS = {
  PREMIUM_LIFETIME: 'premium',
  PLUS_6MONTH: 'plus_6month',
  PLUS_YEARLY: 'plus_yearly'
};

// ══════════════════════════════════════════════
// PRICING (INR)
// ══════════════════════════════════════════════

var PRICING = {
  PREMIUM_LIFETIME: 8900,      // ₹89 in paise
  PLUS_6MONTH: 29900,           // ₹299 in paise
  PLUS_YEARLY: 49900           // ₹499 in paise
};

// ══════════════════════════════════════════════
// ENTITLEMENT PRECEDENCE (highest → lowest)
// ══════════════════════════════════════════════
//
// 1. Premium+ (active, not expired)
// 2. Premium (lifetime, hasPaid)
// 3. Trial (active, not expired)
// 4. Free
//
// Rules:
// - Granting Premium wipes Trial fields
// - Granting Premium+ wipes Trial fields
// - Granting Trial does NOT downgrade Premium/Premium+
// - Revoking clears ALL entitlement fields

var PRECEDENCE_ORDER = [
  ENTITLEMENT_TIERS.PREMIUM_PLUS,
  ENTITLEMENT_TIERS.PREMIUM,
  ENTITLEMENT_TIERS.TRIAL,
  ENTITLEMENT_TIERS.FREE
];

// ══════════════════════════════════════════════
// FREE TIER LIMITS
// ══════════════════════════════════════════════

var FREE_TIER_LIMITS = {
  DAILY_QUESTION_LIMIT: 20,
  AI_EXPLANATION_CREDITS: 5
};

// ══════════════════════════════════════════════
// AI FEATURES (Premium+ only)
// ══════════════════════════════════════════════

var AI_FEATURES = {
  AI_EXPLAIN: 'ai_explain',
  AI_COACH: 'ai_coach',
  AI_STUDY_PLAN: 'ai_study_plan'
};

// ══════════════════════════════════════════════
// PREMIUM FEATURES (Premium and above)
// ══════════════════════════════════════════════

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
  ADAPTIVE_TRAINING: 'adaptive_training'
};

// ══════════════════════════════════════════════
// TIMESTAMP STRATEGY
// ══════════════════════════════════════════════
//
// ALL timestamps in the ecosystem MUST be ISO 8601 strings.
// Generated via: new Date().toISOString()
// Format: "2026-05-13T06:00:00.000Z"
//
// DO NOT use:
// - Unix milliseconds (number)
// - Firestore Timestamps
// - Date objects
// - Custom date formats
//
// Parsing: Date.parse(isoString) → milliseconds for comparison

// Export for future use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ENTITLEMENT_TIERS: ENTITLEMENT_TIERS,
    ENTITLEMENT_FIELDS: ENTITLEMENT_FIELDS,
    PLAN_IDS: PLAN_IDS,
    PRICING: PRICING,
    PRECEDENCE_ORDER: PRECEDENCE_ORDER,
    FREE_TIER_LIMITS: FREE_TIER_LIMITS,
    AI_FEATURES: AI_FEATURES,
    PREMIUM_FEATURES: PREMIUM_FEATURES
  };
}
