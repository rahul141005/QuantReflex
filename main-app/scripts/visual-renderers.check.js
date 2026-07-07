/**
 * visual-renderers.check.js (ADR-105) — lockstep guard for the shared DI/LR renderers.
 *
 * DICharts (shared/ui/di-charts.js) and LRFigures (shared/ui/lr-figures.js) each have ONE canonical source with
 * byte-identical app-local copies (shared/ is outside every deploy root — the ADR-099 P0). This fails the build if
 * any app-local copy drifts from its canonical source. Run scripts/sync-visual-renderers.js after editing a
 * canonical renderer. Mirrors update.check.js.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

console.log('visual-renderers.check — shared DI/LR renderer lockstep (ADR-105)\n');

var RENDERERS = [
  { canonical: 'shared/ui/di-charts.js', global: 'DICharts',
    copies: ['main-app/js/ui/di-charts.js', 'super-admin-app/js/ui/di-charts.js'] },
  { canonical: 'shared/ui/lr-figures.js', global: 'LRFigures',
    copies: ['main-app/js/ui/lr-figures.js', 'super-admin-app/js/ui/lr-figures.js'] }
];

RENDERERS.forEach(function (r) {
  var canonSrc = read(r.canonical);
  /* Canonical module exports the pure render + describe API. */
  var m = require(path.join(ROOT, r.canonical));
  ok(r.global + ': canonical exports render()', typeof m.render === 'function');
  ok(r.global + ': canonical exports describe()', typeof m.describe === 'function');
  r.copies.forEach(function (rel) {
    ok(rel + ': byte-identical to ' + r.canonical, read(rel) === canonSrc);
  });
});

/* ADR-106 (M2): the renderers' CSS is NOT byte-syncable across apps (main-app uses `body.dark-mode`, super-admin uses
   `:root[data-theme="dark"]`), so instead lock the VALUES that actually matter — the DI series palette + LR stroke
   tokens — so a palette/token change in main-app can't silently drift the super-admin charts. Selector-agnostic. */
function extractTokens(src) {
  var re = /--(di-series-\d|lr-stroke(?:-thin)?)\s*:\s*([^;]+);/g, m2, out = [];
  while ((m2 = re.exec(src))) out.push(m2[1] + ':' + m2[2].trim());
  return out.sort();
}
(function () {
  var mainTokens = extractTokens(read('main-app/css/style.css'));
  var adminTokens = extractTokens(read('super-admin-app/css/admin-style.css'));
  ok('DI/LR CSS tokens present in main-app style.css', mainTokens.length >= 14);   // 6 light + 6 dark series + 2 lr-stroke
  ok('super-admin admin-style.css defines the same DI series palette + LR stroke tokens as main-app (no drift)',
    JSON.stringify(mainTokens) === JSON.stringify(adminTokens));
})();

console.log('\nvisual-renderers.check.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
