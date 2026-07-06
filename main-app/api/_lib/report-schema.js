/**
 * report-schema.js — SERVER inline copy of the reporting enums + PURE validation logic (ADR-096).
 *
 * WHY A COPY: the browser and the check harness load the canonical `shared/constants/report-types.js`
 * (static site is served from the repo root; the check `require()`s it). But Vercel bundles each app
 * from its OWN root (`main-app/`), so a serverless function CANNOT `require('../shared/...')` at runtime.
 * This module therefore keeps an INLINE copy of the enums and all the pure request-path logic, and
 * `main-app/scripts/report.check.js` asserts this copy stays in LOCKSTEP with the shared constants.
 *
 * Everything here is PURE (no Firestore, no admin SDK, no I/O) so it is unit-testable under Node.
 * The Vercel handler (`api/report.js`) does the I/O (auth, queries, batch write) and calls into here.
 *
 * PHILOSOPHY (ADR-096): reports are self-contained in Firestore (no email / external notify). No
 * screenshots in v1 — the rich auto-context replaces them. Everything the client sends for
 * classification is UNTRUSTED and validated/size-capped here; reporter identity + priority + status +
 * shortId are assembled SERVER-SIDE (never from the body).
 */
'use strict';

/* ── Enums (LOCKSTEP with shared/constants/report-types.js — enforced by report.check.js) ── */
var STATUSES = ['open', 'investigating', 'needs_info', 'resolved', 'dismissed', 'duplicate', 'archived'];
var OPEN_STATUSES = ['open', 'investigating', 'needs_info'];
var PRIORITIES = ['critical', 'high', 'medium', 'low'];

/* type id → { group, inDrill, defaultPriority, subReasons:[ids] }. Mirrors report-types.js TYPES. */
var TYPE_META = {
  question_wrong:    { group: 'question', inDrill: true,  defaultPriority: 'high',     subReasons: [] },
  answer_wrong:      { group: 'question', inDrill: true,  defaultPriority: 'critical', subReasons: [] },
  options_wrong:     { group: 'question', inDrill: true,  defaultPriority: 'high',     subReasons: [] },
  explanation_wrong: { group: 'question', inDrill: true,  defaultPriority: 'high',     subReasons: [] },
  typo:              { group: 'question', inDrill: true,  defaultPriority: 'low',      subReasons: [] },
  formatting:        { group: 'question', inDrill: true,  defaultPriority: 'low',      subReasons: [] },
  visual:            { group: 'question', inDrill: true,  defaultPriority: 'medium',   subReasons: ['chart_wrong', 'figure_render', 'clipping', 'missing_image', 'other'] },
  bug:               { group: 'app',      inDrill: false, defaultPriority: 'high',     subReasons: [] },
  crash:             { group: 'app',      inDrill: false, defaultPriority: 'critical', subReasons: [] },
  performance:       { group: 'app',      inDrill: false, defaultPriority: 'medium',   subReasons: [] },
  ai_issue:          { group: 'app',      inDrill: false, defaultPriority: 'medium',   subReasons: ['wrong_explanation', 'hallucination', 'poor_reasoning', 'incomplete', 'wrong_calc', 'other'] },
  payment:           { group: 'account',  inDrill: false, defaultPriority: 'high',     subReasons: ['not_activated', 'deducted_no_premium', 'refund', 'transaction_error', 'other'] },
  account:           { group: 'account',  inDrill: false, defaultPriority: 'high',     subReasons: ['login', 'sync', 'delete', 'other'] },
  feature_request:   { group: 'other',    inDrill: false, defaultPriority: 'low',      subReasons: [] },
  feedback:          { group: 'other',    inDrill: false, defaultPriority: 'low',      subReasons: [] },
  other:             { group: 'other',    inDrill: false, defaultPriority: 'medium',   subReasons: [] }
};
var TYPES = Object.keys(TYPE_META);

/* Field caps (LOCKSTEP with report-types.js FIELD_LIMITS). */
var FIELD_LIMITS = {
  title: 140, description: 4000, note: 600, expected: 1000, actual: 1000,
  repro: 400, benefit: 1000, internalNote: 2000, label: 40, labelsMax: 12,
  ratingMin: 1, ratingMax: 5
};

