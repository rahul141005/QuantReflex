/**
 * stats-view.js — Stats view renderer (ADR-080 rebuild).
 *
 * The Stats tab answers ONE question: "Am I becoming better at aptitude?" It reads exclusively from the pure
 * derivation layer (statMath) weighted by the exam-relevance metadata, so Analytics and QuanAI can never disagree and
 * nothing is fabricated (thin data is confidence-damped or shown as an honest empty state). Sections, top to bottom:
 *   Today · Momentum · Subject Mastery · Time Invested · Study Next · QuanAI Recommends · AI deep-dive.
 * No gamification (no XP/coins/levels/badges) — a premium productivity tool.
 */
var _lastStatsFingerprint = null;

function renderStatsView() {
  var p = loadProgress();

  /* PREM-6 (ADR-107): the deep-insights block (mastery + study-next + QuanAI breakdown) is one Premium gate, so it
     derives from the premium entitlement directly rather than a single feature key standing in for the group.
     Behaviour-identical under the single tier; the locked-card CTAs keep their own showPaywall context keys. */
  var canDeep = (typeof hasPremiumAccess === 'function') ? hasPremiumAccess() : true;

  /* Dirty-flag cache: every answer bumps totalAttempted, so this catches all content changes cheaply. Entitlement is
     part of the key (ADR-095) — an in-session upgrade flips canDeep with no new answer, and must re-render so the
     locked Mastery/Study-Next/Recommends cards unlock immediately instead of staying gated until the next question. */
  var fingerprint = (p.totalAttempted || 0) + ':' + (p.totalCorrect || 0) + ':' + (p.dailyStreak || 0) + ':' +
    (p.todayAttempted || 0) + ':' + (_statsTargetExam()) + ':' + (canDeep ? 1 : 0);
  if (_lastStatsFingerprint === fingerprint) return;
  _lastStatsFingerprint = fingerprint;

  var SM = (typeof QR_STATMATH !== 'undefined') ? QR_STATMATH : null;
  var SUB = (typeof QR_SUBJECTS !== 'undefined') ? QR_SUBJECTS : null;
  var ER = (typeof QR_EXAMREL !== 'undefined') ? QR_EXAMREL : null;

  var subjectCats = {};
  if (SUB) SUB.subjects().forEach(function (s) { subjectCats[s.id] = SUB.subjectToCategories(s.id); });
  var weightedCats = (ER && typeof KnowledgeBase !== 'undefined') ? ER.weightedCategories(KnowledgeBase.all()) : [];

  _renderToday(p, SM, SUB, subjectCats);
  _renderMomentum(p, SM);

  /* Premium block — Subject Mastery, Study Next, Recommendation. Free users get one clean locked card and the rest are
     hidden (Time Invested stays free as a motivation hook). */
  _toggleSection('weakestSection', canDeep);
  _toggleSection('recommendationSection', canDeep);

  if (!canDeep) {
    _renderMasteryLocked();
  } else {
    _renderMastery(p, SM, SUB, subjectCats);
    _renderWeakest(p, SM);
    _renderRecommendation(p, SM, ER, weightedCats);
  }

  _renderTimeInvested(p, SM, SUB, subjectCats);
  _renderAiDeepDive(p);
}

/* ───────────────────────── helpers ───────────────────────── */
function _statsEl(id) { return document.getElementById(id); }
function _statsTargetExam() { try { return (typeof TargetExam !== 'undefined' && TargetExam.get()) || ''; } catch (_) { return ''; } }
function _toggleSection(id, show) { var el = _statsEl(id); if (el) el.style.display = show ? '' : 'none'; }
function _statCatLabel(cat) { return (typeof formatCategoryName === 'function') ? formatCategoryName(cat) : cat; }
function _statSubjLabel(SUB, sid) { return (SUB && SUB.label) ? SUB.label(sid) : sid; }

