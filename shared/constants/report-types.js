/**
 * report-types.js — Canonical constants for the QuantReflex Reporting System (ADR-096).
 *
 * ONE source of truth for report TYPES, STATUSES, PRIORITIES, per-type SUB-REASONS, field caps,
 * and the abuse/rate-limit constants. Consumed by:
 *   • main-app browser modal (`js/ui/report-modal.js`) — loaded via a <script> tag as `window.ReportTypes`
 *     (the static site is served from the repo root, exactly like `../shared/validation/auth-validators.js`).
 *   • the report check harness (`main-app/scripts/report.check.js`) via `require()`.
 * The Vercel serverless handler (`main-app/api/report.js`) cannot `require('../shared/...')` at runtime
 * (its bundle root is `main-app/`), so it keeps a validated INLINE COPY in `api/_lib/report-schema.js`;
 * the check asserts that copy is in lockstep with THIS file.
 *
 * REPORTING PHILOSOPHY (ADR-096): reports are fully self-contained in Firestore — the Super-Admin Reports
 * dashboard is the source of truth. NO email / external notification is involved. Screenshots are NOT part of
 * v1 (the rich auto-collected context replaces them); the schema leaves a clean, migration-free seam for
 * attachments and for a future notification hook.
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

  /* ── REPORT TYPES ──
   * group: coarse triage bucket. inDrill: offered in the fast in-drill picker (question-specific).
   * defaultPriority: seed priority when a report of this type is filed. subReasons: optional refinement.
   * fields: which free-text fields the modal shows (all optional server-side except description on app/other types). */
  var TYPES = [
    /* — Question-specific (the in-drill fast path; the TYPE itself is the reason) — */
    { id: 'question_wrong',    label: 'Wrong question',       icon: '📖', group: 'question', inDrill: true,  defaultPriority: 'high',     fields: ['note'] },
    { id: 'answer_wrong',      label: 'Wrong answer',         icon: '✅', group: 'question', inDrill: true,  defaultPriority: 'critical', fields: ['note'] },
    { id: 'options_wrong',     label: 'Wrong options',        icon: '🔢', group: 'question', inDrill: true,  defaultPriority: 'high',     fields: ['note'] },
    { id: 'explanation_wrong', label: 'Wrong explanation',    icon: '🧠', group: 'question', inDrill: true,  defaultPriority: 'high',     fields: ['note'] },
    { id: 'typo',              label: 'Typo',                 icon: '✍️', group: 'question', inDrill: true,  defaultPriority: 'low',      fields: ['note'] },
    { id: 'formatting',        label: 'Formatting issue',     icon: '📐', group: 'question', inDrill: true,  defaultPriority: 'low',      fields: ['note'] },
    { id: 'visual',            label: 'Visual / figure problem', icon: '🎨', group: 'question', inDrill: true, defaultPriority: 'medium', fields: ['note'],
      subReasons: [
        { id: 'chart_wrong',    label: 'Chart is wrong' },
        { id: 'figure_render',  label: "Figure doesn't render right" },
        { id: 'clipping',       label: 'Clipped / cut off' },
        { id: 'missing_image',  label: 'Missing image' },
        { id: 'other',          label: 'Something else' }
      ] },
    /* — App-wide — */
    { id: 'bug',           label: 'Bug',              icon: '🐞', group: 'app', inDrill: false, defaultPriority: 'high',     fields: ['title', 'description', 'expected', 'actual', 'repro'] },
    { id: 'crash',         label: 'Crash / freeze',   icon: '💥', group: 'app', inDrill: false, defaultPriority: 'critical', fields: ['title', 'description', 'repro'] },
    { id: 'performance',   label: 'Performance',      icon: '⚡', group: 'app', inDrill: false, defaultPriority: 'medium',   fields: ['title', 'description'] },
    { id: 'ai_issue',      label: 'AI issue',         icon: '🤖', group: 'app', inDrill: false, defaultPriority: 'medium',   fields: ['description'],
      subReasons: [
        { id: 'wrong_explanation', label: 'Wrong explanation' },
        { id: 'hallucination',     label: 'Made something up' },
        { id: 'poor_reasoning',    label: 'Poor reasoning' },
        { id: 'incomplete',        label: 'Incomplete answer' },
        { id: 'wrong_calc',        label: 'Wrong calculations' },
        { id: 'other',             label: 'Something else' }
      ] },
    /* — Account / billing — */
    { id: 'payment',       label: 'Payment',          icon: '💳', group: 'account', inDrill: false, defaultPriority: 'high',   fields: ['description'],
      subReasons: [
        { id: 'not_activated',       label: 'Premium not activated' },
        { id: 'deducted_no_premium', label: 'Money deducted, no premium' },
        { id: 'refund',              label: 'Refund request' },
        { id: 'transaction_error',   label: 'Transaction error' },
        { id: 'other',               label: 'Something else' }
      ] },
    { id: 'account',       label: 'Account',          icon: '🔒', group: 'account', inDrill: false, defaultPriority: 'high',   fields: ['description'],
      subReasons: [
        { id: 'login',  label: 'Login / sign-in' },
        { id: 'sync',   label: 'Data not syncing' },
        { id: 'delete', label: 'Delete my account / data' },
        { id: 'other',  label: 'Something else' }
      ] },
    /* — Ideas & catch-all — */
    { id: 'feature_request', label: 'Feature request', icon: '💡', group: 'other', inDrill: false, defaultPriority: 'low',    fields: ['title', 'description', 'benefit'] },
    { id: 'feedback',        label: 'Feedback',        icon: '📝', group: 'other', inDrill: false, defaultPriority: 'low',    fields: ['description', 'rating'] },
    { id: 'other',           label: 'Other',           icon: '📦', group: 'other', inDrill: false, defaultPriority: 'medium', fields: ['title', 'description'] }
  ];

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

  var ReportTypes = {
    STATUSES: STATUSES, STATUS_LABELS: STATUS_LABELS, OPEN_STATUSES: OPEN_STATUSES,
    PRIORITIES: PRIORITIES, PRIORITY_LABELS: PRIORITY_LABELS,
    TYPES: TYPES, FIELD_LIMITS: FIELD_LIMITS, RATE_LIMIT: RATE_LIMIT,
    isValidType: isValidType, typeById: typeById,
    isValidStatus: isValidStatus, isValidPriority: isValidPriority, isOpenStatus: isOpenStatus,
    subReasonsFor: subReasonsFor, isValidSubReason: isValidSubReason,
    defaultPriorityFor: defaultPriorityFor, typesForDrill: typesForDrill
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ReportTypes;
  if (typeof window !== 'undefined') window.ReportTypes = ReportTypes;
  else if (root) root.ReportTypes = ReportTypes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
