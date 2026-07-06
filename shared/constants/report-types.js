/**
 * report-types.js — CANONICAL constants for the QuantReflex Reporting System (ADR-096 · redesigned ADR-099).
 *
 * ONE source of truth for report TYPES, STATUSES, PRIORITIES, per-type SUB-REASONS, field caps,
 * and the abuse/rate-limit constants. Consumed by:
 *   • the report check harness (`main-app/scripts/report.check.js`) via `require()` — the canonical reference.
 *   • the main-app browser taxonomy (`main-app/js/ui/report-taxonomy.js`) — a LOCAL, byte-for-byte copy of the
 *     TYPES/STATUS/PRIORITY data that the modal loads as `window.ReportTypes`.
 *
 * WHY A LOCAL BROWSER COPY (ADR-099): the main app deploys rooted at `main-app/` (its own vercel.json); `shared/`
 * is a SIBLING outside that deploy root, so `<script src="../shared/constants/report-types.js">` resolved to the
 * SPA catch-all rewrite and returned index.html → SyntaxError → `window.ReportTypes` was undefined → the report
 * type grid rendered EMPTY in production. The browser now loads `js/ui/report-taxonomy.js` (same origin); this
 * file stays the canonical spec, and `report.check.js` asserts the browser copy ↔ this file ↔ the server inline
 * copy ↔ the Super-Admin label maps are all in LOCKSTEP.
 *
 * The Vercel serverless handler (`main-app/api/report.js`) cannot `require('../shared/...')` at runtime
 * (its bundle root is `main-app/`), so it keeps a validated INLINE COPY in `api/_lib/report-schema.js`.
 *
 * REPORTING PHILOSOPHY (ADR-096): reports are fully self-contained in Firestore — the Super-Admin Reports
 * dashboard is the source of truth. NO email / external notification is involved. Screenshots are NOT part of
 * v1 (the rich auto-collected context replaces them); the schema leaves a clean, migration-free seam for
 * attachments and for a future notification hook.
 *
 * TAXONOMY (ADR-099): the type values are index-agnostic — the `(classification.type, createdAtMs)` composite
 * index is value-agnostic, so enriching the type set needs NO new Firestore index and NO rules change. Each
 * question-family reason is a top-level `type` (not a sub-reason) so `questionReports.topReasons` keeps a
 * per-reason count for triage.
 *
 * STATUS: Reference constants (dual-exported: window.ReportTypes + module.exports). ISO-8601 timestamps.
 */