function _fmtClock(sec) {
  sec = Math.round(Number(sec) || 0);
  if (sec < 60) return sec + 's';
  var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h > 0) return h + 'h' + (m ? ' ' + m + 'm' : '');
  return m + 'm';
}
function _fmtAgo(ts) {
  if (!ts) return '—';
  var d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return QRI18n.t('stats.agoToday');
  if (d === 1) return QRI18n.t('stats.agoYesterday');
  if (d < 7) return QRI18n.t('stats.agoDays', { count: d });
  if (d < 30) return QRI18n.t('stats.agoWeeks', { count: Math.floor(d / 7) });
  return QRI18n.t('stats.agoMonths', { count: Math.floor(d / 30) });
}
/* the shared accuracy→bar/strength language (same cuts as the category bars, so everything reads identically) */
function _barClass(pct) { return pct >= 85 ? 'cat-bar-high' : pct >= 65 ? 'cat-bar-mid' : pct >= 40 ? 'cat-bar-low' : 'cat-bar-weak'; }
function _strength(pct) { return pct >= 85 ? ['strong', QRI18n.t('stats.strengthStrong')] : pct >= 65 ? ['moderate', QRI18n.t('stats.strengthModerate')] : ['weak', QRI18n.t('stats.strengthWeak')]; }
/* vcls: 'value-sm' keeps the wrap-friendly small treatment (momentum trend words like "Building"); '' uses the big
   prominent .value (Today's headline numbers — these must read as the hero metric, not shrink to 13px). */
function _statCard(value, label, mod, hint, vcls) {
  if (vcls == null) vcls = 'value-sm';
  return '<div class="stat-card' + (mod || '') + '"><div class="value ' + vcls + '">' + value + '</div><div class="label">' + label + '</div>' +
    (hint ? '<div class="stat-hint">' + hint + '</div>' : '') + '</div>';
}

/* ───────────────────────── TODAY ───────────────────────── */
function _renderToday(p, SM, SUB, subjectCats) {
  var el = _statsEl('statsToday'); if (!el) return;
  var t = SM ? SM.today(p) : { attempted: p.todayAttempted || 0, correct: p.todayCorrect || 0, accuracy: null, avgSecPerQ: null };
  var accDisp = t.accuracy == null ? '—' : Math.round(t.accuracy * 100) + '%';
  var spd = t.avgSecPerQ != null ? t.avgSecPerQ + 's' : '—';
  var ti = SM ? SM.timeInvested(p, subjectCats) : null;
  var study = ti ? _fmtClock(ti.todaySec) : '—';
  el.className = 'stat-grid stat-grid-2';
  el.innerHTML =
    _statCard((t.attempted || 0), QRI18n.t('stats.solvedToday'), '', '', '') +
    _statCard(accDisp, QRI18n.t('stats.accuracyLabel'), t.accuracy != null ? (t.accuracy >= 0.7 ? ' stat-card-positive' : '') : '', '', '') +
    _statCard(spd, QRI18n.t('stats.avgTimePerQ'), '', '', '') +
    _statCard(study, QRI18n.t('stats.studyTime'), '', '', '');

  /* today's subject split (from the day-reset todayCats tally) */
  var split = _statsEl('statsTodaySplit'); if (!split) return;
  var tc = p.todayCats || {};
  var rows = '';
  if (SUB && Object.keys(tc).length) {
    var total = 0; Object.keys(tc).forEach(function (c) { total += tc[c] || 0; });
    SUB.subjects().forEach(function (s) {
      var n = 0; (subjectCats[s.id] || []).forEach(function (c) { n += tc[c] || 0; });
      if (n > 0) {
        var pct = total ? Math.round((n / total) * 100) : 0;
        rows += '<div class="stats-split-row"><span class="stats-split-name">' + _statSubjLabel(SUB, s.id) + '</span>' +
          '<div class="stats-split-bar"><div class="stats-split-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="stats-split-val">' + n + '</span></div>';
      }
    });
  }
  split.innerHTML = rows ? '<div class="stats-split"><div class="stats-block-cap">' + QRI18n.t('stats.todaysSplit') + '</div>' + rows + '</div>' : '';
}

