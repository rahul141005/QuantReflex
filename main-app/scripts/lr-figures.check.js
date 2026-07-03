/**
 * lr-figures.check.js — visual LR renderer + engine verification (ADR-079 · rewritten for ADR-093).
 *
 * Part 1 exercises LRFigures.render/describe structurally (every spec kind produces well-formed, class-themed SVG).
 * Part 2 sweeps LRVisualEngine: 10 categories × 3 difficulties × 150 samples, asserting the MCQ contract
 * (4+ spec-distinct options, answer present, explanation present, earned-tier subtype) and INDEPENDENTLY
 * recomputing the correct option for every archetype — reflections/rotations re-derived with this file's own
 * anchor/lattice math (not the engine's), paper folds re-unfolded, dice/net pairings re-deduced, embedded
 * motifs re-tested by exact segment-subset. Zero mismatches allowed.
 *   node scripts/lr-figures.check.js
 */
'use strict';
var path = require('path');
var LRF = require(path.join(__dirname, '..', 'js', 'ui', 'lr-figures.js'));
var ENG = require(path.join(__dirname, '..', 'js', 'lr-visual-engine.js'));

var pass = 0, fail = 0, shown = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; if (++shown <= 20) console.error('  ✗ ' + name); } }

/* ───────────────── independent transform math (deliberately re-implemented) ───────────────── */
var ORDER8 = ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'];
var MIR = { t: 't', tr: 'tl', r: 'l', br: 'bl', b: 'b', bl: 'br', l: 'r', tl: 'tr', c: 'c' };
function rotAt(at, k) { var i = ORDER8.indexOf(at); return i === -1 ? at : ORDER8[(i + k + 800) % 8]; }
function segNorm(segs) {
  return segs.map(function (s) { return (s[0] < s[2] || (s[0] === s[2] && s[1] <= s[3])) ? s.slice() : [s[2], s[3], s[0], s[1]]; })
    .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]; });
}
function segKey(segs) { return JSON.stringify(segNorm(segs)); }
function segMirror(segs) { return segs.map(function (s) { return [3 - s[0], s[1], 3 - s[2], s[3]]; }); }
function segWater(segs) { return segs.map(function (s) { return [s[0], 3 - s[1], s[2], 3 - s[3]]; }); }
function segRot(segs, n) { var out = segs; for (var i = 0; i < n; i++) out = out.map(function (s) { return [3 - s[1], s[0], 3 - s[3], s[2]]; }); return out; }
function segSubset(motif, host) {
  var hk = {}; segNorm(host).forEach(function (s) { hk[JSON.stringify(s)] = 1; });
  return segNorm(motif).every(function (s) { return hk[JSON.stringify(s)]; });
}
function key(spec) { return JSON.stringify(spec); }
function correctFig(q) { return q.optionFigures ? q.optionFigures[parseInt(q.answer, 10) - 1] : null; }
function holeKey(holes) { return JSON.stringify((holes || []).map(function (h) { return [Math.round(h[0] * 100), Math.round(h[1] * 100)]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; })); }

console.log('lr-figures.check — visual LR renderer + engine (ADR-079/093)');

