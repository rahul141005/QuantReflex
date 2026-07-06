/**
 * report-modal.js — ReportModal (ADR-096 · premium redesign ADR-099).
 *
 * The "Report a problem" experience, rebuilt as a companion-style BOTTOM SHEET (a sibling of the QuanAI
 * explanation sheet): same shell, tokens, motion, grabber + drag-to-dismiss, responsive→centred ≥600px,
 * dark / reduced-motion / safe-area aware. Every entry point shares this shell but is purpose-scoped:
 *
 *   • Settings  → ReportModal.open({ source:'settings' })
 *        Guided first step: a short list of rich category rows (icon + title + one-line helper) →
 *        the scoped reason grid for that category → an optional detail step.
 *   • In-drill  → ReportModal.open({ source:'drill', question, session })
 *        Opens straight to a contextual question header (which item, auto-collected) + the question
 *        reason grid; a quiet "Not about this question →" escapes to the full chooser.
 *   • AI        → ReportModal.open({ source:'ai_explain', question, session, ai:{explanation, promptId} })
 *        A purpose-built QuanAI reason grid (wrong answer / flawed reasoning / made something up / …) →
 *        an optional note. The question, the explanation text and the QuanAI version are attached
 *        automatically. NO provider/model is ever captured or shown (QuanAI identity, ADR-098).
 *
 * Reports never lose: ReportQueue submits, and queues offline to flush later, so "Send" always succeeds from
 * the user's point of view. Auto-collected diagnostics (ReportContext) mean the user types as little as
 * possible. NO file input / NO screenshot UI (ADR-096). Global: window.ReportModal.
 */