/* ───────────────────────── MOMENTUM ───────────────────────── */
function _renderMomentum(p, SM) {
  _renderSparkline(p, SM);
  var el = _statsEl('statsMomentum'); if (!el) return;
  var aw = SM ? SM.accuracyWindows(p) : { direction: null };
  var sp = SM ? SM.speed(p) : { direction: null };
  var cons = SM ? SM.consistency(p) : { activeDaysLast14: 0, streakHealth: 'fragile' };

  var accTxt = aw.direction === 'improving' ? QRI18n.t('stats.trendUp') : aw.direction === 'declining' ? QRI18n.t('stats.trendDown') : aw.direction === 'flat' ? QRI18n.t('stats.trendSteady') : '—';
  var accMod = aw.direction === 'improving' ? ' stat-card-positive' : aw.direction === 'declining' ? ' stat-card-negative' : '';
  var spdTxt = sp.direction === 'faster' ? QRI18n.t('stats.trendFaster') : sp.direction === 'slower' ? QRI18n.t('stats.trendSlower') : sp.direction === 'flat' ? QRI18n.t('stats.trendSteady') : '—';
  var spdMod = sp.direction === 'faster' ? ' stat-card-positive' : sp.direction === 'slower' ? ' stat-card-negative' : '';
  var consTxt = cons.streakHealth === 'strong' ? QRI18n.t('stats.strengthStrong') : cons.streakHealth === 'broken' ? QRI18n.t('stats.consBroken') : QRI18n.t('stats.consBuilding');
  var consMod = cons.streakHealth === 'strong' ? ' stat-card-positive' : cons.streakHealth === 'broken' ? ' stat-card-negative' : '';

  el.className = 'stat-grid stat-grid-3';
  el.innerHTML =
    _statCard(accTxt, QRI18n.t('stats.accuracyTrend'), accMod) +
    _statCard(spdTxt, QRI18n.t('stats.speedTrend'), spdMod) +
    _statCard(consTxt, QRI18n.t('stats.consistency'), consMod, QRI18n.t('stats.days14', { count: cons.activeDaysLast14 })) +
    _statCard((p.dailyStreak || 0) + ' 🔥', QRI18n.t('stats.currentStreak')) +
    _statCard((p.bestDailyStreak || p.bestStreak || 0), QRI18n.t('stats.bestStreak')) +
    _statCard((p.bestStreak || 0), QRI18n.t('stats.bestRun'), '', QRI18n.t('stats.inARowCorrect'));
}

