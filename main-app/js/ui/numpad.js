/**
 * numpad.js — the shared on-screen answer keypad, now an ADAPTIVE keypad (ADR-086).
 *
 * The keypad is a single persistent bottom surface reused by the drill engine, onboarding and duels. It renders a
 * stable digit block + a tall submit key + at most one contextual symbol slot, so the layout never reshuffles between
 * numeric question types. The exact keys and the input-validation rule for the current question come from the caller
 * (drill passes `QRAnswerFormat.answerFormat(q).keys` + `validateKeystroke`), so a question can never demand a key the
 * keypad can't produce and a valid answer can never be blocked (proven by scripts/answer-format.check.js).
 *
 * Public (bare globals, unchanged signatures + one optional opts arg):
 *   showCustomNumpad(inputEl, submitCallback, opts?)   opts = { keys?: [symbol chars beyond digits], validate?(cur,ch) }
 *   hideCustomNumpad()
 */

/* ---- Custom Numpad Controller ---- */
var _numpadInput = null;
var _numpadSubmitCb = null;
var _numpadValidate = null;              /* (current, key) → bool; null = allow everything (legacy callers) */
var _numpadKeys = null;                   /* the current format's allowed key set (digits+symbols); gates physical keys */
var _NUMPAD_LEGACY_SYMBOLS = [':', '%', '.', '-'];   /* pre-ADR-086 static set — default when a caller passes no keys */
var _numpadCurrentKey = '';              /* remembers the current symbol layout to avoid needless rebuilds */

/* Build the keypad grid: a stable 3-column digit pad (1–9, [symbol|0|⌫]) + a tall submit column on the right.
   `symbols` is a short string of the contextual keys (e.g. '', '.', ':', '/', '-'). At most one is needed today; the
   builder degrades gracefully if a future format declares more. */
function _buildNumpadGrid(symbols) {
  var grid = document.querySelector('#customNumpad .numpad-grid');
  if (!grid) return;
  symbols = (symbols == null ? '' : String(symbols));
  var sig = 'k:' + symbols;
  if (_numpadCurrentKey === sig && grid.getAttribute('data-built') === '1') return;   /* already this layout */
  _numpadCurrentKey = sig;

  function key(k, label, cls) { return '<button class="numpad-btn' + (cls ? ' ' + cls : '') + '" type="button" data-numpad="' + k + '"' + (k === 'backspace' ? ' aria-label="Backspace"' : (k === 'submit' ? ' aria-label="Submit"' : '')) + '>' + label + '</button>'; }
  var first = symbols.charAt(0) || '';
  var extra = symbols.slice(1);            /* any beyond the first (future-proof) go before backspace */
  var minusGlyph = '−';
  function symLabel(s) { return s === '-' ? minusGlyph : s; }

  var pad =
    key('1', '1') + key('2', '2') + key('3', '3') +
    key('4', '4') + key('5', '5') + key('6', '6') +
    key('7', '7') + key('8', '8') + key('9', '9') +
    (first ? key(first, symLabel(first), 'numpad-sym') : '<span class="numpad-btn numpad-blank" aria-hidden="true"></span>') +
    key('0', '0') +
    (extra ? extra.split('').map(function (s) { return key(s, symLabel(s), 'numpad-sym'); }).join('') : '') +
    key('backspace', '⌫', 'numpad-backspace');

  grid.innerHTML =
    '<div class="numpad-pad">' + pad + '</div>' +
    key('submit', '↵', 'numpad-submit');
  grid.setAttribute('data-built', '1');
}

function showCustomNumpad(inputEl, submitCallback, opts) {
  _numpadInput = inputEl;
  _numpadSubmitCb = submitCallback;
  opts = opts || {};
  _numpadValidate = (typeof opts.validate === 'function') ? opts.validate : null;
  _numpadKeys = (opts.keys && opts.keys.length) ? opts.keys.slice() : null;
  /* Symbols = the non-digit keys the caller asked for. Drill passes answerFormat(q).keys (digits + symbols); we keep
     only the symbols here. A caller with no keys gets the legacy set so onboarding/duels are unchanged. */
  var symbols;
  if (opts.keys) {
    symbols = opts.keys.filter(function (k) { return '0123456789'.indexOf(k) === -1; }).join('');
  } else {
    symbols = _NUMPAD_LEGACY_SYMBOLS.join('');
  }
  _buildNumpadGrid(symbols);
  var numpad = document.getElementById('customNumpad');
  if (numpad) {
    numpad.classList.add('visible');
    document.body.classList.add('numpad-active');
  }
}

