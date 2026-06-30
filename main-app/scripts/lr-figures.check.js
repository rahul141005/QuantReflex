/**
 * lr-figures.check.js — validates the visual reasoning renderer + engine (ADR-079).
 *
 * Visual LR must be DETERMINISTIC and UNAMBIGUOUS. This harness: (1) structurally checks the SVG renderer (role/aria,
 * viewBox, element counts, transforms); (2) for every visual category independently recomputes the correct option
 * from the figure spec — mirror/water (the one flipped glyph), dice (7−top), painted cube (formula), figure series
 * (constant rotation), figure analogy (apply A→B to C) — and confirms the engine's answer token points to exactly
 * that figure, with four visually-distinct options. Wired into `npm test`.   node scripts/lr-figures.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var F = require(p('js/ui/lr-figures'));
var VE = require(p('js/lr-visual-engine'));

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 20) console.error('  ✗ ' + label); } }
function count(hay, needle) { return hay.split(needle).length - 1; }

console.log('lr-figures.check — visual reasoning (ADR-079)');

/* 1. renderer structure */
(function () {
  var g = F.render({ kind: 'glyph', text: 'G' });
  ok('glyph: figure+role+svg', /<figure class="lr-figure" role="img"/.test(g) && g.indexOf('<svg') !== -1);
  ok('glyph: 100×100 viewBox', g.indexOf('viewBox="0 0 100 100"') !== -1);
  ok('glyph: aria carries description', g.indexOf('aria-label="the character') !== -1);
  ok('glyph mirror uses horizontal flip', F.render({ kind: 'glyph', text: 'G', flip: 'h' }).indexOf('scale(-1,1)') !== -1);
  ok('glyph water uses vertical flip', F.render({ kind: 'glyph', text: 'G', flip: 'v' }).indexOf('scale(1,-1)') !== -1);
  ok('die 5 has five pips', count(F.render({ kind: 'die', value: 5 }), '<circle') === 5);
  ok('cube draws faces', count(F.render({ kind: 'cube', n: 3 }), '<polygon') >= 3);
  ok('arrow rotates', F.render({ kind: 'arrow', rot: 90 }).indexOf('rotate(90 50 50)') !== -1);
  ok('row widens the viewBox', F.render({ kind: 'row', items: [{ kind: 'glyph', text: 'A' }, { kind: 'glyph', text: 'B' }] }).indexOf('viewBox="0 0 200 100"') !== -1);
  ok('bad spec → empty', F.render(null) === '' && F.render({}) === '');
  ok('describe non-empty', F.describe({ kind: 'die', value: 3 }).length > 0);
})();

/* 2. engine: independent recompute per category */
function sigGlyph(f) { return f.text + '|' + (f.flip || 'none') + '|' + (f.rot || 0); }
function distinct(figs, sigFn) { var s = {}; figs.forEach(function (f) { s[sigFn(f)] = 1; }); return Object.keys(s).length === figs.length; }
function tokenOf(q, predicate) { for (var i = 0; i < q.optionFigures.length; i++) if (predicate(q.optionFigures[i])) return { token: q.options[i], n: 1 }; return { token: null, n: 0 }; }

VE.categories().forEach(function (cat) {
  ['easy', 'medium', 'hard'].forEach(function (diff) {
    for (var n = 0; n < 150; n++) {
      var q = VE.generate(cat, diff);
      ok(cat + ' category+subtype', q.category === cat && q.subtype.indexOf(diff + ':') === 0);
      ok(cat + ' options distinct', new Set(q.options).size === q.options.length && q.options.length >= 4);
      ok(cat + ' answer in options', q.options.indexOf(String(q.answer)) !== -1);

      if (cat === 'lr-mirror' || cat === 'lr-water') {
        var axis = cat === 'lr-mirror' ? 'h' : 'v', g = q.figure.text;
        ok(cat + ' four distinct figures', q.optionFigures.length === 4 && distinct(q.optionFigures, sigGlyph));
        var corr = q.optionFigures.filter(function (f) { return f.text === g && f.flip === axis && !f.rot; });
        ok(cat + ' exactly one correct flip', corr.length === 1);
        var t = tokenOf(q, function (f) { return f.text === g && f.flip === axis && !f.rot; });
        ok(cat + ' answer points to the flip', String(t.token) === String(q.answer));
      } else if (cat === 'lr-dice') {
        ok('dice answer = 7 − top', String(7 - q.figure.value) === String(q.answer));
      } else if (cat === 'lr-cube') {
        var nn = q.figure.n, exp;
        if (/TWO faces/.test(q.question)) exp = 12 * (nn - 2);
        else if (/ONE face/.test(q.question)) exp = 6 * (nn - 2) * (nn - 2);
        else if (/NO face/.test(q.question)) exp = (nn - 2) * (nn - 2) * (nn - 2);
        else exp = 8;
        ok('cube formula', String(exp) === String(q.answer));
      } else if (cat === 'lr-fseries') {
        var items = q.figure.items, rots = [items[0].rot, items[1].rot, items[2].rot, items[3].rot];
        var step = ((rots[1] - rots[0]) % 360 + 360) % 360;
        var consistent = ((rots[2] - rots[1] + 360) % 360) === step && ((rots[3] - rots[2] + 360) % 360) === step;
        ok('fseries constant step', consistent);
        var next = (rots[3] + step) % 360;
        ok('fseries four distinct arrows', distinct(q.optionFigures, function (f) { return f.rot; }));
        var t2 = tokenOf(q, function (f) { return f.rot === next; });
        ok('fseries answer = next rotation', t2.n === 1 && String(t2.token) === String(q.answer));
      } else if (cat === 'lr-fanalogy') {
        var it = q.figure.items, k = ((it[1].rot - it[0].rot) % 360 + 360) % 360, ansRot = (it[2].rot + k) % 360;
        ok('fanalogy four distinct arrows', distinct(q.optionFigures, function (f) { return f.rot; }));
        var t3 = tokenOf(q, function (f) { return f.rot === ansRot; });
        ok('fanalogy applies same turn', t3.n === 1 && String(t3.token) === String(q.answer));
      }
    }
  });
});

console.log('\nlr-figures.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