/* Abuse / rate-limit (LOCKSTEP with report-types.js RATE_LIMIT). */
var RATE_LIMIT = { maxPerHour: 15, maxPerDay: 60, dedupeWindowMs: 5 * 60 * 1000 };

/* Per-type free-text field caps for the classification.fields bag (unknown keys are dropped). */
var FIELD_CAPS = {
  expected: FIELD_LIMITS.expected,
  actual: FIELD_LIMITS.actual,
  repro: FIELD_LIMITS.repro,
  benefit: FIELD_LIMITS.benefit,
  note: FIELD_LIMITS.note
};

/* Overall guards on the client-supplied context/question maps (defense against oversized payloads). */
var CONTEXT_MAX_BYTES = 24 * 1024;   /* serialized context cap */
var QUESTION_MAX_BYTES = 48 * 1024;  /* serialized question snapshot cap */
var RECENT_ERRORS_MAX = 10;
var RECENT_ERROR_MSG_MAX = 500;

/* ── Enum helpers ── */
function isValidType(id) { return Object.prototype.hasOwnProperty.call(TYPE_META, id); }
function isValidStatus(s) { return STATUSES.indexOf(s) !== -1; }
function isValidPriority(p) { return PRIORITIES.indexOf(p) !== -1; }
function isOpenStatus(s) { return OPEN_STATUSES.indexOf(s) !== -1; }
function groupFor(type) { var m = TYPE_META[type]; return m ? m.group : null; }
function defaultPriorityFor(type) { var m = TYPE_META[type]; return (m && m.defaultPriority) || 'medium'; }
function isValidSubReason(type, sub) {
  if (sub == null || sub === '') return true;   // always optional
  var m = TYPE_META[type];
  return !!(m && m.subReasons.indexOf(sub) !== -1);
}

/* ── Coercion primitives ── */
function _str(v, max) {
  if (v == null) return null;
  var s = String(v);
  // Strip control chars but PRESERVE tab (\x09), LF (\x0a) and CR (\x0d) so multi-line free-text
  // (description / repro / expected / actual, and question/explanation snapshots) keeps its line breaks.
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
  if (!s) return null;
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}
function _num(v) { var n = Number(v); return (typeof v !== 'boolean' && isFinite(n)) ? n : null; }
function _bool(v) { return typeof v === 'boolean' ? v : null; }
/* A scalar answer/option value: keep numbers/booleans as-is, length-cap strings, drop objects/arrays. Bounds a
   crafted oversized answer/option so it can't defeat the question byte-cap (ADR-098 hardening). */
function _capScalar(v, max) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  return null;
}
function _byteLen(obj) { try { return Buffer.byteLength(JSON.stringify(obj)); } catch (_) { return 0; } }

