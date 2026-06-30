/**
 * lr-set-engine.js — authentic Logical Reasoning PUZZLE SETS (ADR-079).
 *
 * Real exam LR (esp. Banking/CAT) is dominated by SETS: one scenario with a handful of clues → 3–6 linked questions.
 * This is the "second LR engine": it GENERATES puzzle sets; presentation reuses the proven drill set-mode (it consumes
 * a set's shared text `context` + the linked MCQ list, exactly like a DI caselet set — `opts.diSet`).
 *
 *   set = { category:'lr-seating'|'lr-puzzle', chart:null, context:<scenario + clues, prose>, dataset,
 *           questions:[{question, answer, options, subtype, skill, difficulty}], meta:{count,kind},
 *           _solution:[names left→right / bottom→top] }    // _solution is for the check harness only
 *
 * CORRECTNESS BY CONSTRUCTION: pick a random arrangement → derive only-true clues → GREEDILY add clues until a
 * brute-force solve over all N! arrangements leaves EXACTLY ONE solution (else retry). Every question's answer is then
 * read off that unique solution. scripts/lr-set-engine.check.js independently re-solves the clue set and re-derives
 * every answer. PURE + dual-exported.
 */
(function (root) {
  'use strict';

  function _ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _pickN(a, n) { return _shuffle(a).slice(0, n); }
  function _mcq(correct, pool, n) { n = n || 4; var ans = String(correct), opts = [ans]; var p = _shuffle(pool.map(String)); for (var i = 0; i < p.length && opts.length < n; i++) if (opts.indexOf(p[i]) === -1) opts.push(p[i]); return { answer: ans, options: _shuffle(opts) }; }
  function _ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function _numWord(n) { return ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'][n] || String(n); }
  function _andList(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  var NAMES = ['Amit', 'Bina', 'Charu', 'Deepak', 'Esha', 'Farhan', 'Gita', 'Harish'];

  /* every permutation of [0..n-1] (n! ≤ 720 for n≤6) — each is an arrangement: arr[position] = personIndex */
  function _perms(n) { var res = [], a = []; for (var i = 0; i < n; i++) a.push(i); (function go(k) { if (k === n) { res.push(a.slice()); return; } for (var i = k; i < n; i++) { var t = a[k]; a[k] = a[i]; a[i] = t; go(k + 1); t = a[k]; a[k] = a[i]; a[i] = t; } })(0); return res; }

  /* vocabulary so one solver drives both a left→right SEATING row and a bottom→top FLOOR stack */
  var VOCAB = {
    seating: {
      kind: 'seating',
      intro: function (nm) { return _numWord(nm.length) + ' friends — ' + _andList(nm) + ' — sit in a row facing north (position 1 is the leftmost).'; },
      endLow: function (p) { return p + ' sits at the extreme left end of the row.'; },
      endHigh: function (p) { return p + ' sits at the extreme right end of the row.'; },
      imm: function (a, b) { return a + ' sits immediately to the left of ' + b + '.'; },
      between: function (p, a, b) { return p + ' sits exactly between ' + a + ' and ' + b + '.'; },
      gap: function (p, q, k) { return 'Exactly ' + k + ' ' + (k === 1 ? 'person sits' : 'persons sit') + ' between ' + p + ' and ' + q + '.'; },
      lower: function (p, q) { return p + ' sits somewhere to the left of ' + q + '.'; },
      qPos: function (n) { return 'Who sits at the ' + _ord(n) + ' position from the left?'; },
      qEnd: 'Who sits at the extreme left end of the row?',
      qImmRight: function (x) { return 'Who sits immediately to the right of ' + x + '?'; },
      qFromRight: function (k) { return 'Who sits ' + _ord(k) + ' from the right end?'; },
      qBetween: function (x, y) { return 'How many persons sit between ' + x + ' and ' + y + '?'; },
      qNeighbour: function (x) { return 'Who among the following is an immediate neighbour of ' + x + '?'; }
    },
    floor: {
      kind: 'floor',
      intro: function (nm) { return _numWord(nm.length) + ' persons — ' + _andList(nm) + ' — live on ' + _numWord(nm.length) + ' different floors of a building (the lowest floor is numbered 1 and the topmost is numbered ' + nm.length + ').'; },
      endLow: function (p) { return p + ' lives on the lowest floor (floor 1).'; },
      endHigh: function (p) { return p + ' lives on the topmost floor.'; },
      imm: function (a, b) { return a + ' lives immediately below ' + b + '.'; },
      between: function (p, a, b) { return p + ' lives on a floor exactly between ' + a + ' and ' + b + '.'; },
      gap: function (p, q, k) { return 'Exactly ' + k + ' ' + (k === 1 ? 'floor lies' : 'floors lie') + ' between the floors of ' + p + ' and ' + q + '.'; },
      lower: function (p, q) { return p + ' lives on some floor below ' + q + '.'; },
      qPos: function (n) { return 'Who lives on floor number ' + n + '?'; },
      qEnd: 'Who lives on the lowest floor?',
      qImmRight: function (x) { return 'Who lives immediately above ' + x + '?'; },
      qFromRight: function (k) { return 'Who lives on the ' + _ord(k) + ' floor from the top?'; },
      qBetween: function (x, y) { return 'How many floors lie between the floors of ' + x + ' and ' + y + '?'; },
      qNeighbour: function (x) { return 'Who lives on a floor immediately adjacent to ' + x + '?'; }
    }
  };

  /* all clues that are TRUE for solution `sol` (arr index = position, value = personIndex), as {text, test}. */
  function _trueClues(sol, names, V) {
    var N = sol.length, clues = [];
    clues.push({ text: V.endLow(names[sol[0]]), test: (function (p) { return function (a) { return a[0] === p; }; })(sol[0]) });
    clues.push({ text: V.endHigh(names[sol[N - 1]]), test: (function (p) { return function (a) { return a[a.length - 1] === p; }; })(sol[N - 1]) });
    for (var i = 0; i < N - 1; i++) clues.push({ text: V.imm(names[sol[i]], names[sol[i + 1]]), test: (function (p, q) { return function (a) { return a.indexOf(p) + 1 === a.indexOf(q); }; })(sol[i], sol[i + 1]) });
    for (var b = 1; b < N - 1; b++) clues.push({ text: V.between(names[sol[b]], names[sol[b - 1]], names[sol[b + 1]]), test: (function (p, x, y) { return function (a) { var ip = a.indexOf(p), ix = a.indexOf(x), iy = a.indexOf(y); return (ix === ip - 1 && iy === ip + 1) || (iy === ip - 1 && ix === ip + 1); }; })(sol[b], sol[b - 1], sol[b + 1]) });
    for (var i2 = 0; i2 < N; i2++) for (var j = i2 + 1; j < N; j++) {
      var k = j - i2 - 1;
      if (k >= 1) clues.push({ text: V.gap(names[sol[i2]], names[sol[j]], k), test: (function (p, q, kk) { return function (a) { return Math.abs(a.indexOf(p) - a.indexOf(q)) - 1 === kk; }; })(sol[i2], sol[j], k) });
      clues.push({ text: V.lower(names[sol[i2]], names[sol[j]]), test: (function (p, q) { return function (a) { return a.indexOf(p) < a.indexOf(q); }; })(sol[i2], sol[j]) });
    }
    return clues;
  }

  function _solve(perms, clues) { return perms.filter(function (a) { return clues.every(function (c) { return c.test(a); }); }); }

  /* questions read off the unique solution; `_v` is an internal descriptor the check harness recomputes from. */
  function _buildQuestions(sol, names, V, count) {
    var N = sol.length, people = sol.map(function (p) { return names[p]; });
    var bank = [];
    var pp = _ri(2, N - 1); bank.push({ skill: 'position', d: 'easy', q: V.qPos(pp), ans: names[sol[pp - 1]], opts: people, _v: { t: 'pos', p: pp } });
    bank.push({ skill: 'end', d: 'easy', q: V.qEnd, ans: names[sol[0]], opts: people, _v: { t: 'end' } });
    var ii = _ri(0, N - 2); bank.push({ skill: 'neighbour', d: 'medium', q: V.qImmRight(names[sol[ii]]), ans: names[sol[ii + 1]], opts: people, _v: { t: 'immRight', x: names[sol[ii]] } });
    var gi = _ri(0, N - 2), gj = _ri(gi + 1, N - 1); bank.push({ skill: 'count', d: 'medium', q: V.qBetween(names[sol[gi]], names[sol[gj]]), ans: String(gj - gi - 1), opts: ['0', '1', '2', '3', '4', '5'], _v: { t: 'between', x: names[sol[gi]], y: names[sol[gj]] } });
    var kk = _ri(2, N - 1); bank.push({ skill: 'fromend', d: 'hard', q: V.qFromRight(kk), ans: names[sol[N - kk]], opts: people, _v: { t: 'fromRight', k: kk } });
    var ni = _ri(1, N - 2); var nb = [names[sol[ni - 1]], names[sol[ni + 1]]]; bank.push({ skill: 'adjacency', d: 'hard', q: V.qNeighbour(names[sol[ni]]), ans: _pick(nb), opts: people, _v: { t: 'neighbour', x: names[sol[ni]], any: nb } });
    var diffs = count <= 4 ? ['easy', 'medium', 'medium', 'hard'] : ['easy', 'easy', 'medium', 'medium', 'hard'];
    var bySkill = {}, picked = [];
    _shuffle(bank).forEach(function (b) { if (!bySkill[b.skill]) { bySkill[b.skill] = 1; picked.push(b); } });
    picked = picked.slice(0, count);
    /* order by difficulty (easy→hard) for progression */
    var rank = { easy: 0, medium: 1, hard: 2 };
    picked.sort(function (x, y) { return rank[x.d] - rank[y.d]; });
    return picked.map(function (b, idx) { var m = _mcq(b.ans, b.opts, Math.min(4, b.opts.length)); var d = diffs[idx] || b.d; return { question: b.q, answer: m.answer, options: m.options, subtype: d + ':set_' + b._v.t, skill: b.skill, difficulty: d, _v: b._v }; });
  }

  function _buildRaw(kind, N) {
    var V = VOCAB[kind] || VOCAB.seating;
    var names = _pickN(NAMES, N), perms = _perms(N);
    for (var attempt = 0; attempt < 30; attempt++) {
      var sol = _shuffle(names.map(function (_, i) { return i; }));   // position → personIndex
      var pool = _shuffle(_trueClues(sol, names, V)), chosen = [], remaining = perms.slice();
      while (remaining.length > 1 && chosen.length < 7) {
        var best = null, bestSize = remaining.length + 1, bi = -1;
        for (var c = 0; c < pool.length; c++) { if (chosen.indexOf(pool[c]) !== -1) continue; var sz = remaining.filter(pool[c].test).length; if (sz >= 1 && sz < bestSize) { best = pool[c]; bestSize = sz; bi = c; } }
        if (!best) break;
        chosen.push(best); remaining = remaining.filter(best.test);
      }
      if (remaining.length !== 1) continue;
      /* pad to a fuller, realistic clue list (extra true clues never break uniqueness) */
      for (var pcl = 0; pcl < pool.length && chosen.length < 5; pcl++) if (chosen.indexOf(pool[pcl]) === -1) chosen.push(pool[pcl]);
      var count = _ri(4, 5);
      return { kind: kind, names: names, sol: sol, clues: chosen, questions: _buildQuestions(sol, names, V, count), V: V };
    }
    return null;
  }

  function generateSet(category, opts) {
    opts = opts || {};
    var kind = category === 'lr-puzzle' ? 'floor' : 'seating';
    var raw = _buildRaw(kind, _ri(5, 6)) || _buildRaw(kind, 5) || _buildRaw('seating', 5);
    if (!raw) return null;
    var V = raw.V, names = raw.names;
    var context = V.intro(names) + ' ' + _shuffle(raw.clues).map(function (c) { return c.text; }).join(' ');
    return {
      category: category === 'lr-puzzle' ? 'lr-puzzle' : 'lr-seating',
      chart: null, context: context,
      dataset: { kind: raw.kind, n: names.length },
      questions: raw.questions.map(function (q) { return { question: q.question, answer: q.answer, options: q.options, subtype: q.subtype, skill: q.skill, difficulty: q.difficulty }; }),
      meta: { count: raw.questions.length, kind: raw.kind },
      _solution: raw.sol.map(function (p) { return names[p]; })
    };
  }

  var LRSetEngine = {
    generateSet: generateSet,
    categories: function () { return ['lr-seating', 'lr-puzzle']; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LRSetEngine;
  if (typeof window !== 'undefined') window.LRSetEngine = LRSetEngine;
  else root.LRSetEngine = LRSetEngine;
})(this);
