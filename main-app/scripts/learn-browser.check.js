/**
 * learn-browser.check.js — verifies the Learn engine's BROWSER code path + script load order (ADR-069, Phase 2).
 *
 * The node checks load the modules via require() (the node branch of each dual-export). This harness instead runs
 * the real files in a simulated BROWSER context (a `window` + a tiny `document` stub, and NO `require`/`module`),
 * in the SAME script order as index.html — so it proves the browser branches wire up correctly: the registry sees
 * `window.KnowledgeSchema`, the data modules self-register via `window.KnowledgeBase`, search + renderers expose
 * their globals, and everything resolves with no missing-global / load-order bug. Catches issues a require()-based
 * test cannot.  node scripts/learn-browser.check.js
 */
'use strict';
var vm = require('vm');
var fs = require('fs');
var path = require('path');

/* ---- minimal DOM stub (only createElement is needed; renderers build nodes) ---- */
function makeNode() {
  return {
    tagName: '', className: '', innerHTML: '', textContent: '', attrs: {}, children: [],
    appendChild: function (c) { this.children.push(c); return c; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }
  };
}
var win = {};
var sandbox = {
  window: win,
  document: { createElement: function (t) { var n = makeNode(); n.tagName = String(t).toUpperCase(); return n; } },
  console: console
};
sandbox.self = win;
var ctx = vm.createContext(sandbox);

/* Load the Learn engine in index.html order (registry before data modules). */
['js/knowledge/schema.js', 'js/knowledge/registry.js', 'js/knowledge/blocks.js',
 'data/knowledge/categories.js', 'data/knowledge/numbers.js', 'data/knowledge/arithmetic.js',
 'data/knowledge/commercial.js', 'data/knowledge/modern.js', 'data/knowledge/mensuration.js',
 'data/knowledge/di.js',
 'data/knowledge/lr.js',
 'js/learn/learn-search.js'].forEach(function (rel) {
  var code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
});

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }

console.log('learn-browser.check — Learn engine browser path + load order (ADR-069 Phase 2)');

ok('window.KnowledgeSchema present', !!win.KnowledgeSchema);
ok('window.KnowledgeBase present', !!win.KnowledgeBase);
ok('window.BlockRenderers present', !!win.BlockRenderers);
ok('window.LearnSearch present', !!win.LearnSearch);

ok('data modules self-registered (42 topics: 19 Quant + 6 DI + 17 LR)', win.KnowledgeBase && win.KnowledgeBase.count() === 42);
ok('all seven categories resolved (incl. DI + LR)', (function () {
  var ids = (win.KnowledgeBase.categories() || []).map(function (c) { return c.id; });
  return ['numbers', 'arithmetic', 'commercial-math', 'modern-math', 'mensuration', 'di-charts', 'lr-reasoning'].every(function (c) { return ids.indexOf(c) !== -1; });
})());
ok('graph integrity clean in browser path', win.KnowledgeBase.validateAll().length === 0);

ok('search works in browser path ("percent" → percentages)', (function () {
  win.LearnSearch.build();
  var r = win.LearnSearch.query('percent');
  return r.length && r[0].id === 'percentages';
})());

ok('renderer works in browser path (overview)', (function () {
  var n = win.BlockRenderers.render({ type: 'overview', text: 'hi' });
  return n && n.className === 'kx-overview';
})());
ok('renderer resolves related title via window.KnowledgeBase', (function () {
  var n = win.BlockRenderers.render({ type: 'related', ids: ['profit-loss'] });
  // child chip text should be the TITLE "Profit & Loss", not the slug
  return n && n.children[0] && String(n.children[0].innerHTML).indexOf('Profit') !== -1;
})());

console.log('\nlearn-browser.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