function hideCustomNumpad() {
  _numpadInput = null;
  _numpadSubmitCb = null;
  _numpadValidate = null;
  _numpadKeys = null;
  var numpad = document.getElementById('customNumpad');
  if (numpad) {
    numpad.classList.remove('visible');
    document.body.classList.remove('numpad-active');
  }
}

/* ---- Numpad key press visual feedback ---- */
(function () {
  var _activePress = null; /* only one key can be in 'pressed' state at a time */

  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('.numpad-btn');
    if (!btn || btn.classList.contains('numpad-blank')) return;
    /* Release any previously held key (multi-touch guard) */
    if (_activePress && _activePress !== btn) {
      _activePress.classList.remove('pressed');
    }
    _activePress = btn;
    btn.classList.add('pressed');
    if (typeof triggerHaptic === 'function') triggerHaptic(8);
  });

  function _releaseAll() {
    var pressed = document.querySelectorAll('.numpad-btn.pressed');
    for (var i = 0; i < pressed.length; i++) {
      pressed[i].classList.remove('pressed');
    }
    _activePress = null;
  }

  document.addEventListener('pointerup', _releaseAll);
  document.addEventListener('pointercancel', _releaseAll);
})();

/* ---- Backspace hold-to-repeat + hold-to-clear (ADR-086) ----
   A short tap deletes one character (handled by the click listener below). Pressing and holding backspace repeats the
   delete, then — after a longer hold — clears the whole buffer, so a wrong long answer is fast to wipe with one thumb. */
(function () {
  var _repeat = null, _clear = null;
  function _stop() {
    if (_repeat) { clearInterval(_repeat); _repeat = null; }
    if (_clear) { clearTimeout(_clear); _clear = null; }
  }
  function _del() {
    if (!_numpadInput || _numpadInput.disabled) return;
    if (!document.body.contains(_numpadInput)) { _stop(); return; }
    _numpadInput.value = _numpadInput.value.slice(0, -1);
  }
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest && e.target.closest('[data-numpad="backspace"]');
    if (!btn || !_numpadInput) return;
    _stop();
    _repeat = setInterval(_del, 90);                 /* auto-repeat delete while held */
    _clear = setTimeout(function () {                /* long hold → clear all */
      if (_numpadInput && !_numpadInput.disabled && document.body.contains(_numpadInput)) _numpadInput.value = '';
      _stop();
      if (typeof triggerHaptic === 'function') triggerHaptic(18);
    }, 600);
  });
  document.addEventListener('pointerup', _stop);
  document.addEventListener('pointercancel', _stop);
  document.addEventListener('pointerleave', _stop);
})();

/* ---- MCQ option press feedback (LR, ADR-075) — parity with the numpad above ----
   The drill engine rebuilds the question container each turn, so a delegated document-level listener (like the
   numpad's) is the right home: it needs no per-render rewiring and toggles ONLY the visual `.pressed` class — it
   never grades or advances, so it cannot affect answer state. Gives a tapped option the same on-contact feedback a
   numpad key gets, so the three subjects feel like one input surface. */
(function () {
  var _activeOpt = null;

  document.addEventListener('pointerdown', function (e) {
    var opt = e.target.closest && e.target.closest('.mcq-option');
    if (!opt || opt.disabled) return;
    if (_activeOpt && _activeOpt !== opt) _activeOpt.classList.remove('pressed');
    _activeOpt = opt;
    opt.classList.add('pressed');
    if (typeof triggerHaptic === 'function') triggerHaptic(8);
  });

  function _releaseOpts() {
    var pressed = document.querySelectorAll('.mcq-option.pressed');
    for (var i = 0; i < pressed.length; i++) pressed[i].classList.remove('pressed');
    _activeOpt = null;
  }

  document.addEventListener('pointerup', _releaseOpts);
  document.addEventListener('pointercancel', _releaseOpts);
})();

