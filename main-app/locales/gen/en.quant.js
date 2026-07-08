/**
 * en.quant.js — English generated-content pack (quant engine) for QRGenI18n (ADR-111 Phase F).
 *
 * Templates are extracted VERBATIM from the archetype build()s in js/questions.js — each legacy `pick([…])`
 * branch is one entry in the `s` (stem) array, and the explanation is the `e` array. render() picks
 * templates[v % length] with the build-time variant seed, so the masked-shape SET is byte-identical to the
 * pre-refactor engine (proven by scripts/quant-census.js). Pure math notation in explanations is precomputed
 * into slots (language-neutral) and emitted as-is; natural-language framing is composed from number slots so
 * hi/mr packs can translate the words while every digit stays identical.
 *
 * Archetype key = `category:difficulty:k`. English is EAGER (loaded before questions.js). Function-valued —
 * validated by scripts/gen-i18n.check.js and the quant census, never by the catalog string scanner.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  var pack = { pools: {}, tpl: {
    /* ── Squares & roots ── */
    'squares:easy:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return 'Square of ' + s.n + ' = ?'; }, function (s) { return s.n + ' squared = ?'; }],
      e: [function (s) { return s.n + '² = ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n) + '.'; }]
    },
    'squares:medium:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return 'Square of ' + s.n + ' = ?'; }],
      e: [function (s) { return s.id; }]   // _sqIdentity(n): pure math notation, language-neutral (precomputed slot)
    },
    'squares:medium:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return 'Square root of ' + s.sq + ' = ?'; }, function (s) { return 'If x² = ' + s.sq + ', x = ?'; }],
      e: [function (s) { return 'Find x with x² = ' + s.sq + '. Since ' + s.n + '² = ' + s.sq + ', √' + s.sq + ' = ' + s.n + '.'; }]
    },
    'squares:hard:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return 'If x² = ' + s.sq + ', x = ?'; }],
      e: [function (s) { return s.n + '² = ' + s.sq + ', so √' + s.sq + ' = ' + s.n + '. It sits just above ' + s.b + '² = ' + s.bsq + '.'; }]
    },
    'squares:hard:diffSquares': {
      s: [function (s) { return s.a + '² − ' + s.b + '² = ?'; }],
      e: [function (s) { return 'a² − b² = (a+b)(a−b) = (' + s.sum + ')(' + s.diff + ') = ' + s.ans + '. Factor instead of squaring both — far faster.'; }]
    },

    /* ── Cubes & cube-roots ── (slots carry base numbers; templates recompute derived math, all language-neutral) */
    'cubes:easy:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return 'Cube of ' + s.n + ' = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + ' × ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return 'Cube of ' + s.n + ' = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + '² × ' + s.n + ' = ' + (s.n * s.n) + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return 'Cube root of ' + (s.n * s.n * s.n) + ' = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return s.n + '³ = ' + c + ', so ∛' + c + ' = ' + s.n + '. Tip: the unit digit ' + (c % 10) + ' of the cube fixes the unit digit of the root.'; }]
    },
    'cubes:hard:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return 'Cube root of ' + (s.n * s.n * s.n) + ' = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return '∛' + c + ' = ' + s.n + '. Unit digit ' + (c % 10) + ' → the root ends in ' + (s.n % 10) + '; the leading part places it near ' + s.n + '.'; }]
    },
    'cubes:hard:cubeRoot5': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return 'Find the cube root of ' + (s.n * s.n * s.n) + '.'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return 'Split ' + c + ': the last digit ' + (c % 10) + ' fixes the root’s unit digit as ' + (s.n % 10) + '; the thousands part ' + Math.floor(c / 1000) + ' sits between ' + Math.floor(s.n / 10) + '³ and ' + (Math.floor(s.n / 10) + 1) + '³, so the tens digit is ' + Math.floor(s.n / 10) + '. Root = ' + s.n + '.'; }]
    },
    'cubes:hard:diffCubes': {
      s: [function (s) { return s.a + '³ − ' + s.b + '³ = ?'; }],
      e: [function (s) { return s.a + '³ = ' + (s.a * s.a * s.a) + ' and ' + s.b + '³ = ' + (s.b * s.b * s.b) + ', so the difference = ' + (s.a * s.a * s.a - s.b * s.b * s.b) + '. (Identity: a³ − b³ = (a − b)(a² + ab + b²).)'; }]
    }
  } };

  if (GI) GI.register('en', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
