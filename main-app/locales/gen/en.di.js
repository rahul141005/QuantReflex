/**
 * en.di.js — generated-content pack (DI engine, English) for QRGenI18n (ADR-111 Phase F-M5).
 *
 * di-engine.js owns all RNG + math (dataset construction, answers, chart NUMBERS); this pack owns every user-visible
 * STRING: the theme vocabulary (entity/metric/unit/series/items), the ~35 archetype stem phrasers, the chart
 * titles/axis labels, the lead-ins and the caselet contexts. The engine reads the ACTIVE study-language pack via
 * QRGenI18n.diPack (guarded default 'en') and calls these phrasers with the indices/values it computed — so for a
 * fixed RNG seed the dataset, answer and chart numbers are IDENTICAL in every language and only the wording differs.
 *
 * EN pack = the current engine strings VERBATIM (proven byte-identical by scripts/di-census.js). Numeric theme config
 * (`range`, item/series counts) is part of each theme and MUST stay identical across en/hi/mr (asserted by the check).
 * hi/mr transliterate proper nouns to Devanagari and translate metric/unit/series/context words; digits stay 0-9;
 * ₹/%/units/symbols stay as-is. Function-valued → validated by gen-i18n.check, never the catalog string scanner.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* ── theme vocabulary (CAT / Banking / SSC / Government DI). `range`/counts are numeric config — identical across langs. ── */
  var ENTITY_THEMES = [
    { entity: 'Company', items: ['A', 'B', 'C', 'D', 'E', 'F'], pre: 'Company ', metric: 'Sales', unit: '₹ crore', series: ['2022', '2023', '2024'] },
    { entity: 'Bank Branch', items: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur'], pre: '', metric: 'Loans Disbursed', unit: '₹ lakh', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'Product', items: ['P', 'Q', 'R', 'S', 'T', 'U'], pre: 'Product ', metric: 'Units Sold', unit: "'000 units", series: ['Online', 'Retail'] },
    { entity: 'School', items: ['Rosewood', 'Hilltop', 'Greenfield', 'Lakeside', 'Oakridge', 'Sunrise'], pre: '', metric: 'Students Enrolled', unit: '', series: ['Boys', 'Girls'], range: [240, 1200, 4] },
    { entity: 'Department', items: ['HR', 'Sales', 'IT', 'Finance', 'Operations', 'Legal'], pre: '', metric: 'Employees', unit: '', series: ['2023', '2024'] },
    { entity: 'City', items: ['Indore', 'Surat', 'Nagpur', 'Kochi', 'Patna', 'Bhopal'], pre: '', metric: 'Tickets Booked', unit: '', series: ['Q1', 'Q2'], range: [200, 900, 5] },
    { entity: 'Store', items: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot'], pre: '', metric: 'Revenue', unit: '₹ lakh', series: ['2023', '2024'] },
    { entity: 'State', items: ['Punjab', 'Haryana', 'Gujarat', 'Kerala', 'Assam', 'Odisha'], pre: '', metric: 'Wheat Production', unit: "'000 tonnes", series: ['Kharif', 'Rabi'], range: [150, 900, 5] },
    { entity: 'State', items: ['Maharashtra', 'Bihar', 'Rajasthan', 'Karnataka', 'Telangana', 'Goa'], pre: '', metric: 'Population', unit: 'lakh', series: ['Urban', 'Rural'], range: [40, 360, 2] },
    { entity: 'Country', items: ['India', 'China', 'Brazil', 'Germany', 'Kenya', 'Vietnam'], pre: '', metric: 'Exports', unit: '₹ crore', series: ['2023', '2024'], range: [200, 1200, 5] },
    { entity: 'Hospital', items: ['Civil', 'Apollo', 'Fortis', 'Manipal', 'Medanta', 'KIMS'], pre: '', metric: 'Patients Admitted', unit: '', series: ['General', 'ICU'], range: [120, 720, 4] },
    { entity: 'Platform', items: ['Flipkart', 'Amazon', 'Meesho', 'Nykaa', 'Ajio', 'Tata Neu'], pre: '', metric: 'Orders', unit: "'000", series: ['Fashion', 'Electronics'], range: [60, 480, 3] },
    { entity: 'Operator', items: ['Jio', 'Airtel', 'Vodafone', 'BSNL', 'MTNL', 'ACT'], pre: '', metric: 'Subscribers', unit: 'lakh', series: ['Prepaid', 'Postpaid'], range: [40, 360, 2] },
    { entity: 'Power Plant', items: ['Korba', 'Singrauli', 'Vindhya', 'Talcher', 'Ramagundam', 'Sipat'], pre: '', metric: 'Electricity Generated', unit: 'MW', series: ['Thermal', 'Solar'], range: [150, 900, 5] },
    { entity: 'Destination', items: ['Agra', 'Jaipur', 'Goa', 'Munnar', 'Shimla', 'Hampi'], pre: '', metric: 'Tourist Arrivals', unit: "'000", series: ['Domestic', 'Foreign'], range: [60, 540, 3] },
    { entity: 'Railway Zone', items: ['Northern', 'Western', 'Central', 'Southern', 'Eastern', 'North-East'], pre: '', metric: 'Passengers Carried', unit: 'lakh', series: ['AC', 'Non-AC'], range: [80, 600, 4] },
    { entity: 'Airport', items: ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Kolkata', 'Kochi'], pre: '', metric: 'Flights Handled', unit: "'00", series: ['Domestic', 'International'], range: [40, 320, 2] },
    { entity: 'Insurer', items: ['LIC', 'HDFC', 'SBI', 'ICICI', 'Max', 'Bajaj'], pre: '', metric: 'Premiums Collected', unit: '₹ crore', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'Fund', items: ['Bluechip', 'Midcap', 'Smallcap', 'Flexicap', 'Index', 'ELSS'], pre: '', metric: 'Assets Managed', unit: '₹ crore', series: ['Equity', 'Debt'], range: [150, 900, 5] },
    { entity: 'District', items: ['Cherrapunji', 'Mawsynram', 'Pasighat', 'Agumbe', 'Amboli', 'Gangtok'], pre: '', metric: 'Rainfall', unit: 'mm', series: ['2023', '2024'], range: [400, 1600, 5] },
    { entity: 'Factory', items: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6'], pre: '', metric: 'Output', unit: "'000 units", series: ['Shift A', 'Shift B'], range: [80, 480, 4] },
    { entity: 'Team', items: ['Falcons', 'Tigers', 'Strikers', 'Warriors', 'Royals', 'Titans'], pre: '', metric: 'Goals Scored', unit: '', series: ['Home', 'Away'], range: [12, 90, 1] },
    { entity: 'Mall', items: ['Phoenix', 'Orion', 'Forum', 'Select', 'Lulu', 'Inorbit'], pre: '', metric: 'Footfall', unit: "'000", series: ['Weekday', 'Weekend'], range: [60, 480, 3] }
  ];
  var TIME_THEMES = [
    { metric: 'Revenue', unit: '₹ crore', series: ['Plant X', 'Plant Y'] },
    { metric: 'Production', unit: "'000 units", series: ['Unit A', 'Unit B'] },
    { metric: 'Profit', unit: '₹ lakh', series: ['Division 1', 'Division 2'] },
    { metric: 'Website Visitors', unit: "'000", series: ['Mobile', 'Desktop'] },
    { metric: 'Exports', unit: '₹ crore', series: ['Region East', 'Region West'] },
    { metric: 'Imports', unit: '₹ crore', series: ['Crude', 'Machinery'] },
    { metric: 'GDP', unit: "₹ '000 crore", series: ['Services', 'Industry'] },
    { metric: 'Rainfall', unit: 'mm', series: ['Coastal', 'Inland'], range: [60, 320] },
    { metric: 'Tourist Arrivals', unit: "'000", series: ['Domestic', 'Foreign'] },
    { metric: 'Car Sales', unit: "'000 units", series: ['Petrol', 'EV'] },
    { metric: 'Mobile Subscribers', unit: 'lakh', series: ['Prepaid', 'Postpaid'] },
    { metric: 'Power Generation', unit: 'million units', series: ['Thermal', 'Renewable'] },
    { metric: 'Digital Payments', unit: '₹ crore', series: ['UPI', 'Cards'] },
    { metric: 'Sugar Output', unit: "'000 tonnes", series: ['Mill A', 'Mill B'] }
  ];
  var CASELET_CTX = [
    { whole: 'people surveyed', g1: 'men', g2: 'women', act: 'preferred online shopping' },
    { whole: 'students in a class', g1: 'boys', g2: 'girls', act: 'passed the exam' },
    { whole: 'employees in a firm', g1: 'managers', g2: 'staff', act: 'opted for the new policy' },
    { whole: 'visitors to a fair', g1: 'adults', g2: 'children', act: 'bought a ticket online' },
    { whole: 'commuters polled', g1: 'car users', g2: 'bus users', act: 'support the new metro line' },
    { whole: 'subscribers', g1: 'annual members', g2: 'monthly members', act: 'renewed this year' },
    { whole: 'loan applicants', g1: 'salaried applicants', g2: 'self-employed applicants', act: 'were approved' },
    { whole: 'account holders', g1: 'savings-account holders', g2: 'current-account holders', act: 'use mobile banking' },
    { whole: 'candidates who appeared', g1: 'male candidates', g2: 'female candidates', act: 'cleared the cut-off' },
    { whole: 'registered voters', g1: 'first-time voters', g2: 'repeat voters', act: 'cast their vote' },
    { whole: 'policyholders', g1: 'term-plan holders', g2: 'endowment-plan holders', act: 'renewed their policy' },
    { whole: 'households surveyed', g1: 'urban households', g2: 'rural households', act: 'own a smartphone' },
    { whole: 'farmers in a district', g1: 'small farmers', g2: 'large farmers', act: 'adopted the new seed' },
    { whole: 'patients admitted', g1: 'insured patients', g2: 'uninsured patients', act: 'were discharged within a week' },
    { whole: 'travellers polled', g1: 'business travellers', g2: 'leisure travellers', act: 'booked through the app' },
    { whole: 'employees in a company', g1: 'on-site staff', g2: 'remote staff', act: 'enrolled in the training' }
  ];
  var SUBJECTS = ['Company XYZ', 'the firm', 'the plant', 'the portal', 'the brand', 'the network', 'the chain'];

  var NOUN = { chart: 'chart', table: 'table', graph: 'graph' };
  var AXIS_YEAR = 'Year';

  function plural(w) { if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies'; if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es'; return w + 's'; }
  function metricUnit(d) { return d.metric + (d.unit ? ' (in ' + d.unit + ')' : ''); }
  function ents(d) { return d.labels.length + ' ' + plural(d.entity).toLowerCase(); }

  var STEM_VARIETY = { total: 3, avg: 3 };   // archetypes with multiple in-engine phrasings; all others = 1

  var ENTITY_STEM = {
    read: function (d, c) { return 'What is the ' + d.metric + ' of ' + d.labels[c.i] + '?'; },
    max: function (d) { return 'Which ' + d.entity + ' has the highest ' + d.metric + '? Enter that value.'; },
    min: function (d) { return 'Which ' + d.entity + ' has the lowest ' + d.metric + '? Enter that value.'; },
    rank: function (d, c) { return 'What is the ' + (c.r === 2 ? '2nd' : '3rd') + ' highest ' + d.metric + ' among the ' + plural(d.entity).toLowerCase() + '?'; },
    total: function (d, c) { return [
      'What is the total ' + d.metric + ' of all ' + ents(d) + ' shown?',
      'What is the combined ' + d.metric + ' of the ' + ents(d) + '?',
      'Taken together, what is the total ' + d.metric + ' of all ' + ents(d) + '?'][c.vi]; },
    diff: function (d, c) { return 'By how much does the ' + d.metric + ' of ' + d.labels[c.i] + ' differ from that of ' + d.labels[c.j] + '? (enter the difference)'; },
    avg: function (d, c) { return [
      'What is the average ' + d.metric + ' across all ' + ents(d) + '?',
      'What is the mean ' + d.metric + ' per ' + d.entity.toLowerCase() + ', across the ' + ents(d) + '?',
      'On average, what is the ' + d.metric + ' of one ' + d.entity.toLowerCase() + ' among the ' + ents(d) + '?'][c.vi]; },
    share: function (d, c) { return d.labels[c.i] + ' accounts for what percent of the total ' + d.metric + '? (to 1 decimal place)'; },
    missing: function (d, c) { return 'The total ' + d.metric + ' of all ' + d.labels.length + ' ' + plural(d.entity).toLowerCase() + ' is ' + c.total + '. If every value except ' + d.labels[c.i] + ' is as shown, what is ' + d.labels[c.i] + "'s " + d.metric + '?'; },
    pctMore: function (d, c) { return d.labels[c.i] + "'s " + d.metric + ' differs from that of ' + d.labels[c.j] + ' by what percent? (to 1 decimal place, absolute value)'; },
    deviation: function (d, c) { return "By what percent does " + d.labels[c.i] + "'s " + d.metric + ' differ from the average of all ' + d.labels.length + '? (to 1 decimal place, absolute value)'; },
    combinedShare: function (d, c) { return 'Together, ' + d.labels[c.i] + ' and ' + d.labels[c.j] + ' contribute what percent of the total ' + d.metric + '? (to 1 decimal place)'; },
    ratioSimplest: function (d, c) { return 'What is the ratio of ' + d.labels[c.i] + "'s " + d.metric + ' to that of ' + d.labels[c.j] + '? Express it in simplest form a:b and enter a.'; },
    ratioTimes: function (d, c) { return d.labels[c.i] + "'s " + d.metric + ' is how many times that of ' + d.labels[c.j] + '? (to 1 decimal place)'; },
    pctMorePrimary: function (d, c) { return d.labels[c.i] + "'s " + d.metric + ' is what percent more than ' + d.labels[c.j] + "'s? (to 1 decimal place, absolute value)"; }
  };

  var TIME_STEM = {
    read: function (d, c) { return 'What was the ' + d.metric + ' in ' + d.labels[c.i] + '?'; },
    peak: function (d) { return 'What was the highest ' + d.metric + ' recorded in any single year? Enter that value.'; },
    trough: function (d) { return 'What was the lowest ' + d.metric + ' recorded in any single year? Enter that value.'; },
    total: function (d) { return 'What is the total ' + d.metric + ' over all ' + d.labels.length + ' years?'; },
    diff: function (d, c) { return 'By how much did the ' + d.metric + ' change from ' + d.labels[c.i - 1] + ' to ' + d.labels[c.i] + '? (enter the difference)'; },
    avg: function (d) { return 'What is the average annual ' + d.metric + ' over the ' + d.labels.length + ' years?'; },
    biggestJump: function (d) { return 'What is the largest change in ' + d.metric + ' between any two consecutive years?'; },
    yoy: function (d, c) { return 'What was the percent change in ' + d.metric + ' from ' + d.labels[c.y - 1] + ' to ' + d.labels[c.y] + '? (to 1 decimal place, absolute value)'; },
    cumulativeShare: function (d, c) { return 'The first ' + c.half + ' years contributed what percent of the total ' + d.metric + '? (to 1 decimal place)'; },
    overallGrowth: function (d) { return 'By what percent did the ' + d.metric + ' change over the whole period (' + d.labels[0] + ' to ' + d.labels[d.labels.length - 1] + ')? (to 1 decimal place, absolute value)'; }
  };

  var MULTI_STEM = {
    m_pctDiff: function (d, c) { return 'In ' + d.labels[c.yi] + ', the ' + d.metric + ' of ' + c.aName + ' differs from that of ' + c.bName + ' by what percent? (to 1 decimal place, absolute value)'; },
    m_ratioYear: function (d, c) { return 'In ' + d.labels[c.yi] + ', what is the ratio of ' + c.aName + ' to ' + c.bName + ' (' + d.metric + ')? Express in simplest form a:b and enter a.'; },
    m_seriesShare: function (d, c) { return 'In ' + d.labels[c.yi] + ', ' + c.aName + " accounts for what percent of that entry's combined " + d.metric + ' across all series? (to 1 decimal place)'; },
    m_combinedShare: function (d, c) { return 'Across every series and entry shown, ' + c.aName + ' and ' + c.bName + ' in ' + d.labels[c.yi] + ' together make up what percent of the grand total ' + d.metric + '? (to 1 decimal place)'; },
    m_trendCompare: function (d, c) { return 'From ' + d.labels[0] + ' to ' + d.labels[d.labels.length - 1] + ', by how many units did the larger change in ' + d.metric + ' exceed the smaller? (comparing ' + c.aName + ' and ' + c.bName + ')'; }
  };

  var CASE_STEM = {
    stem: function (ctx, c) { return 'Out of ' + c.total + ' ' + ctx.whole + ', ' + c.g1 + ' are ' + ctx.g1 + ' and ' + c.g2 + ' are ' + ctx.g2 + '. ' + c.p1 + '% of the ' + ctx.g1 + ' and ' + c.p2 + '% of the ' + ctx.g2 + ' ' + ctx.act + '. '; },
    caseRead: function (ctx) { return 'How many ' + ctx.g1 + ' ' + ctx.act + '?'; },
    caseTotal: function (ctx) { return 'In total, how many people ' + ctx.act + '?'; },
    caseMissing: function (ctx, c) { return 'If ' + c.sum + ' people in all ' + ctx.act + ', and ' + c.a1 + ' of them are ' + ctx.g1 + ', how many ' + ctx.g2 + ' ' + ctx.act + '?'; },
    caseShare: function (ctx) { return 'Of all the people who ' + ctx.act + ', what percent are ' + ctx.g1 + '? (to 1 decimal place)'; },
    fallbackQ: 'Out of 400 people surveyed, 240 are men. How many are men?'
  };

  function lead(noun, q, r) {
    var n = NOUN[noun] || noun;
    if (r < 0.4) return q;
    if (r < 0.65) return 'Based on the ' + n + ', ' + q.charAt(0).toLowerCase() + q.slice(1);
    if (r < 0.85) return 'From the ' + n + ' shown: ' + q;
    return 'Refer to the ' + n + '. ' + q;
  }

  var CHART = {
    barTitle: function (d) { return metricUnit(d) + ' by ' + d.entity; },
    pieTitle: function (d) { return 'Share of ' + metricUnit(d); },
    lineTitle: function (d) { return metricUnit(d) + ' over the years'; },
    lineTitleSubject: function (d) { return metricUnit(d) + ' of ' + d.subject + ' over the years'; },
    tableTitle: function (d) { return metricUnit(d) + ' by ' + d.entity; },
    seriesCol: function (d, name) { return name + (d.unit ? ' (' + d.unit + ')' : ''); },
    metricCol: function (d) { return d.metric + (d.unit ? ' (' + d.unit + ')' : ''); },
    yLabel: function (d) { return d.metric; },
    xYear: function () { return AXIS_YEAR; }
  };

  var pack = {
    entityThemes: ENTITY_THEMES, timeThemes: TIME_THEMES, caseletCtx: CASELET_CTX, subjects: SUBJECTS,
    stemVariety: STEM_VARIETY,
    entityStem: ENTITY_STEM, timeStem: TIME_STEM, multiStem: MULTI_STEM, caseStem: CASE_STEM,
    lead: lead, chart: CHART, plural: plural, metricUnit: metricUnit
  };

  if (GI) GI.registerDI('en', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