function _renderSparkline(p, SM) {
  var sparklineEl = _statsEl('statsSparkline'); if (!sparklineEl) return;
  var history = p.dailyHistory || {};
  var _allDates = Object.keys(history).sort(function (a, b) { return new Date(a).getTime() - new Date(b).getTime(); });
  var _last7 = _allDates.slice(-7);
  if (_last7.length < 2) {
    sparklineEl.innerHTML = '<div class="qr-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg><h2>' + QRI18n.t('stats.buildingTrend') + '</h2><p>' + QRI18n.t('stats.buildingTrendSub') + '</p></div>';
    return;
  }
  var _DAY_ABBREV = QRI18n.t('stats.dayAbbrevs').split(',');
  var _barW = 28, _barGap = 12, _chartH = 72, _labelH = 20, _topPad = 18;
  var _svgW = _last7.length * (_barW + _barGap) - _barGap + 16;
  var _svgH = _topPad + _chartH + _labelH + 4;
  var _values = _last7.map(function (d) { var e = history[d]; return e && e.attempted > 0 ? Math.round((e.correct / e.attempted) * 100) : 0; });
  var _maxVal = Math.max.apply(null, _values);
  var _defs = '<defs>' +
    '<linearGradient id="barGradHigh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient>' +
    '<linearGradient id="barGradMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#2563eb"/></linearGradient>' +
    '<linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fca5a5"/><stop offset="100%" stop-color="#ef4444"/></linearGradient>' +
    '<linearGradient id="barGradBest" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#67e8f9"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs>';
  var _bars = '';
  for (var _i = 0; _i < _last7.length; _i++) {
    var _pct = _values[_i];
    var _barH = Math.max(3, Math.round((_pct / 100) * _chartH));
    var _x = 8 + _i * (_barW + _barGap);
    var _y = _topPad + (_chartH - _barH);
    var _fillRef = (_pct === _maxVal && _maxVal > 0) ? 'url(#barGradBest)' : _pct >= 80 ? 'url(#barGradHigh)' : _pct >= 60 ? 'url(#barGradMid)' : 'url(#barGradLow)';
    var _d = new Date(_last7[_i]);
    var _dayLabel = _DAY_ABBREV[_d.getDay()];
    var _valDisplay = _pct > 0 ? _pct + '%' : '';
    var _animDelay = (_i * 0.06).toFixed(2);
    _bars += '<rect class="sparkline-bar" x="' + _x + '" y="' + _y + '" width="' + _barW + '" height="' + _barH + '" rx="6" fill="' + _fillRef + '" style="animation-delay:' + _animDelay + 's"/>' +
      '<text x="' + (_x + _barW / 2) + '" y="' + (_y - 5) + '" text-anchor="middle" class="sparkline-val">' + _valDisplay + '</text>' +
      '<text x="' + (_x + _barW / 2) + '" y="' + (_topPad + _chartH + _labelH - 2) + '" text-anchor="middle" class="sparkline-day">' + _dayLabel + '</text>';
  }
  var _baseline = '<line x1="8" y1="' + (_topPad + _chartH) + '" x2="' + (_svgW - 8) + '" y2="' + (_topPad + _chartH) + '" stroke="currentColor" opacity="0.1" stroke-width="1" stroke-dasharray="4 3"/>';
  var _dir = SM ? SM.accuracyWindows(p).direction : null;
  var _trendLabel = _dir === 'improving' ? QRI18n.t('stats.trendImproving') : _dir === 'declining' ? QRI18n.t('stats.trendDeclining') : _dir === 'flat' ? QRI18n.t('stats.trendSteady') : '';
  var _trendPillClass = _dir === 'improving' ? ' sparkline-trend-positive' : _dir === 'declining' ? ' sparkline-trend-negative' : ' sparkline-trend-steady';
  sparklineEl.innerHTML = '<div class="stats-block-cap">' + QRI18n.t('stats.accuracyLast7') + '</div><div class="sparkline-chart-wrap">' +
    '<svg class="stats-sparkline" role="img" viewBox="0 0 ' + _svgW + ' ' + _svgH + '" preserveAspectRatio="xMidYMid meet" aria-label="' + QRI18n.t('stats.chartAria') + '">' +
    _defs + _baseline + _bars + '</svg></div>' +
    (_trendLabel ? '<div class="sparkline-trend-label' + _trendPillClass + '">' + _trendLabel + '</div>' : '');
}

/* ───────────────────────── SUBJECT MASTERY ───────────────────────── */
function _renderMasteryLocked() {
  var el = _statsEl('statsMastery'); if (!el) return;
  el.innerHTML = '<button class="stats-insights-locked" id="unlockInsightsBtn" type="button">' +
    '<div class="stats-insights-locked-content">' +
    '<p class="stats-insights-locked-title">' + QRI18n.t('stats.masteryLockedTitle') + '</p>' +
    '<p class="stats-insights-locked-cta">' + QRI18n.t('stats.masteryLockedCta') + '</p>' +
    '</div></button>';
  var b = _statsEl('unlockInsightsBtn'); if (b) b.addEventListener('click', function () { showPaywall('stats'); });
}

