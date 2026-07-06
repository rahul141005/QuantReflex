/**
 * report.check.js — contract tests for the Reporting System (ADR-096). Wired into `npm test`.
 *
 * Exercises the PURE logic (no Firestore / no DOM) that the request-path handler and the browser modal
 * rely on, and enforces the enum LOCKSTEP that keeps the three surfaces (shared constants, server inline
 * copy, browser modal) in agreement:
 *   • Enum lockstep: shared/constants/report-types.js ⇄ api/_lib/report-schema.js
 *   • report-types cross-consistency (groups, default priorities, sub-reasons, in-drill set)
 *   • validateCreatePayload accept/reject + normalization (source forced, caps, control-char strip, rating clamp)
 *   • signature stability + collision-resistance
 *   • rate-limit + dedupe decisions (hour/day; clientKey + type+signature window)
 *   • shortId format; sanitizeContext / sanitizeQuestion shape + byte-cap guards
 *   node scripts/report.check.js
 */
'use strict';
var path = require('path');
var p = function (f) { return path.join(__dirname, '..', f); };

var RT = require(p('../shared/constants/report-types.js'));   // canonical enums (this check's reference)
var BR = require(p('js/ui/report-taxonomy.js'));               // the LOCAL browser copy the modal actually loads (ADR-099)
var S = require(p('api/_lib/report-schema.js'));               // server inline copy + pure validation

