/**
 * report-queue.js — ReportQueue (ADR-096).
 *
 * Transport for report submissions with an OFFLINE-SAFE queue. A report must NEVER be lost: if the POST
 * fails (offline / network / 5xx), the payload is persisted to localStorage and flushed automatically on the
 * next `online` event and on every app boot, with capped exponential backoff. Every payload carries a
 * client-generated idempotency key (clientKey) so a retry — or a double-submit — collapses into ONE report
 * server-side (api/report.js findDuplicate), never a duplicate row.
 *
 * POSTs /api/report?action=create with Bearer auth + X-Session-Id (same idiom as companion-ui / duel-core).
 * Global: window.ReportQueue.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'qr_report_queue';
  var MAX_QUEUE = 50;            /* hard cap so a permanently-failing device can't grow storage unbounded */
  var BASE_BACKOFF_MS = 4000;
  var MAX_BACKOFF_MS = 5 * 60 * 1000;
  var _flushing = false;
  var _flushTimer = null;

  function _now() { return Date.now(); }

  function _uuid() {
    try {
      if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
      if (root.crypto && root.crypto.getRandomValues) {
        var b = new Uint8Array(16); root.crypto.getRandomValues(b);
        var h = ''; for (var i = 0; i < 16; i++) h += (b[i] + 0x100).toString(16).slice(1);
        return h;
      }
    } catch (_) {}
    return 'k' + _now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }

  function _load() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function _save(arr) {
    /* At the cap keep the NEWEST MAX_QUEUE (drop the oldest) — _enqueue appends to the tail, so slice(-N)
       retains the just-added report rather than discarding it (ADR-099 verification: "never lose" must not
       silently drop the newest submission on a long-offline device). */
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-MAX_QUEUE))); } catch (_) {}
  }
  function _enqueue(entry) {
    var q = _load();
    /* Dedupe by clientKey so the same report is never queued twice (double-tap while offline). */
    for (var i = 0; i < q.length; i++) { if (q[i] && q[i].payload && q[i].payload.clientKey === entry.payload.clientKey) return; }
    q.push(entry);
    _save(q);
  }
  function _removeByKey(clientKey) {
    var q = _load().filter(function (e) { return !(e && e.payload && e.payload.clientKey === clientKey); });
    _save(q);
  }

  function pendingCount() { return _load().length; }

  function _token() {
    try {
      if (root.Auth && Auth.getIdToken) return Auth.getIdToken();
    } catch (_) {}
    return Promise.reject(new Error('NO_AUTH'));
  }

  /* One network attempt. Resolves { ok, status, data } or { ok:false, network:true } on transport failure. */
  function _post(payload) {
    return _token().then(function (token) {
      /* No token yet (auth not ready / signed out mid-flush) → treat as a transient transport failure so the
         report is KEPT in the queue and retried later, never dropped ("never lose a report"). */
      if (!token) return { ok: false, network: true };
      var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
      try { if (root.Session && Session.id) headers['X-Session-Id'] = Session.id(); } catch (_) {}
      return root.fetch('/api/report?action=create', {
        method: 'POST', headers: headers, body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; },
          function () { return { ok: r.ok, status: r.status, data: {} }; });
      });
    }).catch(function () {
      return { ok: false, network: true };
    });
  }

  /* A response is "retryable" (keep it queued) on offline/network error or 5xx / explicit retryable envelope.
     A 4xx validation error (bad type, empty report, rate-limit already spent) is terminal — drop it, don't loop. */
  function _isRetryable(res) {
    if (!res) return true;
    if (res.network) return true;
    if (res.fatal) return false;
    if (res.ok) return false;
    if (typeof res.status === 'number' && res.status >= 500) return true;
    if (res.status === 429) return true;   /* rate-limited now → try again later */
    /* 401 (token momentarily rejected) and 409 (session replaced by a newer login) are TRANSIENT auth/session
       states, not content-invalid — keep the report queued so it flushes after re-auth (ADR-101: "never lose"). */
    if (res.status === 401 || res.status === 409) return true;
    var err = res.data && res.data.error;
    if (err && err.retryable === true) return true;
    return false;   /* 4xx validation → terminal */
  }

  /**
   * Submit a report. `payload` = { type, subReason, title, description, fields, source, context, question }.
   * Returns a promise resolving to:
   *   { ok:true, id, shortId }                  — accepted by the server
   *   { ok:true, queued:true, clientKey }        — offline/failed → safely queued, will flush later
   *   { ok:false, code, message }                — terminal validation error (won't retry)
   */
  function submit(payload) {
    payload = payload || {};
    if (!payload.clientKey) payload.clientKey = _uuid();

    /* Offline shortcut: don't even try the network — queue immediately. */
    if (root.navigator && root.navigator.onLine === false) {
      _enqueue({ payload: payload, attempts: 0, nextAt: _now() });
      _scheduleFlush(BASE_BACKOFF_MS);
      return Promise.resolve({ ok: true, queued: true, clientKey: payload.clientKey });
    }

    return _post(payload).then(function (res) {
      if (res.ok) {
        _removeByKey(payload.clientKey);   /* in case a prior attempt queued it */
        var d = res.data || {};
        return { ok: true, id: d.id || null, shortId: d.shortId || null, duplicate: !!d.duplicate };
      }
      if (_isRetryable(res)) {
        _enqueue({ payload: payload, attempts: 1, nextAt: _now() + BASE_BACKOFF_MS });
        _scheduleFlush(BASE_BACKOFF_MS);
        return { ok: true, queued: true, clientKey: payload.clientKey };
      }
      var err = (res.data && res.data.error) || {};
      return { ok: false, code: err.code || 'REPORT_FAILED', message: err.message || 'Could not send your report.' };
    });
  }

  function _backoffFor(attempts) {
    return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1)));
  }

  /* Flush all due entries. Sequential (reports are low-volume) so we never hammer the server on reconnect. */
  function flush() {
    if (_flushing) return Promise.resolve();
    if (root.navigator && root.navigator.onLine === false) return Promise.resolve();
    var q = _load();
    if (!q.length) return Promise.resolve();
    _flushing = true;

    var now = _now();
    var due = q.filter(function (e) { return !e.nextAt || e.nextAt <= now; });

    function step(i) {
      if (i >= due.length) return Promise.resolve();
      var entry = due[i];
      return _post(entry.payload).then(function (res) {
        if (res.ok) {
          _removeByKey(entry.payload.clientKey);
        } else if (_isRetryable(res)) {
          /* bump attempts + backoff in storage */
          var cur = _load();
          for (var j = 0; j < cur.length; j++) {
            if (cur[j] && cur[j].payload && cur[j].payload.clientKey === entry.payload.clientKey) {
              cur[j].attempts = (cur[j].attempts || 0) + 1;
              cur[j].nextAt = _now() + _backoffFor(cur[j].attempts);
              break;
            }
          }
          _save(cur);
        } else {
          _removeByKey(entry.payload.clientKey);   /* terminal validation error — drop, don't loop forever */
        }
        return step(i + 1);
      });
    }

    return step(0).then(function () {
      _flushing = false;
      var remaining = _load();
      if (remaining.length) {
        var soonest = remaining.reduce(function (min, e) { return Math.min(min, e.nextAt || _now()); }, Infinity);
        _scheduleFlush(Math.max(BASE_BACKOFF_MS, (soonest - _now())));
      }
    }, function () { _flushing = false; });
  }

  function _scheduleFlush(delay) {
    if (_flushTimer) return;
    delay = Math.max(1000, Math.min(MAX_BACKOFF_MS, delay || BASE_BACKOFF_MS));
    _flushTimer = root.setTimeout(function () { _flushTimer = null; flush(); }, delay);
  }

  function init() {
    try {
      root.addEventListener('online', function () { flush(); });
    } catch (_) {}
    /* Flush anything left from a previous session shortly after boot (once auth is likely ready). */
    if (pendingCount() > 0) _scheduleFlush(6000);
  }

  var ReportQueue = { submit: submit, flush: flush, pendingCount: pendingCount, init: init };

  if (typeof module !== 'undefined' && module.exports) module.exports = ReportQueue;
  if (typeof window !== 'undefined') {
    window.ReportQueue = ReportQueue;
    /* Auto-init in the browser: attach the 'online' flush listener + schedule a boot flush of anything left
       from a prior session. Safe to run at load — init() only registers listeners/timers. */
    try { init(); } catch (_) {}
  } else if (root) root.ReportQueue = ReportQueue;
})(typeof globalThis !== 'undefined' ? globalThis : this);
