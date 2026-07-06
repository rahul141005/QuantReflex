/**
 * report-modal.js — ReportModal (ADR-096).
 *
 * The premium "Report a Problem" experience. Two entry points share one modal:
 *   • Settings  → ReportModal.open({ source:'settings' })         — full type set, grouped.
 *   • In-drill  → ReportModal.open({ source:'drill', question, session }) — pre-scoped to the current
 *                 question (question-family types first), fast (pick a reason → send).
 *
 * Flow: Step 1 type picker → Step 2 type-specific fields (+ optional sub-reason + a collapsible read-only
 * "Technical details (auto-attached)" preview so the user sees the rich diagnostics being sent — which is
 * why no screenshot is needed) → Submit → progress → success (shows the Report ID). Reports never lose:
 * ReportQueue queues offline and flushes later, so "Send" always succeeds from the user's point of view.
 *
 * Glass scaffold reuses .modal-overlay/.modal-content + body.modal-open, qr-ico, showToast, SoundEngine.
 * NO file input / NO screenshot UI (ADR-096). Global: window.ReportModal.
 */
(function (root) {
  'use strict';

  var _open = false;        /* reentrancy guard — only one report modal at a time */
  var _overlay = null;
  var _lastFocus = null;
  var _keyHandler = null;

  function _esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML;
  }
  function _ico(name, emoji) { return (typeof qrIco === 'function') ? qrIco(name, emoji) : '<span class="qr-ico" data-ico="' + name + '" aria-hidden="true">' + emoji + '</span>'; }
  function _sound(name) { try { if (typeof SoundEngine !== 'undefined' && SoundEngine.play) SoundEngine.play(name); } catch (_) {} }
  function _toast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (_) {} }
  function _types() { return (root.ReportTypes && root.ReportTypes.TYPES) ? root.ReportTypes.TYPES : []; }
  function _limits() { return (root.ReportTypes && root.ReportTypes.FIELD_LIMITS) ? root.ReportTypes.FIELD_LIMITS : { title: 140, description: 4000, note: 600 }; }

  /* Per-field render metadata. `key` says where the value lands in the payload: 'title'/'description' are
     top-level; anything else goes into classification.fields. 'note' collapses into description (question
     types carry no separate description). */
  var FIELD_DEFS = {
    title:       { key: 'title',       label: 'Title', input: 'text',     placeholder: 'A short summary', cap: 'title' },
    description: { key: 'description', label: 'Describe the problem', input: 'textarea', placeholder: 'What went wrong? The more detail, the faster we can fix it.', cap: 'description' },
    note:        { key: 'description', label: 'Add a note (optional)', input: 'textarea', placeholder: 'Anything you noticed — optional. The question details are attached automatically.', cap: 'note' },
    expected:    { key: 'expected',    label: 'What did you expect?', input: 'textarea', placeholder: 'What should have happened?', cap: 'expected' },
    actual:      { key: 'actual',      label: 'What actually happened?', input: 'textarea', placeholder: 'What did you see instead?', cap: 'actual' },
    repro:       { key: 'repro',       label: 'Steps to reproduce (optional)', input: 'textarea', placeholder: 'How can we make it happen again?', cap: 'repro' },
    benefit:     { key: 'benefit',     label: 'How would this help you?', input: 'textarea', placeholder: 'Optional — tell us why it matters.', cap: 'benefit' },
    rating:      { key: 'rating',      label: 'How would you rate your experience?', input: 'rating' }
  };

  /* Working state for the current session. */
  var st = null;

  function open(opts) {
    if (_open) return;
    opts = opts || {};
    _open = true;
    var src = (opts.source === 'drill' || opts.source === 'ai_explain') ? opts.source : 'settings';
    st = {
      source: src,
      question: opts.question || null,
      session: opts.session || null,
      ai: opts.ai || null,                                /* ADR-097: AI explanation bundle (ai_explain source) */
      scope: src === 'drill' ? 'drill' : 'all',           /* which type set the picker shows */
      type: null,
      subReason: null,
      submitting: false
    };

    _lastFocus = document.activeElement;
    _overlay = document.createElement('div');
    _overlay.className = 'modal-overlay report-modal-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Report a problem');
    document.body.appendChild(_overlay);
    document.body.classList.add('modal-open');

    _overlay.addEventListener('click', function (e) { if (e.target === _overlay && !st.submitting) close(); });
    _keyHandler = function (e) {
      if (e.key === 'Escape' && !st.submitting) { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') _trapTab(e);
    };
    document.addEventListener('keydown', _keyHandler, true);

    /* ai_explain is pre-scoped to the AI issue type — skip the picker and open the form directly. */
    if (st.source === 'ai_explain') { st.type = 'ai_issue'; _renderForm(); }
    else _renderPicker();
    _sound('settingsToggle');
  }

  function close() {
    if (!_overlay) { _open = false; return; }
    document.removeEventListener('keydown', _keyHandler, true);
    if (_overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    document.body.classList.remove('modal-open');
    _overlay = null; _keyHandler = null; _open = false; st = null;
    try { if (_lastFocus && _lastFocus.focus) _lastFocus.focus(); } catch (_) {}
    _lastFocus = null;
  }

  function _focusables() {
    if (!_overlay) return [];
    return Array.prototype.slice.call(_overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }
  function _trapTab(e) {
    var f = _focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function _focusFirst() {
    var f = _focusables();
    if (f.length) setTimeout(function () { try { f[0].focus(); } catch (_) {} }, 40);
  }

  /* ── Step 1: type picker ── */
  function _renderPicker() {
    var types = _types();
    var showTypes;
    if (st.scope === 'drill') {
      showTypes = types.filter(function (t) { return t.inDrill; });
    } else {
      showTypes = types;
    }

    var html = '' +
      '<div class="modal-content report-modal">' +
        '<button class="report-modal-close" type="button" aria-label="Close">' + _ico('close', '✕') + '</button>' +
        '<h3 class="modal-title report-modal-title">' + _ico('flag', '⚑') + ' Report a problem</h3>' +
        '<p class="report-modal-sub">' + (st.scope === 'drill'
            ? 'What\'s wrong with this question?'
            : 'What would you like to tell us about?') + '</p>' +
        '<div class="report-type-grid" role="list">';

    if (st.scope === 'settings') {
      var groups = [
        { key: 'question', label: 'Question content' },
        { key: 'app', label: 'App problems' },
        { key: 'account', label: 'Account & billing' },
        { key: 'other', label: 'Ideas & feedback' }
      ];
      groups.forEach(function (g) {
        var inGroup = showTypes.filter(function (t) { return t.group === g.key; });
        if (!inGroup.length) return;
        html += '<div class="report-type-group-label">' + _esc(g.label) + '</div>';
        inGroup.forEach(function (t) { html += _typeBtn(t); });
      });
    } else {
      showTypes.forEach(function (t) { html += _typeBtn(t); });
    }

    html += '</div>';

    if (st.scope === 'drill') {
      html += '<button class="report-scope-switch" type="button">This isn\'t about the question →</button>';
    }
    html += '</div>';

    _overlay.innerHTML = html;
    _wirePicker();
    _focusFirst();
  }

  function _typeBtn(t) {
    return '<button class="report-type-btn" type="button" role="listitem" data-type="' + _esc(t.id) + '">' +
             '<span class="report-type-emoji" aria-hidden="true">' + _esc(t.icon || '•') + '</span>' +
             '<span class="report-type-label">' + _esc(t.label) + '</span>' +
           '</button>';
  }

  function _wirePicker() {
    _overlay.querySelector('.report-modal-close').addEventListener('click', function () { if (!st.submitting) close(); });
    var sw = _overlay.querySelector('.report-scope-switch');
    if (sw) sw.addEventListener('click', function () { st.scope = 'all'; _sound('tabSwitch'); _renderPicker(); });
    var btns = _overlay.querySelectorAll('.report-type-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        st.type = this.getAttribute('data-type');
        _clearForm();   /* new type → drop any rating/sub-reason left from a previous form (ADR-097 B6) */
        _sound('tabSwitch');
        _renderForm();
      });
    }
  }

  /* Reset transient per-form state so it never leaks across a type switch (ADR-097 B6). */
  function _clearForm() { if (st) { st.subReason = null; st._rating = null; st._draft = null; } }

  /* ── Step 2: type-specific form ── */
  function _typeById(id) {
    var ts = _types();
    for (var i = 0; i < ts.length; i++) if (ts[i].id === id) return ts[i];
    return null;
  }

  function _renderForm() {
    var t = _typeById(st.type);
    if (!t) { _renderPicker(); return; }
    var lim = _limits();
    var fields = t.fields || [];
    var subs = (t.subReasons || []);

    var html = '' +
      '<div class="modal-content report-modal">' +
        '<button class="report-modal-close" type="button" aria-label="Close">' + _ico('close', '✕') + '</button>' +
        /* ai_explain has no picker to go back to — the Back button closes instead. */
        '<button class="report-back-btn" type="button">' + _ico('back', '‹') + (st.source === 'ai_explain' ? ' Close' : ' Back') + '</button>' +
        '<h3 class="modal-title report-modal-title">' +
          '<span class="report-type-emoji" aria-hidden="true">' + _esc(t.icon || '•') + '</span> ' + _esc(t.label) +
        '</h3>';

    if (st.source === 'ai_explain') {
      html += '<p class="report-modal-sub report-q-scope">' + _ico('robot', '🤖') +
              ' Reporting this QuanAI explanation — the question, your answer, the explanation text and the QuanAI version are attached automatically.</p>';
    } else if (st.source === 'drill' && st.question) {
      html += '<p class="report-modal-sub report-q-scope">' + _ico('target', '🎯') +
              ' Reporting the current question — its full details are attached automatically.</p>';
    }

    /* sub-reason chips (optional refinement) */
    if (subs.length) {
      html += '<div class="report-field"><label class="modal-label">Which best describes it?</label>' +
              '<div class="report-subreason-chips" role="radiogroup" aria-label="Reason">';
      subs.forEach(function (s) {
        html += '<button class="report-chip" type="button" role="radio" aria-checked="false" data-sub="' + _esc(s.id) + '">' + _esc(s.label) + '</button>';
      });
      html += '</div></div>';
    }

    /* free-text / rating fields */
    fields.forEach(function (fname) {
      var def = FIELD_DEFS[fname];
      if (!def) return;
      if (def.input === 'rating') {
        html += '<div class="report-field"><label class="modal-label">' + _esc(def.label) + '</label>' +
                '<div class="report-rating" role="radiogroup" aria-label="Rating">';
        for (var r = 1; r <= 5; r++) html += '<button class="report-star" type="button" role="radio" aria-checked="false" data-rating="' + r + '" aria-label="' + r + ' star">★</button>';
        html += '</div></div>';
      } else {
        var cap = def.cap ? (lim[def.cap] || 600) : 600;
        html += '<div class="report-field">' +
                '<label class="modal-label" for="rf_' + fname + '">' + _esc(def.label) + '</label>' +
                (def.input === 'textarea'
                  ? '<textarea class="modal-input report-textarea" id="rf_' + fname + '" maxlength="' + cap + '"></textarea>'
                  : '<input class="modal-input" type="text" id="rf_' + fname + '" maxlength="' + cap + '" />') +
                '<div class="report-char-count" data-for="rf_' + fname + '">0 / ' + cap + '</div>' +
                '</div>';
      }
    });

    /* collapsible auto-attached technical details (transparency; reassures no screenshot needed) */
    html += '<details class="report-tech">' +
              '<summary>' + _ico('info', 'ℹ️') + ' Technical details (attached automatically)</summary>' +
              '<pre class="report-tech-pre" id="reportTechPre">Loading…</pre>' +
            '</details>';

    html += '<div class="modal-actions report-actions">' +
              '<button class="btn-secondary report-cancel" type="button">Cancel</button>' +
              '<button class="btn-primary report-submit" type="button">' + _ico('send', '📤') + ' Send report</button>' +
            '</div>';
    html += '</div>';

    _overlay.innerHTML = html;
    _wireForm(t);
    _focusFirst();
  }

  function _wireForm(t) {
    _overlay.querySelector('.report-modal-close').addEventListener('click', function () { if (!st.submitting) close(); });
    _overlay.querySelector('.report-back-btn').addEventListener('click', function () { if (st.submitting) return; if (st.source === 'ai_explain') { close(); } else { _clearForm(); _renderPicker(); } });
    _overlay.querySelector('.report-cancel').addEventListener('click', function () { if (!st.submitting) close(); });

    /* sub-reason chips */
    var chips = _overlay.querySelectorAll('.report-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        var was = this.getAttribute('aria-checked') === 'true';
        for (var k = 0; k < chips.length; k++) { chips[k].classList.remove('selected'); chips[k].setAttribute('aria-checked', 'false'); }
        if (!was) { this.classList.add('selected'); this.setAttribute('aria-checked', 'true'); st.subReason = this.getAttribute('data-sub'); }
        else { st.subReason = null; }
      });
    }

    /* rating stars */
    var stars = _overlay.querySelectorAll('.report-star');
    for (var s = 0; s < stars.length; s++) {
      stars[s].addEventListener('click', function () {
        var val = parseInt(this.getAttribute('data-rating'), 10);
        st._rating = val;
        for (var k = 0; k < stars.length; k++) {
          var on = parseInt(stars[k].getAttribute('data-rating'), 10) <= val;
          stars[k].classList.toggle('on', on);
          stars[k].setAttribute('aria-checked', on ? 'true' : 'false');
        }
      });
    }

    /* Restore in-progress input after a re-render (e.g. a terminal submit failure) so nothing the user typed/
       selected is lost (ADR-098). st.subReason / st._rating are the source of truth; st._draft holds typed text. */
    if (st.subReason) {
      var selChip = _overlay.querySelector('.report-chip[data-sub="' + st.subReason + '"]');
      if (selChip) { selChip.classList.add('selected'); selChip.setAttribute('aria-checked', 'true'); }
    }
    if (st._rating) {
      for (var rs = 0; rs < stars.length; rs++) {
        var on2 = parseInt(stars[rs].getAttribute('data-rating'), 10) <= st._rating;
        stars[rs].classList.toggle('on', on2); stars[rs].setAttribute('aria-checked', on2 ? 'true' : 'false');
      }
    }
    if (st._draft) {
      Object.keys(st._draft).forEach(function (fn) { var el = _overlay.querySelector('#rf_' + fn); if (el) el.value = st._draft[fn]; });
      st._draft = null;   /* consumed */
    }

    /* char counters */
    var counted = _overlay.querySelectorAll('[data-for]');
    for (var c = 0; c < counted.length; c++) {
      (function (counter) {
        var field = _overlay.querySelector('#' + counter.getAttribute('data-for'));
        if (!field) return;
        var cap = field.getAttribute('maxlength');
        var upd = function () { counter.textContent = field.value.length + ' / ' + cap; };
        field.addEventListener('input', upd); upd();
      })(counted[c]);
    }

    _overlay.querySelector('.report-submit').addEventListener('click', _submit);

    /* lazily fill the technical-details preview (kept cheap; only computed once the form is shown) */
    try {
      var pre = _overlay.querySelector('#reportTechPre');
      if (pre) pre.textContent = _techPreview();
    } catch (_) {}
  }

  /* Human-readable preview of the auto-context (a curated subset — the full context is sent to the server). */
  function _techPreview() {
    var ctx = _collectContext();
    var lines = [];
    var app = ctx.app || {}, dev = ctx.device || {}, loc = ctx.locale || {};
    lines.push('App version: ' + (app.version || 'unknown'));
    lines.push('Source: ' + (app.source || '') + (app.targetExam ? ' · exam: ' + app.targetExam : ''));
    lines.push('Theme: ' + (app.theme || '-') + ' / ' + (app.appearance || '-'));
    lines.push('Device: ' + (dev.formFactor || '?') + ' · ' + (dev.viewport ? dev.viewport.w + '×' + dev.viewport.h : '') + ' @' + (dev.dpr || 1) + 'x');
    lines.push('Online: ' + (dev.online === false ? 'no' : 'yes') + (dev.connection ? ' (' + dev.connection + ')' : ''));
    lines.push('Locale: ' + (loc.language || '-') + ' · ' + (loc.tz || '-'));
    lines.push('Route: ' + (ctx.route || '-'));
    if ((st.source === 'drill' || st.source === 'ai_explain') && st.question) {
      lines.push('Question: ' + (st.question.category || '?') + (st.question.subtype ? '/' + st.question.subtype : ''));
      if (st.question.question) lines.push('  “' + String(st.question.question).slice(0, 120) + '”');
    }
    if (st.source === 'ai_explain' && st.ai) {
      lines.push('QuanAI explanation version: ' + (st.ai.promptId || 'unknown'));
      if (st.ai.explanation) lines.push('Explanation: “' + String(st.ai.explanation).slice(0, 160) + (st.ai.explanation.length > 160 ? '…' : '') + '”');
    }
    if (ctx.recentErrors && ctx.recentErrors.length) lines.push('Recent errors: ' + ctx.recentErrors.length + ' captured');
    return lines.join('\n');
  }

  function _collectContext() {
    if (typeof root.ReportContext === 'undefined') return { app: { source: st.source } };
    return root.ReportContext.collect(st.source);
  }

  /* ── Submit ── */
  function _readFields(t) {
    var out = { title: null, description: null, fields: {} };
    (t.fields || []).forEach(function (fname) {
      var def = FIELD_DEFS[fname];
      if (!def) return;
      if (def.input === 'rating') {
        if (st._rating) out.fields.rating = st._rating;
        return;
      }
      var el = _overlay.querySelector('#rf_' + fname);
      if (!el) return;
      var val = (el.value || '').trim();
      if (!val) return;
      if (def.key === 'title') out.title = val;
      else if (def.key === 'description') out.description = val;
      else out.fields[def.key] = val;
    });
    return out;
  }

  function _submit() {
    if (st.submitting) return;
    var t = _typeById(st.type);
    if (!t) return;
    var vals = _readFields(t);

    /* app/account/other reports need SOME substance — free text OR a rating (a star-only feedback submit is
       valid). Question-family AND ai_explain reports are meaningful from the type + attached context alone. */
    if (t.group !== 'question' && st.source !== 'ai_explain' && !vals.title && !vals.description && vals.fields.rating == null) {
      _toast('Please add a short description (or a rating).');
      var firstField = _overlay.querySelector('.modal-input');
      if (firstField) firstField.focus();
      return;
    }

    /* Stash typed text so a terminal-error re-render (below) can restore it — nothing the user wrote is lost. */
    st._draft = {};
    (t.fields || []).forEach(function (fname) { var el = _overlay.querySelector('#rf_' + fname); if (el && FIELD_DEFS[fname] && FIELD_DEFS[fname].input !== 'rating') st._draft[fname] = el.value; });

    st.submitting = true;
    _renderSubmitting();

    var payload = {
      type: st.type,
      subReason: st.subReason || null,
      title: vals.title,
      description: vals.description,
      fields: vals.fields,
      source: st.source,
      context: _collectContext(),
      question: ((st.source === 'drill' || st.source === 'ai_explain') && st.question && root.ReportContext)
        ? root.ReportContext.snapshotQuestion(st.question, st.session || {})
        : null,
      /* Whitelist the AI bundle to product-safe fields (QuanAI identity, ADR-098) — never let a provider/model
         identifier into the POST body or the offline queue, regardless of what the caller supplied. */
      ai: (st.source === 'ai_explain' && st.ai) ? { explanation: st.ai.explanation || '', promptId: st.ai.promptId || null } : null
    };

    var submitP = (root.ReportQueue && root.ReportQueue.submit)
      ? root.ReportQueue.submit(payload)
      : Promise.resolve({ ok: false, code: 'NO_QUEUE', message: 'Reporting is unavailable right now.' });

    submitP.then(function (res) {
      if (res && res.ok) {
        _sound('achievement');
        _renderSuccess(res.queued ? null : (res.shortId || null), !!res.queued);
      } else {
        st.submitting = false;
        _toast((res && res.message) || 'Could not send your report. Please try again.');
        _renderForm();
      }
    }).catch(function () {
      st.submitting = false;
      _toast('Could not send your report. Please try again.');
      _renderForm();
    });
  }

  function _renderSubmitting() {
    _overlay.innerHTML =
      '<div class="modal-content report-modal report-state-center">' +
        '<div class="report-spinner" aria-hidden="true"></div>' +
        '<p class="report-state-msg" aria-live="polite">Sending your report…</p>' +
      '</div>';
  }

  function _renderSuccess(shortId, queued) {
    st.submitting = false;
    var idLine = shortId
      ? '<p class="report-success-id">Reference: <strong>' + _esc(shortId) + '</strong></p>'
      : '';
    var msg = queued
      ? 'You\'re offline — your report is saved and will send automatically when you\'re back online.'
      : 'Thanks! Your report is in — our team can see it right away.';
    _overlay.innerHTML =
      '<div class="modal-content report-modal report-state-center">' +
        '<div class="report-success-check" aria-hidden="true">' + _ico('check', '✅') + '</div>' +
        '<h3 class="report-success-title">Report ' + (queued ? 'saved' : 'sent') + '</h3>' +
        '<p class="report-success-msg" aria-live="polite">' + _esc(msg) + '</p>' +
        idLine +
        '<div class="modal-actions"><button class="btn-primary report-done" type="button">' +
          (st.source === 'drill' ? 'Continue practice' : 'Done') + '</button></div>' +
      '</div>';
    var done = _overlay.querySelector('.report-done');
    done.addEventListener('click', close);
    setTimeout(function () { try { done.focus(); } catch (_) {} }, 40);
  }

  var ReportModal = { open: open, close: close, isOpen: function () { return _open; } };

  if (typeof module !== 'undefined' && module.exports) module.exports = ReportModal;
  if (typeof window !== 'undefined') window.ReportModal = ReportModal;
  else if (root) root.ReportModal = ReportModal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