var pass = 0, fail = 0, shown = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; if (shown++ < 40) console.error('  ✗ ' + name); } }
function arrEq(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

/* ───────── 1. Enum lockstep (shared ⇄ server) ───────── */
ok('STATUSES lockstep', arrEq(RT.STATUSES, S.STATUSES));
ok('OPEN_STATUSES lockstep', arrEq(RT.OPEN_STATUSES, S.OPEN_STATUSES));
ok('PRIORITIES lockstep', arrEq(RT.PRIORITIES, S.PRIORITIES));
ok('TYPES id set lockstep', arrEq(RT.TYPES.map(function (t) { return t.id; }), S.TYPES));
RT.TYPES.forEach(function (t) {
  var m = S.TYPE_META[t.id];
  ok('server meta exists for ' + t.id, !!m);
  if (!m) return;
  ok(t.id + ' group lockstep', m.group === t.group);
  ok(t.id + ' defaultPriority lockstep', m.defaultPriority === t.defaultPriority);
  ok(t.id + ' subReasons lockstep', arrEq((t.subReasons || []).map(function (s) { return s.id; }), m.subReasons));
});
['title', 'description', 'note', 'expected', 'actual', 'repro', 'benefit'].forEach(function (k) {
  ok('FIELD_LIMITS.' + k + ' lockstep', RT.FIELD_LIMITS[k] === S.FIELD_LIMITS[k]);
});
['maxPerHour', 'maxPerDay', 'dedupeWindowMs'].forEach(function (k) {
  ok('RATE_LIMIT.' + k + ' lockstep', RT.RATE_LIMIT[k] === S.RATE_LIMIT[k]);
});

/* ───────── 1b. Browser taxonomy lockstep (ADR-099): the LOCAL js/ui/report-taxonomy.js the modal actually
   loads must be byte-identical (on the enum-bearing data) to the canonical shared/constants/report-types.js.
   This is the 4th surface — a mismatch here is exactly the class of bug that made the grid render empty. ───────── */
ok('browser STATUSES lockstep', arrEq(BR.STATUSES, RT.STATUSES));
ok('browser OPEN_STATUSES lockstep', arrEq(BR.OPEN_STATUSES, RT.OPEN_STATUSES));
ok('browser PRIORITIES lockstep', arrEq(BR.PRIORITIES, RT.PRIORITIES));
ok('browser TYPES id set lockstep', arrEq(BR.TYPES.map(function (t) { return t.id; }), RT.TYPES.map(function (t) { return t.id; })));
RT.TYPES.forEach(function (t) {
  var b = BR.typeById(t.id);
  ok('browser type ' + t.id + ' present', !!b);
  if (!b) return;
  ok('browser ' + t.id + ' label lockstep', b.label === t.label);
  ok('browser ' + t.id + ' group lockstep', b.group === t.group);
  ok('browser ' + t.id + ' defaultPriority lockstep', b.defaultPriority === t.defaultPriority);
  ok('browser ' + t.id + ' inDrill lockstep', b.inDrill === t.inDrill);
  ok('browser ' + t.id + ' helper present', typeof b.helper === 'string' && b.helper.length > 0);
  ok('browser ' + t.id + ' subReasons lockstep', arrEq((t.subReasons || []).map(function (s) { return s.id; }), (b.subReasons || []).map(function (s) { return s.id; })));
});
ok('browser GROUPS present', Array.isArray(BR.GROUPS) && BR.GROUPS.length === 5);
BR.GROUPS.forEach(function (g) {
  ok('group ' + g.id + ' well-formed', !!g.id && !!g.label && !!g.helper);
  ok('group ' + g.id + ' has ≥1 type', BR.typesForGroup(g.id).length > 0);
});
/* The taxonomy must never be empty — the whole point of the P0 fix + the modal's defensive fallback. */
ok('browser taxonomy is non-empty', BR.TYPES.length >= 12);

/* ───────── 2. report-types cross-consistency ───────── */
var VALID_GROUPS = ['question', 'ai', 'learn', 'app', 'account', 'other'];
RT.TYPES.forEach(function (t) {
  ok(t.id + ' has a label', typeof t.label === 'string' && t.label.length > 0);
  ok(t.id + ' has a valid group', VALID_GROUPS.indexOf(t.group) !== -1);
  ok(t.id + ' has a valid default priority', RT.PRIORITIES.indexOf(t.defaultPriority) !== -1);
  ok(t.id + ' has fields[]', Array.isArray(t.fields));
  ok(t.id + ' has a helper', typeof t.helper === 'string' && t.helper.length > 0);
  (t.subReasons || []).forEach(function (s) { ok(t.id + ' subReason ' + s.id + ' well-formed', !!s.id && !!s.label); });
});
ok('all in-drill types are question-group', RT.typesForDrill().every(function (t) { return t.group === 'question'; }));
ok('all question-group types are in-drill', RT.typesForGroup('question').every(function (t) { return t.inDrill; }));
ok('exactly 12 in-drill (question) types', RT.typesForDrill().length === 12);
/* ADR-099 new types are present with the intended triage seeds. */
ok('solution_wrong exists (question, high)', S.groupFor('solution_wrong') === 'question' && S.defaultPriorityFor('solution_wrong') === 'high');
ok('formula_wrong exists (question, high)', S.groupFor('formula_wrong') === 'question' && S.defaultPriorityFor('formula_wrong') === 'high');
ok('difficulty_mismatch exists (question, low)', S.groupFor('difficulty_mismatch') === 'question' && S.defaultPriorityFor('difficulty_mismatch') === 'low');
ok('question_other exists (question)', S.groupFor('question_other') === 'question');
ok('ui_issue exists (app)', S.groupFor('ui_issue') === 'app');
ok('ai_issue is its own group', S.groupFor('ai_issue') === 'ai');
/* ADR-100: Learn topic type + MCQ-only flag. */
ok('learn_issue is its own group', S.groupFor('learn_issue') === 'learn' && RT.typeById('learn_issue') && RT.typeById('learn_issue').group === 'learn');
ok('learn_issue is not in-drill', !RT.typeById('learn_issue').inDrill);
ok('learn_issue not in the Settings chooser GROUPS', RT.GROUPS.every(function (g) { return g.id !== 'learn'; }));
ok('learn_issue subReasons lockstep (shared⇄server)', arrEq(RT.typeById('learn_issue').subReasons.map(function (s) { return s.id; }), S.TYPE_META.learn_issue.subReasons));
ok('isValidSubReason(learn_issue,concept)', S.isValidSubReason('learn_issue', 'concept') && RT.isValidSubReason('learn_issue', 'concept'));
ok('isValidSubReason(learn_issue,formula)', S.isValidSubReason('learn_issue', 'formula'));
ok('options_wrong is mcqOnly (shared⇄browser)', RT.typeById('options_wrong').mcqOnly === true && BR.typeById('options_wrong').mcqOnly === true);
ok('answer_wrong is NOT mcqOnly (applies to typed too)', !RT.typeById('answer_wrong').mcqOnly);
ok('legacy question_wrong is GONE from the taxonomy', !S.isValidType('question_wrong') && !RT.isValidType('question_wrong'));
ok('legacy formatting is GONE from the taxonomy', !S.isValidType('formatting') && !RT.isValidType('formatting'));
ok('defaultPriorityFor(answer_wrong)=critical', RT.defaultPriorityFor('answer_wrong') === 'critical' && S.defaultPriorityFor('answer_wrong') === 'critical');
ok('defaultPriorityFor(typo)=low', S.defaultPriorityFor('typo') === 'low');
ok('isValidSubReason(visual,chart_wrong)', S.isValidSubReason('visual', 'chart_wrong') && RT.isValidSubReason('visual', 'chart_wrong'));
ok('isValidSubReason(ai_issue,flawed_reasoning)', S.isValidSubReason('ai_issue', 'flawed_reasoning') && RT.isValidSubReason('ai_issue', 'flawed_reasoning'));
ok('isValidSubReason(ai_issue,poor_reasoning) false (renamed away)', !S.isValidSubReason('ai_issue', 'poor_reasoning'));
ok('isValidSubReason(visual,null) ok (optional)', S.isValidSubReason('visual', null));
ok('isValidSubReason(bug,anything) false (no subReasons)', !S.isValidSubReason('bug', 'nope'));
ok('isOpenStatus(open) true / (resolved) false', S.isOpenStatus('open') && !S.isOpenStatus('resolved'));

/* ───────── 3. validateCreatePayload ───────── */
/* A realistic in-drill question snapshot (server-side shape: `questionText`). Real in-drill reports always
   attach this, so a 2-tap question report carries substance without any typed text. */
var Q = { questionId: 'Qx', category: 'ratios', questionText: 'If a:b=2:3, find a:c' };
var v;
v = S.validateCreatePayload({ type: 'nope' });
ok('reject unknown type', !v.ok && v.code === 'INVALID_TYPE');
v = S.validateCreatePayload({ type: 'visual', subReason: 'zzz', source: 'drill', question: Q });
ok('reject invalid subReason', !v.ok && v.code === 'INVALID_SUBREASON');
v = S.validateCreatePayload({ type: 'bug', source: 'settings' });
ok('reject empty app report', !v.ok && v.code === 'EMPTY_REPORT');
v = S.validateCreatePayload({ type: 'answer_wrong', source: 'drill', question: Q });
ok('accept in-drill question report with no text (2-tap, question attached)', v.ok && v.clean.type === 'answer_wrong');
ok('question report seeds critical priority', v.ok && v.clean.priority === 'critical');
/* ADR-099-verify: the substance guard gates on MATERIALIZED content, not the (spoofable) client source. */
ok('reject empty Settings question report (no question attached)', !S.validateCreatePayload({ type: 'answer_wrong', source: 'settings' }).ok);
ok('reject in-drill question report with NO question attached', S.validateCreatePayload({ type: 'answer_wrong', source: 'drill' }).code === 'EMPTY_REPORT');
ok('reject junk feedback masquerading as ai_explain (no ai bundle)', S.validateCreatePayload({ type: 'feedback', source: 'ai_explain' }).code === 'EMPTY_REPORT');
ok('reject junk bug masquerading as ai_explain (no ai bundle)', S.validateCreatePayload({ type: 'bug', source: 'ai_explain' }).code === 'EMPTY_REPORT');
ok('accept Settings question report with a note', S.validateCreatePayload({ type: 'answer_wrong', source: 'settings', description: 'the 3rd MCQ marks B but it is C' }).ok);
/* ADR-099 new types validate + seed as intended (in-drill, question attached). */
ok('accept in-drill solution_wrong', S.validateCreatePayload({ type: 'solution_wrong', source: 'drill', question: Q }).ok);
ok('accept in-drill difficulty_mismatch', S.validateCreatePayload({ type: 'difficulty_mismatch', source: 'drill', question: Q }).ok);
ok('ui_issue needs substance', S.validateCreatePayload({ type: 'ui_issue', source: 'settings' }).code === 'EMPTY_REPORT');
ok('ui_issue accepts a description', S.validateCreatePayload({ type: 'ui_issue', source: 'settings', description: 'buttons overlap' }).ok);
v = S.validateCreatePayload({ type: 'bug', description: 'It broke', source: 'settings' });
ok('accept app report with description', v.ok && v.clean.description === 'It broke');
ok('server-seeds priority (never trusts body)', S.validateCreatePayload({ type: 'bug', description: 'x', priority: 'critical' }).clean.priority === 'high');

/* source is forced from body.source only to the two allowed values */
ok('source forced to settings by default', S.validateCreatePayload({ type: 'feedback', description: 'hi' }).clean.source === 'settings');
ok('source drill honored', S.validateCreatePayload({ type: 'typo', source: 'drill', question: Q }).clean.source === 'drill');
ok('context.app.source cannot be spoofed', S.validateCreatePayload({ type: 'typo', source: 'drill', question: Q, context: { app: { source: 'HACK' } } }).clean.context.app.source === 'drill');

/* caps + control-char strip + spaces preserved */
var longDesc = new Array(5000).join('x');
v = S.validateCreatePayload({ type: 'bug', description: longDesc, source: 'settings' });
ok('description capped to FIELD_LIMITS.description', v.clean.description.length === RT.FIELD_LIMITS.description);
v = S.validateCreatePayload({ type: 'bug', title: 'hi  there', description: 'ok', source: 'settings' });
ok('control chars stripped but spaces kept', v.clean.title === 'hi there');
v = S.validateCreatePayload({ type: 'feedback', description: 'great', fields: { rating: 9 }, source: 'settings' });
ok('rating clamped to 5', v.clean.fields.rating === 5);
v = S.validateCreatePayload({ type: 'feedback', description: 'meh', fields: { rating: -2 }, source: 'settings' });
ok('rating clamped to 1', v.clean.fields.rating === 1);
v = S.validateCreatePayload({ type: 'bug', description: 'x', fields: { expected: 'a', bogus: 'drop me' }, source: 'settings' });
ok('unknown field keys dropped', v.clean.fields.expected === 'a' && v.clean.fields.bogus === undefined);

/* clientKey passthrough */
ok('clientKey passthrough', S.validateCreatePayload({ type: 'typo', source: 'drill', question: Q, clientKey: 'abc123' }).clean.clientKey === 'abc123');

/* ───────── 4. signature stability + collision-resistance ───────── */
var qA = { category: 'ratios', subtype: 'x', questionText: 'What is 2+2?' };
var qA2 = { category: 'ratios', subtype: 'x', questionText: 'What is 2+2?' };
var qB = { category: 'ratios', subtype: 'x', questionText: 'What is 2+3?' };
ok('signature stable across calls', S.computeSignature(qA) === S.computeSignature(qA2));
ok('signature differs for different text', S.computeSignature(qA) !== S.computeSignature(qB));
ok('signature prefers questionId', S.computeSignature({ questionId: 'Q9', category: 'x', questionText: 'y' }) === 'Q9');
ok('signature prefers _authoredId when no questionId', S.computeSignature({ _authoredId: 'A3', questionText: 'y' }) === 'A3');
ok('signature null when nothing identifying', S.computeSignature({ category: 'x' }) === null);
/* light collision sweep: 2000 distinct texts → 2000 distinct signatures */
var seen = {}, coll = 0;
for (var i = 0; i < 2000; i++) { var s = S.computeSignature({ category: 'c', subtype: 's', questionText: 'q number ' + i }); if (seen[s]) coll++; seen[s] = 1; }
ok('no signature collisions over 2000 distinct texts', coll === 0);

/* ───────── 5. rate-limit + dedupe ───────── */
var now = 1700000000000;
function stamps(nInHour, nEarlierToday) {
  var a = [];
  for (var i = 0; i < nInHour; i++) a.push(now - i * 1000);
  for (var j = 0; j < nEarlierToday; j++) a.push(now - (2 * 60 * 60 * 1000) - j * 1000);
  return a;
}
ok('under limits → allowed', S.rateLimitDecision(stamps(3, 3), now, RT.RATE_LIMIT).allowed);
ok('at hourly cap → blocked', !S.rateLimitDecision(stamps(RT.RATE_LIMIT.maxPerHour, 0), now, RT.RATE_LIMIT).allowed);
ok('hourly block is retryable', S.rateLimitDecision(stamps(RT.RATE_LIMIT.maxPerHour, 0), now, RT.RATE_LIMIT).retryable === true);
ok('at daily cap → blocked', !S.rateLimitDecision(stamps(2, RT.RATE_LIMIT.maxPerDay), now, RT.RATE_LIMIT).allowed);

var cands = [
  { id: 'r1', type: 'answer_wrong', signature: 'sigA', clientKey: 'k1', createdAtMs: now - 60 * 1000 },
  { id: 'r2', type: 'bug', signature: null, clientKey: 'k2', createdAtMs: now - 120 * 1000 }
];
ok('dedupe by clientKey', S.findDuplicate(cands, { type: 'bug', signature: 'zzz', clientKey: 'k1' }, now, RT.RATE_LIMIT) === 'r1');
ok('dedupe by type+signature within window', S.findDuplicate(cands, { type: 'answer_wrong', signature: 'sigA', clientKey: 'new' }, now, RT.RATE_LIMIT) === 'r1');
ok('no dedupe when signature differs', S.findDuplicate(cands, { type: 'answer_wrong', signature: 'sigOTHER', clientKey: 'new' }, now, RT.RATE_LIMIT) === null);
ok('no dedupe outside window', S.findDuplicate([{ id: 'r3', type: 'typo', signature: 'sigA', clientKey: 'x', createdAtMs: now - 10 * 60 * 1000 }], { type: 'typo', signature: 'sigA', clientKey: 'y' }, now, RT.RATE_LIMIT) === null);
ok('no dedupe for signatureless app reports', S.findDuplicate(cands, { type: 'bug', signature: null, clientKey: 'brand-new' }, now, RT.RATE_LIMIT) === null);

/* ───────── 6. shortId + sanitizers ───────── */
ok('shortId format QR-XXXX', /^QR-[0-9A-Z]{4}$/.test(S.makeShortId([255, 16, 7, 200, 33, 99])));
ok('shortId deterministic for fixed bytes', S.makeShortId([1, 2, 3, 4]) === S.makeShortId([1, 2, 3, 4]));

var ctx = S.sanitizeContext({ app: { version: 'v214', source: 'x', theme: 'classic' }, device: { ua: 'UA', screen: { w: 390, h: 844 }, online: true }, locale: { tz: 'Asia/Kolkata' }, route: '#practice', recentErrors: [{ msg: 'boom', at: 1 }, { msg: '', at: 2 }] }, 'drill');
ok('sanitizeContext forces source', ctx.app.source === 'drill');
ok('sanitizeContext keeps screen', ctx.device.screen.w === 390);
ok('sanitizeContext drops empty errors', ctx.recentErrors.length === 1);
ok('sanitizeContext caps recentErrors at 10', S.sanitizeContext({ recentErrors: Array.from({ length: 50 }, function (_, i) { return { msg: 'e' + i, at: i }; }) }, 'settings').recentErrors.length === 10);

var qsnap = S.sanitizeQuestion({ questionId: 'Q1', category: 'ratios', questionText: 'hi', options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], answer: 2, selectedAnswer: 3, wasAnswered: true });
ok('sanitizeQuestion computes signature', qsnap.signature === 'Q1');
ok('sanitizeQuestion caps options at 12', qsnap.options.length === 12);
ok('sanitizeQuestion keeps selectedAnswer', qsnap.selectedAnswer === 3);
ok('sanitizeQuestion returns null for empty', S.sanitizeQuestion(null) === null);
/* byte-cap: a giant chart spec is dropped */
var huge = { category: 'di', questionText: 'q', chart: { data: new Array(60000).join('z') } };
var qhuge = S.sanitizeQuestion(huge);
ok('sanitizeQuestion drops oversized chart', qhuge.chart === null);