/* Deterministic, collision-resistant string hash (djb2 xor variant) → base36. Pure, stable across runs. */
function _hash(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) { h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

/**
 * Stable generator signature for a drill question snapshot: questionId || _authoredId ||
 * `category|subtype|hash(questionText)`. Returns null when nothing identifying is present.
 */
function computeSignature(q) {
  if (!q || typeof q !== 'object') return null;
  var qid = _str(q.questionId, 200);
  if (qid) return qid;
  var aid = _str(q._authoredId, 200);
  if (aid) return aid;
  var cat = _str(q.category, 80) || 'unknown';
  var sub = _str(q.subtype, 80) || 'unknown';
  var text = _str(q.questionText, 4000);
  if (!text) return null;                          // no stable identity → leave unsignatured
  return cat + '|' + sub + '|' + _hash(text);
}

/* Crockford base32 (no I/L/O/U) — human-friendly, unambiguous. */
var _B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/**
 * Build a short reference id 'QR-XXXX' from a byte source (Buffer/array/Uint8Array).
 * Pure + injectable so the check can pass fixed bytes; the handler passes crypto.randomBytes.
 */
function makeShortId(bytes, len) {
  len = len || 4;
  var out = '';
  for (var i = 0; i < len; i++) {
    var b = bytes && bytes.length ? (bytes[i % bytes.length] & 0xff) : 0;
    out += _B32.charAt(b % 32);
  }
  return 'QR-' + out;
}

/* ── recentErrors sanitizer ── */
function _sanitizeRecentErrors(arr) {
  if (!Array.isArray(arr)) return [];
  var out = [];
  for (var i = 0; i < arr.length && out.length < RECENT_ERRORS_MAX; i++) {
    var e = arr[i];
    if (!e || typeof e !== 'object') continue;
    var msg = _str(e.msg, RECENT_ERROR_MSG_MAX);
    if (!msg) continue;
    out.push({ msg: msg, at: _num(e.at) || 0 });
  }
  return out;
}

/* ── context sanitizer (whitelist-shaped, byte-capped) ── */
function sanitizeContext(ctx, source) {
  ctx = (ctx && typeof ctx === 'object') ? ctx : {};
  var app = (ctx.app && typeof ctx.app === 'object') ? ctx.app : {};
  var dev = (ctx.device && typeof ctx.device === 'object') ? ctx.device : {};
  var loc = (ctx.locale && typeof ctx.locale === 'object') ? ctx.locale : {};

  var screen = (dev.screen && typeof dev.screen === 'object')
    ? { w: _num(dev.screen.w) || 0, h: _num(dev.screen.h) || 0 } : null;
  var viewport = (dev.viewport && typeof dev.viewport === 'object')
    ? { w: _num(dev.viewport.w) || 0, h: _num(dev.viewport.h) || 0 } : null;

  var clean = {
    app: {
      version: _str(app.version, 40),
      source: source,                              // server-forced (never trust the body's source)
      theme: _str(app.theme, 40),
      appearance: _str(app.appearance, 40),
      targetExam: _str(app.targetExam, 120)
    },
    device: {
      ua: _str(dev.ua, 400),
      platform: _str(dev.platform, 120),
      formFactor: _str(dev.formFactor, 20),
      screen: screen,
      viewport: viewport,
      dpr: _num(dev.dpr),
      online: _bool(dev.online),
      connection: _str(dev.connection, 40),
      deviceMemory: _num(dev.deviceMemory),
      hardwareConcurrency: _num(dev.hardwareConcurrency),
      standalone: _bool(dev.standalone),
      reducedMotion: _bool(dev.reducedMotion)
    },
    locale: {
      tz: _str(loc.tz, 80),
      language: _str(loc.language, 40)
    },
    route: _str(ctx.route, 200),
    sessionId: _str(ctx.sessionId, 80),   // the handler overrides this with the trusted X-Session-Id header
    recentErrors: _sanitizeRecentErrors(ctx.recentErrors),
    submittedAtMs: _num(ctx.submittedAtMs)
    /* NOTE (future seam): a notification/email hook or context.attachments[] can be added here with
       zero migration — not implemented in v1. */
  };
  /* Byte-cap guard: if a client stuffs the context, drop the least-critical big field (recentErrors). */
  if (_byteLen(clean) > CONTEXT_MAX_BYTES) clean.recentErrors = [];
  return clean;
}

/* ── question snapshot sanitizer (only for source==='drill') ── */
function sanitizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  var clean = {
    signature: null,                               // set by caller after computeSignature
    questionId: _str(q.questionId, 200),
    _authoredId: _str(q._authoredId, 200),
    category: _str(q.category, 80),
    subtype: _str(q.subtype, 80),
    difficulty: _str(q.difficulty, 40),
    questionText: _str(q.questionText, FIELD_LIMITS.description),
    options: Array.isArray(q.options) ? q.options.slice(0, 12).map(function (o) { return _capScalar(o, 300); }) : null,
    optionFigures: Array.isArray(q.optionFigures) ? q.optionFigures.slice(0, 12) : null,
    answer: _capScalar(q.answer, 300),
    explanation: _str(q.explanation, 8000),
    aiContext: (q.aiContext === undefined ? null : q.aiContext),
    chart: (q.chart === undefined ? null : q.chart),
    mode: _str(q.mode, 40),
    isDuel: _bool(q.isDuel),
    reviewMode: _bool(q.reviewMode),
    adaptiveMode: _bool(q.adaptiveMode),
    adaptiveDifficulty: _str(q.adaptiveDifficulty, 40),
    questionNumber: _num(q.questionNumber),
    count: _num(q.count),
    selectedAnswer: _capScalar(q.selectedAnswer, 300),
    wasAnswered: _bool(q.wasAnswered),
    wasCorrect: _bool(q.wasCorrect),
    timeSpentMs: _num(q.timeSpentMs),
    timerRunning: _bool(q.timerRunning),
    perQLimit: _num(q.perQLimit),
    timeLimit: _num(q.timeLimit),
    score: _num(q.score),
    streak: _num(q.streak)
  };
  clean.signature = computeSignature(q);
  /* Byte-cap guard: if the snapshot is huge (e.g. giant chart spec), drop the heaviest optional fields. */
  if (_byteLen(clean) > QUESTION_MAX_BYTES) { clean.chart = null; clean.aiContext = null; }
  if (_byteLen(clean) > QUESTION_MAX_BYTES) { clean.optionFigures = null; clean.explanation = _str(clean.explanation, 2000); }
  return clean;
}