function _renderMastery(p, SM, SUB, subjectCats) {
  var el = _statsEl('statsMastery'); if (!el) return;
  if (!SM || !SUB) { el.innerHTML = ''; return; }
  var detail = SM.masteryDetail(p, subjectCats);
  var sids = SUB.subjects().map(function (s) { return s.id; }).filter(function (id) { return detail[id]; });
  if (!sids.length) {
    el.innerHTML = '<p class="secondary-text">' + QRI18n.t('stats.masteryEmpty') + '</p>';
    return;
  }
  var conf = { high: QRI18n.t('stats.confHigh'), medium: QRI18n.t('stats.confMedium'), low: QRI18n.t('stats.confLow') };
  var rows = sids.map(function (id) {
    var d = detail[id], pct = d.pct, sc = _strength(pct);
    var weak = (d.weakAreas || []).map(_statCatLabel).slice(0, 2).join(', ');
    return '<div class="stats-mastery-row">' +
      '<div class="stats-mastery-top"><span class="stats-mastery-name">' + _statSubjLabel(SUB, id) + '</span>' +
      '<span class="stats-mastery-pct">' + pct + '%</span></div>' +
      '<div class="cat-bar-container"><div class="cat-bar ' + _barClass(pct) + '" style="width:' + pct + '%"></div></div>' +
      '<div class="stats-mastery-meta">' +
      '<span class="category-strength-label strength-' + sc[0] + '">' + sc[1] + '</span>' +
      '<span class="stats-mastery-sub">' + (conf[d.confidence] || '') + ' · ' + QRI18n.t('stats.lastAgo', { ago: _fmtAgo(d.lastTs) }) + '</span>' +
      '</div>' +
      (weak ? '<div class="stats-mastery-weak">' + QRI18n.t('stats.weakPrefix', { list: weak }) + '</div>' : '') +
      '</div>';
  }).join('');
  el.innerHTML = '<div class="stats-block-cap">' + QRI18n.t('stats.masteryCap') + '</div>' + rows;
}

/* ───────────────────────── TIME INVESTED ───────────────────────── */
function _renderTimeInvested(p, SM, SUB, subjectCats) {
  var el = _statsEl('statsTime'); if (!el) return;
  if (!SM) { el.innerHTML = ''; return; }
  var ti = SM.timeInvested(p, subjectCats);
  if (!ti.totalSec) { el.innerHTML = '<p class="secondary-text">' + QRI18n.t('stats.timeEmpty') + '</p>'; return; }
  var cards = '<div class="stat-grid stat-grid-3">' +
    _statCard(_fmtClock(ti.todaySec), QRI18n.t('stats.today')) +
    _statCard(_fmtClock(ti.weekSec), QRI18n.t('stats.thisWeek')) +
    _statCard(_fmtClock(ti.monthSec), QRI18n.t('stats.thisMonth')) + '</div>';
  var split = '';
  if (SUB && ti.bySubject && Object.keys(ti.bySubject).length) {
    var total = 0; Object.keys(ti.bySubject).forEach(function (s) { total += ti.bySubject[s] || 0; });
    var rows = SUB.subjects().filter(function (s) { return ti.bySubject[s.id]; }).map(function (s) {
      var sec = ti.bySubject[s.id], pct = total ? Math.round((sec / total) * 100) : 0;
      return '<div class="stats-split-row"><span class="stats-split-name">' + _statSubjLabel(SUB, s.id) + '</span>' +
        '<div class="stats-split-bar"><div class="stats-split-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="stats-split-val">' + _fmtClock(sec) + '</span></div>';
    }).join('');
    if (rows) split = '<div class="stats-split"><div class="stats-block-cap">' + QRI18n.t('stats.whereTimeGoes') + '</div>' + rows + '</div>';
  }
  el.innerHTML = cards + split;
}

/* ───────────────────────── STUDY NEXT (weakest) ───────────────────────── */
function _renderWeakest(p, SM) {
  var el = _statsEl('statsWeakest'); if (!el) return;
  var wt = SM ? SM.weakestTopics(p, 5) : [];
  if (!wt.length) { el.innerHTML = '<p class="secondary-text">' + QRI18n.t('stats.noWeakSpots') + '</p>'; return; }
  var rows = wt.map(function (m) {
    var pct = Math.round(m.acc * 100), sc = _strength(pct);
    return '<button class="stats-weak-row" type="button" data-cat="' + m.cat + '">' +
      '<span class="stats-weak-name">' + _statCatLabel(m.cat) + '</span>' +
      '<div class="cat-bar-container"><div class="cat-bar ' + _barClass(pct) + '" style="width:' + pct + '%"></div></div>' +
      '<span class="category-strength-label strength-' + sc[0] + '">' + pct + '%</span>' +
      '<span class="stats-weak-go">' + QRI18n.t('stats.practiseGo') + '</span></button>';
  }).join('');
  el.innerHTML = '<div class="stats-block-cap">' + QRI18n.t('stats.rankedWeakest') + '</div>' + rows;
  el.querySelectorAll('.stats-weak-row').forEach(function (b) {
    b.addEventListener('click', function () {
      var cat = b.getAttribute('data-cat');
      if (typeof Router !== 'undefined') Router.showView('practice');
      if (typeof startDrillFromPractice === 'function') setTimeout(function () { startDrillFromPractice('focus', cat, _statCatLabel(cat)); }, 60);
    });
  });
}

