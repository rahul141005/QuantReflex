/**
 * data/knowledge/mensuration.js — "Mensuration" knowledge objects (ADR-069, Phase 3 gold-standard content).
 * Original exam-grade explanations; organisation inspired by the standard speed-maths cheat sheets. No filler.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'area', title: 'Area', icon: '📐', category: 'mensuration',
      difficulty: 'foundation', examFrequency: 'medium', status: 'published',
      drillCategory: 'area', syllabusTopicId: null, revisionIntervalDays: 6,
      related: ['volume'],
      searchTerms: ['area', 'square', 'rectangle', 'triangle', 'circle', 'parallelogram', 'trapezium', 'perimeter'],
      sections: [
        { type: 'overview', text: 'Area is the 2D space a shape covers, measured in square units. Almost every exam shape reduces to one of three ideas: side², base × height, or a constant × radius². Keep π as 22/7 or 3.14 as the numbers suggest.' },
        { type: 'concept', title: 'Three building blocks', body: 'Rectangles and parallelograms are base × height; triangles are half of that; circles scale with the square of the radius. A trapezium is the average of its two parallel sides times the height — a "rectangle" of the mean width.' },
        { type: 'formula', items: [
          { name: 'Square / Rectangle', expr: 'Square = a²;  Rectangle = l × b', when: 'Right-angled shapes with given sides.' },
          { name: 'Triangle', expr: 'Area = ½ × base × height', when: 'Height must be perpendicular to the chosen base.' },
          { name: 'Circle', expr: 'Area = πr²;  Circumference = 2πr', when: 'Use π = 22/7 with multiples of 7.' },
          { name: 'Parallelogram / Trapezium', expr: 'Parallelogram = base × height;  Trapezium = ½(a + b) × height', when: 'a, b are the parallel sides of the trapezium.' }
        ] },
        { type: 'trick', title: 'Scaling shortcut', items: [
          'If each linear dimension scales by k, area scales by k². Doubling the side of a square quadruples its area.',
          'Equilateral triangle of side a: area = (√3/4)a².'
        ] },
        { type: 'example', problem: 'Find the area of a circle of radius 7 cm.', steps: [
          'Area = πr² = 22/7 × 7².',
          '= 22/7 × 49 = 22 × 7.'
        ], answer: '154 cm²' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Using a slant side as the height of a triangle/parallelogram (it must be perpendicular).',
          'Confusing area (r²) with circumference (r).',
          'Forgetting that area scales with the SQUARE of any length change.',
          'Mixing units (cm with m) before computing.'
        ] },
        { type: 'memory', text: 'Triangle = ½ base × height; circle = πr². Area always scales as length².' },
        { type: 'revision', points: [
          'Square a², rectangle l×b, triangle ½bh.',
          'Circle πr², circumference 2πr.',
          'Trapezium ½(a+b)h; parallelogram base×height.',
          'Scale length by k ⇒ area by k².'
        ] }
      ]
    },
    {
      id: 'volume', title: 'Volume', icon: '🧊', category: 'mensuration',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'volume', syllabusTopicId: null, revisionIntervalDays: 6,
      related: ['area'],
      searchTerms: ['volume', 'cube', 'cuboid', 'cylinder', 'sphere', 'cone', 'capacity', 'surface area'],
      sections: [
        { type: 'overview', text: 'Volume is the 3D space a solid occupies, in cubic units. For prisms and cylinders it is simply base area × height; cones and spheres carry the memorable 1/3 and 4/3 factors.' },
        { type: 'concept', title: 'Base area × height, with two exceptions', body: 'A cuboid is l × b × h; a cylinder is its circular base πr² times height. A cone is exactly one-third of the cylinder with the same base and height; a sphere is 4/3 πr³. Those two fractions are the whole game.' },
        { type: 'formula', items: [
          { name: 'Cube / Cuboid', expr: 'Cube = a³;  Cuboid = l × b × h', when: 'Rectangular solids.' },
          { name: 'Cylinder', expr: 'Volume = πr²h;  Curved surface = 2πrh', when: 'Base area × height.' },
          { name: 'Cone', expr: 'Volume = ⅓ πr²h', when: 'Exactly one-third of the matching cylinder.' },
          { name: 'Sphere', expr: 'Volume = 4⁄3 πr³;  Surface = 4πr²', when: 'Remember the 4/3 multiplier.' }
        ] },
        { type: 'trick', title: 'Scaling shortcut', items: [
          'Scale every length by k ⇒ volume scales by k³, surface area by k².',
          'A cone, hemisphere and cylinder on the same base and height are in the volume ratio 1 : 2 : 3.'
        ] },
        { type: 'example', problem: 'Find the volume of a cylinder of radius 7 cm and height 10 cm.', steps: [
          'Volume = πr²h = 22/7 × 7² × 10.',
          '= 22/7 × 49 × 10 = 22 × 7 × 10.'
        ], answer: '1540 cm³' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Dropping the 1/3 (cone) or 4/3 (sphere) factor.',
          'Using diameter where the formula needs radius.',
          'Confusing volume (length³) with surface area (length²).',
          'Forgetting volume scales as the CUBE of any length change.'
        ] },
        { type: 'memory', text: 'Cylinder πr²h; cone is ⅓ of it; sphere 4⁄3 πr³. Volume scales as length³.' },
        { type: 'revision', points: [
          'Cube a³, cuboid l·b·h, cylinder πr²h.',
          'Cone ⅓πr²h, sphere 4⁄3πr³.',
          'Cone : hemisphere : cylinder (same base, height) = 1 : 2 : 3.',
          'Scale length by k ⇒ volume by k³.'
        ] }
      ]
    }
  ];

  KB.registerAll('mensuration', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
