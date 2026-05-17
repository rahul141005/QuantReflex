/**
 * numpad.js — Custom numpad controller
 *
 * Extracted from app.js. Manages:
 *   - showCustomNumpad() / hideCustomNumpad() toggle
 *   - Numpad key click handler (digits, backspace, submit)
 *   - Numpad key press visual feedback (pressed state + haptic)
 *   - Input focus management
 *
 * All functions remain as bare globals for backward compatibility.
 */

/* ---- Custom Numpad Controller ---- */
var _numpadInput = null;
var _numpadSubmitCb = null;

function showCustomNumpad(inputEl, submitCallback) {
  _numpadInput = inputEl;
  _numpadSubmitCb = submitCallback;
  var numpad = document.getElementById('customNumpad');
  if (numpad) {
    numpad.classList.add('visible');
    document.body.classList.add('numpad-active');
  }
}

function hideCustomNumpad() {
  _numpadInput = null;
  _numpadSubmitCb = null;
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
    if (!btn) return;
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