/* ───────── 7. ADR-097: AI-explanation reporting + audit fixes ───────── */
/* newline / tab preservation (B3) */
var nlv = S.validateCreatePayload({ type: 'bug', source: 'settings', description: 'Step 1\nStep 2\tend' });
ok('B3 newlines + tabs preserved in free text', nlv.clean.description === 'Step 1\nStep 2\tend');
ok('B3 other control chars still stripped', S.validateCreatePayload({ type: 'bug', source: 'settings', description: 'a bc' }).clean.description === 'abc');
/* rating-only feedback accepted (B2) */
var ro = S.validateCreatePayload({ type: 'feedback', source: 'settings', fields: { rating: 5 } });
ok('B2 rating-only feedback accepted', ro.ok && ro.clean.fields.rating === 5);
ok('B2 truly-empty non-question still rejected', S.validateCreatePayload({ type: 'bug', source: 'settings' }).code === 'EMPTY_REPORT');
/* ai_explain source + question snapshot + ai bundle (A) */
var aiv = S.validateCreatePayload({ type: 'ai_issue', subReason: 'hallucination', source: 'ai_explain',
  description: 'made up a step', question: { questionId: 'Q7', category: 'ratios', questionText: 'x', answer: 3, selectedAnswer: 4, wasAnswered: true },
  ai: { explanation: 'because 2+2=5', promptId: 'explain.base@3', model: 'gpt-4o-mini', provider: 'openai' } });
