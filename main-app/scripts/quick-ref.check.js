/**
 * quick-ref.check.js — integrity of the Quick-Reference revision library (ADR-084 Batch 3). Wired into `npm test`.
 *
 * Guards that every curated card references a real section, that its Learn/Practice cross-links resolve to existing
 * KnowledgeBase topics and Quant drill categories (so a card can never deep-link to a removed chapter or drill), and
 * that each block is a well-formed table or grid. This is the "zero stale links" contract for the library.
 */
'use strict';
var QR = require('../js/quick-reference/quick-ref-data.js');
var CATEGORY_LABELS = require('../services/quantTopics.js').CATEGORY_LABELS;

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + name); } }

var drillCats = Object.keys(CATEGORY_LABELS);
var learnIds = {};
['numbers', 'arithmetic', 'commercial', 'algebra', 'geometry', 'mensuration', 'modern'].forEach(function (f) {
  require('../data/knowledge/' + f + '.js').forEach(function (t) { learnIds[t.id] = 1; });
});
var secIds = QR.SECTIONS.map(function (s) { return s.id; });

console.log('quick-ref.check — Quick-Reference revision library (ADR-084)');

ok('has sections', QR.SECTIONS.length >= 4);
ok('has cards', QR.CARDS.length >= 15);

var seenId = {};
QR.CARDS.forEach(function (c) {
  ok(c.id + ' unique id', !seenId[c.id]); seenId[c.id] = 1;
  ok(c.id + ' has title', typeof c.title === 'string' && c.title.length > 0);
  ok(c.id + ' has icon', typeof c.icon === 'string' && c.icon.length > 0);
  ok(c.id + ' valid section (' + c.section + ')', secIds.indexOf(c.section) !== -1);
  ok(c.id + ' has searchTerms', Array.isArray(c.searchTerms) && c.searchTerms.length >= 1);
  if (c.learn) ok(c.id + ' learn id resolves (' + c.learn + ')', !!learnIds[c.learn]);
  if (c.drill) ok(c.id + ' drill category resolves (' + c.drill + ')', drillCats.indexOf(c.drill) !== -1);
  ok(c.id + ' has a block', !!c.block && typeof c.block.kind === 'string');
  if (c.block && c.block.kind === 'table') {
    ok(c.id + ' table headers', Array.isArray(c.block.headers) && c.block.headers.length >= 1);
    ok(c.id + ' table rows', Array.isArray(c.block.rows) && c.block.rows.length >= 1);
    (c.block.rows || []).forEach(function (r, i) { ok(c.id + ' row ' + i + ' matches header width', Array.isArray(r) && r.length === c.block.headers.length); });
  } else if (c.block && c.block.kind === 'grid') {
    ok(c.id + ' grid items', Array.isArray(c.block.items) && c.block.items.length >= 1);
    (c.block.items || []).forEach(function (it, i) { ok(c.id + ' grid item ' + i + ' has e+v', it && it.e != null && it.v != null); });
  } else {
    ok(c.id + ' block kind is table|grid', false);
  }
});

/* every section actually carries at least one card (no empty accordions) */
secIds.forEach(function (s) { ok('section ' + s + ' non-empty', QR.CARDS.some(function (c) { return c.section === s; })); });

console.log('quick-ref.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