/* ───────────────────────── QUANAI RECOMMENDS ───────────────────────── */
function _renderRecommendation(p, SM, ER, weightedCats) {
  var el = _statsEl('statsRecommendation'); if (!el) return;
  var track = ER ? ER.trackForExam(_statsTargetExam()) : null;
  var rec = (SM && weightedCats.length) ? SM.nextRecommendation(p, weightedCats, track) : null;
  if (!rec) { el.innerHTML = '<p class="secondary-text">' + QRI18n.t('stats.recEmpty') + '</p>'; return; }
  var revise = _statCatLabel(rec.reviseCat);
  var sentence = rec.practised
    ? QRI18n.t('stats.recRevise', { topic: revise, pct: Math.round((rec.acc || 0) * 100) })
    : QRI18n.t('stats.recStart', { topic: revise });
  if (rec.thenCat) sentence += QRI18n.t('stats.recThen', { topic: _statCatLabel(rec.thenCat) });
  sentence += QRI18n.t('stats.fullStop');
  el.innerHTML = '<div class="stats-rec-card">' +
    '<div class="stats-rec-head"><span class="stats-rec-ico">🤖</span><span class="stats-rec-by">QuanAI</span></div>' +
    '<p class="stats-rec-text">' + sentence + '</p>' +
    '<button class="btn-primary stats-rec-btn" type="button" data-cat="' + rec.reviseCat + '">' + QRI18n.t('stats.practiseTopic', { topic: revise }) + '</button></div>';
  var btn = el.querySelector('.stats-rec-btn');
  if (btn) btn.addEventListener('click', function () {
    var cat = btn.getAttribute('data-cat');
    if (typeof Router !== 'undefined') Router.showView('practice');
    if (typeof startDrillFromPractice === 'function') setTimeout(function () { startDrillFromPractice('focus', cat, _statCatLabel(cat)); }, 60);
  });
}

/* ───────────────────────── AI deep-dive (existing premium modal) ───────────────────────── */
function _renderAiDeepDive(p) {
  var c = _statsEl('aiInsightsContainer'); if (!c || typeof AIFeatures === 'undefined') return;
  if (!AIFeatures.isPremium()) {
    c.innerHTML = '<p class="secondary-text stats-premium-note">' + QRI18n.t('stats.deepLocked') + '</p>' +
      '<button class="btn-primary ai-coach-unlock-btn stats-premium-cta" type="button">' + QRI18n.t('stats.unlockWithPremium') + '</button>';
    var u = c.querySelector('.ai-coach-unlock-btn'); if (u) u.addEventListener('click', function () { showPaywall('ai_coach'); });
  } else {
    c.innerHTML = '<button class="home-bento-action-btn ai-insights-btn" type="button" style="padding:1rem 2rem;border-radius:12px;font-size:1rem;box-shadow:0 4px 12px rgba(0,0,0,0.1);">' + QRI18n.t('stats.fullBreakdown') + '</button>';
    var b = c.querySelector('.ai-insights-btn');
    if (b) b.addEventListener('click', function () { AIFeatures.showStatsInsightsModal(p); });
  }
}

/* ADR-111: a language switch must bust the dirty-flag cache, or Stats keeps its old-language render
   until the next answered question. */
if (typeof QRI18n !== 'undefined' && QRI18n.onChange) QRI18n.onChange(function () { _lastStatsFingerprint = null; });