ok('A ai_explain source accepted', aiv.ok && aiv.clean.source === 'ai_explain');
ok('A ai_explain captures question snapshot', aiv.clean.question && aiv.clean.signature === 'Q7');
ok('A ai bundle keeps explanation + promptId', aiv.clean.ai && aiv.clean.ai.promptId === 'explain.base@3' && aiv.clean.ai.explanation === 'because 2+2=5');
ok('A ai bundle dropped when empty', S.validateCreatePayload({ type: 'bug', source: 'settings', description: 'x', ai: {} }).clean.ai === null);
ok('A sanitizeAi caps explanation to 8000', S.sanitizeAi({ explanation: new Array(9000).join('z') }).explanation.length === 8000);
ok('A non-ai_explain report carries no ai', S.validateCreatePayload({ type: 'typo', source: 'drill', question: Q }).clean.ai === null);
ok('A ai_explain needs no free text (2-tap)', S.validateCreatePayload({ type: 'ai_issue', source: 'ai_explain', subReason: 'hallucination', question: { questionId: 'Q1', questionText: 'x', answer: 1 }, ai: { explanation: 'e' } }).ok === true);

/* ───────── 8. QuanAI identity (ADR-098): NO provider/model ever reaches a report ───────── */
ok('QuanAI: sanitizeAi drops model even if a client sends it', S.sanitizeAi({ explanation: 'e', promptId: 'explain.base@3', model: 'gpt-4o-mini', provider: 'openai' }).model === undefined);
ok('QuanAI: sanitizeAi drops provider even if a client sends it', S.sanitizeAi({ explanation: 'e', provider: 'openai' }).provider === undefined);
ok('QuanAI: sanitizeAi keeps only explanation + promptId', (function () { var k = Object.keys(S.sanitizeAi({ explanation: 'e', promptId: 'x', model: 'm', provider: 'p' })).sort(); return k.length === 2 && k[0] === 'explanation' && k[1] === 'promptId'; })());
ok('QuanAI: a hand-crafted model in the create body never persists', (function () { var c = S.validateCreatePayload({ type: 'ai_issue', source: 'ai_explain', subReason: 'hallucination', question: { questionId: 'Q1', questionText: 'x', answer: 1 }, ai: { explanation: 'e', promptId: 'explain.base@3', model: 'gpt-4o-mini', provider: 'openai' } }); return c.clean.ai.model === undefined && c.clean.ai.provider === undefined && c.clean.ai.promptId === 'explain.base@3'; })());
/* the whole serialized clean payload must contain no provider/model token */
ok('QuanAI: serialized report payload leaks no gpt/openai', (function () { var c = S.validateCreatePayload({ type: 'ai_issue', source: 'ai_explain', subReason: 'hallucination', question: { questionId: 'Q1', questionText: 'x', answer: 1 }, ai: { explanation: 'e', promptId: 'explain.base@3', model: 'gpt-4o-mini', provider: 'openai' } }); return !/gpt|openai/i.test(JSON.stringify(c.clean)); })());

