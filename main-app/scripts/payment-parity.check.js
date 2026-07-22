/**
 * payment-parity.check.js — pricing/duration single-source-of-truth ratchet (Phase 4, ADR-114).
 *
 * The plan constants are deliberately inline-copied in four places (server PLAN_CONFIG, server
 * revenue map, client display PLANS, shared canonical constants) because `shared/` sits outside
 * each app's Vercel deploy root (ADR-099). This check makes the copies impossible to drift:
 * it parses the actual source files and asserts mutual equality, display-vs-paise coherence,
 * the marketing save-% math, and the absence of stale price literals in UI copy.
 *
 * Deliberate EXEMPTION: super-admin-app/api/_lib/metrics.js PREMIUM_PRICE_PAISE is a HISTORICAL
 * fallback for pre-`amount` legacy payment docs (sold at launch prices) and must NOT track live
 * price changes — this check asserts the exemption comment is still present so nobody "fixes" it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const RR = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* ---- 1. server canonical: services/paymentService.js PLAN_CONFIG ---- */
const psSrc = R('services/paymentService.js');
function planCfg(key) {
  const m = psSrc.match(new RegExp(key + ":\\s*\\{\\s*amountPaise:\\s*(\\d+),\\s*label:\\s*'([^']+)',\\s*durationDays:\\s*(\\d+)"));
  return m ? { paise: +m[1], label: m[2], days: +m[3] } : null;
}
const ps6 = planCfg('premium_6m'), ps12 = planCfg('premium_12m');
ok('paymentService PLAN_CONFIG parses', !!(ps6 && ps12));

/* ---- 2. server revenue map: services/aiService.js ---- */
const aiSrc = R('services/aiService.js');
const aiPrice = aiSrc.match(/PREMIUM_PRICE_PAISE\s*=\s*\{\s*premium_6m:\s*(\d+),\s*premium_12m:\s*(\d+)/);
const aiDays = aiSrc.match(/PREMIUM_DURATION_DAYS\s*=\s*\{\s*premium_6m:\s*(\d+),\s*premium_12m:\s*(\d+)/);
ok('aiService price/duration maps parse', !!(aiPrice && aiDays));

/* ---- 3. client display: js/paywall.js PLANS ---- */
const pwSrc = R('js/paywall.js');
function pwPlan(key) {
  const m = pwSrc.match(new RegExp(key + ":\\s*\\{[^}]*price:\\s*(\\d+),\\s*months:\\s*(\\d+),\\s*perMonth:\\s*(\\d+)"));
  return m ? { rupees: +m[1], months: +m[2], perMonth: +m[3] } : null;
}
const pw6 = pwPlan('premium_6m'), pw12 = pwPlan('premium_12m');
ok('paywall PLANS parses', !!(pw6 && pw12));

/* ---- 4. shared canonical: shared/constants/entitlements.js ---- */
const shSrc = RR('shared/constants/entitlements.js');
const sh6 = shSrc.match(/PREMIUM_6M:\s*(\d+),/), sh12 = shSrc.match(/PREMIUM_12M:\s*(\d+)/);
const shD6 = shSrc.match(/DURATIONS_DAYS\s*=\s*\{[^}]*PREMIUM_6M:\s*(\d+)/);
ok('shared PRICING parses', !!(sh6 && sh12));

/* ---- mutual parity ---- */
if (ps6 && ps12 && aiPrice && pw6 && pw12 && sh6 && sh12) {
  ok('6m paise: paymentService == aiService', ps6.paise === +aiPrice[1], ps6.paise + ' vs ' + aiPrice[1]);
  ok('12m paise: paymentService == aiService', ps12.paise === +aiPrice[2], ps12.paise + ' vs ' + aiPrice[2]);
  ok('6m paise: paymentService == shared', ps6.paise === +sh6[1], ps6.paise + ' vs ' + sh6[1]);
  ok('12m paise: paymentService == shared', ps12.paise === +sh12[1], ps12.paise + ' vs ' + sh12[1]);
  ok('6m display rupees x100 == paise', pw6.rupees * 100 === ps6.paise, pw6.rupees + ' vs ' + ps6.paise);
  ok('12m display rupees x100 == paise', pw12.rupees * 100 === ps12.paise, pw12.rupees + ' vs ' + ps12.paise);
  ok('6m days: paymentService == aiService', !!aiDays && ps6.days === +aiDays[1]);
  ok('12m days: paymentService == aiService', !!aiDays && ps12.days === +aiDays[2]);
  ok('6m days: paymentService == shared', !!shD6 && ps6.days === +shD6[1]);
  ok('perMonth math (6m)', pw6.perMonth === Math.round(pw6.rupees / pw6.months), 'got ' + pw6.perMonth);
  ok('perMonth math (12m)', pw12.perMonth === Math.round(pw12.rupees / pw12.months), 'got ' + pw12.perMonth);

  /* marketing save-% (12m vs 6m per-month) must match the locale copy in all three languages */
  const savePct = Math.round((1 - (pw12.rupees / 12) / (pw6.rupees / 6)) * 100);
  for (const loc of ['en', 'hi', 'mr']) {
    const l = R('locales/' + loc + '.js');
    const m = l.match(/savePct:\s*'([^']*)'/);
    ok('locales/' + loc + ' savePct exists', !!m);
    if (m) ok('locales/' + loc + ' savePct says ' + savePct + '%', m[1].indexOf(String(savePct)) !== -1, m[1]);
    /* stale-price guard: the paywall namespace must not mention retired price points */
    const pwBlock = (l.match(/paywall:\s*\{[\s\S]*?\n\s{4}\}/) || [''])[0];
    ok('locales/' + loc + ' paywall block has no stale 349/499/28%', !/349|499|28%/.test(pwBlock));
  }
}

/* ---- historical-fallback exemption stays documented ---- */
const metricsSrc = RR('super-admin-app/api/_lib/metrics.js');
ok('metrics.js historical fallback exemption documented',
  /HISTORICAL fallback only/.test(metricsSrc) && /34900/.test(metricsSrc),
  'the legacy revenue map must stay at launch prices with its comment');

/* ---- Play SKU <-> plan map parity (active once WS5 lands; soft until the map exists) ---- */
const skuMap = shSrc.match(/PLAY_SKUS\s*=\s*\{\s*premium_6m:\s*'([^']+)',\s*premium_12m:\s*'([^']+)'/);
if (skuMap) {
  const pbSrcPath = path.join(__dirname, '..', 'services', 'playBillingService.js');
  if (fs.existsSync(pbSrcPath)) {
    const pb = fs.readFileSync(pbSrcPath, 'utf8');
    ok('play SKU map: shared == playBillingService (6m)', pb.indexOf("'" + skuMap[1] + "'") !== -1);
    ok('play SKU map: shared == playBillingService (12m)', pb.indexOf("'" + skuMap[2] + "'") !== -1);
  }
} else {
  console.log('  note: PLAY_SKUS not yet defined (pre-WS5 state) — not enforced');
}

console.log('payment-parity.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