(function (root) {
  'use strict';

  var _open = false;        /* reentrancy guard — only one report sheet at a time */
  var _overlay = null, _sheet = null, _body = null, _titleEl = null, _backEl = null;
  var _lastFocus = null;
  var _keyHandler = null;
  var st = null;            /* working state for the current session */

  /* Never render an empty grid: if the taxonomy failed to load, fall back to a built-in core set + warn
     (ADR-099 — the P0 that made the grid look like a bare scaffold must never recur silently). */
  var _FALLBACK_TYPES = [
    { id: 'answer_wrong',      label: 'Wrong answer',      icon: '✅', group: 'question', inDrill: true,  helper: 'The marked answer looks incorrect', fields: ['note'] },
    { id: 'explanation_wrong', label: 'Wrong explanation', icon: '🧠', group: 'question', inDrill: true,  helper: 'The explanation is wrong',           fields: ['note'] },
    { id: 'options_wrong',     label: 'Bad options',       icon: '🔢', group: 'question', inDrill: true,  helper: 'Options are wrong or missing',       fields: ['note'] },
    { id: 'question_other',    label: 'Something else',    icon: '💬', group: 'question', inDrill: true,  helper: 'Another issue with this question',   fields: ['note'] },
    { id: 'ai_issue',          label: 'A QuanAI explanation', icon: '🤖', group: 'ai', inDrill: false,     helper: "Something's off with an explanation", fields: ['note'],
      subReasons: [ { id: 'wrong_answer', label: 'Wrong final answer' }, { id: 'flawed_reasoning', label: 'Flawed reasoning' }, { id: 'hallucination', label: 'Made something up' }, { id: 'other', label: 'Something else' } ] },
    { id: 'bug',               label: "Something's broken", icon: '🐞', group: 'app', inDrill: false, helper: "A feature isn't working", fields: ['title', 'description', 'repro'] },
    { id: 'crash',             label: 'Crash or freeze',    icon: '💥', group: 'app', inDrill: false, helper: 'The app froze or closed', fields: ['title', 'description', 'repro'] },
    { id: 'payment',           label: 'Payment or billing', icon: '💳', group: 'account', inDrill: false, helper: 'A payment or premium issue', fields: ['description'] },
    { id: 'account',           label: 'Account or sign-in', icon: '🔒', group: 'account', inDrill: false, helper: 'Sign-in or your data', fields: ['description'] },
    { id: 'feedback',          label: 'General feedback',   icon: '📝', group: 'other', inDrill: false, helper: "Tell us how it's going", fields: ['description', 'rating'] },
    { id: 'other',             label: 'Something else',     icon: '📦', group: 'other', inDrill: false, helper: 'Anything not listed', fields: ['title', 'description'] }
  ];
  var _FALLBACK_GROUPS = [
    { id: 'question', label: 'A question or its answer', icon: '📝', helper: 'A wrong answer, option or typo' },
    { id: 'ai',       label: 'A QuanAI explanation',     icon: '🤖', helper: 'An explanation issue' },
    { id: 'app',      label: "The app isn't working",    icon: '🐞', helper: 'A bug or crash' },
    { id: 'account',  label: 'Account or payment',       icon: '💳', helper: 'Sign-in, syncing or premium' },
    { id: 'other',    label: 'An idea or feedback',      icon: '💡', helper: 'A suggestion or feedback' }
  ];
  var _warned = false;
  function _RT() { return root.ReportTypes || null; }
  function _types() {
    var rt = _RT();
    var t = (rt && rt.TYPES) ? rt.TYPES : [];
    if (!t.length) { if (!_warned) { _warned = true; try { console.warn('[report-modal] ReportTypes taxonomy missing — using built-in fallback so the grid is never empty.'); } catch (_) {} } return _FALLBACK_TYPES; }
    return t;
  }
  function _groups() {
    var rt = _RT();
    var g = (rt && rt.GROUPS) ? rt.GROUPS : [];
    return g.length ? g : _FALLBACK_GROUPS;
  }
  function _typesForGroup(gid) { return _types().filter(function (t) { return t.group === gid; }); }
  function _limits() { return (_RT() && _RT().FIELD_LIMITS) ? _RT().FIELD_LIMITS : { title: 140, description: 4000, note: 600 }; }

  function _esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML;
  }
  function _ico(name, emoji) { return (typeof qrIco === 'function') ? qrIco(name, emoji) : '<span class="qr-ico" data-ico="' + name + '" aria-hidden="true">' + emoji + '</span>'; }
  function _sound(name) { try { if (typeof SoundEngine !== 'undefined' && SoundEngine.play) SoundEngine.play(name); } catch (_) {} }
  function _toast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (_) {} }
  function _titro(x) { x = String(x == null ? '' : x).replace(/[_-]+/g, ' ').trim(); return x ? x.charAt(0).toUpperCase() + x.slice(1) : ''; }

  /* Per-field render metadata. `key` says where the value lands in the payload: 'title'/'description' are
     top-level; anything else goes into classification.fields. 'note' collapses into description. */
  var FIELD_DEFS = {
    title:       { key: 'title',       label: 'Give it a short title', input: 'text',     placeholder: 'A one-line summary', cap: 'title' },
    description: { key: 'description', label: 'What happened?', input: 'textarea', placeholder: 'Tell us what went wrong — the more detail, the faster we can fix it.', cap: 'description' },
    note:        { key: 'description', label: 'Add anything else (optional)', input: 'textarea', placeholder: "Anything you noticed. The question's details are attached automatically, so this is optional.", cap: 'note' },
    expected:    { key: 'expected',    label: 'What did you expect?', input: 'textarea', placeholder: 'What should have happened?', cap: 'expected' },
    actual:      { key: 'actual',      label: 'What happened instead?', input: 'textarea', placeholder: 'What did you see?', cap: 'actual' },
    repro:       { key: 'repro',       label: 'How can we reproduce it? (optional)', input: 'textarea', placeholder: 'Steps to make it happen again.', cap: 'repro' },
    benefit:     { key: 'benefit',     label: 'How would this help you? (optional)', input: 'textarea', placeholder: 'Tell us why it matters.', cap: 'benefit' },
    rating:      { key: 'rating',      label: 'How are we doing?', input: 'rating' }
  };

  /* ─────────────────────────────── open / close ─────────────────────────────── */
  function open(opts) {
    if (_open) return;
    opts = opts || {};
    _open = true;
    var src = (opts.source === 'drill' || opts.source === 'ai_explain') ? opts.source : 'settings';
    st = {
      source: src,
      question: opts.question || null,
      session: opts.session || null,
      ai: opts.ai || null,
      onClose: (typeof opts.onClose === 'function') ? opts.onClose : null,  /* caller cleanup (e.g. resume a paused drill) */
      group: null,
      type: null,
      subReason: null,
      step: null,
      _escaped: false,     /* in-drill user tapped "Not about this question →" */
      _rating: null,
      _draft: null,
      submitting: false
    };

    _lastFocus = document.activeElement;
    _overlay = document.createElement('div');
    _overlay.className = 'report-sheet-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Report a problem');
    _overlay.innerHTML =
      '<div class="report-sheet" role="document">' +
        '<div class="report-sheet-grabber" aria-hidden="true"></div>' +
        '<div class="report-sheet-head">' +
          '<button class="report-sheet-back" type="button" aria-label="Back" style="display:none">' + _ico('back', '‹') + '</button>' +
          '<span class="report-sheet-title"></span>' +
          '<button class="report-sheet-close" type="button" aria-label="Close">' + _ico('close', '✕') + '</button>' +
        '</div>' +
        '<div class="report-sheet-body"></div>' +
      '</div>';
    document.body.appendChild(_overlay);
    document.body.classList.add('modal-open');

    _sheet = _overlay.querySelector('.report-sheet');
    _body = _overlay.querySelector('.report-sheet-body');
    _titleEl = _overlay.querySelector('.report-sheet-title');
    _backEl = _overlay.querySelector('.report-sheet-back');

    _overlay.querySelector('.report-sheet-close').addEventListener('click', function () { if (!st.submitting) close(); });
    _backEl.addEventListener('click', _back);
    /* Backdrop tap dismisses — but NOT when the form has typed content (guard against an accidental mis-tap
       discarding a written report; the explicit ✕ / Cancel / Escape still close — ADR-099 verification). */
    _overlay.addEventListener('click', function (e) { if (e.target === _overlay && !st.submitting && !_isFormDirty()) close(); });
    _keyHandler = function (e) {
      if (e.key === 'Escape' && !st.submitting) { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') _trapTab(e);
    };
    document.addEventListener('keydown', _keyHandler, true);
    _wireDrag();

    /* Route to the first step for this entry point. */
    if (st.source === 'ai_explain') { st.group = 'ai'; _renderReasons(); }
    else if (st.source === 'drill') { st.group = 'question'; _renderReasons(); }
    else { _renderChooser(); }

    _sound('settingsToggle');
  }

  function close() {
    if (!_overlay) { _open = false; return; }
    var onClose = st && st.onClose;
    document.removeEventListener('keydown', _keyHandler, true);
    if (_overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    document.body.classList.remove('modal-open');
    _overlay = _sheet = _body = _titleEl = _backEl = null;
    _keyHandler = null; _open = false; st = null;
    try { if (_lastFocus && _lastFocus.focus) _lastFocus.focus(); } catch (_) {}
    _lastFocus = null;
    /* Run caller cleanup LAST (after teardown) so e.g. resuming a paused drill can't re-enter an inconsistent
       modal state. Guarded so a throwing callback never leaves the sheet half-open. */
    if (onClose) { try { onClose(); } catch (_) {} }
  }

  /* "Dirty" = the user typed free text or set a rating in the current form step — the real data-loss surface.
     A one-tap reason/sub-reason selection is trivially redone, so it doesn't count. Guards accidental
     backdrop-tap / over-drag dismissals. */
  function _isFormDirty() {
    if (!st || st.step !== 'form' || !_body) return false;
    if (st._rating) return true;
    var inputs = _body.querySelectorAll('.modal-input, .report-textarea');
    for (var i = 0; i < inputs.length; i++) { if ((inputs[i].value || '').trim()) return true; }
    return false;
  }

  /* Drag-down-to-dismiss on the grabber/head — mirrors the companion sheet (ADR-049). */
  function _wireDrag() {
    var handle = _overlay.querySelector('.report-sheet-grabber');
    var head = _overlay.querySelector('.report-sheet-head');
    var startY = 0, dy = 0, dragging = false;
    function onStart(e) { if (st.submitting) return; dragging = true; dy = 0; startY = (e.touches ? e.touches[0].clientY : e.clientY); _sheet.style.transition = 'none'; }
    function onMove(e) {
      if (!dragging) return;
      dy = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
      if (dy < 0) dy = 0;
      _sheet.style.transform = 'translateY(' + dy + 'px)';
    }
    function onEnd() {
      if (!dragging) return; dragging = false;
      _sheet.style.transition = 'transform .2s cubic-bezier(.2,.7,.3,1)';
      if (dy > 90 && !_isFormDirty()) { _sheet.style.transform = 'translateY(100%)'; setTimeout(close, 170); }
      else { _sheet.style.transform = 'translateY(0)'; }   /* snap back (also when the form has unsaved input) */
    }
    [handle, head].forEach(function (el) {
      if (!el) return;
      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchmove', onMove, { passive: true });
      el.addEventListener('touchend', onEnd);
    });
  }

  /* ─────────────────────────────── focus management ─────────────────────────────── */
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
  function _focusBody() {
    var f = _body ? _body.querySelector('button, input, textarea, [tabindex]:not([tabindex="-1"])') : null;
    if (f) setTimeout(function () { try { f.focus(); } catch (_) {} }, 40);
  }

  /* head title + back-button visibility */
  function _setHead(title, hasBack) {
    if (_titleEl) _titleEl.textContent = title || 'Report a problem';
    if (_backEl) _backEl.style.display = hasBack ? '' : 'none';
  }

  /* Back button behaviour depends on where we are + how we got here. */
  function _back() {
    if (!st || st.submitting) return;
    _sound('tabSwitch');
    if (st.step === 'form') {
      st.type = null; _clearForm();
      _renderReasons();
      return;
    }
    if (st.step === 'reasons') {
      if (st.source === 'settings' || st._escaped) { st.group = null; _renderChooser(); return; }
      close(); return;   /* in-drill / AI first step → nothing behind */
    }
    if (st.step === 'chooser') {
      if (st._escaped) { st._escaped = false; st.group = 'question'; _renderReasons(); return; }  /* back to the drill question */
      close(); return;
    }
    close();
  }

  function _clearForm() { if (st) { st.subReason = null; st._rating = null; st._draft = null; } }

  /* ─────────────────────────────── Step: guided chooser (Settings) ─────────────────────────────── */
  function _renderChooser() {
    st.step = 'chooser';
    _setHead('Report a problem', st._escaped);
    var rows = _groups().map(_groupRow).join('');
    _body.innerHTML =
      '<p class="report-lead">What would you like to tell us about? Pick the closest — we\'ll take it from there.</p>' +
      '<div class="report-reason-list">' + rows + '</div>';
    var btns = _body.querySelectorAll('[data-group]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        st.group = this.getAttribute('data-group');
        _clearForm(); st.type = null;
        _sound('tabSwitch');
        _renderReasons();
      });
    }
    _focusBody();
  }

  function _groupRow(g) {
    return '<button class="report-reason" type="button" data-group="' + _esc(g.id) + '">' +
             '<span class="report-reason-ico" aria-hidden="true">' + _esc(g.icon || '•') + '</span>' +
             '<span class="report-reason-txt">' +
               '<span class="report-reason-label">' + _esc(g.label) + '</span>' +
               (g.helper ? '<span class="report-reason-help">' + _esc(g.helper) + '</span>' : '') +
             '</span>' +
             '<span class="report-reason-chev" aria-hidden="true">›</span>' +
           '</button>';
  }

  /* ─────────────────────────────── Step: reason grid ─────────────────────────────── */
  function _renderReasons() {
    st.step = 'reasons';
    var g = st.group;
    var hasBack = (st.source === 'settings') || st._escaped;
    var html = '';

    if (st.source === 'ai_explain' || g === 'ai') {
      /* Purpose-built QuanAI reason grid (the ai_issue sub-reasons act as the primary reasons). */
      _setHead('The QuanAI explanation', hasBack);
      if (st.source === 'ai_explain') html += _aiAttachedHtml();
      else html += '<p class="report-lead">What\'s off about QuanAI\'s explanations?</p>';
      var subs = _aiReasons();
      html += '<div class="report-reason-list">';
      subs.forEach(function (s) { html += _reasonTile({ id: s.id, label: s.label, icon: s.icon || '•', helper: s.helper || '' }, 'sub'); });
      html += '</div>';
      _body.innerHTML = html;
      _wireReasonTiles('sub');
      _focusBody();
      return;
    }

    if (g === 'question') {
      var title = st.source === 'drill' ? 'What\'s off?' : 'A question or its answer';
      _setHead(title, hasBack);
      if (st.source === 'drill') html += _qContextHtml();
      else html += '<p class="report-lead">Pick what\'s wrong — you\'ll tell us which question on the next step.</p>';
      var qTypes = _typesForGroup('question');
      html += '<div class="report-reason-list">';
      qTypes.forEach(function (t) { html += _reasonTile(t, 'type'); });
      html += '</div>';
      if (st.source === 'drill') {
        html += '<button class="report-escape" type="button">' + _ico('back', '↔') + ' Not about this question</button>';
      }
      _body.innerHTML = html;
      _wireReasonTiles('type');
      var esc = _body.querySelector('.report-escape');
      if (esc) esc.addEventListener('click', function () { st._escaped = true; st.group = null; _clearForm(); st.type = null; _sound('tabSwitch'); _renderChooser(); });
      _focusBody();
      return;
    }

    /* app / account / other */
    var grpLabel = (_RT() && _RT().GROUP_LABELS && _RT().GROUP_LABELS[g]) || _titro(g);
    _setHead(grpLabel, hasBack);
    html += '<p class="report-lead">Pick the closest — we can always sort out the details.</p>';
    var types = _typesForGroup(g);
    html += '<div class="report-reason-list">';
    types.forEach(function (t) { html += _reasonTile(t, 'type'); });
    html += '</div>';
    _body.innerHTML = html;
    _wireReasonTiles('type');
    _focusBody();
  }

  function _reasonTile(t, kind) {
    var attr = kind === 'sub' ? 'data-sub' : 'data-type';
    return '<button class="report-reason" type="button" ' + attr + '="' + _esc(t.id) + '">' +
             '<span class="report-reason-ico" aria-hidden="true">' + _esc(t.icon || '•') + '</span>' +
             '<span class="report-reason-txt">' +
               '<span class="report-reason-label">' + _esc(t.label) + '</span>' +
               (t.helper ? '<span class="report-reason-help">' + _esc(t.helper) + '</span>' : '') +
             '</span>' +
             '<span class="report-reason-chev" aria-hidden="true">›</span>' +
           '</button>';
  }

  function _wireReasonTiles(kind) {
    var sel = kind === 'sub' ? '[data-sub]' : '[data-type]';
    var btns = _body.querySelectorAll(sel);
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        if (kind === 'sub') { st.type = 'ai_issue'; st.subReason = this.getAttribute('data-sub'); }
        else { st.type = this.getAttribute('data-type'); if (st.source !== 'ai_explain') st.subReason = null; st._rating = null; st._draft = null; }
        _sound('tabSwitch');
        _renderForm();
      });
    }
  }

  /* The QuanAI reason set (each an ai_issue sub-reason), given a little icon + helper for the grid. */
  function _aiReasons() {
    var meta = {
      wrong_answer:     { icon: '🎯', helper: "The explanation's final answer is wrong" },
      flawed_reasoning: { icon: '🧠', helper: "A step or the logic doesn't hold up" },
      hallucination:    { icon: '🌫️', helper: 'It stated something untrue or invented' },
      incomplete:       { icon: '➗', helper: 'It skipped steps or stopped early' },
      confusing:        { icon: '❓', helper: 'The wording is hard to follow' },
      formatting:       { icon: '📐', helper: 'Maths or layout renders badly' },
      other:            { icon: '💬', helper: 'Something else about it' }
    };
    var t = _RT() && _RT().typeById ? _RT().typeById('ai_issue') : null;
    var subs = (t && t.subReasons) ? t.subReasons : (_FALLBACK_TYPES.filter(function (x) { return x.id === 'ai_issue'; })[0].subReasons || []);
    return subs.map(function (s) { var m = meta[s.id] || {}; return { id: s.id, label: s.label, icon: m.icon || '•', helper: m.helper || '' }; });
  }

  /* ─────────────────────────────── Step: detail form ─────────────────────────────── */
  function _typeById(id) {
    var ts = _types();
    for (var i = 0; i < ts.length; i++) if (ts[i].id === id) return ts[i];
    return null;
  }

  function _renderForm() {
    st.step = 'form';
    var t = _typeById(st.type);
    if (!t) { _renderReasons(); return; }
    var lim = _limits();
    var fields = t.fields || [];
    var isSettingsQuestion = (st.group === 'question' && st.source === 'settings');
    _setHead(t.label, true);

    var html = '';

    /* Context banner (reassure the user which item this is about + that nothing is lost). */
    if (st.source === 'ai_explain') {
      html += _aiAttachedHtml();
    } else if (st.source === 'drill' && st.group === 'question') {
      html += _qContextHtml();
    } else if (isSettingsQuestion) {
      html += '<p class="report-note-hint">' + _ico('info', 'ℹ️') + ' We can\'t see which question you mean from here — please tell us below.</p>';
    }

    /* sub-reason chips (visual / payment / account). AI + settings-AI already chose their reason in the grid. */
    var subs = (t.subReasons || []);
    var showChips = subs.length && st.group !== 'ai';
    if (showChips) {
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
        var label = def.label, ph = def.placeholder;
        /* A Settings-filed question report has no attached question, so its note is required + reframed. */
        if (fname === 'note' && isSettingsQuestion) { label = 'Which question, and what\'s off?'; ph = 'Describe the question and what looked wrong.'; }
        /* A Settings-filed AI report has no explanation attached, so its note is required + reframed. */
        else if (fname === 'note' && st.group === 'ai' && st.source === 'settings') { label = "What's wrong with the explanations?"; ph = 'Tell us what you\'ve noticed about QuanAI\'s explanations.'; }
        var cap = def.cap ? (lim[def.cap] || 600) : 600;
        html += '<div class="report-field">' +
                '<label class="modal-label" for="rf_' + fname + '">' + _esc(label) + '</label>' +
                (def.input === 'textarea'
                  ? '<textarea class="modal-input report-textarea" id="rf_' + fname + '" maxlength="' + cap + '" placeholder="' + _esc(ph || '') + '"></textarea>'
                  : '<input class="modal-input" type="text" id="rf_' + fname + '" maxlength="' + cap + '" placeholder="' + _esc(ph || '') + '" />') +
                '<div class="report-char-count" data-for="rf_' + fname + '">0 / ' + cap + '</div>' +
                '</div>';
      }
    });

    /* collapsible auto-attached technical details (transparency; reassures no screenshot needed) */
    html += '<details class="report-tech">' +
              '<summary>' + _ico('info', 'ℹ️') + ' What we attach automatically</summary>' +
              '<pre class="report-tech-pre" id="reportTechPre">Loading…</pre>' +
            '</details>';

    html += '<div class="report-actions">' +
              '<button class="btn-primary report-submit" type="button">' + _ico('send', '📤') + ' Send report</button>' +
              '<p class="report-reassure">' + _reassureLine() + '</p>' +
            '</div>';

    _body.innerHTML = html;
    _wireForm(t);
    _focusBody();
  }

  function _reassureLine() {
    if (st.source === 'drill') return 'Your session is safe — sending this won\'t end your drill.';
    if (st.source === 'ai_explain') return 'We\'ll take a look. This won\'t change what\'s on your screen.';
    return 'Thanks for helping us make QuantReflex better.';
  }

  /* Contextual question header — auto-built from the live question + session so the user trusts *which* item
     they're reporting (they type nothing). */
  function _qContextHtml() {
    var q = st.question || {}, s = st.session || {};
    var chips = [];
    if (s.questionNumber) chips.push('Question ' + s.questionNumber + (s.count ? ' of ' + s.count : ''));
    var topic = q.category || q.subtype;
    if (topic) chips.push(_titro(topic));
    if (q.difficulty) chips.push(_titro(q.difficulty));
    var ml = _modeLabel(s);
    if (ml) chips.push(ml);
    var chipHtml = chips.map(function (x) { return '<span class="report-ctx-chip">' + _esc(x) + '</span>'; }).join('');
    var qtext = q.question != null ? String(q.question) : '';
    var preview = qtext ? '<div class="report-ctx-q">“' + _esc(qtext.slice(0, 120)) + (qtext.length > 120 ? '…' : '') + '”</div>' : '';
    return '<div class="report-ctx">' +
             '<div class="report-ctx-top">' + _ico('target', '🎯') + '<span>This question — attached automatically</span></div>' +
             (chipHtml ? '<div class="report-ctx-chips">' + chipHtml + '</div>' : '') +
             preview +
           '</div>';
  }

  function _modeLabel(s) {
    if (!s) return null;
    if (s.isDuel) return 'Duel';
    if (s.reviewMode) return 'Review';
    if (s.mode) { var m = { practice: 'Practice', timed: 'Timed test', mock: 'Mock test', exam: 'Exam', warmup: 'Warm-up', quick: 'Quick drill', reflex: 'Reflex drill' }; return m[s.mode] || _titro(s.mode); }
    return null;
  }

  /* Read-only "what's attached" summary for an AI-explanation report (question + explanation + QuanAI version). */
  function _aiAttachedHtml() {
    var q = st.question || {}, ai = st.ai || {};
    var lines = [];
    var topic = q.category || q.subtype;
    if (topic) lines.push(_titro(topic));
    var ver = ai.promptId ? 'QuanAI ' + ai.promptId : null;
    if (ver) lines.push(ver);
    var meta = lines.length ? '<div class="report-ctx-chips">' + lines.map(function (x) { return '<span class="report-ctx-chip">' + _esc(x) + '</span>'; }).join('') + '</div>' : '';
    var exp = ai.explanation ? '<div class="report-ctx-q">“' + _esc(String(ai.explanation).slice(0, 130)) + (String(ai.explanation).length > 130 ? '…' : '') + '”</div>' : '';
    return '<div class="report-ctx">' +
             '<div class="report-ctx-top">' + _ico('robot', '🤖') + '<span>This QuanAI explanation — attached automatically</span></div>' +
             meta + exp +
           '</div>';
  }

  function _wireForm(t) {
    /* sub-reason chips */
    var chips = _body.querySelectorAll('.report-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        var was = this.getAttribute('aria-checked') === 'true';
        for (var k = 0; k < chips.length; k++) { chips[k].classList.remove('selected'); chips[k].setAttribute('aria-checked', 'false'); }
        if (!was) { this.classList.add('selected'); this.setAttribute('aria-checked', 'true'); st.subReason = this.getAttribute('data-sub'); }
        else { st.subReason = null; }
      });
    }

    /* rating stars */
    var stars = _body.querySelectorAll('.report-star');
    for (var s = 0; s < stars.length; s++) {
      stars[s].addEventListener('click', function () {
        var val = parseInt(this.getAttribute('data-rating'), 10);
        st._rating = val;
        for (var k = 0; k < stars.length; k++) {
          var rv = parseInt(stars[k].getAttribute('data-rating'), 10);
          stars[k].classList.toggle('on', rv <= val);                        // visual: fill up to the value
          stars[k].setAttribute('aria-checked', rv === val ? 'true' : 'false'); // ARIA: exactly ONE radio checked
        }
      });
    }

    /* Restore any in-progress input after a re-render (terminal submit failure) — nothing typed is lost. */
    if (st.subReason) {
      var selChip = _body.querySelector('.report-chip[data-sub="' + st.subReason + '"]');
      if (selChip) { selChip.classList.add('selected'); selChip.setAttribute('aria-checked', 'true'); }
    }
    if (st._rating) {
      for (var rs = 0; rs < stars.length; rs++) {
        var rvv = parseInt(stars[rs].getAttribute('data-rating'), 10);
        stars[rs].classList.toggle('on', rvv <= st._rating); stars[rs].setAttribute('aria-checked', rvv === st._rating ? 'true' : 'false');
      }
    }
    if (st._draft) {
      Object.keys(st._draft).forEach(function (fn) { var el = _body.querySelector('#rf_' + fn); if (el) el.value = st._draft[fn]; });
      st._draft = null;
    }

    /* char counters */
    var counted = _body.querySelectorAll('[data-for]');
    for (var c = 0; c < counted.length; c++) {
      (function (counter) {
        var field = _body.querySelector('#' + counter.getAttribute('data-for'));
        if (!field) return;
        var cap = field.getAttribute('maxlength');
        var upd = function () { counter.textContent = field.value.length + ' / ' + cap; };
        field.addEventListener('input', upd); upd();
      })(counted[c]);
    }

    _body.querySelector('.report-submit').addEventListener('click', _submit);

    try {
      var pre = _body.querySelector('#reportTechPre');
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

  /* ─────────────────────────────── Submit ─────────────────────────────── */
  function _readFields(t) {
    var out = { title: null, description: null, fields: {} };
    (t.fields || []).forEach(function (fname) {
      var def = FIELD_DEFS[fname];
      if (!def) return;
      if (def.input === 'rating') { if (st._rating) out.fields.rating = st._rating; return; }
      var el = _body.querySelector('#rf_' + fname);
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
    var isSettingsQuestion = (st.group === 'question' && st.source === 'settings');

    /* Substance guard (mirrors api/_lib/report-schema.js):
       • in-drill question + ai_explain → meaningful from the attached context alone.
       • a Settings-filed question → needs a note (no question is attached here).
       • everything else → needs free text OR a rating. */
    var needsText = false;
    if (isSettingsQuestion) needsText = !vals.title && !vals.description;
    else if (st.group !== 'question' && st.source !== 'ai_explain') needsText = !vals.title && !vals.description && vals.fields.rating == null;
    if (needsText) {
      /* Only mention a rating when the type actually offers one (feedback) — otherwise the copy is misleading. */
      var hasRating = (t.fields || []).indexOf('rating') !== -1;
      _toast(isSettingsQuestion ? 'Tell us which question and what looked off.'
        : (hasRating ? 'Please add a short description (or a rating).' : 'Please add a short description.'));
      var firstField = _body.querySelector('.modal-input');
      if (firstField) firstField.focus();
      return;
    }

    /* Stash typed text so a terminal-error re-render can restore it — nothing the user wrote is lost. */
    st._draft = {};
    (t.fields || []).forEach(function (fname) { var el = _body.querySelector('#rf_' + fname); if (el && FIELD_DEFS[fname] && FIELD_DEFS[fname].input !== 'rating') st._draft[fname] = el.value; });

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
      /* Attach the question snapshot ONLY when the report is actually about the question: an AI-explanation
         report, or an in-drill report still scoped to the question group. After "Not about this question →"
         the group is app/account/other, so we must NOT staple an irrelevant question to it (ADR-099 verify). */
      question: ((st.source === 'ai_explain' || (st.source === 'drill' && st.group === 'question')) && st.question && root.ReportContext)
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
    _setHead('Sending…', false);
    _body.innerHTML =
      '<div class="report-state-center">' +
        '<div class="report-spinner" aria-hidden="true"></div>' +
        '<p class="report-state-msg" aria-live="polite">Sending your report…</p>' +
      '</div>';
  }

  function _renderSuccess(shortId, queued) {
    st.submitting = false;
    _setHead(queued ? 'Saved' : 'Report sent', false);
    var idLine = shortId
      ? '<p class="report-success-id">Reference: <strong>' + _esc(shortId) + '</strong></p>'
      : '';
    var title = queued ? 'Saved — we\'ll send it' : 'Thanks — we\'ve got it';
    var msg = queued
      ? 'You\'re offline, so we\'ve saved your report. It\'ll send itself the moment you\'re back online — nothing is lost.'
      : 'Your report is with our team now. We read every one — thank you for helping us make QuantReflex better.';
    _body.innerHTML =
      '<div class="report-state-center">' +
        '<div class="report-success-check" aria-hidden="true">' + _ico('check', '✅') + '</div>' +
        '<h3 class="report-success-title">' + _esc(title) + '</h3>' +
        '<p class="report-success-msg" aria-live="polite">' + _esc(msg) + '</p>' +
        idLine +
        '<div class="report-actions"><button class="btn-primary report-done" type="button">' +
          (st.source === 'drill' ? 'Back to practice' : 'Done') + '</button></div>' +
      '</div>';
    var done = _body.querySelector('.report-done');
    done.addEventListener('click', close);
    setTimeout(function () { try { done.focus(); } catch (_) {} }, 40);
  }

  var ReportModal = { open: open, close: close, isOpen: function () { return _open; } };

  if (typeof module !== 'undefined' && module.exports) module.exports = ReportModal;
  if (typeof window !== 'undefined') window.ReportModal = ReportModal;
  else if (root) root.ReportModal = ReportModal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
