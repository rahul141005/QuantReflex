/**
 * data/knowledge/mensuration.js — Mensuration knowledge objects (ADR-069).
 * Phase 1 migration of the legacy Area/Volume formula topics. Phase 3 enriches to the gold standard.
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
      searchTerms: ['area', 'square', 'rectangle', 'triangle', 'circle', 'parallelogram', 'trapezium'],
      sections: [
        { type: 'overview', text: 'Area measures the 2D space a shape covers. Most exam shapes reduce to base × height or a constant × radius².' },
        { type: 'formula', items: [
          { name: 'Square', expr: 'Area = a²', when: 'Side length is known.' },
          { name: 'Rectangle', expr: 'Area = l × b', when: 'Length and breadth given.' },
          { name: 'Triangle', expr: 'Area = ½ × base × height', when: 'Height is perpendicular to the chosen base.' },
          { name: 'Circle', expr: 'Area = πr²', when: 'Use π = 22/7 or 3.14 per the question.' },
          { name: 'Parallelogram', expr: 'Area = base × height', when: 'Same base–height idea as a rectangle.' },
          { name: 'Trapezium', expr: 'Area = ½ × (a + b) × height', when: 'a and b are the parallel sides.' }
        ] }
      ]
    },
    {
      id: 'volume', title: 'Volume', icon: '🧊', category: 'mensuration',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'volume', syllabusTopicId: null, revisionIntervalDays: 6,
      related: ['area'],
      searchTerms: ['volume', 'cube', 'cuboid', 'cylinder', 'sphere', 'cone', 'capacity'],
      sections: [
        { type: 'overview', text: 'Volume measures the 3D space a solid occupies. For prisms and cylinders it is base area × height; cones and spheres carry the 1/3 and 4/3 factors.' },
        { type: 'formula', items: [
          { name: 'Cube', expr: 'Volume = a³', when: 'All edges equal.' },
          { name: 'Cuboid', expr: 'Volume = l × b × h', when: 'Multiply all three dimensions.' },
          { name: 'Cylinder', expr: 'Volume = πr²h', when: 'Base area × height.' },
          { name: 'Sphere', expr: 'Volume = (4/3)πr³', when: 'Remember the 4/3 multiplier.' },
          { name: 'Cone', expr: 'Volume = (1/3)πr²h', when: 'Exactly one-third of the matching cylinder.' }
        ] }
      ]
    }
  ];

  KB.registerAll('mensuration', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