/* ─────────────────────────── Part 1: renderer ─────────────────────────── */
(function () {
  var g = LRF.render({ kind: 'glyph', text: 'R', flip: 'h' });
  ok('1 glyph figure well-formed', g.indexOf('class="lr-figure"') !== -1 && g.indexOf('role="img"') !== -1 && g.indexOf('<svg') !== -1 && g.indexOf('viewBox="0 0 100 100"') !== -1);
  ok('1 mirror uses scale(-1,1)', g.indexOf('scale(-1,1)') !== -1);
  ok('1 water uses scale(1,-1)', LRF.render({ kind: 'glyph', text: 'R', flip: 'v' }).indexOf('scale(1,-1)') !== -1);
  ok('1 die value 5 → five pips', (LRF.render({ kind: 'die', value: 5 }).match(/<circle/g) || []).length === 5);
  ok('1 cube → ≥3 polygons', (LRF.render({ kind: 'cube', n: 3 }).match(/<polygon/g) || []).length >= 3);
  ok('1 arrow rot 90', LRF.render({ kind: 'arrow', rot: 90 }).indexOf('rotate(90 50 50)') !== -1);
  ok('1 row of 2 → viewBox 200', LRF.render({ kind: 'row', items: [{ kind: 'qmark' }, { kind: 'qmark' }] }).indexOf('viewBox="0 0 200 100"') !== -1);
  ok('1 null/unknown → empty', LRF.render(null) === '' && LRF.render({}) === '');

  var sh = LRF.render({ kind: 'shape', form: 'triangle', fill: 'none' });
  ok('1 shape outline', sh.indexOf('lr-fig-shape') !== -1 && sh.indexOf('<polygon') !== -1);
  ok('1 solid shape', LRF.render({ kind: 'shape', form: 'square', fill: 'solid' }).indexOf('lr-fig-solidshape') !== -1);
  var hf = LRF.render({ kind: 'shape', form: 'circle', fill: 'half' });
  ok('1 half shade uses clipPath', hf.indexOf('<clipPath') !== -1 && hf.indexOf('clip-path="url(#') !== -1);
  ok('1 two half-shaded figures get distinct clip ids', (function () {
    var a = LRF.render({ kind: 'shape', form: 'circle', fill: 'half' });
    var b = LRF.render({ kind: 'shape', form: 'circle', fill: 'half' });
    var ida = a.match(/clipPath id="([^"]+)"/), idb = b.match(/clipPath id="([^"]+)"/);
    return !!(ida && idb && ida[1] !== idb[1]);
  })());
  var co = LRF.render({ kind: 'compo', outer: { form: 'square', fill: 'none' }, inner: [{ form: 'dot', at: 'tl' }] });
  ok('1 compo renders outer + positioned inner', co.indexOf('lr-fig-shape') !== -1 && co.indexOf('lr-fig-dotfill') !== -1 && co.indexOf('translate(') !== -1);
  ok('1 compo flip transform', LRF.render({ kind: 'compo', outer: { form: 'square', fill: 'none' }, inner: [], flip: 'h' }).indexOf('scale(-1,1)') !== -1);
  var sg = LRF.render({ kind: 'seg', segs: [[0, 0, 1, 0], [1, 0, 1, 1]] });
  ok('1 seg lattice mapping (0→14, 1→38)', sg.indexOf('x1="14"') !== -1 && sg.indexOf('x2="38"') !== -1 && (sg.match(/<line/g) || []).length === 2);
  var pf = LRF.render({ kind: 'paper', fold: 'v', folded: true, holes: [[0.25, 0.25]] });
  ok('1 folded paper: sheet + dashed crease + hole', pf.indexOf('lr-fig-paper') !== -1 && pf.indexOf('lr-fig-fold') !== -1 && pf.indexOf('lr-fig-hole') !== -1);
  ok('1 unfolded paper has no crease', LRF.render({ kind: 'paper', holes: [[0.25, 0.25], [0.75, 0.25]] }).indexOf('lr-fig-fold') === -1);
  var nt = LRF.render({ kind: 'net', faces: ['1', '2', '3', '4', '5', '6'] });
  ok('1 net: six cells + six labels', (nt.match(/lr-fig-netcell/g) || []).length === 6 && (nt.match(/lr-fig-netlbl/g) || []).length === 6);
  ok('1 net escapes labels', LRF.render({ kind: 'net', faces: ['<x>', '2', '3', '4', '5', '6'] }).indexOf('<x>') === -1);
  var d3 = LRF.render({ kind: 'die3', top: 1, front: 2, right: 3 });
  ok('1 die3: three faces + three labels', (d3.match(/<polygon/g) || []).length === 3 && (d3.match(/lr-fig-facelbl/g) || []).length >= 3);
  var gr = LRF.render({ kind: 'grid3', cells: [null, null, null, null, null, null, null, null, null] });
  ok('1 grid3: 300 viewBox + frame + gridlines', gr.indexOf('viewBox="0 0 300 300"') !== -1 && gr.indexOf('lr-fig-gridframe') !== -1 && (gr.match(/lr-fig-gridline/g) || []).length === 4);
  ['glyph', 'arrow', 'die', 'cube', 'qmark', 'shape', 'compo', 'seg', 'paper', 'net', 'die3', 'grid3', 'row'].forEach(function (k) {
    var spec = { kind: k, text: 'R', value: 3, n: 3, form: 'circle', fill: 'none', outer: { form: 'square', fill: 'none' }, inner: [], segs: [[0, 0, 1, 1]], holes: [], faces: ['1', '2', '3', '4', '5', '6'], top: 1, front: 2, right: 3, cells: [], items: [{ kind: 'qmark' }] };
    ok('1 describe(' + k + ') non-empty', typeof LRF.describe(spec) === 'string' && LRF.describe(spec).length > 0);
  });
})();