/* ── AI explanation metadata sanitizer (ADR-097; ADR-098 identity) ──
   Captures the explanation text + the QuanAI-owned version id (promptId, e.g. 'explain.base@3') so an admin can
   tie a reported explanation back to its generation config. The underlying provider/model is DELIBERATELY NOT
   captured or stored (QuanAI product identity, ADR-098) — a hand-crafted client body sending `model`/`provider`
   is ignored here; the real model lives only in server-side aiRequests telemetry. */
var AI_EXPLANATION_MAX = 8000;
function sanitizeAi(ai) {
  if (!ai || typeof ai !== 'object') return null;
  var explanation = _str(ai.explanation, AI_EXPLANATION_MAX);
  var promptId = _str(ai.promptId, 120);
  if (!explanation && !promptId) return null;   // nothing worth storing
  return { explanation: explanation, promptId: promptId };
}

/**
 * Validate + normalize a create payload. PURE — no I/O, no reporter identity (assembled by the handler).
 * @param {object} body — untrusted client body
 * @returns {{ ok:boolean, code?:string, message?:string, clean?:object }}
 *   clean = { type, subReason, title, description, priority, fields, source, context, question, signature, clientKey }
 */
function validateCreatePayload(body) {
  body = body || {};

  var type = _str(body.type, 40);
  if (!type || !isValidType(type)) {
    return { ok: false, code: 'INVALID_TYPE', message: 'Unknown or missing report type.' };
  }

  var subReason = _str(body.subReason, 60);
  if (!isValidSubReason(type, subReason)) {
    return { ok: false, code: 'INVALID_SUBREASON', message: 'Invalid reason for this report type.' };
  }

  var title = _str(body.title, FIELD_LIMITS.title);
  var description = _str(body.description, FIELD_LIMITS.description);

  /* source is client-declared but constrained to the known entry points; anything else → 'settings'. */
  var source = (body.source === 'drill' || body.source === 'ai_explain') ? body.source : 'settings';
  var group = groupFor(type);

  /* type-specific fields bag: keep only known keys, cap each, coerce rating to [1..5]. Parsed BEFORE the
     empty-report guard so a rating counts as content (a star-only feedback submit is valid). */
  var rawFields = (body.fields && typeof body.fields === 'object') ? body.fields : {};
  var fields = {};
  Object.keys(FIELD_CAPS).forEach(function (k) {
    var v = _str(rawFields[k], FIELD_CAPS[k]);
    if (v) fields[k] = v;
  });
  if (rawFields.rating != null) {
    var r = _num(rawFields.rating);
    if (r != null) fields.rating = Math.max(FIELD_LIMITS.ratingMin, Math.min(FIELD_LIMITS.ratingMax, Math.round(r)));
  }

  /* Question-family reports (the in-drill fast path) AND ai_explain reports are meaningful from the type +
     attached context alone — text optional. App / account / other reports must carry SOME substance —
     free text OR a rating (star-only feedback). */
  if (group !== 'question' && source !== 'ai_explain') {
    if (!title && !description && fields.rating == null) {
      return { ok: false, code: 'EMPTY_REPORT', message: 'Please add a short description (or a rating).' };
    }
  }

  var context = sanitizeContext(body.context, source);

  /* Capture the exact question for in-drill AND ai_explain reports (both are anchored to a live question). */
  var question = null, signature = null;
  if (source === 'drill' || source === 'ai_explain') {
    question = sanitizeQuestion(body.question);
    if (question) signature = question.signature;
  }

  /* AI-explanation metadata (ADR-097) — only meaningful for ai_explain, but sanitized defensively regardless. */
  var ai = sanitizeAi(body.ai);

  /* client idempotency key — dedupes a double-submit / offline-retry into ONE row (handler enforces). */
  var clientKey = _str(body.clientKey, 64);

  return {
    ok: true,
    clean: {
      type: type,
      subReason: subReason,
      title: title,
      description: description,
      priority: defaultPriorityFor(type),          // server-seeded; admin edits later
      fields: fields,
      source: source,
      context: context,
      question: question,
      signature: signature,
      ai: ai,
      clientKey: clientKey
    }
  };
}

