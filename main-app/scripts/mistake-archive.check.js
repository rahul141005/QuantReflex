/**
 * mistake-archive.check.js — the Mistake Archive foundation harness (ADR-111 Phase F-M8). Runs in npm test.
 *
 * Proves the durable archive is correct and forward-compatible: the v2 record schema + capture across EVERY engine
 * (Quant, DI, LR, LR-visual, authored, and the shared-context SETS), reproduce-the-attempt-exactly, backward-compatible
 * v1→v2 upgrade, stable-id uniqueness, the merge-by-id reconciliation that keeps offline cache and cloud free of
 * duplicates / loss / corruption, the query layer (filter / sort / search / facets), the mutation API surface, and the
 * i18n `lang` stamping. Pure logic — no DOM / localStorage; the module is require()'d directly.
 */
'use strict';

var path = require('path');
var A = require(path.join(__dirname, '..', 'js', 'mistake-archive.js'));

var failures = 0;
function ok(cond, msg) { if (cond) return; failures++; console.error('  ✗ ' + msg); }
function section(name) { console.log('\n' + name); }

console.log('mistake-archive.check — durable Mistake Archive foundation (ADR-111 F-M8)');

/* representative wrong-answer questions per engine (the shape the drill passes to recordAnswer). */
var Q = {
  quant: { question: '15% of 240 = ?', answer: 36, category: 'percentages', subtype: 'easy:pct' },
  di: { question: 'From the bar chart, sales in Q2?', answer: '42', category: 'di-bar', subtype: 'medium:read', options: ['42', '50', '38', '44'], chart: { kind: 'bar', labels: ['Q1', 'Q2'], values: [30, 42] } },
  lr: { question: 'All A are B. Some B are C. Conclusion?', answer: 'Does not follow', category: 'lr-syllogism', subtype: 'medium:syllogism', options: ['Follows', 'Does not follow'] },
  lrv: { question: 'Mirror image of the figure?', answer: '2', category: 'lr-mirror', subtype: 'easy:mirror', options: ['1', '2', '3', '4'], figure: { kind: 'glyph', text: 'F', flip: 'none' }, optionFigures: [{ kind: 'glyph', text: 'F', flip: 'h' }, { kind: 'glyph', text: 'F', flip: 'v' }] },
  authored: { question: 'Which assumption is implicit?', answer: 'B', category: 'cr-assumption', subtype: 'hard:cr', options: ['A', 'B', 'C', 'D'] },
  lrSet: { question: 'Who sits third from left?', answer: 'Ravi', category: 'lr-seating', subtype: 'medium:seat', options: ['Ravi', 'Sita', 'Amit', 'Neha'] },
  diCaselet: { question: 'From the caselet, total employees?', answer: '120', category: 'di-caselet', subtype: 'medium:caselet', options: ['120', '140', '100', '130'], context: 'A firm has two divisions…' }
};

/* ── 1. Schema + capture across every engine ── */
section('1. v2 record schema + capture across every engine');
var recs = {};
Object.keys(Q).forEach(function (k, i) {
  var r = A.buildRecord(Q[k], { ts: 1000 + i, date: 'Mon Jan 01 2024', lang: (i % 3 === 0 ? 'hi' : i % 3 === 1 ? 'mr' : 'en'), selected: 'wrong' + i, timeMs: 3000 + i, source: 'drill', sessionType: 'Quick Math' });
  recs[k] = r;
  ok(r.v === A.SCHEMA_VERSION, k + ': schema version stamped');
  ok(!!r.id, k + ': stable id present');
  ok(r.answer === String(Q[k].answer), k + ': correct answer preserved');
  ok(r.selected === 'wrong' + i, k + ': selected answer captured');
  ok(typeof r.timeMs === 'number', k + ': timing captured');
  ok(r.lang === (i % 3 === 0 ? 'hi' : i % 3 === 1 ? 'mr' : 'en'), k + ': study language stamped');
  ok(r.source === 'drill' && r.sessionType === 'Quick Math', k + ': source + session type captured');
  /* every reserved learning field present */
  ['reviewCount', 'lastReviewedTs', 'bookmarked', 'resolved', 'gen'].forEach(function (f) { ok(f in r, k + ': reserved field ' + f + ' present'); });
});
ok(recs.quant.engine === 'quant' && recs.di.engine === 'di' && recs.lr.engine === 'lr' && recs.lrv.engine === 'lrv' && recs.authored.engine === 'authored' && recs.lrSet.engine === 'lr-set', 'engine classified per category');
ok(recs.quant.difficulty === 'easy' && recs.authored.difficulty === 'hard', 'difficulty derived from subtype');

