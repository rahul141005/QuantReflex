/**
 * hi.di.js — generated-content pack (di engine, hi) for QRGenI18n (ADR-111 Phase F).
 * Registers template/pool tables consumed by js/gen-i18n.js render(). Skeleton — populated during the
 * di engine refactor. Function-valued templates — validated by scripts/gen-i18n.check.js. Same-origin
 * IIFE, dual pattern (browser <script> + node require).
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);
  var pack = { pools: {}, tpl: {} };
  if (GI) GI.register('hi', 'di', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