/* ─────────────────────────── Part 2: engine sweep ─────────────────────────── */
var CATS = ENG.categories();
ok('2 ten categories', CATS.length === 10 && CATS.indexOf('lr-paper') !== -1 && CATS.indexOf('lr-embedded') !== -1);

var TIER_KEYS = {
  'lr-mirror': { easy: ['mirror', 'figmirror'], medium: ['cluster', 'figmirror'], hard: ['segmirror'] },
  'lr-water': { easy: ['water', 'figwater'], medium: ['cluster', 'figwater'], hard: ['segwater'] },
  'lr-dice': { easy: ['opp', 'hiddenSum'], medium: ['net', 'twoDiceSum'], hard: ['twoPos'] },
  'lr-cube': { easy: ['paint3'], medium: ['paint'], hard: ['paint5', 'cuboid'] },
  'lr-fseries': { easy: ['pos', 'count'], medium: ['posShade', 'pos3'], hard: ['countShade', 'altPos'] },
  'lr-fanalogy': { easy: ['rot'], medium: ['reflect', 'count', 'shade'], hard: ['rotShade', 'swap'] },
  'lr-odd-fig': { easy: ['count'], medium: ['form'], hard: ['reflect'] },
  'lr-paper': { easy: ['fold1'], medium: ['fold1b', 'foldD'], hard: ['fold2'] },
  'lr-pattern': { easy: ['rowRot'], medium: ['rotForm'], hard: ['rotShade'] },
  'lr-embedded': { easy: ['embed'], medium: ['embed'], hard: ['embed'] }
};