/* ── 2. Reproduce the attempt exactly (frozen rendering incl. machine specs) ── */
section('2. Reproduce the original attempt exactly');
ok(!!recs.di.chart && recs.di.chart.values[1] === 42, 'DI chart spec stored for exact reproduce');
ok(!!recs.lrv.figure && recs.lrv.optionFigures && recs.lrv.optionFigures.length === 2, 'LR-visual figure + optionFigures stored');
var rq = A.toReviewQuestion(recs.lrv);
ok(rq.question === Q.lrv.question && rq.answer === '2' && rq.figure && rq.optionFigures && rq._fromArchive, 'toReviewQuestion reconstructs the exact drill question');
var rqDi = A.toReviewQuestion(recs.di);
ok(rqDi.chart && rqDi.options && rqDi.options.length === 4, 'DI review question carries chart + options');

/* ── 3. Reviewability across engines (SETs excluded) ── */
section('3. Cross-engine reviewability (shared-context SETs excluded)');
ok(A.isReviewable(recs.quant), 'quant numeric reviewable');
ok(A.isReviewable(recs.di), 'DI single (chart stored) reviewable');
ok(A.isReviewable(recs.lr), 'LR text-MCQ reviewable');
ok(A.isReviewable(recs.lrv), 'LR-visual (figure stored) reviewable');
ok(A.isReviewable(recs.authored), 'authored CR reviewable');
ok(!A.isReviewable(recs.lrSet), 'lr-seating SET NOT reviewable');
ok(!A.isReviewable(recs.diCaselet), 'di-caselet SET NOT reviewable');

/* ── 4. Backward-compatible v1 → v2 upgrade ── */
section('4. Backward-compatible v1 → v2 upgrade');
var v1 = { question: 'Old mistake', answer: 'x', category: 'ratios', options: ['x', 'y', 'z'], explanation: 'because', subtype: 'medium:ratio', date: 'Tue Feb 06 2024' };
var up = A.normalize(v1);
ok(up.v === A.SCHEMA_VERSION && !!up.id && up.engine === 'quant', 'v1 record upgraded with id + engine');
ok(up.ts > 0 && up.lang === 'en' && up.reviewCount === 0 && up.bookmarked === false, 'v1 defaults filled (ts from date, lang en, learning fields)');
ok(A.normalize(up) === up, 'normalize is idempotent on a current record');
ok(up.question === 'Old mistake' && up.options.length === 3, 'v1 content preserved through upgrade');
/* unknown future field preserved */
var future = A.normalize({ question: 'q', answer: 'a', category: 'squares', ts: 5, futureField: { deep: 42 } });
ok(future.futureField && future.futureField.deep === 42, 'unknown future field preserved untouched');

/* ── 5. Stable-id uniqueness ── */
section('5. Stable-id uniqueness + determinism');
ok(A.stableId('q', 's', 100) === A.stableId('q', 's', 100), 'stableId deterministic for same inputs');
ok(A.stableId('q', 's', 100) !== A.stableId('q', 's', 101), 'different ts → different id');
ok(A.stableId('q1', 's', 100) !== A.stableId('q2', 's', 100), 'different question → different id');
var ids = {}; var coll = 0;
for (var i = 0; i < 2000; i++) { var id = A.stableId('question ' + (i % 500), 'sel', 1700000000000 + i); if (ids[id]) coll++; ids[id] = 1; }
ok(coll === 0, 'no id collisions across 2000 distinct attempts');

