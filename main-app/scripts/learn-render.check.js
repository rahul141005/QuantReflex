/**
 * learn-render.check.js — smoke tests for the knowledge block renderers (ADR-069, Phase 2).
 *
 * blocks.js is DOM-driven, so we give it a tiny document stub (no jsdom dependency) and assert each renderer
 * produces a node with the expected tag/class/content and that unknown blocks return null. This is the coverage
 * that lets the renderer ship (the Phase-1 audit deferred it precisely because it was untested).
 *   node scripts/learn-render.check.js
 */
'use strict';
var path = require('path');

/* ---- minimal DOM stub ---- */
function makeNode() {
  return {
    tagName: '', className: '', innerHTML: '', attrs: {}, children: [],
    appendChild: function (c) { this.children.push(c); return c; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    querySelector: function () { return null; }
  };
}
global.document = { createElement: function (tag) { var n = makeNode(); n.tagName = String(tag).toUpperCase(); return n; } };

var BR = require(path.join(__dirname, '..', 'js', 'knowledge', 'blocks.js'));

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }
function txtIncludes(node, needle) {
  if (!node) return false;
  if (String(node.innerHTML).indexOf(needle) !== -1) return true;
  return (node.children || []).some(function (c) { return txtIncludes(c, needle); });
}
function hasClass(node, cls) {
  if (!node) return false;
  if (String(node.className).indexOf(cls) !== -1) return true;
  return (node.children || []).some(function (c) { return hasClass(c, cls); });
}

console.log('learn-render.check — knowledge block renderers (ADR-069 Phase 2)');

ok('overview → kx-overview + text', (function () { var n = BR.render({ type: 'overview', text: 'Hello world' }); return n && n.className === 'kx-overview' && txtIncludes(n, 'Hello world'); })());
ok('concept → title + body', (function () { var n = BR.render({ type: 'concept', title: 'Mean', body: 'the average' }); return hasClass(n, 'kx-concept') && txtIncludes(n, 'Mean') && txtIncludes(n, 'the average'); })());
ok('formula → reuses .formula-block + expr', (function () { var n = BR.render({ type: 'formula', items: [{ name: 'A', expr: 'x=1', when: 'always' }] }); return hasClass(n, 'formula-block') && txtIncludes(n, 'x=1') && txtIncludes(n, 'always'); })());
ok('trick → kx-trick list', (function () { var n = BR.render({ type: 'trick', title: 'T', items: ['do this', { text: 'and that' }] }); return hasClass(n, 'kx-trick') && txtIncludes(n, 'do this') && txtIncludes(n, 'and that'); })());
ok('trap → kx-trap list', (function () { var n = BR.render({ type: 'trap', items: ['watch out'] }); return hasClass(n, 'kx-trap') && txtIncludes(n, 'watch out'); })());
ok('memory → kx-memory + text', (function () { var n = BR.render({ type: 'memory', text: 'mnemonic' }); return hasClass(n, 'kx-memory') && txtIncludes(n, 'mnemonic'); })());
ok('example → problem/steps/answer', (function () { var n = BR.render({ type: 'example', problem: 'P', steps: ['s1', 's2'], answer: '42' }); return hasClass(n, 'kx-example') && txtIncludes(n, 'P') && txtIncludes(n, 's1') && txtIncludes(n, '42'); })());
ok('table → reuses .math-table', (function () { var n = BR.render({ type: 'table', caption: 'Cap', headers: ['a', 'b'], rows: [['1', '2']] }); return hasClass(n, 'kx-table-wrap') && txtIncludes(n, 'math-table') && txtIncludes(n, 'Cap') && txtIncludes(n, '1'); })());
ok('revision → kx-revision points', (function () { var n = BR.render({ type: 'revision', points: ['p1', 'p2'] }); return hasClass(n, 'kx-revision') && txtIncludes(n, 'p1'); })());
ok('related → chips with href', (function () { var n = BR.render({ type: 'related', ids: ['profit-loss'] }); return hasClass(n, 'kx-chip') && n.children[0].attrs.href.indexOf('#learn/profit-loss') === 0; })());
ok('unknown block → null', BR.render({ type: 'video', src: 'x' }) === null);
ok('null block → null', BR.render(null) === null);
/* XSS: angle brackets in content are escaped, not interpreted */
ok('content is HTML-escaped', (function () { var n = BR.render({ type: 'overview', text: '<script>x</script>' }); return txtIncludes(n, '&lt;script&gt;') && !txtIncludes(n, '<script>x'); })());

console.log('\nlearn-render.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
