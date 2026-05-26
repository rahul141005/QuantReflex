/**
 * bottom-sheet.js — Mobile-native bottom sheet component
 *
 * Used for student profile details, filters, and notice compose.
 * Smooth open/close transitions. Backdrop overlay.
 */
var BottomSheet = (function () {
  'use strict';

  var _isOpen = false;

  function open(title, contentHtml) {
    var overlay = document.getElementById('bottomSheetOverlay');
    var sheet = document.getElementById('bottomSheet');
    var titleEl = document.getElementById('bottomSheetTitle');
    var contentEl = document.getElementById('bottomSheetContent');

    if (!overlay || !sheet) return;

    if (titleEl) titleEl.textContent = title || '';
    if (contentEl) contentEl.innerHTML = contentHtml || '';

    overlay.classList.add('active');
    sheet.classList.add('active');
    document.body.style.overflow = 'hidden';
    _isOpen = true;
  }

  function close() {
    var overlay = document.getElementById('bottomSheetOverlay');
    var sheet = document.getElementById('bottomSheet');

    if (overlay) overlay.classList.remove('active');
    if (sheet) sheet.classList.remove('active');
    document.body.style.overflow = '';
    _isOpen = false;
  }

  function isOpen() { return _isOpen; }

  /**
   * Update content without re-opening.
   */
  function setContent(html) {
    var el = document.getElementById('bottomSheetContent');
    if (el) el.innerHTML = html;
  }

  return { open: open, close: close, isOpen: isOpen, setContent: setContent };
})();
