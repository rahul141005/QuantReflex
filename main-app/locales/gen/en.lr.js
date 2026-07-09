/**
 * en.lr.js — generated-content pack (LR engine, English) for QRGenI18n (ADR-111 Phase F-M6).
 *
 * lr-engine.js owns ALL RNG + math (dataset construction, answers, MCQ distractor selection, model-checking); this
 * pack owns every user-visible STRING: name/noun/word pools, the ~12 category stem phrasers, kinship relation terms,
 * direction/weekday/month words, syllogism quantifier forms and verdicts. The engine reads the ACTIVE study-language
 * pack via QRGenI18n.lrPack (guarded default 'en') and feeds it the indices/values it computed — so for a fixed RNG
 * seed the answer, options (by relation-id/index), subtype and difficulty are IDENTICAL in every language; only the
 * wording differs (proven by scripts/lr-census.js EN byte-identity + gen-i18n.check §11 invariance).
 *
 * KINSHIP (blueprint §5.4.4): Hindi/Marathi kinship is finer than English (Uncle→चाचा/मामा by lineage). `relTerm`
 * takes a generic relation-id + a lineage SPECIFIER (pat/mat/sons/daughters/bro/sis, derived by the engine from the
 * known r2). EN collapses every specific case to the generic English term (byte-identical); hi/mr render the specific
 * word for the ANSWER and a canonical word for distractors — so EN option sets stay dedup-clean and hi/mr read native.
 *
 * EN pack = the current engine strings VERBATIM. Cipher substrates (CAT, DOG…), variables (A,B,P,Q), coded symbols
 * (@#&%$, >≥<≤=), letters and digits stay Latin/symbolic in every language. Function-valued → validated by gen-i18n.check.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* ── pools ── */
  var NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Neha', 'Arjun', 'Kavya', 'Rohan', 'Pooja', 'Karan', 'Divya',
    'Aditya', 'Meera', 'Farhan', 'Ananya', 'Ishaan', 'Riya', 'Kabir', 'Tara', 'Nikhil', 'Sara', 'Vivek', 'Gauri',
    'Manish', 'Ritu', 'Aryan', 'Diya', 'Rohit', 'Anjali', 'Saurabh', 'Kiran'];
  var ACTORS = ['A person', 'A man', 'A woman', 'A jogger', 'A hiker', 'A tourist', 'A morning walker', 'Ravi', 'Priya', 'Arjun', 'Meera', 'Kabir'];
  var ROW_OPENS = ['In a row of people', 'In a straight line', 'In a row of children', 'Standing in a single row', 'In a line at the assembly', 'Among friends standing in a row'];
  var Q_OPENS = ['In a queue', 'In a line at the ticket counter', 'Waiting in a queue', 'In a line at the bus stop', 'Standing in a queue'];
  var DIR8 = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
  var DIR4 = ['North', 'East', 'South', 'West'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var NOUNS = ['cats', 'dogs', 'birds', 'pens', 'books', 'cars', 'trees', 'flowers', 'tables', 'chairs', 'apples', 'mangoes', 'doctors', 'teachers', 'singers', 'players',
    'lawyers', 'engineers', 'nurses', 'farmers', 'painters', 'dancers', 'soldiers', 'pilots', 'bottles', 'phones', 'laptops', 'mirrors',
    'roses', 'lilies', 'oranges', 'lemons', 'lions', 'tigers', 'rivers', 'mountains', 'cities', 'villages', 'islands', 'bridges'];
  var WORD_GROUPS = [
    { in: ['Rose', 'Lily', 'Jasmine', 'Lotus', 'Tulip'], out: ['Mango', 'Apple', 'Potato', 'Carrot', 'Onion'] },
    { in: ['Apple', 'Mango', 'Banana', 'Guava', 'Orange'], out: ['Potato', 'Carrot', 'Radish', 'Rose', 'Onion'] },
    { in: ['Lion', 'Tiger', 'Leopard', 'Cheetah', 'Panther'], out: ['Cow', 'Goat', 'Sheep', 'Horse', 'Camel'] },
    { in: ['Copper', 'Iron', 'Gold', 'Silver', 'Zinc'], out: ['Oxygen', 'Plastic', 'Wood', 'Glass', 'Rubber'] },
    { in: ['Sparrow', 'Eagle', 'Parrot', 'Crow', 'Pigeon'], out: ['Shark', 'Whale', 'Cobra', 'Frog', 'Rat'] },
    { in: ['Triangle', 'Square', 'Hexagon', 'Pentagon', 'Octagon'], out: ['Circle', 'Sphere', 'Cube', 'Line', 'Point'] },
    { in: ['India', 'Nepal', 'Japan', 'Brazil', 'Kenya'], out: ['Asia', 'Europe', 'Delhi', 'Paris', 'Nile'] },
    { in: ['Carrot', 'Potato', 'Onion', 'Radish', 'Beetroot'], out: ['Apple', 'Mango', 'Rose', 'Wheat', 'Lotus'] },
    { in: ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'], out: ['Moon', 'Sun', 'Comet', 'Asteroid', 'Star'] },
    { in: ['Flute', 'Trumpet', 'Saxophone', 'Clarinet', 'Harmonica'], out: ['Guitar', 'Drum', 'Piano', 'Violin', 'Tabla'] },
    { in: ['Hammer', 'Saw', 'Drill', 'Screwdriver', 'Wrench'], out: ['Nail', 'Screw', 'Plank', 'Glue', 'Paint'] },
    { in: ['Doctor', 'Engineer', 'Lawyer', 'Teacher', 'Architect'], out: ['Hospital', 'Bridge', 'Court', 'School', 'Building'] }
  ];
  var VERBAL_ANALOGY = [
    { a: 'Hand', b: 'Glove', c: 'Foot', ans: 'Sock', pool: ['Sock', 'Shoe', 'Toe', 'Leg', 'Heel'] },
    { a: 'Bird', b: 'Nest', c: 'Bee', ans: 'Hive', pool: ['Hive', 'Web', 'Den', 'Burrow', 'Cave'] },
    { a: 'Pen', b: 'Write', c: 'Knife', ans: 'Cut', pool: ['Cut', 'Sharp', 'Blade', 'Kitchen', 'Steel'] },
    { a: 'Doctor', b: 'Patient', c: 'Teacher', ans: 'Student', pool: ['Student', 'School', 'Lesson', 'Class', 'Book'] },
    { a: 'Day', b: 'Night', c: 'Summer', ans: 'Winter', pool: ['Winter', 'Season', 'Rain', 'Hot', 'Sun'] },
    { a: 'Car', b: 'Garage', c: 'Aeroplane', ans: 'Hangar', pool: ['Hangar', 'Airport', 'Runway', 'Sky', 'Pilot'] },
    { a: 'Author', b: 'Book', c: 'Composer', ans: 'Music', pool: ['Music', 'Piano', 'Song', 'Note', 'Band'] },
    { a: 'Cow', b: 'Calf', c: 'Dog', ans: 'Puppy', pool: ['Puppy', 'Kitten', 'Cub', 'Foal', 'Kid'] },
    { a: 'Wheel', b: 'Car', c: 'Petal', ans: 'Flower', pool: ['Flower', 'Garden', 'Stem', 'Leaf', 'Seed'] },
    { a: 'Hunger', b: 'Food', c: 'Thirst', ans: 'Water', pool: ['Water', 'Drink', 'Glass', 'Juice', 'Rain'] },
    { a: 'Captain', b: 'Team', c: 'Principal', ans: 'School', pool: ['School', 'Class', 'Teacher', 'Student', 'Office'] },
    { a: 'Painter', b: 'Brush', c: 'Writer', ans: 'Pen', pool: ['Pen', 'Paper', 'Book', 'Ink', 'Word'] },
    { a: 'Thermometer', b: 'Temperature', c: 'Clock', ans: 'Time', pool: ['Time', 'Hour', 'Minute', 'Watch', 'Alarm'] },
    { a: 'Library', b: 'Books', c: 'Arsenal', ans: 'Weapons', pool: ['Weapons', 'Soldiers', 'War', 'Guards', 'Fort'] },
    { a: 'Caterpillar', b: 'Butterfly', c: 'Tadpole', ans: 'Frog', pool: ['Frog', 'Fish', 'Snake', 'Lizard', 'Toad'] },
    { a: 'Drizzle', b: 'Downpour', c: 'Breeze', ans: 'Gale', pool: ['Gale', 'Storm', 'Wind', 'Cyclone', 'Air'] }
  ];
  var INEQ_VERDICTS = ['Only I is true', 'Only II is true', 'Both I and II are true', 'Either I or II is true', 'Neither I nor II is true'];

  /* kinship: relation-primitive display words (for stems "A is the <father> of B") + generic-id → term + specific rendering. */
  var PRIM_WORD = { father: 'father', mother: 'mother', son: 'son', daughter: 'daughter', brother: 'brother', sister: 'sister' };
  /* generic relation ids (the REL_POOL); EN term = the id capitalised as today. */
  var REL_GENERIC = ['Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Nephew', 'Niece', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Cousin'];
  /* EN ignores the specifier — every specific case collapses to the generic English term (byte-identical). */
  function relTerm(generic, spec) { return generic; }

  var CODE_OP_WORD = { '+': 'father', '-': 'mother', '*': 'son', '/': 'daughter', '>': 'brother', '<': 'sister' };

  /* ── stem phrasers (the engine computes all numbers/indices; these produce the wording) ── */
  var LR = {
    names: NAMES, actors: ACTORS, rowOpens: ROW_OPENS, qOpens: Q_OPENS, dir8: DIR8, dir4: DIR4,
    weekdays: WEEKDAYS, months: MONTHS, nouns: NOUNS, wordGroups: WORD_GROUPS, verbalAnalogy: VERBAL_ANALOGY,
    ineqVerdicts: INEQ_VERDICTS, relGeneric: REL_GENERIC, relTerm: relTerm, primWord: PRIM_WORD, codeOpWord: CODE_OP_WORD,

    /* 1. coding-decoding */
    coding: {
      sum: function (w) { return 'If each letter scores its position (A=1, B=2, …, Z=26), what is the total score of the word "' + w + '"?'; },
      numcode: function (w) { return 'Each letter is written as its position number (A=1, B=2, …, Z=26). Which is the correct code for "' + w + '"?'; },
      revsum: function (w) { return 'In a code, letters are valued in REVERSE (A=26, B=25, …, Z=1). What is the total value of "' + w + '"?'; },
      cipher: function (ex, exCode, target) { return 'In a certain code, "' + ex + '" is written as "' + exCode + '". How is "' + target + '" written in that code?'; },
      posshift: function (ex, exCode, target) { return 'In a certain code, "' + ex + '" is written as "' + exCode + '". Following the same rule, how is "' + target + '" written?'; },
      revshift: function (ex, exCode, target) { return 'In a certain code, "' + ex + '" is written as "' + exCode + '" (the word is reversed, then each letter shifted by the same number). How is "' + target + '" written?'; }
    },

    /* 2. blood relations */
    blood: {
      chainStem: function (A, B, C, r1w, r2w) { return A + ' is the ' + r1w + ' of ' + B + '. ' + B + ' is the ' + r2w + ' of ' + C + '. How is ' + A + ' related to ' + C + '?'; },
      codedStem: function (legend, r1w, op1, expr, P, R) { return 'If, between two people, ' + legend + ' (read left-to-right, e.g. "X ' + op1 + ' Y" means X is the ' + r1w + ' of Y), then in the expression "' + expr + '", how is ' + P + ' related to ' + R + '?'; },
      legendItem: function (sym, relWord) { return "'" + sym + "' = " + relWord; }
    },

    /* 3. direction sense */
    direction: {
      dist2: function (actor, a, nWord, b, eWord) { return actor + ' walks ' + a + ' km ' + nWord + ', then turns and walks ' + b + ' km ' + eWord + '. How far (in km) is the person now from the starting point?'; },
      dist3: function (actor, p1, nWord, extra, opp, b, eWord) { return actor + ' walks ' + p1 + ' km ' + nWord + ', then ' + extra + ' km ' + opp + ', then ' + b + ' km ' + eWord + '. How far (in km) is the person from the start?'; },
      turns: function (who, start, seq, subject) { return who + ' is facing ' + start + '. ' + who + ' ' + seq + '. Which direction is ' + subject + ' facing now?'; },
      turnPhrase: function (tn) { return tn === 'about' ? 'turns around (180°)' : 'turns ' + tn; },
      turnJoin: ', then ',
      turnSubjectPerson: 'the person',
      diagonal: function (actor, north, south, east, west) { return actor + ' walks ' + north + ' km North, ' + south + ' km South, ' + east + ' km East and ' + west + ' km West. In which direction is the person now from the starting point?'; }
    },

    /* 4. ranking & ordering */
    ranking: {
      total: function (rowOpen, nm, ordL, ordR, tail) { return rowOpen + ', ' + nm + ' is ' + ordL + ' from the left and ' + ordR + ' from the right. ' + tail; },
      totalTails: ['How many people are there in the row?', 'What is the total number of people in the row?', 'How many people are standing in the row?'],
      otherend: function (N, nm, ordK) { return 'In a class of ' + N + ' students, ' + nm + ' ranks ' + ordK + ' from the top. What is ' + nm + "'s rank from the bottom?"; },
      between: function (qOpen, nm, ordA, nm2, ordB) { return qOpen + ', ' + nm + ' is ' + ordA + ' from the front and ' + nm2 + ' is ' + ordB + ' from the front. How many people stand between them?'; },
      multistep: function (nm, ordL, ordR, ordP) { return nm + ' is ' + ordL + ' from the left and ' + ordR + ' from the right in a row. How many people are to the RIGHT of the person standing ' + ordP + ' from the left?'; },
      interchange: function (A, ordAL, B, ordBR, newAL) { return 'In a row, ' + A + ' is ' + ordAL + ' from the left and ' + B + ' is ' + ordBR + ' from the right. After they interchange seats, ' + A + ' now stands at position ' + newAL + ' counting from the left end. How many people are in the row?'; }
    },

    /* 5. odd one out */
    odd: {
      numeric: function (list) { return 'Which one does NOT belong with the others: ' + list + '?'; },
      letter: function (list) { return 'Three of these letter-pairs follow the same rule. Which one is the ODD one out: ' + list + '?'; },
      word: function (list) { return 'Which one does NOT belong with the others: ' + list + '?'; }
    },

    /* 6. analogies */
    analogy: {
      numeric: function (a, fa, c) { return a + ' : ' + fa + ' :: ' + c + ' : ?'; },
      verbal: function (a, b, c) { return a + ' : ' + b + ' :: ' + c + ' : ?'; },
      letter: function (p1, p1code, p3) { return p1 + ' : ' + p1code + ' :: ' + p3 + ' : ?'; }
    },

    /* 7. syllogisms — quantifier forms + wrapper */
    syllo: {
      stmt: function (quant, x, y, neg) {
        if (quant === 'All') return 'All ' + x + ' are ' + y;
        if (quant === 'No') return 'No ' + x + ' are ' + y;
        return 'Some ' + x + ' are ' + (neg ? 'not ' : '') + y;
      },
      verdict: { 'Follows': 'Follows', 'Does not follow': 'Does not follow' },
      wrap: function (premises, conclusion) { return 'Statements: ' + premises + ' Conclusion: ' + conclusion + ' Does the conclusion logically follow?'; }
    },

    /* 8. series */
    series: { next: function (seq) { return 'Find the next term in the series:  ' + seq + ', ?'; } },

    /* 9. coded inequalities */
    inequality: {
      legendItem: function (sym, rel) { return "'" + sym + "' means '" + rel + "'"; },
      stem: function (legend, stmt, vi, rI, vj, rII) { return 'In a certain code, ' + legend + '.\nStatements: ' + stmt + '.\nConclusions:  I. ' + vi + ' ' + rI + ' ' + vj + '   II. ' + vi + ' ' + rII + ' ' + vj + '.\nWhich conclusion is definitely true?'; }
    },

    /* 10. calendars */
    calendar: {
      dayafter: function (startWd, off) { return 'If today is ' + startWd + ', what day of the week will it be after ' + off + ' days?'; },
      datediff: function (y, date1, wd1, date2) { return 'In the year ' + y + ', ' + date1 + ' falls on a ' + wd1 + '. What day of the week is ' + date2 + ' in the same year?'; },
      dow: function (date, yy) { return 'What day of the week was ' + date + ', ' + yy + '?'; },
      fmtDate: function (d, monthName) { return d + ' ' + monthName; }
    },

    /* 11. clocks */
    clock: {
      angle0: function (h) { return 'What is the angle (in degrees) between the hour and minute hands of a clock at ' + h + ':00?'; },
      angle30: function (h) { return 'What is the angle (in degrees) between the hour and minute hands of a clock at ' + h + ':30?'; },
      minmove: function (mn) { return 'Through how many degrees does the minute hand of a clock turn in ' + mn + ' minutes?'; },
      hourmin: function (em) { return 'Through how many degrees does the hour hand of a clock turn in ' + em + ' minutes?'; },
      hourmove: function (hr) { return 'Through how many degrees does the hour hand of a clock turn in ' + hr + ' hours?'; },
      angle: function (clk) { return 'What is the smaller angle (in degrees) between the hour and minute hands at ' + clk + '?'; },
      mirror: function (clk) { return 'A clock shows ' + clk + '. What time does its mirror image show?'; }
    },

    /* 12. input-output */
    io: { stem: function (nums, ordP, S) { return 'A sorting machine works one step at a time: each step moves the smallest not-yet-arranged number to the front of the unarranged part. Input line: ' + nums + '. Which number is in the ' + ordP + ' position from the left after Step ' + S + '?'; } },

    /* ordinal — English suffix (hi/mr override) */
    ord: function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  };

  if (GI) GI.registerLR('en', LR);
  if (typeof module !== 'undefined' && module.exports) module.exports = LR;
})();