/* per-archetype independent recompute: true (verified), false (MISMATCH), null (not covered) */
function recompute(q) {
  var kx = q.subtype.split(':')[1];
  var cf = correctFig(q);
  var fig = q.figure;

  if (kx === 'mirror' || kx === 'water') {
    var axis = kx === 'mirror' ? 'h' : 'v';
    return !!cf && cf.kind === 'glyph' && cf.text === fig.text && cf.flip === axis;
  }
  if (kx === 'figmirror' || kx === 'figwater') {
    var ax = kx === 'figmirror' ? 'h' : 'v';
    var expect = JSON.parse(JSON.stringify(fig)); expect.flip = ax;
    return key(cf) === key(expect);
  }
  if (kx === 'cluster') {
    var isM = q.category === 'lr-mirror';
    var chars = fig.items.map(function (it) { return it.text; });
    var exp = isM ? chars.slice().reverse() : chars.slice();
    var flip = isM ? 'h' : 'v';
    if (!cf || cf.kind !== 'row' || cf.items.length !== chars.length) return false;
    return cf.items.every(function (it, i) { return it.text === exp[i] && it.flip === flip; });
  }
  if (kx === 'segmirror' || kx === 'segwater') {
    var tr = kx === 'segmirror' ? segMirror : segWater;
    if (segKey(cf.segs) !== segKey(tr(fig.segs))) return false;
    for (var r = 0; r < 4; r++) if (segKey(segRot(fig.segs, r)) === segKey(cf.segs)) return false;   // chirality
    return true;
  }

  if (kx === 'opp') return +q.answer === 7 - fig.value;
  if (kx === 'hiddenSum') return +q.answer === 21 - fig.value;
  if (kx === 'twoDiceSum') return +q.answer === (7 - fig.items[0].value) + (7 - fig.items[1].value);
  if (kx === 'net') {
    var m = q.question.match(/opposite (\d)/); if (!m) return false;
    var PAIR = { 0: 5, 5: 0, 1: 3, 3: 1, 2: 4, 4: 2 };
    var idx = fig.faces.indexOf(m[1]); if (idx === -1) return false;
    return q.answer === fig.faces[PAIR[idx]];
  }
  if (kx === 'twoPos') {
    var mm = q.question.match(/opposite (\d)/); if (!mm) return false;
    var X = +mm[1], seen = {};
    fig.items.forEach(function (v) { [v.top, v.front, v.right].forEach(function (n) { if (n !== X) seen[n] = 1; }); });
    var others = [1, 2, 3, 4, 5, 6].filter(function (n) { return n !== X && !seen[n]; });
    return others.length === 1 && +q.answer === others[0];
  }

  if (kx === 'paint3' || kx === 'paint' || kx === 'paint5') {
    var nm = q.question.match(/(\d+)×(\d+)×(\d+)|\((\d+) along each edge\)/);
    var n = nm ? +(nm[1] || nm[4]) : null; if (!n) return false;
    var t = q.question.toLowerCase();
    var v = t.indexOf('at least one') !== -1 ? n * n * n - Math.pow(n - 2, 3)
      : t.indexOf('three faces') !== -1 ? 8
      : t.indexOf('two faces') !== -1 ? 12 * (n - 2)
      : t.indexOf('one face painted') !== -1 ? 6 * (n - 2) * (n - 2)
      : Math.pow(n - 2, 3);
    return +q.answer === v;
  }
  if (kx === 'cuboid') {
    var dm = q.question.match(/(\d+) × (\d+) × (\d+)/); if (!dm) return false;
    var a = +dm[1], b = +dm[2], c = +dm[3], tl = q.question.toLowerCase();
    var vv = tl.indexOf('three faces') !== -1 ? 8
      : tl.indexOf('two faces') !== -1 ? 4 * ((a - 2) + (b - 2) + (c - 2))
      : tl.indexOf('one face painted') !== -1 ? 2 * ((a - 2) * (b - 2) + (b - 2) * (c - 2) + (a - 2) * (c - 2))
      : (a - 2) * (b - 2) * (c - 2);
    return +q.answer === vv;
  }

  function st(item) {
    var inner = item.inner || [];
    return { at: inner.length === 1 ? inner[0].at : null, count: inner.length, fill: (item.outer && item.outer.fill) || 'none' };
  }
  if (q.category === 'lr-fseries') {
    var shown = fig.items.slice(0, 4).map(st), nx = st(cf);
    if (kx === 'pos' || kx === 'pos3') {
      var step = (ORDER8.indexOf(shown[1].at) - ORDER8.indexOf(shown[0].at) + 8) % 8;
      for (var i = 1; i < 3; i++) if ((ORDER8.indexOf(shown[i + 1].at) - ORDER8.indexOf(shown[i].at) + 8) % 8 !== step) return false;
      return nx.at === rotAt(shown[3].at, step);
    }
    if (kx === 'count') {
      var d = shown[1].count - shown[0].count;
      if (shown[2].count - shown[1].count !== d || shown[3].count - shown[2].count !== d) return false;
      return nx.count === shown[3].count + d && nx.fill === 'none';
    }
    if (kx === 'posShade') {
      var s2 = (ORDER8.indexOf(shown[1].at) - ORDER8.indexOf(shown[0].at) + 8) % 8;
      if (shown[0].fill !== 'none' || shown[1].fill !== 'solid' || shown[2].fill !== 'none' || shown[3].fill !== 'solid') return false;
      return nx.at === rotAt(shown[3].at, s2) && nx.fill === 'none';
    }
    if (kx === 'countShade') {
      var dc = shown[1].count - shown[0].count;
      return nx.count === shown[3].count + dc && nx.fill === 'none';
    }
    if (kx === 'altPos') {
      var d1 = (ORDER8.indexOf(shown[1].at) - ORDER8.indexOf(shown[0].at) + 8) % 8;
      var d2 = (ORDER8.indexOf(shown[2].at) - ORDER8.indexOf(shown[1].at) + 8) % 8;
      var d3b = (ORDER8.indexOf(shown[3].at) - ORDER8.indexOf(shown[2].at) + 8) % 8;
      if (d3b !== d1) return false;
      return nx.at === rotAt(shown[3].at, d2);
    }
  }

  if (q.category === 'lr-fanalogy') {
    var A = fig.items[0], B = fig.items[1], C = fig.items[2], D = cf;
    function one(x) { return { at: (x.inner && x.inner[0] && x.inner[0].at) || null, count: (x.inner || []).length, ofill: (x.outer && x.outer.fill) || 'none', oform: x.outer && x.outer.form, iform: x.inner && x.inner[0] && x.inner[0].form }; }
    var sA = one(A), sB = one(B), sC = one(C), sD = one(D);
    if (kx === 'rot') {
      var k2 = (ORDER8.indexOf(sB.at) - ORDER8.indexOf(sA.at) + 8) % 8;
      return sD.at === rotAt(sC.at, k2);
    }
    if (kx === 'reflect') return sB.at === MIR[sA.at] && sD.at === MIR[sC.at];
    if (kx === 'count') { var dd = sB.count - sA.count; return sD.count === sC.count + dd; }
    if (kx === 'shade') return sA.ofill === 'none' && sB.ofill === 'solid' && sD.ofill === 'solid' && sD.at === sC.at;
    if (kx === 'rotShade') {
      var k3 = (ORDER8.indexOf(sB.at) - ORDER8.indexOf(sA.at) + 8) % 8;
      return sB.ofill === 'solid' && sD.ofill === 'solid' && sD.at === rotAt(sC.at, k3);
    }
    if (kx === 'swap') return sB.oform === sA.iform && sB.iform === sA.oform && sD.oform === sC.iform && sD.iform === sC.oform;
  }

  if (q.category === 'lr-odd-fig') {
    var opts = q.optionFigures, oddIdx = parseInt(q.answer, 10) - 1;
    var rest = opts.filter(function (_, i) { return i !== oddIdx; });
    if (kx === 'count') {
      var c0 = (rest[0].inner || []).length;
      return rest.every(function (f) { return (f.inner || []).length === c0; }) && (opts[oddIdx].inner || []).length !== c0;
    }
    if (kx === 'form') {
      var f0 = rest[0].inner[0].form;
      return rest.every(function (f) { return f.inner[0].form === f0; }) && opts[oddIdx].inner[0].form !== f0;
    }
    if (kx === 'reflect') {
      var base = rest[0].segs;
      var isRot = function (s) { for (var r = 0; r < 4; r++) if (segKey(segRot(base, r)) === segKey(s)) return true; return false; };
      if (!rest.every(function (f) { return isRot(f.segs); })) return false;
      if (isRot(opts[oddIdx].segs)) return false;
      var mBase = segMirror(base);
      for (var r2 = 0; r2 < 4; r2++) if (segKey(segRot(mBase, r2)) === segKey(opts[oddIdx].segs)) return true;
      return false;
    }
  }

  if (q.category === 'lr-paper') {
    var panel = fig.kind === 'row' ? fig.items[fig.items.length - 1] : fig;
    var folds = Array.isArray(panel.fold) ? panel.fold : [panel.fold];
    var hs = panel.holes.map(function (h) { return h.slice(); });
    folds.slice().reverse().forEach(function (f) {
      var add = [];
      hs.forEach(function (h) {
        if (f === 'v') add.push([1 - h[0], h[1]]);
        else if (f === 'h') add.push([h[0], 1 - h[1]]);
        else add.push([h[1], h[0]]);
      });
      hs = hs.concat(add);
    });
    return holeKey(cf.holes) === holeKey(hs);
  }

  if (q.category === 'lr-pattern') {
    var cells = fig.cells;
    var a6 = cells[6].inner[0].at, a7 = cells[7].inner[0].at;
    var stp = (ORDER8.indexOf(a7) - ORDER8.indexOf(a6) + 8) % 8;
    if (cf.inner[0].at !== rotAt(a7, stp)) return false;
    if (kx === 'rowRot') return cf.outer.form === cells[6].outer.form;
    if (kx === 'rotForm') return cf.inner[0].form === cells[6].inner[0].form && cf.outer.form === cells[6].outer.form;
    if (kx === 'rotShade') return cf.outer.fill === 'solid' && cf.outer.form === cells[6].outer.form;
  }

  if (kx === 'embed') {
    var motif = fig.segs;
    if (!segSubset(motif, cf.segs)) return false;
    return q.optionFigures.every(function (f, i) {
      if (i === parseInt(q.answer, 10) - 1) return true;
      return !segSubset(motif, f.segs);
    });
  }
  return null;
}

