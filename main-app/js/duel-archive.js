/**
 * duel-archive.js — Battle Archive (Premium duel history + rivalry/personal stats + achievements). ADR-068.
 *
 * PREMIUM-ONLY, HIDDEN for free users (never greyed/blurred — the section is simply not rendered).
 * Read-only client layer over the SERVER-maintained truth:
 *   • list   = users/{uid}/duelHistory   (orderBy playedAt desc, paginated — never loads all)
 *   • stats  = users/{uid}/duelStats/summary  (one doc: personal aggregates + per-rival head-to-head + achievements)
 * The client NEVER computes outcomes/aggregates — it reads what api/duel.js wrote in the finalize transaction.
 * Expands INLINE inside #homeDuelCard (no navigation); architecture-ready for a future #duel-replay screen.
 *
 * Reuses the global firebase Firestore singleton (same as DuelCore) + DuelCore.getMyUid(). No new SDK init,
 * no second listener on the hot path. Spark profile: ~2 reads on open (summary + page 1), +1 read per page.
 */
var DuelArchive = (function () {
  'use strict';

  var PAGE = 15;                  // duelHistory docs per page (pagination — never load all)
  var SECTION_ID = 'duelArchiveSection';

  /* ---- in-memory cache (per session) so re-open is instant; invalidated on a local duel finish ---- */
  var _summary = null;            // duelStats/summary doc data
  var _docs = [];                 // loaded duelHistory docs (raw, newest-first) for the active server query
  var _cursor = null;             // Firestore startAfter cursor (last snapshot of the active query)
  var _morePages = true;          // could the active query have more docs?
  var _loading = false;
  var _handle = null;             // QROverlay handle for the open modal (FW-W2)
  var _premium = false;
  var _queryKey = '';             // identity of the active server query (filters) — changing it resets paging
  var _reqToken = 0;              // monotonic fetch token — a stale in-flight page response is ignored
  var _searchTimer = null;        // debounce timer for the search box (cleared on collapse)

  /* ---- active filters ---- */
  var _f = { outcome: 'all', difficulty: 'all', range: 'all', search: '', rivalUid: null };

  /* Display strings resolve at render time via _t so a language switch never shows a stale name (ADR-111). */
  var ACHIEVEMENTS = [
    { key: 'firstBlood',  icon: '🩸', nk: 'duel.achFirstBlood',  dk: 'duel.achFirstBloodDesc' },
    { key: 'firstWin',    icon: '🏆', nk: 'duel.achFirstWin',    dk: 'duel.achFirstWinDesc' },
    { key: 'tenWins',     icon: '🔟', nk: 'duel.achTenWins',     dk: 'duel.achTenWinsDesc' },
    { key: 'fiftyWins',   icon: '🎖️', nk: 'duel.achFiftyWins',   dk: 'duel.achFiftyWinsDesc' },
    { key: 'hundredWins', icon: '💯', nk: 'duel.achHundredWins', dk: 'duel.achHundredWinsDesc' },
    { key: 'streak5',     icon: '🔥', nk: 'duel.achStreak5',     dk: 'duel.achStreak5Desc' },
    { key: 'streak10',    icon: '⚡', nk: 'duel.achStreak10',    dk: 'duel.achStreak10Desc' },
    { key: 'perfectDuel', icon: '✨', nk: 'duel.achPerfectDuel', dk: 'duel.achPerfectDuelDesc' },
    { key: 'lightning',   icon: '🚀', nk: 'duel.achLightning',   dk: 'duel.achLightningDesc' },
    { key: 'revenge',     icon: '🗡️', nk: 'duel.achRevenge',     dk: 'duel.achRevengeDesc' }
  ];

  /* ───────────────────────── helpers ───────────────────────── */

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }
  function _initial(name) { var n = String(name || '?').trim(); return n ? n.charAt(0).toUpperCase() : '?'; }
  function _db() { return firebase.firestore(); }
  /* ADR-119: never read firebase.auth().currentUser directly — see duel-core._uid. */
  function _uid() {
    try {
      if (typeof DuelCore !== 'undefined' && DuelCore.getMyUid) return DuelCore.getMyUid();
      if (typeof Auth !== 'undefined' && Auth.getUserId) return Auth.getUserId();
      return null;
    } catch (_) { return null; }
  }
  function _el() { return document.getElementById(SECTION_ID); }
  /* i18n (ADR-111): app-language channel; guarded so a harness without QRI18n still gets the key. */
  function _t(key, params) { return (typeof QRI18n !== 'undefined') ? QRI18n.t(key, params) : key; }

  var _MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function _months() { var p = String(_t('duel.archMonths') || '').split(','); return p.length === 12 ? p : _MONTHS_EN; }
  function _fmtDate(ms) { if (!ms) return '—'; var d = new Date(ms); return d.getDate() + ' ' + _months()[d.getMonth()] + ' ' + d.getFullYear(); }
  function _fmtTime(ms) { if (!ms) return ''; var d = new Date(ms); var h = d.getHours(), m = d.getMinutes(); var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12; return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ap; }
  function _fmtDur(ms) { if (!ms || ms < 0) return '—'; var s = Math.round(ms / 1000); if (s < 60) return _t('duel.archDurSecs', { s: s }); var m = Math.floor(s / 60); return _t('duel.archDurMinSecs', { m: m, s: s % 60 }); }
  function _fmtSpeed(sec) { return (sec && sec > 0) ? _t('duel.archDurSecs', { s: Math.round(sec * 10) / 10 }) : '—'; }
  function _cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  /* ADR-130: these were `guide.difficulty*`, a namespace that carries no difficulty keys — so QRI18n.t()
     fell through to its unknown-key branch and RENDERED THE KEY ITSELF ("guide.difficultyMedium") into
     every archive card subtitle and onto the filter chips below, in all three languages. The keys have
     always lived under `settings.` (drill-engine.js and report-modal.js resolve them correctly); this
     file was the lone outlier. Guarded now by i18n.check §4b, which resolves every literal t() key. */
  function _diffLabel(diff) { return diff === 'easy' ? _t('settings.difficultyEasy') : (diff === 'medium' ? _t('settings.difficultyMedium') : (diff === 'hard' ? _t('settings.difficultyHard') : _cap(diff))); }
  function _outLabel(o) { return o === 'win' ? _t('duel.archOutWin') : (o === 'loss' ? _t('duel.archOutLoss') : (o === 'no_contest' ? _t('duel.archOutNc') : _t('duel.archOutDraw'))); }
  function _rangeCutoff(range) {
    if (range === 'all') return 0;
    var now = new Date(); var d;
    if (range === 'today') { d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return d.getTime(); }
    if (range === 'week') return Date.now() - 7 * 86400000;
    if (range === 'month') return Date.now() - 30 * 86400000;
    return 0;
  }

  /* ───────────────────────── data layer ───────────────────────── */

  function _buildQuery() {
    var uid = _uid(); if (!uid) return null;
    var col = _db().collection('users').doc(uid).collection('duelHistory');
    var q = col;
    // ONE indexed primary dimension (outcome → difficulty → rival), then the playedAt time-range inequality.
    // Every primary maps to a (field, playedAt DESC) composite index; 'all' uses the single-field playedAt index.
    if (_f.rivalUid) q = q.where('opponentUid', '==', _f.rivalUid);
    else if (_f.outcome !== 'all') q = q.where('outcome', '==', _f.outcome);
    else if (_f.difficulty !== 'all') q = q.where('difficulty', '==', _f.difficulty);
    var cutoff = _rangeCutoff(_f.range);
    if (cutoff > 0) q = q.where('playedAt', '>=', cutoff);
    q = q.orderBy('playedAt', 'desc');
    return q;
  }

  /** Identity of the SERVER query only (primary dimension + time range). A residual-only change must NOT refetch. */
  function _keyOf() {
    if (_f.rivalUid) return 'rival:' + _f.rivalUid + '|' + _f.range;
    if (_f.outcome !== 'all') return 'outcome:' + _f.outcome + '|' + _f.range;
    if (_f.difficulty !== 'all') return 'diff:' + _f.difficulty + '|' + _f.range;
    return 'all|' + _f.range;
  }

  /** Residual client-side refinements the server query didn't apply.
   * GLOBAL mode: outcome + difficulty are mutually exclusive (one is always the SERVER primary), so the only
   * residual is name-search. RIVALRY mode: the server primary is opponentUid (a single rival's set is small —
   * bounded, no empty-page risk), so outcome + difficulty + search refine it client-side. */
  function _residual(d) {
    if (_f.rivalUid) {
      if (_f.outcome !== 'all' && d.outcome !== _f.outcome) return false;
      if (_f.difficulty !== 'all' && d.difficulty !== _f.difficulty) return false;
    }
    if (_f.search) {
      var s = _f.search.toLowerCase();
      if (String(d.opponentName || '').toLowerCase().indexOf(s) === -1) return false;
    }
    return true;
  }

  function _loadSummary() {
    /* ADR-130: this early return used to be `return Promise.resolve(null)` — the ONLY path in this
       function that resolved WITHOUT assigning _summary. _renderTrigger() re-enters itself from
       `if (!have) _loadSummary().then(… _renderTrigger())`, and `have` is `_summary != null`, so with a
       null uid the pair recursed through microtasks forever, rewriting sec.innerHTML and attaching a new
       listener on every pass. Measured: it KILLS THE RENDERER (the tab dies; a page-level try/catch
       cannot intercept it, because nothing throws). Reachable because render()'s premium flag comes from
       the ENTITLEMENT cache (hasPremiumAccess, home-view.js:464) while _uid() comes from AUTH — two
       different sources with no guarantee they agree, e.g. across a logout/teardown window.
       Assigning {} matches what the .catch path below already does, so `have` becomes true and the
       re-entry terminates after one pass. */
    var uid = _uid(); if (!uid) { _summary = _summary || {}; return Promise.resolve(_summary); }
    return _db().collection('users').doc(uid).collection('duelStats').doc('summary').get()
      .then(function (snap) { _summary = snap.exists ? snap.data() : {}; return _summary; })
      .catch(function () { _summary = _summary || {}; return _summary; });
  }

  /** Load the next page of the active query. Resets paging when the filter identity changed.
   * A reset always supersedes any in-flight fetch (bumps _reqToken) so rapid filter switching can't append a stale
   * page's docs under the new query key — the old fetch's response is dropped when its captured token is stale. */
  function _loadPage(reset) {
    var key = _keyOf();
    var changed = reset || key !== _queryKey;
    if (changed) { _queryKey = key; _docs = []; _cursor = null; _morePages = true; _reqToken++; }
    // A "load more" (not changed) must not run while a fetch is in flight; a reset already bumped the token above.
    if (!_morePages || (_loading && !changed)) return Promise.resolve(_docs);
    var token = changed ? _reqToken : ++_reqToken;
    var q = _buildQuery(); if (!q) return Promise.resolve(_docs);
    if (_cursor) q = q.startAfter(_cursor);
    q = q.limit(PAGE);
    _loading = true;
    return q.get().then(function (snap) {
      if (token !== _reqToken) return _docs;   // a newer query superseded this one — drop the stale response
      _loading = false;
      snap.forEach(function (doc) { _docs.push(Object.assign({ _id: doc.id }, doc.data())); });
      _cursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : _cursor;
      _morePages = snap.docs.length === PAGE;
      return _docs;
    }).catch(function () { if (token === _reqToken) { _loading = false; _morePages = false; } return _docs; });
  }

  /* ───────────────────────── view-models (delegate to the shared pure math when available) ───────────────────────── */

  function _aggView() { return _deriveAggregateView(_summary); }
  function _rivalView(uid) { return _deriveRivalView(_summary, uid); }

  // Display-only re-derivation that mirrors services/duelStats.js (the SERVER is the writer; the client only reads
  // the stored aggregate and re-derives the same view-model for rendering — verified equivalent by the check harness).
  function _n(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function _deriveAggregateView(s) {
    var ag = (s && s.duelAggregates) || {}; var total = _n(ag.totalDuels);
    return {
      totalDuels: total, wins: _n(ag.wins), losses: _n(ag.losses), draws: _n(ag.draws),
      winPct: total > 0 ? Math.round(_n(ag.wins) / total * 100) : 0,
      currentStreak: _n(ag.currentStreak), bestStreak: _n(ag.bestStreak),
      avgAccuracy: _n(ag.totalQuestions) > 0 ? Math.round(_n(ag.totalCorrect) / ag.totalQuestions * 100) : 0,
      avgSolveSec: _n(ag.solveSamples) > 0 ? Math.round(_n(ag.totalSolveSec) / ag.solveSamples * 10) / 10 : 0,
      fastestWinSec: _n(ag.fastestWinSec), highestScore: _n(ag.highestScore), lowestScore: _n(ag.lowestScore),
      totalCorrect: _n(ag.totalCorrect), totalQuestions: _n(ag.totalQuestions), totalAnswered: _n(ag.totalAnswered)
    };
  }
  function _deriveRivalView(s, oppUid) {
    var rv = (s && s.rivals && s.rivals[oppUid]) || null; if (!rv) return null; var c = _n(rv.count);
    return {
      name: rv.name || _t('share.opponent'), battles: c, wins: _n(rv.wins), losses: _n(rv.losses), draws: _n(rv.draws),
      headToHeadPct: c > 0 ? Math.round(_n(rv.wins) / c * 100) : 0, streak: _n(rv.streak), lastOutcome: rv.lastOutcome || null,
      fastestWinSec: _n(rv.fastestWinSec), closestMargin: rv.closestMargin == null ? null : _n(rv.closestMargin),
      avgMargin: c > 0 ? Math.round(_n(rv.totalMargin) / c * 10) / 10 : 0,
      avgAccuracy: c > 0 ? Math.round(_n(rv.sumAccuracy) / c) : 0,
      avgSolveSec: c > 0 ? Math.round(_n(rv.sumSolveSec) / c * 10) / 10 : 0
    };
  }
  function _topRivals() {
    var rivals = (_summary && _summary.rivals) || {}; var mp = null, md = null;
    Object.keys(rivals).forEach(function (uid) {
      if (!mp || _n(rivals[uid].count) > _n(rivals[mp].count)) mp = uid;
      if (!md || _n(rivals[uid].wins) > _n(rivals[md].wins)) md = uid;
    });
    return {
      mostPlayed: mp ? { uid: mp, name: rivals[mp].name, count: _n(rivals[mp].count) } : null,
      mostDefeated: (md && _n(rivals[md].wins) > 0) ? { uid: md, name: rivals[md].name, wins: _n(rivals[md].wins) } : null
    };
  }

  /* ───────────────────────── rendering ───────────────────────── */

  /** PUBLIC: called by home-view on every render. isPremium → show the trigger; else HIDE entirely (premium-only). */
  function render(isPremium) {
    _premium = !!isPremium;
    var sec = _el(); if (!sec) return;
    if (!_premium) { sec.style.display = 'none'; sec.innerHTML = ''; _closeModal(); return; }
    sec.style.display = '';
    _renderTrigger();
  }

  function _battleCount() { var v = _aggView(); return v.totalDuels; }
  function _isOpen() { return !!document.getElementById('baModalOverlay'); }

  /* The duel card hosts only a compact trigger — the archive itself opens as a focused, centered modal (ADR-068). */
  function _renderTrigger() {
    var sec = _el(); if (!sec) return;
    var have = _summary != null;
    var count = have ? _battleCount() : null;
    sec.innerHTML =
      '<button class="ba-open" type="button" id="baOpen" aria-haspopup="dialog">' +
        '<span class="ba-open-icon">⚔️</span>' +
        '<span class="ba-open-label">' + _t('duel.archOpenLabel') + (count != null ? ' <span class="ba-count">' + count + '</span>' : '') + '</span>' +
        '<span class="ba-open-chevron" aria-hidden="true">›</span>' +
      '</button>';
    var btn = document.getElementById('baOpen');
    if (btn) btn.addEventListener('click', function () { _openModal(); });
    // Lazily warm the count if we don't have the summary yet (1 cheap read), then refresh the trigger label.
    if (!have) { _loadSummary().then(function () { if (!_isOpen()) _renderTrigger(); }); }
  }

  /* Build the centered premium modal (reuses the paywall shell's dim/scale/scroll), append to <body>, then load. */
  function _openModal() {
    if (_isOpen()) return;
    var overlay = document.createElement('div');
    overlay.className = 'ba-modal-overlay'; overlay.id = 'baModalOverlay';
    overlay.innerHTML =
      '<div class="ba-modal-card" role="dialog" aria-modal="true" aria-labelledby="baModalTitle">' +
        '<div class="ba-modal-head">' +
          '<h2 class="ba-modal-title" id="baModalTitle" tabindex="-1">' + _t('duel.archModalTitle') + '</h2>' +
          '<button class="ba-modal-close" id="baModalClose" type="button" aria-label="' + _esc(_t('duel.archCloseAria')) + '">✕</button>' +
        '</div>' +
        '<div class="ba-modal-body ba-body" id="baBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    /* FW-W2: shared lifecycle (lock/Escape/trap/restore + 200ms closing anim); the pending-search
       timer is cleared in onClose so a debounced query can't fire into the torn-down body. */
    _handle = QROverlay.open(overlay, {
      dialogEl: overlay.querySelector('.ba-modal-card'),
      removeOnClose: true, closingClass: 'closing', closeMs: 200,
      initialFocus: '#baModalTitle',
      sound: 'settingsToggle',
      onClose: function () {
        if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
        _handle = null;
      }
    });
    _loadAndPaint();
  }

  function _closeModal() { if (_handle) _handle.close(); }

  /* Paint the modal body: from the in-memory cache if still valid (same filter, page held — no refetch, keeps scroll),
     else show the skeleton and load summary + page 1. onLocalDuelComplete() nulls the cache so a post-duel reopen refreshes. */
  function _loadAndPaint() {
    var body = document.getElementById('baBody'); if (!body) return;
    if (_summary != null && _docs.length && _keyOf() === _queryKey) { _paintBody(); return; }
    body.innerHTML = '<div class="ba-skeleton"><div class="ba-skel-row"></div><div class="ba-skel-row"></div><div class="ba-skel-row"></div></div>';
    var needSummary = _summary == null;
    var jobs = [needSummary ? _loadSummary() : Promise.resolve(_summary), _loadPage(true)];
    Promise.all(jobs).then(function () { _paintBody(); });
  }

  function _paintBody() {
    var body = document.getElementById('baBody'); if (!body) return;
    var agg = _aggView();
    if (agg.totalDuels === 0 && !_anyFilterActive()) { body.innerHTML = _emptyState(); _wireEmpty(); return; }
    var html = '';
    html += _rivalBannerHtml();
    html += _personalStripHtml(agg);
    html += _filtersHtml();
    html += '<div class="ba-list" id="baList">' + _listHtml() + '</div>';
    html += _achievementsHtml();
    body.innerHTML = html;
    _wireBody();
  }

  function _anyFilterActive() {
    return _f.outcome !== 'all' || _f.difficulty !== 'all' || _f.range !== 'all' || _f.search !== '' || !!_f.rivalUid;
  }

  function _emptyState() {
    return '' +
      '<div class="ba-empty">' +
        '<div class="ba-empty-art">⚔️</div>' +
        '<h4 class="ba-empty-title">' + _t('duel.archEmptyTitle') + '</h4>' +
        '<p class="ba-empty-sub">' + _t('duel.archEmptySub') + '</p>' +
        '<button class="ba-empty-cta" type="button" id="baEmptyCta">' + _t('duel.archEmptyCta') + '</button>' +
      '</div>';
  }
  function _wireEmpty() {
    var c = document.getElementById('baEmptyCta');
    if (c) c.addEventListener('click', function () { if (typeof DuelManager !== 'undefined' && DuelManager.openSetup) DuelManager.openSetup(); });
  }

  function _rivalBannerHtml() {
    if (!_f.rivalUid) return '';
    var r = _rivalView(_f.rivalUid); if (!r) return '';
    var streakTxt = r.streak > 0 ? _t('duel.archStreakW', { n: r.streak }) : (r.streak < 0 ? _t('duel.archStreakL', { n: -r.streak }) : '—');
    return '' +
      '<div class="ba-rivalry">' +
        '<button class="ba-rivalry-clear" type="button" id="baRivalClear" aria-label="' + _esc(_t('duel.archClearRivalAria')) + '">✕</button>' +
        '<div class="ba-rivalry-head">' +
          '<span class="duel-avatar lg">' + _esc(_initial(r.name)) + '</span>' +
          '<div class="ba-rivalry-id"><span class="ba-rivalry-vs">' + _t('duel.archRivalryVs') + '</span><strong class="ba-rivalry-name">' + _esc(r.name) + '</strong></div>' +
          '<div class="ba-rivalry-score"><span>' + r.wins + '</span><em>–</em><span>' + r.losses + '</span></div>' +
        '</div>' +
        '<div class="ba-rivalry-grid">' +
          _miniStat(_t('duel.archStatBattles'), r.battles) +
          _miniStat(_t('duel.archStatWinPct'), r.headToHeadPct + '%') +
          _miniStat(_t('duel.archStatStreak'), streakTxt) +
          _miniStat(_t('duel.archStatDraws'), r.draws) +
          _miniStat(_t('duel.archStatFastestWin'), _fmtSpeedDur(r.fastestWinSec)) +
          _miniStat(_t('duel.archStatClosest'), r.closestMargin == null ? '—' : ('±' + r.closestMargin)) +
          _miniStat(_t('duel.archStatAvgMargin'), (r.avgMargin > 0 ? '+' : '') + r.avgMargin) +
          _miniStat(_t('duel.archStatAvgAccuracy'), r.avgAccuracy + '%') +
          _miniStat(_t('duel.archStatAvgSolve'), _fmtSpeed(r.avgSolveSec)) +
        '</div>' +
      '</div>';
  }
  function _fmtSpeedDur(sec) { return (sec && sec > 0) ? _fmtDur(sec * 1000) : '—'; }

  function _personalStripHtml(agg) {
    var top = _topRivals();
    var streakTxt = agg.currentStreak > 0 ? (agg.currentStreak + '🔥') : '0';
    return '' +
      '<div class="ba-personal">' +
        '<div class="ba-personal-row">' +
          _miniStat(_t('duel.archStatBattles'), agg.totalDuels) +
          _miniStat(_t('duel.archStatWins'), agg.wins) +
          _miniStat(_t('duel.archStatLosses'), agg.losses) +
          _miniStat(_t('duel.archStatWinPct'), agg.winPct + '%') +
        '</div>' +
        '<div class="ba-personal-row">' +
          _miniStat(_t('duel.archStatStreak'), streakTxt) +
          _miniStat(_t('duel.archStatBestStreak'), agg.bestStreak) +
          _miniStat(_t('duel.archStatAvgAccuracy'), agg.avgAccuracy + '%') +
          _miniStat(_t('duel.archStatAvgSolve'), _fmtSpeed(agg.avgSolveSec)) +
        '</div>' +
        '<div class="ba-personal-row">' +
          _miniStat(_t('duel.archStatFastestWin'), _fmtSpeedDur(agg.fastestWinSec)) +
          _miniStat(_t('duel.archStatHighScore'), agg.highestScore) +
          _miniStat(_t('duel.archStatMostPlayed'), top.mostPlayed ? _esc(top.mostPlayed.name) : '—') +
          _miniStat(_t('duel.archStatMostBeaten'), top.mostDefeated ? _esc(top.mostDefeated.name) : '—') +
        '</div>' +
      '</div>';
  }
  function _miniStat(label, val) {
    return '<div class="ba-mini"><span class="ba-mini-val">' + val + '</span><span class="ba-mini-label">' + _esc(label) + '</span></div>';
  }

  function _filtersHtml() {
    function chips(group, opts, active) {
      return '<div class="ba-chips" data-group="' + group + '">' + opts.map(function (o) {
        return '<button class="ba-chip' + (o.v === active ? ' is-active' : '') + '" type="button" data-v="' + o.v + '">' + _esc(o.l) + '</button>';
      }).join('') + '</div>';
    }
    return '' +
      '<div class="ba-filters">' +
        chips('outcome', [{ v: 'all', l: _t('duel.archFAll') }, { v: 'win', l: _t('duel.archStatWins') }, { v: 'loss', l: _t('duel.archStatLosses') }, { v: 'draw', l: _t('duel.archStatDraws') }], _f.outcome) +
        chips('difficulty', [{ v: 'all', l: _t('duel.archFAny') }, { v: 'easy', l: _t('settings.difficultyEasy') }, { v: 'medium', l: _t('settings.difficultyMedium') }, { v: 'hard', l: _t('settings.difficultyHard') }], _f.difficulty) +
        chips('range', [{ v: 'all', l: _t('duel.archFAllTime') }, { v: 'today', l: _t('duel.archFToday') }, { v: 'week', l: _t('duel.archFWeek') }, { v: 'month', l: _t('duel.archFMonth') }], _f.range) +
        '<input class="ba-search" type="search" id="baSearch" placeholder="' + _esc(_t('duel.archSearchPh')) + '" value="' + _esc(_f.search) + '" aria-label="' + _esc(_t('duel.archSearchAria')) + '" />' +
      '</div>';
  }

  function _listHtml() {
    var rows = _docs.filter(_residual);
    if (!rows.length) {
      // In global mode every filter is server-side, so an empty result is genuinely empty. The only client-side
      // refinement is name-search (and outcome/difficulty within a small rivalry set) — there, "load more to search
      // older battles" is the honest hint when more pages exist.
      var clientRefined = !!_f.search || !!_f.rivalUid;
      var msg = (clientRefined && _morePages)
        ? _t('duel.archNoMatchMore')
        : _t('duel.archNoMatch');
      return '<div class="ba-noresults">' + msg + '</div>' + _loadMoreHtml();
    }
    return rows.map(_cardHtml).join('') + _loadMoreHtml();
  }
  function _loadMoreHtml() {
    return _morePages ? '<button class="ba-loadmore" type="button" id="baLoadMore">' + _t('duel.archLoadMore') + '</button>' : '';
  }

  function _cardHtml(d) {
    var outcome = d.outcome || 'draw';
    var badgeCls = outcome === 'win' ? 'is-win' : (outcome === 'loss' ? 'is-loss' : (outcome === 'no_contest' ? 'is-nc' : 'is-draw'));
    var badgeTxt = outcome === 'win' ? _t('duel.archBadgeWin') : (outcome === 'loss' ? _t('duel.archBadgeLoss') : (outcome === 'no_contest' ? _t('duel.archBadgeNc') : _t('duel.archBadgeDraw')));
    var who = d.iChallenged ? _t('duel.archYouChallenged') : _t('duel.archChallengedYou');
    var n = d.questionCount || 0;
    return '' +
      '<div class="ba-card ' + badgeCls + '" data-id="' + _esc(d._id) + '" tabindex="0" role="button" aria-expanded="false">' +
        '<span class="duel-avatar ba-card-av">' + _esc(_initial(d.opponentName)) + '</span>' +
        '<div class="ba-card-main">' +
          '<div class="ba-card-top"><strong class="ba-card-opp">' + _esc(d.opponentName || _t('share.opponent')) + '</strong>' +
            '<span class="ba-badge ' + badgeCls + '">' + badgeTxt + '</span></div>' +
          '<div class="ba-card-sub">' + _fmtDate(d.playedAt) + ' · ' + (n ? _t('duel.archQCount', { n: n }) : '—') + (d.difficulty ? ' · ' + _diffLabel(d.difficulty) : '') + '</div>' +
        '</div>' +
        '<div class="ba-card-score"><span class="ba-score-you">' + (d.myScore || 0) + '</span><em>–</em><span class="ba-score-opp">' + (d.oppScore || 0) + '</span></div>' +
        '<div class="ba-card-detail" hidden>' +
          '<div class="ba-detail-grid">' +
            _miniStat(_t('duel.archStatYourScore'), (d.myScore || 0)) +
            _miniStat(_t('duel.archStatTheirScore'), (d.oppScore || 0)) +
            _miniStat(_t('duel.archStatYourAccuracy'), (d.accuracy || 0) + '%') +
            _miniStat(_t('duel.archStatTheirAccuracy'), (d.oppAccuracy || 0) + '%') +
            _miniStat(_t('duel.archStatYourSpeed'), _fmtSpeed(d.mySpeed)) +
            _miniStat(_t('duel.archStatTheirSpeed'), _fmtSpeed(d.oppSpeed)) +
            _miniStat(_t('duel.archStatDuration'), _fmtDur(d.durationMs)) +
            _miniStat(_t('duel.archStatTime'), _fmtTime(d.playedAt)) +
          '</div>' +
          '<div class="ba-detail-foot">' + _esc(who) + ' · ' + _esc(_outLabel(outcome)) +
            '<button class="ba-detail-rival" type="button" data-rival="' + _esc(d.opponentUid || '') + '" data-rivalname="' + _esc(d.opponentName || '') + '">' + _t('duel.archViewRivalry') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function _achievementsHtml() {
    var unlocked = (_summary && _summary.achievements) || {};
    var cards = ACHIEVEMENTS.map(function (a) {
      var on = !!unlocked[a.key];
      return '<div class="ba-ach' + (on ? ' is-on' : '') + '" title="' + _esc(_t(a.dk)) + '">' +
        '<span class="ba-ach-icon">' + a.icon + '</span>' +
        '<span class="ba-ach-name">' + _esc(_t(a.nk)) + '</span>' +
        (on ? '<span class="ba-ach-date">' + _fmtDate(unlocked[a.key]) + '</span>' : '<span class="ba-ach-locked">' + _t('duel.archAchLocked') + '</span>') +
        '</div>';
    }).join('');
    var count = ACHIEVEMENTS.filter(function (a) { return !!unlocked[a.key]; }).length;
    return '<div class="ba-ach-wrap"><div class="ba-ach-head">' + _t('duel.archAchHead') + ' <span class="ba-count">' + count + '/' + ACHIEVEMENTS.length + '</span></div>' +
      '<div class="ba-ach-grid">' + cards + '</div></div>';
  }

  /* ───────────────────────── wiring ───────────────────────── */

  function _wireBody() {
    var body = document.getElementById('baBody'); if (!body) return;
    // filter chips
    body.querySelectorAll('.ba-chips').forEach(function (grp) {
      var group = grp.getAttribute('data-group');
      grp.querySelectorAll('.ba-chip').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-v');
          if (_f[group] === v) return;
          _f[group] = v;
          // GLOBAL mode: outcome + difficulty are mutually exclusive so every filter stays a clean server query
          // (no residual paging gaps). In RIVALRY mode they refine the small rival set together, so don't reset.
          if (!_f.rivalUid) {
            if (group === 'outcome' && v !== 'all') _f.difficulty = 'all';
            else if (group === 'difficulty' && v !== 'all') _f.outcome = 'all';
          }
          _refreshList();
        });
      });
    });
    var search = document.getElementById('baSearch');
    if (search) {
      search.addEventListener('input', function () {
        if (_searchTimer) clearTimeout(_searchTimer);
        _searchTimer = setTimeout(function () { _searchTimer = null; _f.search = search.value.trim(); _refreshListOnly(); }, 180);
      });
    }
    var clr = document.getElementById('baRivalClear');
    if (clr) clr.addEventListener('click', function () { _f.rivalUid = null; _refreshList(); });
    _wireList();
  }

  function _wireList() {
    var list = document.getElementById('baList'); if (!list) return;
    list.querySelectorAll('.ba-card').forEach(function (card) {
      var expand = function (e) {
        if (e && e.target && e.target.closest('.ba-detail-rival')) return;
        var det = card.querySelector('.ba-card-detail'); if (!det) return;
        var open = !det.hidden; det.hidden = open; card.classList.toggle('is-expanded', !open);
        card.setAttribute('aria-expanded', String(!open));
      };
      card.addEventListener('click', expand);
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(e); } });
    });
    list.querySelectorAll('.ba-detail-rival').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var uid = b.getAttribute('data-rival'); if (!uid) return;
        _f.rivalUid = uid; _f.outcome = 'all'; _f.difficulty = 'all';
        _refreshList();
        var mb = document.getElementById('baBody'); if (mb) mb.scrollTop = 0;   // scroll the modal body up to the new rivalry banner
      });
    });
    var more = document.getElementById('baLoadMore');
    if (more) more.addEventListener('click', function () { more.textContent = _t('duel.loadingMore'); _loadPage(false).then(function () { _refreshListOnly(); }); });
  }

  /** Apply a filter change: refetch only when the SERVER query identity changed; else repaint loaded docs. */
  function _refreshList() {
    if (_keyOf() !== _queryKey) { _loadPage(true).then(function () { _paintBody(); }); }
    else { _paintBody(); }
  }
  /** Repaint only the list region from already-loaded docs (search / load-more / residual change). */
  function _refreshListOnly() {
    var list = document.getElementById('baList'); if (!list) { _paintBody(); return; }
    list.innerHTML = _listHtml(); _wireList();
  }

  /* ───────────────────────── public API ───────────────────────── */

  /** Called by DuelManager when the LOCAL player's duel reaches completion — invalidate cache + live-refresh. */
  function onLocalDuelComplete() {
    _summary = null; _docs = []; _cursor = null; _morePages = true; _queryKey = '';
    if (!_premium) return;
    if (_isOpen()) _loadAndPaint(); else _renderTrigger();
  }

  return {
    render: render,
    onLocalDuelComplete: onLocalDuelComplete,
    // exposed for tests / debugging
    _applyFilterForTest: function (f) { Object.assign(_f, f); }
  };
})();

if (typeof window !== 'undefined') window.DuelArchive = DuelArchive;
