/**
 * en.di.js — generated-content pack (di engine, en) for QRGenI18n (ADR-111 Phase F).
 * Registers template/pool tables consumed by js/gen-i18n.js render(). Skeleton (F-M1): populated during the
 * di engine refactor. Function-valued templates — validated by scripts/gen-i18n.check.js, NOT the catalog
 * string scanner. Same-origin IIFE, dual pattern (browser <script> + node require).
 */
(function () {
  'use strict';
  var pack = { pools: {}, tpl: {} };
  if (typeof QRGenI18n !== 'undefined') QRGenI18n.register('en', 'di', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
