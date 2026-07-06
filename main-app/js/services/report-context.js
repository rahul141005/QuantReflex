/**
 * report-context.js — ReportContext (ADR-096).
 *
 * Assembles the MAXIMIZED auto-diagnostics attached to every report. Because ADR-096 ships NO screenshots
 * in v1, this rich context IS the debugging aid — it must capture everything needed to reproduce an issue
 * without an image: app version, theme/appearance/target-exam, full device/runtime fingerprint, locale,
 * route, recent JS errors, and (for in-drill reports) a complete question snapshot (generator identity,
 * options, correct answer, explanation, the exact drill config, and what the user had selected).
 *
 * Everything here is best-effort and defensively guarded — collecting context must NEVER throw and block a
 * report. The server re-validates and size-caps all of it (api/_lib/report-schema.js).
 *
 * Global: window.ReportContext. No external deps beyond optional globals it feature-detects.
 */
(function (root) {
  'use strict';

  function _num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function _safe(fn, fallback) { try { return fn(); } catch (_) { return fallback === undefined ? null : fallback; } }

  /* window.QR_APP_VERSION is defined inline in index.html and bumped in LOCKSTEP with the service-worker
     APP_VERSION — it's the single most useful field for triaging "works on my build" issues. */
  function _appVersion() { return _safe(function () { return root.QR_APP_VERSION || null; }); }

  function _settings() {
    return _safe(function () { return (typeof loadSettings === 'function') ? (loadSettings() || {}) : {}; }, {});
  }

  function _formFactor() {
    return _safe(function () {
      var w = Math.min(root.innerWidth || 0, root.innerHeight || 0);
      var max = Math.max(root.innerWidth || 0, root.innerHeight || 0);
      if (max <= 0) return null;
      if (w >= 768) return 'desktop';
      if (w >= 600 || max >= 900) return 'tablet';
      return 'phone';
    });
  }

  function _connection() {
    return _safe(function () {
      var c = root.navigator && (root.navigator.connection || root.navigator.mozConnection || root.navigator.webkitConnection);
      return c && c.effectiveType ? String(c.effectiveType) : null;
    });
  }

  function _standalone() {
    return _safe(function () {
      if (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) return true;
      if (root.navigator && root.navigator.standalone === true) return true;
      return false;
    });
  }

  function _reducedMotion() {
    return _safe(function () { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); });
  }

  /* The most recent captured JS errors (window.onerror / unhandledrejection), from the app-level ring buffer
     installed in app.js. Returns [] when unavailable. */
  function _recentErrors() {
    return _safe(function () {
      if (typeof root.getRecentErrors === 'function') return root.getRecentErrors() || [];
      if (Array.isArray(root.__qrErrors)) return root.__qrErrors.slice(-10);
      return [];
    }, []);
  }

  /**
   * Collect the full auto-context for a report.
   * @param {'settings'|'drill'|'ai_explain'|'learn'} source
   * @returns {object} context map (matches shared/schemas/report-schema.json 'context')
   */
  function collect(source) {
    var s = _settings();
    var nav = root.navigator || {};
    var scr = root.screen || {};
    return {
      app: {
        version: _appVersion(),
        source: (source === 'drill' || source === 'ai_explain' || source === 'learn') ? source : 'settings',
        theme: s.theme || null,
        appearance: s.appearance || null,
        targetExam: _safe(function () { return (typeof TargetExam !== 'undefined' && TargetExam.get) ? TargetExam.get() : null; })
      },
      device: {
        ua: _safe(function () { return String(nav.userAgent || '').slice(0, 400); }),
        platform: _safe(function () { return nav.platform ? String(nav.platform).slice(0, 120) : null; }),
        formFactor: _formFactor(),
        screen: (scr.width ? { w: _num(scr.width) || 0, h: _num(scr.height) || 0 } : null),
        viewport: { w: _num(root.innerWidth) || 0, h: _num(root.innerHeight) || 0 },
        dpr: _num(root.devicePixelRatio),
        online: _safe(function () { return typeof nav.onLine === 'boolean' ? nav.onLine : null; }),
        connection: _connection(),
        deviceMemory: _num(nav.deviceMemory),
        hardwareConcurrency: _num(nav.hardwareConcurrency),
        standalone: _standalone(),
        reducedMotion: _reducedMotion()
      },
      locale: {
        tz: _safe(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }),
        language: _safe(function () { return nav.language || null; })
      },
      route: _safe(function () { return String(root.location && root.location.hash || '').slice(0, 200); }),
      sessionId: _safe(function () { return (root.Session && Session.id) ? Session.id() : null; }),
      recentErrors: _recentErrors(),
      submittedAtMs: Date.now()
    };
  }

  /**
   * Build the question snapshot for an in-drill report. `q` is the LIVE questions[current] object; `state` is a
   * bag of the current session state supplied by the drill engine (mode, config, score, what was selected, …).
   * Mirrors the AI-explain packaging idiom (drill-engine.js) so the admin sees exactly the item that was on screen.
   * @param {object} q
   * @param {object} state
   * @returns {object|null}
   */
  function snapshotQuestion(q, state) {
    if (!q) return null;
    state = state || {};
    var snap = {
      questionId: q.questionId || q.id || null,
      _authoredId: q._authoredId || null,
      category: q.category || null,
      subtype: q.subtype || null,
      difficulty: q.difficulty || null,
      /* Accept either `question` (live drill question object) or `questionText` (the shape the duel-review
         explain path passes) so a reported explanation ALWAYS carries its text + a stable signature (ADR-099). */
      questionText: (q.question != null ? String(q.question) : (q.questionText != null ? String(q.questionText) : null)),
      /* Answer mode (ADR-100): captured explicitly so no consumer has to re-infer it from options length.
         `isMCQ` is authoritative (has options); `answerFormat` is best-effort (explicit q.answerFormat, else the
         QRAnswerFormat kind — 'mcq'/'numeric'). Lets the UI + admin never say "options" for a typed question. */
      isMCQ: (Array.isArray(q.options) && q.options.length > 0),
      answerFormat: (function () {
        if (typeof q.answerFormat === 'string' && q.answerFormat) return q.answerFormat;
        try { if (root.QRAnswerFormat && root.QRAnswerFormat.answerFormat) { var f = root.QRAnswerFormat.answerFormat(q); return (f && f.kind) ? f.kind : null; } } catch (_) {}
        return null;
      })(),
      options: Array.isArray(q.options) ? q.options.slice(0, 12) : null,
      optionFigures: Array.isArray(q.optionFigures) ? q.optionFigures.slice(0, 12) : null,
      answer: (q.answer === undefined ? null : q.answer),
      explanation: (q.explanation != null ? String(q.explanation) : null),
      aiContext: (q.aiContext === undefined ? null : q.aiContext),
      chart: (q.chart === undefined ? null : q.chart),
      figure: (q.figure === undefined ? null : q.figure),
      mode: state.mode || null,
      isDuel: (typeof state.isDuel === 'boolean' ? state.isDuel : null),
      reviewMode: (typeof state.reviewMode === 'boolean' ? state.reviewMode : null),
      adaptiveMode: (typeof state.adaptiveMode === 'boolean' ? state.adaptiveMode : null),
      adaptiveDifficulty: state.adaptiveDifficulty || null,
      questionNumber: _num(state.questionNumber),
      count: _num(state.count),
      selectedAnswer: (state.selectedAnswer === undefined ? null : state.selectedAnswer),
      wasAnswered: (typeof state.wasAnswered === 'boolean' ? state.wasAnswered : null),
      wasCorrect: (typeof state.wasCorrect === 'boolean' ? state.wasCorrect : null),
      timeSpentMs: _num(state.timeSpentMs),
      timerRunning: (typeof state.timerRunning === 'boolean' ? state.timerRunning : null),
      perQLimit: _num(state.perQLimit),
      timeLimit: _num(state.timeLimit),
      score: _num(state.score),
      streak: _num(state.streak)
    };
    return snap;
  }

  var ReportContext = { collect: collect, snapshotQuestion: snapshotQuestion };

  if (typeof module !== 'undefined' && module.exports) module.exports = ReportContext;
  if (typeof window !== 'undefined') window.ReportContext = ReportContext;
  else if (root) root.ReportContext = ReportContext;
})(typeof globalThis !== 'undefined' ? globalThis : this);
