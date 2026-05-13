/**
 * swipe-nav.js — Swipe gesture navigation between tabs
 *
 * Extracted from app.js. Manages horizontal swipe detection
 * and tab switching with velocity and threshold checks.
 *
 * Dependencies (expected globals):
 *   Router, SoundEngine, triggerHaptic,
 *   _drillSessionActive, _activeDrillEngine,
 *   _focusModeActive, _customPracticeActive
 */

/* ---- Swipe Navigation ---- */
function initSwipeNavigation() {
  var viewOrder = ['home', 'practice', 'learn', 'stats', 'settings'];
  var touchStartX = 0;
  var touchStartY = 0;
  var touchStartTime = 0;
  var isSwiping = false;
  var swipeLocked = false;
  var SWIPE_THRESHOLD = 40;
  var SWIPE_VELOCITY_THRESHOLD = 0.25;
  var VERTICAL_THRESHOLD_RATIO = 1.2;
  var MIN_VERTICAL_PX = 10;

  document.addEventListener('touchstart', function (e) {
    /* Don't capture swipes on inputs or inside modals or onboarding */
    if (e.target.closest('.modal-overlay, .table-modal-overlay, .info-modal-overlay, .onboarding-overlay, input, textarea, select')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    isSwiping = true;
    swipeLocked = false;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!isSwiping || swipeLocked) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    /* If vertical movement dominates early, cancel swipe detection */
    if (Math.abs(dy) > MIN_VERTICAL_PX && Math.abs(dy) > Math.abs(dx) * VERTICAL_THRESHOLD_RATIO) {
      isSwiping = false;
      swipeLocked = true;
    }
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!isSwiping) return;
    isSwiping = false;

    var touchEndX = e.changedTouches[0].clientX;
    var touchEndY = e.changedTouches[0].clientY;
    var deltaX = touchEndX - touchStartX;
    var deltaY = touchEndY - touchStartY;
    var elapsed = Date.now() - touchStartTime;

    /* Must be primarily horizontal */
    if (Math.abs(deltaY) * VERTICAL_THRESHOLD_RATIO > Math.abs(deltaX)) return;
    /* Must exceed minimum distance */
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
    /* Check velocity */
    var velocity = Math.abs(deltaX) / elapsed;
    if (velocity < SWIPE_VELOCITY_THRESHOLD) return;

    var currentView = Router.getCurrentView();
    var currentIndex = viewOrder.indexOf(currentView);
    if (currentIndex === -1) return;

    /* Block swipe during active drill/test session, drill start screen,
       or when focus/custom category selection is open */
    if (_drillSessionActive || _activeDrillEngine) return;
    if (_focusModeActive || _customPracticeActive) return;

    var nextIndex;
    if (deltaX > 0) {
      /* Swipe right → go to previous tab */
      nextIndex = currentIndex - 1;
    } else {
      /* Swipe left → go to next tab */
      nextIndex = currentIndex + 1;
    }

    if (nextIndex >= 0 && nextIndex < viewOrder.length) {
      _closeAllInfoModals();
      SoundEngine.play('tabSwitch');
      triggerHaptic(10);
      Router.showView(viewOrder[nextIndex]);
    }
  }, { passive: true });
}