var SAMPLES = 150;
CATS.forEach(function (cat) {
  ['easy', 'medium', 'hard'].forEach(function (diff) {
    var bad = 0, mismatch = 0, recomputed = 0, seenKeys = {};
    for (var i = 0; i < SAMPLES; i++) {
      var q = ENG.generate(cat, diff);
      var kx = q.subtype.split(':')[1];
      seenKeys[kx] = 1;
      var structural =
        q.category === cat &&
        q.subtype.indexOf(diff + ':') === 0 &&
        q.options && q.options.length >= 4 &&
        q.options.indexOf(q.answer) !== -1 &&
        typeof q.explanation === 'string' && q.explanation.length >= 10 &&
        (!q.optionFigures || (q.optionFigures.length === q.options.length &&
          q.optionFigures.map(key).filter(function (v, ix, arr) { return arr.indexOf(v) === ix; }).length === q.optionFigures.length)) &&
        (!q.optionFigures || q.optionFigures.every(function (f) { return LRF.render(f).length > 0; })) &&
        (!q.figure || LRF.render(q.figure).length > 0) &&
        TIER_KEYS[cat][diff].indexOf(kx) !== -1;
      if (!structural) { bad++; if (bad === 1) console.error('    structural fail: ' + cat + '/' + q.subtype); continue; }
      var rc = recompute(q);
      if (rc === false) { mismatch++; if (mismatch === 1) console.error('    recompute MISMATCH: ' + cat + '/' + q.subtype); }
      else if (rc === true) recomputed++;
    }
    ok('2 ' + cat + ' ' + diff + ' structural clean', bad === 0);
    ok('2 ' + cat + ' ' + diff + ' zero recompute mismatches', mismatch === 0);
    ok('2 ' + cat + ' ' + diff + ' recompute coverage ≥90%', recomputed >= SAMPLES * 0.9);
    if (TIER_KEYS[cat][diff].length > 1) ok('2 ' + cat + ' ' + diff + ' surfaces ≥2 archetypes', Object.keys(seenKeys).length >= 2);
  });
});

console.log('\nlr-figures.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