/* ── 6. Merge-by-id: no duplication / loss / corruption (offline ↔ cloud) ── */
section('6. Sync reconciliation: no duplication, loss, or corruption');
var local = [A.buildRecord(Q.quant, { ts: 10, selected: 'a', source: 'drill' }), A.buildRecord(Q.di, { ts: 20, selected: 'b', source: 'drill' })];
var cloud = [A.buildRecord(Q.lr, { ts: 30, selected: 'c', source: 'drill' }), A.buildRecord(Q.quant, { ts: 10, selected: 'a', source: 'drill' })];  /* quant is the SAME attempt on both */
var merged = A.mergeMistakes(local, cloud);
ok(merged.length === 3, 'union dedups the shared attempt (3, not 4)');
var mIds = merged.map(function (r) { return r.id; });
ok(new Set(mIds).size === 3, 'no duplicate ids after merge');
ok(mIds.indexOf(local[0].id) !== -1 && mIds.indexOf(local[1].id) !== -1 && mIds.indexOf(cloud[0].id) !== -1, 'no mistake lost across the merge');
/* learning state OR-merged: a bookmark on one side + a resolution on the other both survive */
var side1 = Object.assign({}, local[0], { bookmarked: true });
var side2 = Object.assign({}, local[0], { resolved: true, reviewCount: 3 });
var lm = A.mergeMistakes([side1], [side2]);
ok(lm.length === 1 && lm[0].bookmarked === true && lm[0].resolved === true && lm[0].reviewCount === 3, 'learning state (bookmark/resolve/reviewCount) OR-merged, not clobbered');
/* order: sorted by ts desc; cap enforced */
ok(merged[0].ts >= merged[1].ts && merged[1].ts >= merged[2].ts, 'merged list sorted newest-first');
var many = []; for (var j = 0; j < 150; j++) many.push(A.buildRecord({ question: 'q' + j, answer: '1', category: 'squares' }, { ts: j }));
ok(A.mergeMistakes(many, []).length === A.CAP, 'cap-' + A.CAP + ' enforced (' + A.CAP + ' most-recent kept)');
/* idempotent: merging a list with itself changes nothing */
ok(A.mergeMistakes(merged, merged).length === 3, 'merge is idempotent (self-merge is a no-op)');

/* ── 7. Query: filter / sort / search / facets ── */
section('7. Query layer: filter / sort / search / facets');
var all = [
  A.buildRecord(Q.quant, { ts: 100, lang: 'hi', selected: '1', source: 'drill' }),
  A.buildRecord(Q.di, { ts: 200, lang: 'mr', selected: '2', source: 'timedTest' }),
  A.buildRecord(Q.lrv, { ts: 300, lang: 'hi', selected: '3', source: 'drill' }),
  A.buildRecord(Q.authored, { ts: 400, lang: 'en', selected: 'A', source: 'drill' })
];
ok(A.query(all, { engine: 'lrv' }).length === 1, 'filter by engine');
ok(A.query(all, { lang: 'hi' }).length === 2, 'filter by language');
ok(A.query(all, { source: 'timedTest' }).length === 1, 'filter by source');
ok(A.query(all, { difficulty: 'hard' }).length === 1, 'filter by difficulty');
ok(A.query(all, { search: 'chart' }).length === 1, 'search over question text (case-insensitive)');
ok(A.query(all, { search: 'CHART' }).length === 1, 'search is case-insensitive');
var byTsDesc = A.query(all, { sort: 'ts', dir: 'desc' });
ok(byTsDesc[0].ts === 400 && byTsDesc[3].ts === 100, 'sort by ts desc');
var byDiffAsc = A.query(all, { sort: 'difficulty', dir: 'asc' }).map(function (r) { return r.difficulty; });
ok(byDiffAsc[0] === 'easy', 'sort by difficulty asc');
ok(A.query(all, { limit: 2 }).length === 2, 'limit honoured');
var f = A.facets(all);
ok(f.engines.lrv === 1 && f.langs.hi === 2 && f.sources.drill === 3, 'facets counts distinct values');

