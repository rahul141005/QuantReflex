/**
 * en.lrv.js — generated-content pack (LR-VISUAL engine, English) for QRGenI18n (ADR-111 Phase F-M7).
 *
 * lr-visual-engine.js owns ALL RNG + geometry + the machine FIGURE specs (glyphs, dice, dots, shapes, segment lattices,
 * paper-fold hole sets, 3×3 grids) — those carry NO natural-language text and are byte-identical across languages. This
 * pack owns every user-visible STRING: the per-category stems and the ~40 explanations, plus the shape-name words and
 * paint-type descriptors embedded inside them. For a fixed RNG seed the answer, option tokens, subtype, difficulty AND
 * every figure spec are IDENTICAL in every language — only the wording differs (EN byte-identity proven by
 * scripts/lrv-census.js; cross-language invariance by gen-i18n.check §12).
 *
 * Shape names (circle/square/…) and paint-type labels are keyed by a stable id so the answer never depends on wording:
 * the engine passes the id, the pack renders the word. EN reproduces the current strings VERBATIM. Function-valued →
 * validated by gen-i18n.check, not the catalog string scanner.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  var SHAPES = { circle: 'circle', square: 'square', triangle: 'triangle', pentagon: 'pentagon', hexagon: 'hexagon', diamond: 'diamond', dot: 'dot', star: 'star' };
  function sw(f) { return SHAPES[f] || f; }
  var PAINT = { two: 'exactly two faces painted', one: 'exactly one face painted', none: 'no face painted', three: 'exactly three faces painted', atLeastOne: 'at least one face painted' };

  var LRV = {
    shapes: SHAPES, shapeWord: sw, paintLabel: function (id) { return PAINT[id] || id; },
    /* _axisWord draws from these (length 3 each — draw order preserved). */
    axis: {
      h: ['mirror image (the mirror stands upright beside it)', 'mirror image', 'image in a vertical mirror'],
      v: ['water image (its reflection in still water below)', 'water image', 'reflection in water']
    },

    /* mirror / water */
    mirror: {
      charStem: function (aw) { return 'Select the correct ' + aw + ' of the character shown at the top.'; },
      charExpl: function (isM) { return isM ? 'A mirror reverses left and right — the character appears flipped sideways.' : 'Water reflects top and bottom — the character appears flipped upside-down, not sideways.'; },
      figStem: function (aw) { return 'Which option shows the correct ' + aw + ' of the figure?'; },
      figExplE: function (isM) { return isM ? 'In a mirror the dot swaps to the opposite side (left ↔ right); top and bottom stay put.' : 'In water the figure flips vertically — the dot moves from top to bottom on the SAME side.'; },
      clusterStems: function (aw, isM) { return ['Choose the option that shows the ' + aw + ' of the given group of characters.', 'The group of characters at the top is held up to a ' + (isM ? 'mirror' : 'water surface') + '. Which option shows what you would see?']; },
      clusterExpl: function (isM) { return isM ? 'A mirror reverses the ORDER of the characters and flips each one left-to-right.' : 'Water keeps the order but turns each character upside-down.'; },
      figExplM: function (isM) { return isM ? 'Reflect every element left ↔ right: each marker jumps to the opposite side of the vertical axis.' : 'Reflect every element top ↔ bottom: each marker jumps across the horizontal axis.'; },
      segStem: function (aw) { return 'Select the option that shows the exact ' + aw + ' of the figure at the top.'; },
      segExpl: function (isM) { return isM ? 'Trace each line: a mirror swaps left and right only. A rotated copy LOOKS similar but the slants run the wrong way — that is the trap.' : 'Water flips the figure vertically. Compare the top of the original with the bottom of each option; rotations are the trap.'; }
    },

    /* dice */
    dice: {
      oppStems: function (top) { return ['A standard die is shown (opposite faces always add up to 7). Which number is on the face opposite the ' + top + '?', 'The die shown is a standard die, so opposite faces total 7. What lies on the face opposite the one showing ' + top + '?']; },
      oppExpl: function (top) { return 'On a standard die opposite faces sum to 7, so the face opposite ' + top + ' is 7 − ' + top + ' = ' + (7 - top) + '.'; },
      hiddenStem: function (t2) { return 'A die shows ' + t2 + ' on its top face. The six faces carry the numbers 1 to 6. What do the OTHER five faces add up to?'; },
      hiddenExpl: function (t2) { return 'All six faces total 1+2+3+4+5+6 = 21, so the hidden five faces total 21 − ' + t2 + ' = ' + (21 - t2) + '.'; },
      netStem: function (face) { return 'The net shown is folded to form a cube. Which number will be on the face opposite ' + face + '?'; },
      netExpl: function (face, ans) { return 'In a cross-shaped net, faces separated by one square fold to opposite sides. Here ' + face + ' folds opposite ' + ans + '; the four squares in between wrap around as its neighbours.'; },
      twoDiceStem: function (a, b) { return 'Two standard dice show ' + a + ' and ' + b + ' on top. What is the total of the numbers on their two bottom faces?'; },
      twoDiceExpl: function (a, b) { return 'Each bottom face is 7 minus its top face: (7 − ' + a + ') + (7 − ' + b + ') = ' + ((7 - a) + (7 - b)) + '.'; },
      twoPosStem: function (X) { return 'The same die is shown in two different positions. Which number lies on the face opposite ' + X + '?'; },
      twoPosExpl: function (nbrJoined, X, opp) { return 'Across the two positions, the numbers ' + nbrJoined + ' all appear on faces touching ' + X + ' — so they are its neighbours. The only number never seen next to ' + X + ' is ' + opp + ', which must be opposite it.'; }
    },

    /* painted cube / cuboid */
    cube: {
      cubeStems: function (n, tk) { return ['A cube is painted on all its faces and cut into ' + n + '×' + n + '×' + n + ' = ' + (n * n * n) + ' identical small cubes. How many small cubes have ' + tk + '?', 'A solid cube is painted red on every face, then sliced into ' + (n * n * n) + ' equal small cubes (' + n + ' along each edge). How many of them have ' + tk + '?']; },
      cubeExpl: function (n) { return 'Corners (3 painted faces) = 8; edge cubes (2 faces) = 12×(n−2); face-centre cubes (1 face) = 6×(n−2)²; hidden inner cubes = (n−2)³, with n = ' + n + '.'; },
      cuboidStem: function (a, b, c, tk) { return 'A cuboid measuring ' + a + ' × ' + b + ' × ' + c + ' units is painted on all faces and cut into unit cubes. How many unit cubes have ' + tk + '?'; },
      cuboidExpl: function () { return 'For an a×b×c cuboid: corners = 8; edges (2 faces) = 4[(a−2)+(b−2)+(c−2)]; faces (1 face) = 2[(a−2)(b−2)+(b−2)(c−2)+(a−2)(c−2)]; inner = (a−2)(b−2)(c−2).'; }
    },

    /* figure series */
    fseries: {
      stems: ['Which figure should come next in the series, in place of the question mark?', 'Study the series and pick the figure that continues it.', 'Select the figure that will replace the question mark in the series.', 'The figures follow a pattern. Which option comes next?'],
      posExpl: function (k, outer) { return 'The dot moves ' + (k === 1 ? 'one step' : 'two steps') + ' clockwise around the ' + sw(outer) + ' each time, so it continues to the next position.'; },
      countExpl: function (up) { return 'The number of dots ' + (up ? 'increases' : 'decreases') + ' by one in every figure of the series.'; },
      posShadeExpl: function (k2) { return 'Two things change together: the dot advances ' + k2 + ' step(s) clockwise every time, while the shading alternates. The next figure must satisfy BOTH rules.'; },
      pos3Expl: function () { return 'The dot jumps three positions (135°) clockwise each time — a longer step than it first appears. Track it around the shape.'; },
      countShadeExpl: function (up4) { return 'Two rules run at once: the dot count ' + (up4 ? 'rises' : 'falls') + ' by one every step AND the shading alternates. Options that satisfy only one rule are traps.'; },
      altPosExpl: function (a1, a2) { return 'The dot advances by ALTERNATING steps (' + a1 + ', then ' + a2 + ', then ' + a1 + '…). The next move is a ' + a2 + '-step jump.'; }
    },

    /* figure analogy */
    fanalogy: {
      stems: ['The first figure is related to the second in a certain way. Which option relates to the third figure in the SAME way?', 'Select the figure that completes the analogy (first is to second as third is to ?).', 'The second figure follows from the first by a rule. Apply the same rule to the third figure and pick the result.'],
      rotExpl: function (k) { return 'From the first to the second figure the dot turns ' + (k * 45) + '° clockwise. Apply the same turn to the third figure.'; },
      reflectExpl: function () { return 'The second figure is the MIRROR image of the first (left ↔ right) — not a rotation. Mirror the third figure the same way.'; },
      countExpl: function (dlt) { return 'The rule adds ' + dlt + ' dot(s) from the first figure to the second. Add the same number to the third figure.'; },
      shadeExpl: function () { return 'The outline becomes fully shaded while everything else stays put. Shade the third figure the same way.'; },
      rotShadeExpl: function (k5) { return 'TWO changes happen together: the dot turns ' + (k5 * 45) + '° clockwise AND the outline becomes shaded. Options applying only one change are traps.'; },
      swapExpl: function () { return 'The inner and outer shapes trade places — the small shape grows into the outline and the outline shrinks inside it.'; }
    },

    /* odd figure out */
    odd: {
      stems: ['Three of the four figures are alike in a certain way. Select the one that is DIFFERENT.', 'Find the odd figure out.', 'Three figures share a common property. Choose the one that does not belong.'],
      countExpl: function (c, oddC) { return 'Count the dots: three figures contain ' + c + ' dots each; the odd one contains ' + oddC + '. The outer shapes are a distraction.'; },
      formExpl: function (innerM) { return 'Three figures carry the same inner shape (a ' + sw(innerM) + ') merely moved to different positions — rotations of one another. The odd figure hides a different shape inside.'; },
      reflectExpl: function () { return 'Three options are the SAME figure merely rotated. The odd one is a mirror image — no amount of rotation can turn the original into it.'; }
    },

    /* paper folding */
    paper: {
      stem: 'A square sheet is folded as shown and holes are punched. How will it look when unfolded?',
      fold2Stem: 'A square sheet is folded in half twice — right onto left, then bottom onto top — and one hole is punched. How does it look unfolded?',
      fold2Expl: 'Each fold doubles the punch when opened: one hole becomes two across the vertical crease, then those two become four across the horizontal crease — one in each quadrant, all mirror-placed.',
      foldDStem: 'The sheet is folded along its diagonal and a hole is punched, as shown. Which option shows the unfolded sheet?',
      foldDExpl: 'A diagonal fold reflects the punch ACROSS the diagonal: the hole at (x, y) gains a twin at (y, x). Left–right or top–bottom twins are the traps.',
      fold1Expl: function (fold) { return 'Unfolding reflects every hole across the crease' + (fold === 'v' ? ' (left ↔ right)' : ' (top ↔ bottom)') + ': each punch appears twice, mirror-placed. Watch the reflection axis — it is the usual trap.'; }
    },

    /* matrix (pattern) completion */
    pattern: {
      stems: ['Study the 3×3 matrix. Which figure completes it, in place of the question mark?', 'Each row of the matrix follows a rule. Select the figure that belongs in the empty cell.', 'Which option completes the figure matrix?'],
      easyExpl: function (step) { return 'In every row the marker advances ' + step + ' position(s) clockwise from cell to cell; each row uses its own outer shape. Apply the same shift to the last row.'; },
      mediumExpl: function (step) { return 'Two rules stack: across each row the marker advances ' + step + ' position(s) clockwise, and each ROW carries its own marker shape. The missing cell must obey both rules.'; },
      hardExpl: function (step) { return 'Across each row the marker advances ' + step + ' position(s); down the rows the shading of the outline deepens (plain → half → solid). The answer must satisfy the row rule AND the column rule.'; }
    },

    /* embedded figures */
    embedded: {
      stems: ['The simple figure at the top is hidden inside exactly one of the four options. Which option contains it?', 'Select the option in which the given figure is embedded (same size, same orientation).'],
      expl: 'Look for the exact lines of the small figure — same lengths, same slants, same corners — buried inside one option. The other options alter one of its lines slightly, so the match fails.'
    }
  };

  if (GI) GI.registerLRV('en', LRV);
  if (typeof module !== 'undefined' && module.exports) module.exports = LRV;
})();