/* ---- Numpad key click handler ---- */
(function initNumpad() {
  var _lastNumpadClick = 0;
  var _NUMPAD_DEBOUNCE_MS = 40; /* drop simultaneous multi-touch events */

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-numpad]');
    if (!btn || !_numpadInput) return;
    /* Guard: ensure input element is still in the DOM (prevents stale reference writes) */
    if (!document.body.contains(_numpadInput)) return;

    /* Multi-touch debounce: drop second event if < 40ms after previous */
    var now = Date.now();
    if (now - _lastNumpadClick < _NUMPAD_DEBOUNCE_MS) return;
    _lastNumpadClick = now;

    var key = btn.getAttribute('data-numpad');

    /* Prevent input after answer is submitted (input is disabled) */
    if (_numpadInput.disabled && key !== 'submit') return;

    if (key === 'submit') {
      if (_numpadSubmitCb) _numpadSubmitCb();
    } else if (key === 'backspace') {
      _numpadInput.value = _numpadInput.value.slice(0, -1);
    } else {
      /* Reject keystrokes that would build an invalid answer (2nd '.', non-leading '-', …) per the current format. */
      if (_numpadValidate && !_numpadValidate(_numpadInput.value, key)) return;
      /* Cap input length to prevent unbounded entry */
      if (_numpadInput.value.length < 15) {
        _numpadInput.value += key;
      }
    }

    /* NOTE: _numpadInput.focus() intentionally removed —
       calling focus() triggers the native keyboard on mobile, which
       fights with our custom numpad overlay. The input is readonly
       so no native keyboard is needed. */
  });
})();

/* ---- Physical-keyboard entry (accessibility / desktop / tablet-with-keyboard, ADR-094) ----
   The answer input is readonly + never focused (so mobile never raises the native keyboard), which left
   keyboard-only, switch and desktop users unable to type numeric answers. This global keydown mirrors the numpad
   click logic EXACTLY — same _numpadValidate, same 15-char cap, same _numpadSubmitCb — and is auto-scoped by
   _numpadInput (only set while a numeric drill question is live; MCQ + post-answer call hideCustomNumpad, which
   nulls it), so it never fires on MCQ screens or outside a drill. It never calls focus(), preserving the mobile
   invariant. Physical keys are gated to the current format's allowed set (_numpadKeys) just like the rendered buttons. */
(function () {
  var LEGACY = ['0','1','2','3','4','5','6','7','8','9',':','%','.','-'];
  function _allowedKey(ch) {
    return (_numpadKeys && _numpadKeys.length) ? _numpadKeys.indexOf(ch) !== -1 : LEGACY.indexOf(ch) !== -1;
  }
  document.addEventListener('keydown', function (e) {
    if (!_numpadInput) return;                                  /* no active numeric question */
    /* Any blocking overlay covers (and pointer-blocks) the on-screen numpad, but keyboard events bypass that visual
       guard — a keypress could otherwise submit/mutate the frozen answer or advance the drill UNDER the overlay
       (ADR-095). Yield to BOTH the pause overlay (its own element; it doesn't set modal-open) and any modal that sets
       body.modal-open — notably the exit-session dialog, which is reachable mid-question. */
    if (document.getElementById('drillPauseOverlay') || document.body.classList.contains('modal-open')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;            /* let browser/OS shortcuts through */
    if (!document.body.contains(_numpadInput)) return;         /* stale reference guard */
    /* Don't hijack typing in a real editable field (login, custom-topic name, search). The answer input is
       readonly, so a focused, non-readonly INPUT/TEXTAREA/contentEditable means the user is typing elsewhere. */
    var t = e.target;
    if (t && t !== _numpadInput) {
      var tag = t.tagName;
      if (t.isContentEditable || tag === 'TEXTAREA' || (tag === 'INPUT' && !t.readOnly)) return;
    }
    var key = e.key;
    if (key === 'Enter') {
      e.preventDefault();
      if (_numpadSubmitCb) _numpadSubmitCb();
      return;
    }
    if (_numpadInput.disabled) return;                          /* already answered — ignore digit entry */
    if (key === 'Backspace') {
      e.preventDefault();
      _numpadInput.value = _numpadInput.value.slice(0, -1);
      return;
    }
    if (key && key.length === 1 && _allowedKey(key)) {
      e.preventDefault();
      if (_numpadValidate && !_numpadValidate(_numpadInput.value, key)) return;
      if (_numpadInput.value.length < 15) _numpadInput.value += key;
    }
  });
})();