(function (root) {
  'use strict';

  /* ── Report STATUS lifecycle ── (admin-driven triage; 'open' is the create-time default) */
  var STATUSES = ['open', 'investigating', 'needs_info', 'resolved', 'dismissed', 'duplicate', 'archived'];
  var STATUS_LABELS = {
    open: 'Open', investigating: 'Investigating', needs_info: 'Needs info',
    resolved: 'Resolved', dismissed: 'Dismissed', duplicate: 'Duplicate', archived: 'Archived'
  };
  /* Statuses that count as "still needs attention" (drives the dashboard Open count + questionReports.openCount). */
  var OPEN_STATUSES = ['open', 'investigating', 'needs_info'];

  /* ── PRIORITY ── (auto-seeded from type, admin-editable) */
  var PRIORITIES = ['critical', 'high', 'medium', 'low'];
  var PRIORITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

  /* ── REPORT TYPES (ADR-099 taxonomy) ──
   * group: coarse triage bucket ('question' | 'ai' | 'app' | 'account' | 'other').
   * inDrill: offered in the fast in-drill reason grid (all question-family reasons).
   * defaultPriority: seed priority when a report of this type is filed (admin-editable).
   * helper: a one-line description shown under the label in the picker (guides the choice; reduces cognitive load).
   * fields: which free-text/rating fields the modal shows ('note' folds into description). All optional
   *   server-side EXCEPT: app/account/other/ai types need SOME substance, and a question type filed from
   *   Settings (no live question attached) needs a note — enforced in api/_lib/report-schema.js.
   * subReasons: optional refinement chips (visual / ai_issue / payment / account). */
  var TYPES = [
    /* — Question-family (the in-drill fast path; each reason is its own TYPE so questionReports.topReasons
         keeps a per-reason count for triage). Ordered most-impactful first. — */
    { id: 'answer_wrong',        label: 'Wrong answer',         icon: '✅', group: 'question', inDrill: true, defaultPriority: 'critical', helper: 'The marked answer looks incorrect',          fields: ['note'] },
    { id: 'solution_wrong',      label: 'Wrong solution',       icon: '🧮', group: 'question', inDrill: true, defaultPriority: 'high',     helper: "The working or steps don't add up",         fields: ['note'] },
    { id: 'explanation_wrong',   label: 'Wrong explanation',    icon: '🧠', group: 'question', inDrill: true, defaultPriority: 'high',     helper: 'The explanation is wrong or misleading',    fields: ['note'] },
    { id: 'options_wrong',       label: 'Bad options',          icon: '🔢', group: 'question', inDrill: true, defaultPriority: 'high',     helper: 'Options are wrong, repeated or missing',    fields: ['note'], mcqOnly: true },
    { id: 'formula_wrong',       label: 'Formula looks wrong',  icon: '📐', group: 'question', inDrill: true, defaultPriority: 'high',     helper: 'A formula or rule used here seems off',     fields: ['note'] },
    { id: 'typo',                label: 'Typo or wording',      icon: '✍️', group: 'question', inDrill: true, defaultPriority: 'low',      helper: 'A spelling, symbol or wording mistake',     fields: ['note'] },
    { id: 'visual',              label: 'Diagram or image',     icon: '🎨', group: 'question', inDrill: true, defaultPriority: 'medium',   helper: 'A chart, figure or image has a problem',    fields: ['note'],
      subReasons: [
        { id: 'chart_wrong',    label: 'Chart is wrong' },
        { id: 'figure_render',  label: "Figure doesn't render right" },
        { id: 'clipping',       label: 'Clipped / cut off' },
        { id: 'missing_image',  label: 'Missing image' },
        { id: 'other',          label: 'Something else' }
      ] },
    { id: 'unclear',             label: 'Confusing question',   icon: '❓', group: 'question', inDrill: true, defaultPriority: 'medium',   helper: 'The question is unclear or ambiguous',      fields: ['note'] },
    { id: 'difficulty_mismatch', label: 'Wrong difficulty',     icon: '🎚️', group: 'question', inDrill: true, defaultPriority: 'low',     helper: 'Too easy or too hard for its level',        fields: ['note'] },
    { id: 'wrong_topic',         label: 'Wrong topic',          icon: '🗂️', group: 'question', inDrill: true, defaultPriority: 'low',     helper: 'Filed under the wrong topic or subject',    fields: ['note'] },
    { id: 'duplicate',           label: "I've seen this before",icon: '🔁', group: 'question', inDrill: true, defaultPriority: 'low',      helper: 'This question looks like a repeat',         fields: ['note'] },
    { id: 'question_other',      label: 'Something else',       icon: '💬', group: 'question', inDrill: true, defaultPriority: 'medium',   helper: 'Another issue with this question',          fields: ['note'] },
    /* — QuanAI explanations (purpose-built; own reason set) — */
    { id: 'ai_issue',      label: 'A QuanAI explanation', icon: '🤖', group: 'ai', inDrill: false, defaultPriority: 'medium', helper: "Something's off with a QuanAI explanation", fields: ['note'],
      subReasons: [
        { id: 'wrong_answer',     label: 'Wrong final answer' },
        { id: 'flawed_reasoning', label: 'Flawed reasoning' },
        { id: 'hallucination',    label: 'Made something up' },
        { id: 'incomplete',       label: 'Missing steps' },
        { id: 'confusing',        label: 'Confusing wording' },
        { id: 'formatting',       label: 'Formatting problem' },
        { id: 'other',            label: 'Something else' }
      ] },
    /* — Learn topics (purpose-built; opened from a Learn chapter via source:'learn'; own reason set. NOT in the
         Settings chooser GROUPS. Learn ships no AI surface, so there is deliberately no AI reason here.) — */
    { id: 'learn_issue',   label: 'A Learn topic', icon: '📚', group: 'learn', inDrill: false, defaultPriority: 'medium', helper: "Something's off in this chapter", fields: ['note'],
      subReasons: [
        { id: 'concept',     label: 'Incorrect concept' },
        { id: 'formula',     label: 'Wrong formula' },
        { id: 'explanation', label: 'Incorrect explanation' },
        { id: 'typo',        label: 'Typo' },
        { id: 'formatting',  label: 'Broken formatting' },
        { id: 'visual',      label: 'Image / diagram issue' },
        { id: 'outdated',    label: 'Outdated information' },
        { id: 'other',       label: 'Something else' }
      ] },
    /* — App problems — */
    { id: 'bug',           label: "Something's broken", icon: '🐞', group: 'app', inDrill: false, defaultPriority: 'high',     helper: "A feature isn't working right",  fields: ['title', 'description', 'expected', 'actual', 'repro'] },
    { id: 'crash',         label: 'Crash or freeze',    icon: '💥', group: 'app', inDrill: false, defaultPriority: 'critical', helper: 'The app froze, closed or hung',   fields: ['title', 'description', 'repro'] },
    { id: 'ui_issue',      label: 'Looks broken',       icon: '🧩', group: 'app', inDrill: false, defaultPriority: 'medium',   helper: 'Something looks off or misaligned', fields: ['description'] },
    { id: 'performance',   label: 'Slow or laggy',      icon: '⚡', group: 'app', inDrill: false, defaultPriority: 'medium',   helper: 'The app is slow or stutters',     fields: ['description'] },
    /* — Account / billing — */
    { id: 'payment',       label: 'Payment or billing', icon: '💳', group: 'account', inDrill: false, defaultPriority: 'high',   helper: 'A payment, premium or refund issue', fields: ['description'],
      subReasons: [
        { id: 'not_activated',       label: 'Premium not activated' },
        { id: 'deducted_no_premium', label: 'Money deducted, no premium' },
        { id: 'refund',              label: 'Refund request' },
        { id: 'transaction_error',   label: 'Transaction error' },
        { id: 'other',               label: 'Something else' }
      ] },
    { id: 'account',       label: 'Account or sign-in', icon: '🔒', group: 'account', inDrill: false, defaultPriority: 'high',   helper: 'Sign-in, syncing or your data',   fields: ['description'],
      subReasons: [
        { id: 'login',  label: 'Login / sign-in' },
        { id: 'sync',   label: 'Data not syncing' },
        { id: 'delete', label: 'Delete my account / data' },
        { id: 'other',  label: 'Something else' }
      ] },
    /* — Ideas & catch-all — */
    { id: 'feature_request', label: 'Feature idea',    icon: '💡', group: 'other', inDrill: false, defaultPriority: 'low',    helper: 'Suggest something new',   fields: ['title', 'description', 'benefit'] },
    { id: 'feedback',        label: 'General feedback',icon: '📝', group: 'other', inDrill: false, defaultPriority: 'low',    helper: 'Tell us how it\'s going',  fields: ['description', 'rating'] },
    { id: 'other',           label: 'Something else',  icon: '📦', group: 'other', inDrill: false, defaultPriority: 'medium', helper: 'Anything not listed here', fields: ['title', 'description'] }
  ];

  /* ── GROUPS ── the guided Settings first step shows these as rich rows (icon + title + helper), each drilling
     into the scoped reason set below it. Ordered by how often users reach for them. 'question' is included so a
     user can flag a question from Settings too (they'll be asked which one, since none is auto-attached). */
  var GROUPS = [
    { id: 'question', label: 'A question or its answer', icon: '📝', helper: 'A wrong answer, solution, option, typo or figure' },
    { id: 'ai',       label: 'A QuanAI explanation',     icon: '🤖', helper: "An explanation that's wrong, unclear or incomplete" },
    { id: 'app',      label: "The app isn't working",    icon: '🐞', helper: 'A bug, crash, slowness or something that looks broken' },
    { id: 'account',  label: 'Account or payment',       icon: '💳', helper: 'Sign-in, syncing, premium or a refund' },
    { id: 'other',    label: 'An idea or feedback',      icon: '💡', helper: 'Suggest a feature or tell us how it\'s going' }
  ];
  var GROUP_LABELS = {};
  for (var gi = 0; gi < GROUPS.length; gi++) GROUP_LABELS[GROUPS[gi].id] = GROUPS[gi].label;

  var _byId = {};
  for (var i = 0; i < TYPES.length; i++) _byId[TYPES[i].id] = TYPES[i];

  /* ── Field length caps (client shows counters; server rejects over-cap) ── */
  var FIELD_LIMITS = {
    title: 140,
    description: 4000,
    note: 600,
    expected: 1000,
    actual: 1000,
    repro: 400,
    benefit: 1000,
    internalNote: 2000,
    label: 40,
    labelsMax: 12,
    ratingMin: 1,
    ratingMax: 5
  };

  /* ── Abuse / rate-limit (enforced server-side in api/report.js) ── */
  var RATE_LIMIT = {
    maxPerHour: 15,          // per-uid reports/hour → 429 REPORT_RATE_LIMIT
    maxPerDay: 60,           // per-uid reports/day
    dedupeWindowMs: 5 * 60 * 1000   // identical (type+signature) within 5 min → linked as duplicate, not a new row
  };

  /* ── Helpers (used by modal + server copy + check) ── */
  function isValidType(id) { return Object.prototype.hasOwnProperty.call(_byId, id); }
  function typeById(id) { return _byId[id] || null; }
  function isValidStatus(s) { return STATUSES.indexOf(s) !== -1; }
  function isValidPriority(p) { return PRIORITIES.indexOf(p) !== -1; }
  function isOpenStatus(s) { return OPEN_STATUSES.indexOf(s) !== -1; }
  function subReasonsFor(typeId) { var t = _byId[typeId]; return (t && t.subReasons) ? t.subReasons : []; }
  function isValidSubReason(typeId, sub) {
    if (sub == null || sub === '') return true;   // sub-reason is always optional
    var subs = subReasonsFor(typeId);
    for (var k = 0; k < subs.length; k++) if (subs[k].id === sub) return true;
    return false;
  }
  function defaultPriorityFor(typeId) { var t = _byId[typeId]; return (t && t.defaultPriority) || 'medium'; }
  function typesForDrill() { return TYPES.filter(function (t) { return t.inDrill; }); }
  function typesForGroup(groupId) { return TYPES.filter(function (t) { return t.group === groupId; }); }
  function groupById(id) { for (var k = 0; k < GROUPS.length; k++) if (GROUPS[k].id === id) return GROUPS[k]; return null; }

  var ReportTypes = {
    STATUSES: STATUSES, STATUS_LABELS: STATUS_LABELS, OPEN_STATUSES: OPEN_STATUSES,
    PRIORITIES: PRIORITIES, PRIORITY_LABELS: PRIORITY_LABELS,
    TYPES: TYPES, GROUPS: GROUPS, GROUP_LABELS: GROUP_LABELS,
    FIELD_LIMITS: FIELD_LIMITS, RATE_LIMIT: RATE_LIMIT,
    isValidType: isValidType, typeById: typeById,
    isValidStatus: isValidStatus, isValidPriority: isValidPriority, isOpenStatus: isOpenStatus,
    subReasonsFor: subReasonsFor, isValidSubReason: isValidSubReason,
    defaultPriorityFor: defaultPriorityFor, typesForDrill: typesForDrill,
    typesForGroup: typesForGroup, groupById: groupById
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ReportTypes;
  if (typeof window !== 'undefined') window.ReportTypes = ReportTypes;
  else if (root) root.ReportTypes = ReportTypes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