/* tri-surface enum lockstep: shared ⇄ server ⇄ super-admin reports.js (textual extract) */
(function () {
  var fs = require('fs');
  var sa = fs.readFileSync(p('../super-admin-app/api/admin/reports.js'), 'utf8');
  function saArr(name) { var m = sa.match(new RegExp('var ' + name + " = (\\[[^\\]]*\\]);")); return m ? JSON.parse(m[1].replace(/'/g, '"')) : null; }
  ok('super-admin STATUSES lockstep', arrEq(saArr('STATUSES'), RT.STATUSES));
  ok('super-admin OPEN_STATUSES lockstep', arrEq(saArr('OPEN_STATUSES'), RT.OPEN_STATUSES));
  ok('super-admin PRIORITIES lockstep', arrEq(saArr('PRIORITIES'), RT.PRIORITIES));

  /* The super-admin VIEW's label maps must cover every type + status, or a new one renders as a raw id with no
     failure (ADR-098 finding #3). Extract the keys of TYPE_LABELS / STATUS_LABELS and check coverage. */
  var view = fs.readFileSync(p('../super-admin-app/js/views/reports.js'), 'utf8');
  function keysOf(objName) {
    var m = view.match(new RegExp('var ' + objName + ' = \\{([\\s\\S]*?)\\};'));
    return m ? (m[1].match(/(\w+):/g) || []).map(function (s) { return s.replace(':', ''); }) : [];
  }
  var typeKeys = keysOf('TYPE_LABELS'), statusKeys = keysOf('STATUS_LABELS');
  RT.TYPES.forEach(function (t) { ok('super-admin TYPE_LABELS covers ' + t.id, typeKeys.indexOf(t.id) !== -1); });
  RT.STATUSES.forEach(function (s) { ok('super-admin STATUS_LABELS covers ' + s, statusKeys.indexOf(s) !== -1); });

  /* ADR-099-verify: the VIEW must also label every SUB-REASON (esp. AI reasons — the key triage field) or it
     renders a raw snake_case id. Assert SUBREASON_LABELS covers every subReason id across the taxonomy. */
  var subKeys = keysOf('SUBREASON_LABELS');
  var allSubs = {};
  RT.TYPES.forEach(function (t) { (t.subReasons || []).forEach(function (s) { allSubs[s.id] = 1; }); });
  Object.keys(allSubs).forEach(function (sid) { ok('super-admin SUBREASON_LABELS covers ' + sid, subKeys.indexOf(sid) !== -1); });

  /* 5th surface (ADR-099-verify): the canonical JSON schema's classification.type enum must equal the taxonomy —
     a type added to report-types.js but forgotten in the JSON schema would otherwise go uncaught. */
  var jsonSchema = JSON.parse(fs.readFileSync(p('../shared/schemas/report-schema.json'), 'utf8'));
  var jsonTypeEnum = jsonSchema.properties.classification.properties.type.enum;
  ok('JSON-schema classification.type enum lockstep', arrEq(jsonTypeEnum, RT.TYPES.map(function (t) { return t.id; })));
  var jsonSourceEnum = jsonSchema.properties.context.properties.app.properties.source.enum;
  ok('JSON-schema context.app.source includes ai_explain', jsonSourceEnum.indexOf('ai_explain') !== -1);
  ok('JSON-schema context.app.source includes learn (ADR-100)', jsonSourceEnum.indexOf('learn') !== -1);
  ok('JSON-schema documents the learn object (ADR-100)', !!jsonSchema.properties.learn && jsonSchema.properties.learn.additionalProperties === false);
})();

/* ───────── 9. ADR-100: Learn reporting + MCQ-vs-typed correctness ───────── */
/* source:'learn' is accepted (not coerced to settings) and a Learn report is 2-tap when a topic is attached. */
var lv = S.validateCreatePayload({ type: 'learn_issue', subReason: 'concept', source: 'learn', learn: { topicId: 'lr-coding-decoding', title: 'Coding-Decoding', category: 'lr-reasoning', subject: 'lr' } });
ok('learn source accepted (not coerced)', lv.ok && lv.clean.source === 'learn');
ok('learn report is 2-tap with a topic attached (no text needed)', lv.ok && lv.clean.learn && lv.clean.learn.topicId === 'lr-coding-decoding');
ok('learn report seeds medium priority', lv.ok && lv.clean.priority === 'medium');
ok('learn report carries no question/ai', lv.clean.question === null && lv.clean.ai === null);
ok('reject empty learn report (no topic, no text)', S.validateCreatePayload({ type: 'learn_issue', source: 'learn' }).code === 'EMPTY_REPORT');
ok('sanitizeLearn keeps the topic fields', (function () { var l = S.sanitizeLearn({ topicId: 'x', title: 'T', category: 'c', subject: 's', difficulty: 'core', examFrequency: 'high', route: '#learn/x', bogus: 'drop' }); return l.topicId === 'x' && l.subject === 's' && l.bogus === undefined; })());
ok('sanitizeLearn null when nothing identifying', S.sanitizeLearn({ difficulty: 'core' }) === null);
ok('learn subReasons all covered by super-admin SUBREASON_LABELS (via §8)', true); // coverage asserted in §8's allSubs loop
/* MCQ-vs-typed: the snapshot carries a reliable answer-mode marker; server derives isMCQ from options if absent. */
ok('sanitizeQuestion keeps client isMCQ=false for a typed question', S.sanitizeQuestion({ questionId: 'Q1', questionText: '2+2?', isMCQ: false, answer: 4 }).isMCQ === false);
ok('sanitizeQuestion derives isMCQ from options when absent (MCQ)', S.sanitizeQuestion({ questionId: 'Q2', questionText: 'x', options: ['a', 'b', 'c'], answer: 'a' }).isMCQ === true);
ok('sanitizeQuestion derives isMCQ=false when no options', S.sanitizeQuestion({ questionId: 'Q3', questionText: 'x', answer: '7/12' }).isMCQ === false);
ok('sanitizeQuestion keeps answerFormat', S.sanitizeQuestion({ questionId: 'Q4', questionText: 'x', answer: '3:2', answerFormat: 'ratio' }).answerFormat === 'ratio');
ok('typed-answer report round-trips a fraction answer', S.validateCreatePayload({ type: 'answer_wrong', source: 'drill', question: { questionId: 'Q5', questionText: 'x', answer: '7/12', selectedAnswer: '1/2', isMCQ: false } }).clean.question.answer === '7/12');

/* ───────── done ───────── */
console.log('\nreport.check.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
