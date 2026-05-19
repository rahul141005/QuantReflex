/**
 * session-manager.js — Drill session lifecycle management
 *
 * Extracted from app.js. Manages:
 *   - Active drill engine reference (_activeDrillEngine)
 *   - Session active flag (_drillSessionActive)
 *   - Enter/exit session mode (nav bar, body class, numpad)
 *   - Exit confirmation dialog
 *   - Navigation transition guards
 *   - Practice action lock
 *
 * All functions remain as bare globals for backward compatibility.
 */

/* ---- Active drill engine reference for cleanup ---- */
var _activeDrillEngine = null;
var _navTransitionInProgress = false;
var _practiceActionLocked = false;
/* True only while user is actively answering questions (after START pressed) */
var _drillSessionActive = false;
var _exitSessionMsg = 'Exit this session? Your progress will be lost.';
/* Prevents multiple exit dialogs from stacking */
var _exitDialogShowing = false;

/**
 * Enter drill session mode:
 * - set session active flag
 * - hide bottom navigation bar for immersive experience
 * - add body class for CSS adjustments (numpad positioning)
 */
function _enterDrillSession() {
  _drillSessionActive = true;
  var nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = 'none';
  document.body.classList.add('drill-session-active');
  document.documentElement.classList.add('drill-session-active');
}

/**
 * Exit drill session mode (unified cleanup):
 * - reset session flag
 * - restore bottom navigation bar
 * - remove body class
 * - hide custom numpad and clean up input state
 */
function _exitDrillSession() {
  _drillSessionActive = false;
  var nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = '';
  document.body.classList.remove('drill-session-active');
  document.documentElement.classList.remove('drill-session-active');
  hideCustomNumpad();
}

function _tryBeginNavTransition() {
  if (_navTransitionInProgress) return false;
  _navTransitionInProgress = true;
  setTimeout(function () {
    _navTransitionInProgress = false;
  }, 220);
  return true;
}

function _tryPracticeAction() {
  if (_practiceActionLocked) return false;
  _practiceActionLocked = true;
  setTimeout(function () {
    _practiceActionLocked = false;
  }, 220);
  return true;
}

/**
 * Show a custom in-app exit confirmation dialog instead of native confirm().
 * Native confirm() can behave unreliably in some browser contexts,
 * sometimes ending the session even when Cancel is pressed.
 * @param {function} onConfirm - callback when user confirms exit
 */
function showExitSessionDialog(onConfirm) {
  if (_exitDialogShowing) return;
  _exitDialogShowing = true;

  function closeDialog(modalEl) {
    if (modalEl) modalEl.style.display = 'none';
    _exitDialogShowing = false;
    document.body.classList.remove('modal-open');
  }

  var modal = document.getElementById('exitSessionModal');
  if (!modal) {
    console.error('[SessionManager] exitSessionModal missing from DOM');
    onConfirm();
    return;
  }

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  var cancelBtn = document.getElementById('exitSessionCancel');
  var confirmBtn = document.getElementById('exitSessionConfirm');
  if (!cancelBtn || !confirmBtn) {
    console.error('[SessionManager] exitSession buttons missing from DOM');
    onConfirm();
    return;
  }

  cancelBtn.onclick = function () {
    closeDialog(modal);
    /* Session continues — do nothing else */
  };

  confirmBtn.onclick = function () {
    closeDialog(modal);
    onConfirm();
  };

  /* Close on overlay click (treat as cancel) */
  modal.onclick = function (e) {
    if (e.target === modal) closeDialog(modal);
  };
}

/* Prevent accidental page close / tab close during active drill sessions */
window.addEventListener('beforeunload', function (e) {
  if (_drillSessionActive) {
    e.preventDefault();
    /* Modern browsers require returnValue to be set */
    e.returnValue = '';

    /* Clear adaptive difficulty override so stale state doesn't persist
       if the user force-closes the tab mid-drill */
    if (typeof AdaptiveState !== 'undefined' && typeof AdaptiveState.clearDifficulty === 'function') {
      AdaptiveState.clearDifficulty();
    } else {
      window._adaptiveOverrideDifficulty = null;
    }
  }

  /* Always flush pending Firestore writes on page unload */
  if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.flushUpdatesAsync === 'function') {
    FirestoreSync.flushUpdatesAsync();
  }
});

/* On mobile (especially PWAs), beforeunload is unreliable when the OS kills the app.
   Hook into visibilitychange to safely flush pending Firestore writes when backgrounded. */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') {
    if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.flushUpdatesAsync === 'function') {
      FirestoreSync.flushUpdatesAsync();
    }
  }
});