/* ── 8. Long-term extensibility (F-M8 final audit): the 10 future capabilities ── */
section('8. Long-term extensibility — future capabilities accommodated without breaking compatibility');
var e0 = A.buildRecord(Q.quant, { ts: 5000, lang: 'en', selected: '30', source: 'drill' });
/* reserved namespaces present + additive schema */
ok('ext' in e0 && typeof e0.ext === 'object', 'reserved `ext` namespace present (AI coaching notes / personalized feedback / tags)');
ok('gen' in e0, 'gen provenance present (future exact re-generation)');
/* AI coaching: writing under ext survives normalize untouched */
var withNote = A.normalize(Object.assign({}, e0, { ext: { aiReview: { note: 'watch sign errors', tags: ['careless'] } } }));
ok(withNote.ext.aiReview.note === 'watch sign errors' && withNote.ext.aiReview.tags[0] === 'careless', 'AI coaching feedback stored under ext survives normalize');
/* spaced repetition: scheduling fields + SM-2 transition */
ok('dueTs' in e0 && 'interval' in e0 && typeof e0.ease === 'number', 'spaced-repetition fields present (dueTs / interval / ease)');
var sr1 = A.scheduleReview(e0, true, 1000000);
ok(sr1.interval === 1 && sr1.dueTs === 1000000 + 86400000 && sr1.reviewCount === 1 && sr1.resolved === true, 'scheduleReview(correct) → 1-day interval, due tomorrow, resolved');
var sr2 = A.scheduleReview(Object.assign({}, e0, sr1), true, 2000000);
ok(sr2.interval === 3 && sr2.reviewCount === 2, 'scheduleReview second success → 3-day interval');
var srFail = A.scheduleReview(Object.assign({}, e0, sr2), false, 3000000);
ok(srFail.interval === 1 && srFail.ease < sr2.ease && srFail.resolved === false, 'scheduleReview(fail) → reset to 1 day, ease drops, unresolved');
/* bookmarks + weak-topic + coaching analytics already asserted in §1/§7 (bookmarked field, query, facets) */
ok('bookmarked' in e0, 'bookmarks/favorites field present');
ok(typeof A.facets === 'function' && typeof A.query === 'function', 'weak-topic detection + coaching analytics via query()/facets()');
/* difficulty progression history + multiple attempts on the same question: stable qkey groups attempts */
var a1 = A.buildRecord(Q.quant, { ts: 100, selected: '30', source: 'drill' });
var a2 = A.buildRecord(Q.quant, { ts: 200, selected: '32', source: 'drill' });   // SAME question, later attempt, different answer
ok(a1.qkey === a2.qkey && a1.id !== a2.id, 'same question across attempts → same qkey, different id (multiple attempts tracked)');
var grouped = A.groupByQuestion([a1, a2, A.buildRecord(Q.di, { ts: 300 })]);
ok(grouped[a1.qkey] && grouped[a1.qkey].length === 2 && Object.keys(grouped).length === 2, 'groupByQuestion buckets attempts by question (progression history)');
ok(grouped[a1.qkey][0].ts === 200, 'grouped attempts sorted newest-first');
/* user export / import: round-trip, and import merge-dedups (no duplication / corruption) */
var payload = A.exportArchive([a1, a2]);
ok(payload.schema === A.SCHEMA_VERSION && payload.count === 2 && Array.isArray(payload.mistakes), 'exportArchive produces a self-describing portable payload');
var imported = A.importArchive([a1], payload);   // a1 already present → must dedup
ok(imported.length === 2, 'importArchive merges deduped (re-import cannot duplicate)');
/* cross-device sync already asserted in §6 (mergeMistakes) */
ok(typeof A.mergeMistakes === 'function', 'cross-device synchronization via mergeMistakes (merge-by-id)');
/* future engines / question types: unknown category classifies safely; a future engine's record-level spec/field is
   preserved by the additive schema (normalize never drops unknown record fields → new engines extend without breaking) */
var fut = A.buildRecord({ question: 'new engine q', answer: '1', category: 'xy-newtype', subtype: 'medium:new' }, { ts: 9 });
ok(fut.engine === 'quant', 'unknown future category classifies to safe default engine');
var futWithNewSpec = A.normalize(Object.assign({}, fut, { newSpec: { grid: [[1, 2]] } }));
ok(futWithNewSpec.newSpec && futWithNewSpec.newSpec.grid[0][1] === 2, 'a future engine record-level spec field is preserved through normalize (future question types)');
/* schema version bumped, backward-compatible: a v2 record (no qkey/ext) upgrades in place */
var v2rec = { v: 2, id: 'mabc', ts: 50, question: 'legacy v2', answer: 'z', category: 'squares', options: null, reviewCount: 1, bookmarked: true };
var v3 = A.normalize(v2rec);
ok(v3.v === A.SCHEMA_VERSION && v3.qkey && v3.ext && v3.interval === 0 && v3.ease === 2.5, 'v2 record upgrades to v3 (qkey/ext/SR fields backfilled)');
ok(v3.bookmarked === true && v3.reviewCount === 1, 'v2 learning state preserved through the v3 upgrade');
ok(A.normalize(v3) === v3, 'normalize idempotent on a current v3 record');

if (failures) { console.error('\n✗ mistake-archive.check FAILED with ' + failures + ' failure(s).'); process.exit(1); }
console.log('\n✓ mistake-archive.check passed — durable archive schema, cross-engine capture/replay, backward-compat, sync-merge integrity, and query layer are correct.');