/**
 * PURE rate-limit decision. `timestampsMs` = createdAtMs of the caller's recent reports (any subset that
 * includes at least the last day). Returns { allowed, code?, message?, retryable? }.
 */
function rateLimitDecision(timestampsMs, nowMs, limits) {
  limits = limits || RATE_LIMIT;
  var hourAgo = nowMs - 60 * 60 * 1000;
  var dayAgo = nowMs - 24 * 60 * 60 * 1000;
  var inHour = 0, inDay = 0;
  for (var i = 0; i < timestampsMs.length; i++) {
    var t = timestampsMs[i];
    if (typeof t !== 'number') continue;
    if (t >= hourAgo) inHour++;
    if (t >= dayAgo) inDay++;
  }
  if (inHour >= limits.maxPerHour) {
    return { allowed: false, code: 'REPORT_RATE_LIMIT', message: 'You\'ve sent a lot of reports recently. Please try again in a little while.', retryable: true };
  }
  if (inDay >= limits.maxPerDay) {
    return { allowed: false, code: 'REPORT_RATE_LIMIT', message: 'Daily report limit reached. Please try again tomorrow.', retryable: true };
  }
  return { allowed: true };
}

/**
 * PURE duplicate detector. `candidates` = recent reports [{ id, type, signature, clientKey, createdAtMs }].
 * A new report is a duplicate if (a) the same clientKey already exists (idempotent retry), or (b) an identical
 * (type + signature) report was filed within dedupeWindowMs. Returns the existing report id, or null.
 */
function findDuplicate(candidates, incoming, nowMs, limits) {
  limits = limits || RATE_LIMIT;
  if (!Array.isArray(candidates)) return null;
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (!c) continue;
    if (incoming.clientKey && c.clientKey && c.clientKey === incoming.clientKey) return c.id;
  }
  if (!incoming.signature) return null;            // no signature → don't collapse distinct app reports
  for (var j = 0; j < candidates.length; j++) {
    var d = candidates[j];
    if (!d) continue;
    if (d.type === incoming.type && d.signature === incoming.signature &&
        typeof d.createdAtMs === 'number' && (nowMs - d.createdAtMs) <= limits.dedupeWindowMs) {
      return d.id;
    }
  }
  return null;
}

module.exports = {
  STATUSES: STATUSES, OPEN_STATUSES: OPEN_STATUSES, PRIORITIES: PRIORITIES,
  TYPES: TYPES, TYPE_META: TYPE_META, FIELD_LIMITS: FIELD_LIMITS, RATE_LIMIT: RATE_LIMIT,
  isValidType: isValidType, isValidStatus: isValidStatus, isValidPriority: isValidPriority, isOpenStatus: isOpenStatus,
  groupFor: groupFor, defaultPriorityFor: defaultPriorityFor, isValidSubReason: isValidSubReason,
  computeSignature: computeSignature, makeShortId: makeShortId,
  sanitizeContext: sanitizeContext, sanitizeQuestion: sanitizeQuestion, sanitizeAi: sanitizeAi,
  validateCreatePayload: validateCreatePayload,
  rateLimitDecision: rateLimitDecision, findDuplicate: findDuplicate
};
