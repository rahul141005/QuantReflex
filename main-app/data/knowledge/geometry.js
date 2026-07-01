/**
 * data/knowledge/geometry.js — "Geometry" category knowledge objects (ADR-083 Phase 3E, gold-standard content).
 * Numeric/formula-first geometry (angles, triangles, polygons, coordinates, trig) — no diagram dependence. No filler.
 * Dual-loaded: self-registers in the browser; the check harness requires it under node.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'geometry-basics', title: 'Geometry Basics', icon: '🔺', category: 'geometry',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'geometry-basics', syllabusTopicId: 'lines_angles', revisionIntervalDays: 7,
      related: ['coordinate-geometry-basics', 'area', 'number-system'],
      searchTerms: ['angle', 'complement', 'supplement', 'triangle', 'pythagoras', 'hypotenuse', 'isosceles', 'polygon', 'interior angle', 'exterior angle'],
      sections: [
        { type: 'overview', text: 'Most exam geometry reduces to a handful of angle facts and the Pythagoras theorem. Learn the angle sums (line, triangle, polygon), the common Pythagorean triples, and you can answer the majority of questions without ever drawing an accurate figure.' },
        { type: 'concept', title: 'Angle relationships', body: 'Two angles are COMPLEMENTARY if they sum to 90°, SUPPLEMENTARY if they sum to 180°. Angles on a straight line sum to 180°; angles around a point sum to 360°. The three angles of any triangle sum to 180°, so the third angle = 180° − (other two). An exterior angle of a triangle equals the sum of the two remote interior angles.' },
        { type: 'concept', title: 'Triangles & Pythagoras', body: 'In a right-angled triangle, hypotenuse² = leg₁² + leg₂². Memorise the common triples so you skip the square-root: (3,4,5), (5,12,13), (8,15,17), (7,24,25) and their multiples (6,8,10), (9,12,15)… An isosceles triangle has two equal sides and two equal base angles, so each base angle = (180° − apex)/2. An equilateral triangle has all angles 60°.' },
        { type: 'formula', items: [
          { name: 'Triangle angle sum', expr: 'A + B + C = 180°', when: 'Find a missing angle; third = 180° − (other two).' },
          { name: 'Pythagoras', expr: 'hyp² = a² + b²', when: 'Right triangles. Use triples to avoid the surd.' },
          { name: 'Polygon interior-angle sum', expr: 'Sum = (n − 2) × 180°', when: 'Any n-sided polygon.' },
          { name: 'Regular polygon each angle', expr: 'Each interior = (n − 2)×180° / n', when: 'Regular (equal-angled) polygons only.', trap: 'Each EXTERIOR angle = 360°/n.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'Spot a Pythagorean triple before reaching for a calculator — legs 5 & 12 ⟹ 13 instantly.',
          'Exterior angle of a triangle = sum of the two opposite interior angles (skip the 180° subtraction).',
          'Sum of ALL exterior angles of any polygon is 360° — so each exterior of a regular n-gon is 360°/n.'
        ] },
        { type: 'example', problem: 'Two angles of a triangle are 55° and 65°. Find the third.', steps: [
          'Angles sum to 180°.',
          'Third = 180° − 55° − 65° = 60°.'
        ], answer: '60°' },
        { type: 'example', problem: 'Find each interior angle of a regular hexagon.', steps: [
          'Interior-angle sum = (6 − 2) × 180° = 720°.',
          'Regular ⟹ each = 720° / 6 = 120°.'
        ], answer: '120°' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Bank the Pythagorean triples — they turn multi-step right-triangle problems into one-liners.',
          'For polygon angles, decide "sum" vs "each" first, then apply the matching formula.',
          'Angle-chase with the line/triangle/point sums rather than trying to measure a figure.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Confusing complement (90°) with supplement (180°).',
          'Using (n − 2)×180° for EACH angle instead of the SUM.',
          'Forgetting an isosceles triangle\'s base angles are equal.',
          'Assuming a triangle is right-angled when it isn\'t — Pythagoras needs a right angle.'
        ] },
        { type: 'memory', text: 'Co-mplement = 90 (Corner); Su-pplement = 180 (Straight line). Triangle = 180, polygon sum = (n−2)·180.' },
        { type: 'revision', points: [
          'Complement → 90°, supplement → 180°, triangle → 180°.',
          'hyp² = a² + b²; learn the triples (3,4,5)…',
          'Polygon interior sum = (n − 2)×180°; each regular = that ÷ n.',
          'Every polygon\'s exterior angles sum to 360°.'
        ] }
      ]
    },
    {
      id: 'coordinate-geometry-basics', title: 'Coordinate Geometry', icon: '📍', category: 'geometry',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'coordinate-geometry-basics', syllabusTopicId: 'coordinate_geometry', revisionIntervalDays: 8,
      related: ['geometry-basics', 'linear-equations', 'area'],
      searchTerms: ['coordinate', 'cartesian', 'distance formula', 'midpoint', 'slope', 'gradient', 'section formula', 'straight line'],
      sections: [
        { type: 'overview', text: 'Coordinate geometry puts points on a grid so geometry becomes algebra. Four formulas — distance, midpoint, slope and section — answer almost every basic question. All follow from the differences in x and y between two points.' },
        { type: 'concept', title: 'Distance & midpoint', body: 'Between P(x₁, y₁) and Q(x₂, y₂): the DISTANCE is √[(x₂ − x₁)² + (y₂ − y₁)²] — literally Pythagoras on the horizontal and vertical gaps. The MIDPOINT is the average of the coordinates: ((x₁ + x₂)/2, (y₁ + y₂)/2).' },
        { type: 'concept', title: 'Slope & the section formula', body: 'The SLOPE (gradient) of PQ is (y₂ − y₁)/(x₂ − x₁) — "rise over run". A positive slope rises left-to-right, negative falls, zero is horizontal, undefined (vertical) when x₂ = x₁. Parallel lines share a slope; perpendicular slopes multiply to −1. The SECTION formula gives the point dividing PQ internally in ratio m:n: x = (m·x₂ + n·x₁)/(m + n), and similarly for y.' },
        { type: 'formula', items: [
          { name: 'Distance', expr: '√[(x₂ − x₁)² + (y₂ − y₁)²]', when: 'Length of a segment; Pythagoras in disguise.' },
          { name: 'Midpoint', expr: '((x₁ + x₂)/2, (y₁ + y₂)/2)', when: 'The point exactly halfway.' },
          { name: 'Slope', expr: '(y₂ − y₁)/(x₂ − x₁)', when: 'Steepness/direction; equal slopes ⟹ parallel.' },
          { name: 'Section (internal m:n)', expr: 'x = (m·x₂ + n·x₁)/(m + n)', when: 'A point splitting the segment in a given ratio; m:n = 1:1 is the midpoint.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'Distances often hide a Pythagorean triple — Δx = 3, Δy = 4 ⟹ distance 5.',
          'Perpendicular check: multiply the two slopes; = −1 means perpendicular.',
          'The midpoint is just the special case of the section formula with ratio 1:1.'
        ] },
        { type: 'example', problem: 'Find the distance between (2, 3) and (5, 7).', steps: [
          'Δx = 5 − 2 = 3, Δy = 7 − 3 = 4.',
          'Distance = √(3² + 4²) = √25 = 5.'
        ], answer: '5' },
        { type: 'example', problem: 'Find the slope of the line through (1, 2) and (4, 11).', steps: [
          'Slope = (11 − 2)/(4 − 1).',
          '= 9/3 = 3.'
        ], answer: '3' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Write Δx and Δy first — all four formulas are built from them.',
          'Recognise triples in distance questions to skip the square root.',
          'For "divides in ratio m:n", plug straight into the section formula; don\'t re-derive it.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Subtracting coordinates in a different order for x than for y in the slope.',
          'Forgetting to square BOTH differences in the distance formula.',
          'Swapping m and n in the section formula (m pairs with the FAR point x₂).',
          'Calling a vertical line\'s slope "zero" — it is undefined.'
        ] },
        { type: 'memory', text: 'Distance = Pythagoras on (Δx, Δy). Slope = rise/run. Midpoint = average of the ends.' },
        { type: 'revision', points: [
          'Distance = √[(Δx)² + (Δy)²]; midpoint = average of coordinates.',
          'Slope = (y₂ − y₁)/(x₂ − x₁); parallel equal, perpendicular product −1.',
          'Section (m:n): x = (m·x₂ + n·x₁)/(m + n).',
          'Vertical line ⟹ slope undefined, horizontal ⟹ slope 0.'
        ] }
      ]
    },
    {
      id: 'trigonometry', title: 'Trigonometry', icon: '🔻', category: 'geometry',
      difficulty: 'advanced', examFrequency: 'medium', status: 'published',
      drillCategory: 'trigonometry', syllabusTopicId: 'trigonometry', revisionIntervalDays: 8,
      related: ['geometry-basics', 'area', 'number-system'],
      searchTerms: ['trigonometry', 'trig', 'sin', 'cos', 'tan', 'sohcahtoa', 'standard angles', 'identity', 'heights and distances', 'angle of elevation', 'complementary angles'],
      sections: [
        { type: 'overview', text: 'Trigonometry links the angles of a right triangle to the ratios of its sides. Three ratios (sin, cos, tan), one table of standard angles, one Pythagorean identity, and the complementary-angle rule cover the bulk of SSC/Banking trig and every heights-and-distances question.' },
        { type: 'concept', title: 'The three ratios — SOH-CAH-TOA', body: 'In a right triangle, for an acute angle θ: sin θ = Opposite/Hypotenuse, cos θ = Adjacent/Hypotenuse, tan θ = Opposite/Adjacent = sin θ/cos θ. Their reciprocals are cosec, sec and cot. Remember the mnemonic SOH-CAH-TOA.' },
        { type: 'concept', title: 'Standard-angle values & complementary angles', body: 'Learn the table for 0°, 30°, 45°, 60°, 90° cold. Key clean ones: sin 30° = cos 60° = ½, sin 90° = cos 0° = 1, tan 45° = 1, sin 0° = cos 90° = 0. Complementary rule: sin θ = cos(90° − θ), tan θ = cot(90° − θ), sec θ = cosec(90° − θ). So "sin θ = cos 40°" gives θ = 50°.' },
        { type: 'table', caption: 'Standard-angle values', headers: ['θ', 'sin', 'cos', 'tan'], rows: [
          ['0°', '0', '1', '0'],
          ['30°', '½', '√3/2', '1/√3'],
          ['45°', '√2/2', '√2/2', '1'],
          ['60°', '√3/2', '½', '√3'],
          ['90°', '1', '0', '∞']
        ] },
        { type: 'formula', items: [
          { name: 'Pythagorean identities', expr: 'sin²θ + cos²θ = 1;  sec²θ − tan²θ = 1;  cosec²θ − cot²θ = 1', when: 'Simplify or evaluate ratio expressions — each equals 1 for every θ.' },
          { name: 'Complementary angles', expr: 'sin θ = cos(90° − θ),  tan θ = cot(90° − θ)', when: 'Convert between co-ratios; solve "sin θ = cos X°".' },
          { name: 'Heights & distances', expr: 'tan(angle of elevation) = height / horizontal distance', when: 'Tower/pole problems. At 45°, height = distance.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'Any expression of the form sin²θ + cos²θ (or sec²−tan², cosec²−cot²) is just 1 — no angle needed.',
          'sin θ = cos(90° − θ): if the two co-ratios are equal, the angles are complementary (add to 90°).',
          'At an elevation of 45°, tan = 1, so the height equals the horizontal distance — the fastest H&D case.'
        ] },
        { type: 'example', problem: 'If sin θ = cos 35°, find the acute angle θ.', steps: [
          'sin θ = cos(90° − θ), so cos(90° − θ) = cos 35°.',
          '90° − θ = 35° ⟹ θ = 55°.'
        ], answer: '55°' },
        { type: 'example', problem: 'The angle of elevation of a tower-top from a point 30 m away is 45°. Find its height.', steps: [
          'tan 45° = height / 30.',
          'tan 45° = 1, so height = 30 m.'
        ], answer: '30 m' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Commit the standard-angle table to memory — it is assumed, never given.',
          'Spot identity patterns (sin²+cos²) and collapse them to 1 before doing any arithmetic.',
          'For heights & distances, draw the right triangle and label opposite/adjacent before choosing the ratio.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Mixing up which ratio is opposite/hypotenuse vs adjacent/hypotenuse — keep SOH-CAH-TOA handy.',
          'Writing sin(90° − θ) = sin θ (it equals cos θ).',
          'Forgetting tan 90° is undefined (division by cos 90° = 0).',
          'Setting up an elevation problem with the height and distance swapped in tan.'
        ] },
        { type: 'memory', text: 'SOH-CAH-TOA for the ratios; "co-ratios ⟹ complementary angles"; sin²θ + cos²θ = 1 always.' },
        { type: 'revision', points: [
          'sin = O/H, cos = A/H, tan = O/A.',
          'Standard angles 0/30/45/60/90 — memorise the table.',
          'sin²θ + cos²θ = 1; sin θ = cos(90° − θ).',
          'Heights & distances: tan(elevation) = height/distance; 45° ⟹ equal.'
        ] }
      ]
    }
  ];

  KB.registerAll('geometry', TOPICS);

  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
