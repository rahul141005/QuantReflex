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
  var _expanded = false;
  var _premium = false;
  var _queryKey = '';             // identity of the active server query (filters) — changing it resets paging

  /* ---- active filters ---- */
  var _f = { outcome: 'all', difficulty: 'all', range: 'all', search: '', rivalUid: null };

  var ACHIEVEMENTS = [
    { key: 'firstBlood',  icon: '🩸', name: 'First Blood',       desc: 'Complete your first duel' },
    { key: 'firstWin',    icon: '🏆', name: 'First Victory',     desc: 'Win your first duel' },
    { key: 'tenWins',     icon: '🔟', name: '10 Wins',           desc: 'Win 10 duels' },
    { key: 'fiftyWins',   icon: '🎖️', name: '50 Wins',           desc: 'Win 50 duels' },
    { key: 'hundredWins', icon: '💯', name: '100 Wins',          desc: 'Win 100 duels' },
    { key: 'streak5',     icon: '🔥', name: '5 Win Streak',      desc: 'Win 5 duels in a row' },
    { key: 'streak10',    icon: '⚡', name: '10 Win Streak',     desc: 'Win 10 duels in a row' },
    { key: 'perfectDuel', icon: '✨', name: 'Perfect Duel',      desc: 'Answer every question correctly' },
    { key: 'lightning',   icon: '🚀', name: 'Lightning',         desc: 'Win averaging under 5s a question' },
    { key: 'revenge',     icon: '🗡️', name: 'Revenge',           desc: 'Beat an opponent who had your number' }
  ];

  /* ───────────────────────── helpers ───────────────────────── */

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }
  function _initial(name) { var n = String(name || '?').trim(); return n ? n.charAt(0).toUpperCase() : '?'; }
  function _db() { return firebase.firestore(); }
  function _uid() { try { return (typeof DuelCore !== 'undefined' && DuelCore.getMyUid) ? DuelCore.getMyUid() : (firebase.auth().currentUser || {}).uid; } catch (_) { return null; } }
  function _el() { return document.getElementById(SECTION_ID); }

  var _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function _fmtDate(ms) { if (!ms) return '—'; var d = new Date(ms); return d.getDate() + ' ' + _MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function _fmtTime(ms) { if (!ms) return ''; var d = new Date(ms); var h = d.getHours(), m = d.getMinutes(); var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12; return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ap; }
  function _fmtDur(ms) { if (!ms || ms < 0) return '—'; var s = Math.round(ms / 1000); if (s < 60) return s + 's'; var m = Math.floor(s / 60); return m + 'm ' + (s % 60) + 's'; }
  function _fmtSpeed(sec) { return (sec && sec > 0) ? (Math.round(sec * 10) / 10) + 's' : '—'; }
  function _cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
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

  /** Residual client-side refinements the server query didn't apply (the non-primary dimension + name search). */
  function _residual(d) {
    var diffIsPrimary = !_f.rivalUid && _f.outcome === 'all' && _f.difficulty !== 'all';
    if (_f.difficulty !== 'all' && !diffIsPrimary && d.difficulty !== _f.difficulty) return false;
    if (_f.rivalUid && _f.outcome !== 'all' && d.outcome !== _f.outcome) return false;
    if (_f.search) {
      var s = _f.search.toLowerCase();
      if (String(d.opponentName || '').toLowerCase().indexOf(s) === -1) return false;
    }
    return true;
  }

  function _loadSummary() {
    var uid = _uid(); if (!uid) return Promise.resolve(null);
    return _db().collection('users').doc(uid).collection('duelStats').doc('summary').get()
      .then(function (snap) { _summary = snap.exists ? snap.data() : {}; return _summary; })
      .catch(function () { _summary = _summary || {}; return _summary; });
  }

  /** Load the next page of the active query. Resets paging when the filter identity changed. */
  function _loadPage(reset) {
    var key = _keyOf();
    if (reset || key !== _queryKey) { _queryKey = key; _docs = []; _cursor = null; _morePages = true; }
    if (!_morePages || _loading) return Promise.resolve(_docs);
    var q = _buildQuery(); if (!q) return Promise.resolve(_docs);
    if (_cursor) q = q.startAfter(_cursor);
    q = q.limit(PAGE);
    _loading = true;
    return q.get().then(function (snap) {
      _loading = false;
      snap.forEach(function (doc) { _docs.push(Object.assign({ _id: doc.id }, doc.data())); });
      _cursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : _cursor;
      _morePages = snap.docs.length === PAGE;
      return _docs;
    }).catch(function () { _loading = false; _morePages = false; return _docs; });
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
      name: rv.name || 'Opponent', battles: c, wins: _n(rv.wins), losses: _n(rv.losses), draws: _n(rv.draws),
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

  /** PUBLIC: called by home-view on every render. isPremium → show; else HIDE entirely (premium-only). */
  function render(isPremium) {
    _premium = !!isPremium;
    var sec = _el(); if (!sec) return;
    if (!_premium) { sec.style.display = 'none'; sec.innerHTML = ''; _expanded = false; return; }
    sec.style.display = '';
    if (_expanded) { _renderExpanded(); }
    else { _renderHeader(); }
  }

  function _battleCount() { var v = _aggView(); return v.totalDuels; }

  function _renderHeader() {
    var sec = _el(); if (!sec) return;
    var have = _summary != null;
    var count = have ? _battleCount() : null;
    sec.innerHTML =
      '<button class="ba-toggle" type="button" id="baToggle" aria-expanded="false" aria-controls="baBody">' +
        '<span class="ba-toggle-icon">⚔️</span>' +
        '<span class="ba-toggle-label">Battle Archive' + (count != null ? ' <span class="ba-count">' + count + '</span>' : '') + '</span>' +
        '<span class="ba-toggle-chevron" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="ba-body" id="baBody" hidden></div>';
    var btn = document.getElementById('baToggle');
    if (btn) btn.addEventListener('click', function () { _toggle(); });
    // Lazily warm the count if we don't have the summary yet (1 cheap read), then refresh the header label.
    if (!have) { _loadSummary().then(function () { if (!_expanded) _renderHeader(); }); }
  }

  function _toggle() {
    _expanded = !_expanded;
    var sec = _el(); if (sec) sec.classList.toggle('is-open', _expanded);
    if (_expanded) {
      _renderExpanded(true);
      if (typeof SoundEngine !== 'undefined' && SoundEngine.play) { try { SoundEngine.play('settingsToggle'); } catch (_) {} }
    } else {
      _renderHeader();
    }
  }

  function _renderExpanded(initialOpen) {
    _renderHeader();
    var sec = _el(); if (sec) sec.classList.add('is-open');
    var btn = document.getElementById('baToggle');
    if (btn) { btn.setAttribute('aria-expanded', 'true'); var ch = btn.querySelector('.ba-toggle-chevron'); if (ch) ch.textContent = '▴'; }
    var body = document.getElementById('baBody'); if (!body) return;
    body.hidden = false;
    body.innerHTML = '<div class="ba-skeleton"><div class="ba-skel-row"></div><div class="ba-skel-row"></div><div class="ba-skel-row"></div></div>';
    // Load summary (if needed) + first page, then paint.
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
        '<h4 class="ba-empty-title">No battles yet</h4>' +
        '<p class="ba-empty-sub">Challenge an opponent and your duel history, rivalries and achievements will live here.</p>' +
        '<button class="ba-empty-cta" type="button" id="baEmptyCta">Challenge your first opponent</button>' +
      '</div>';
  }
  function _wireEmpty() {
    var c = document.getElementById('baEmptyCta');
    if (c) c.addEventListener('click', function () { if (typeof DuelManager !== 'undefined' && DuelManager.openSetup) DuelManager.openSetup(); });
  }

  function _rivalBannerHtml() {
    if (!_f.rivalUid) return '';
    var r = _rivalView(_f.rivalUid); if (!r) return '';
    var streakTxt = r.streak > 0 ? ('W' + r.streak) : (r.streak < 0 ? ('L' + (-r.streak)) : '—');
    return '' +
      '<div class="ba-rivalry">' +
        '<button class="ba-rivalry-clear" type="button" id="baRivalClear" aria-label="Clear rivalry filter">✕</button>' +
        '<div class="ba-rivalry-head">' +
          '<span class="duel-avatar lg">' + _esc(_initial(r.name)) + '</span>' +
          '<div class="ba-rivalry-id"><span class="ba-rivalry-vs">Rivalry vs</span><strong class="ba-rivalry-name">' + _esc(r.name) + '</strong></div>' +
          '<div class="ba-rivalry-score"><span>' + r.wins + '</span><em>–</em><span>' + r.losses + '</span></div>' +
        '</div>' +
        '<div class="ba-rivalry-grid">' +
          _miniStat('Battles', r.battles) +
          _miniStat('Win %', r.headToHeadPct + '%') +
          _miniStat('Streak', streakTxt) +
          _miniStat('Draws', r.draws) +
          _miniStat('Fastest win', _fmtSpeedDur(r.fastestWinSec)) +
          _miniStat('Closest', r.closestMargin == null ? '—' : ('±' + r.closestMargin)) +
          _miniStat('Avg margin', (r.avgMargin > 0 ? '+' : '') + r.avgMargin) +
          _miniStat('Avg accuracy', r.avgAccuracy + '%') +
          _miniStat('Avg solve', _fmtSpeed(r.avgSolveSec)) +
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
          _miniStat('Battles', agg.totalDuels) +
          _miniStat('Wins', agg.wins) +
          _miniStat('Losses', agg.losses) +
          _miniStat('Win %', agg.winPct + '%') +
        '</div>' +
        '<div class="ba-personal-row">' +
          _miniStat('Streak', streakTxt) +
          _miniStat('Best streak', agg.bestStreak) +
          _miniStat('Avg accuracy', agg.avgAccuracy + '%') +
          _miniStat('Avg solve', _fmtSpeed(agg.avgSolveSec)) +
        '</div>' +
        '<div class="ba-personal-row">' +
          _miniStat('Fastest win', _fmtSpeedDur(agg.fastestWinSec)) +
          _miniStat('High score', agg.highestScore) +
          _miniStat('Most played', top.mostPlayed ? _esc(top.mostPlayed.name) : '—') +
          _miniStat('Most beaten', top.mostDefeated ? _esc(top.mostDefeated.name) : '—') +
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
        chips('outcome', [{ v: 'all', l: 'All' }, { v: 'win', l: 'Wins' }, { v: 'loss', l: 'Losses' }, { v: 'draw', l: 'Draws' }], _f.outcome) +
        chips('difficulty', [{ v: 'all', l: 'Any' }, { v: 'easy', l: 'Easy' }, { v: 'medium', l: 'Medium' }, { v: 'hard', l: 'Hard' }], _f.difficulty) +
        chips('range', [{ v: 'all', l: 'All time' }, { v: 'today', l: 'Today' }, { v: 'week', l: 'Week' }, { v: 'month', l: 'Month' }], _f.range) +
        '<input class="ba-search" type="search" id="baSearch" placeholder="Search opponent…" value="' + _esc(_f.search) + '" aria-label="Search opponent" />' +
      '</div>';
  }

  function _listHtml() {
    var rows = _docs.filter(_residual);
    if (!rows.length) {
      return '<div class="ba-noresults">No battles match these filters' + (_morePages ? ' yet.' : '.') + '</div>' + _loadMoreHtml();
    }
    return rows.map(_cardHtml).join('') + _loadMoreHtml();
  }
  function _loadMoreHtml() {
    return _morePages ? '<button class="ba-loadmore" type="button" id="baLoadMore">Load more</button>' : '';
  }

  function _cardHtml(d) {
    var outcome = d.outcome || 'draw';
    var badgeCls = outcome === 'win' ? 'is-win' : (outcome === 'loss' ? 'is-loss' : (outcome === 'no_contest' ? 'is-nc' : 'is-draw'));
    var badgeTxt = outcome === 'win' ? 'WIN' : (outcome === 'loss' ? 'LOSS' : (outcome === 'no_contest' ? 'NO CONTEST' : 'DRAW'));
    var who = d.iChallenged ? 'You challenged' : 'Challenged you';
    var n = d.questionCount || 0;
    return '' +
      '<div class="ba-card ' + badgeCls + '" data-id="' + _esc(d._id) + '" tabindex="0" role="button" aria-expanded="false">' +
        '<span class="duel-avatar ba-card-av">' + _esc(_initial(d.opponentName)) + '</span>' +
        '<div class="ba-card-main">' +
          '<div class="ba-card-top"><strong class="ba-card-opp">' + _esc(d.opponentName || 'Opponent') + '</strong>' +
            '<span class="ba-badge ' + badgeCls + '">' + badgeTxt + '</span></div>' +
          '<div class="ba-card-sub">' + _fmtDate(d.playedAt) + ' · ' + (n ? n + ' Q' : '—') + (d.difficulty ? ' · ' + _cap(d.difficulty) : '') + '</div>' +
        '</div>' +
        '<div class="ba-card-score"><span class="ba-score-you">' + (d.myScore || 0) + '</span><em>–</em><span class="ba-score-opp">' + (d.oppScore || 0) + '</span></div>' +
        '<div class="ba-card-detail" hidden>' +
          '<div class="ba-detail-grid">' +
            _miniStat('Your score', (d.myScore || 0)) +
            _miniStat('Their score', (d.oppScore || 0)) +
            _miniStat('Your accuracy', (d.accuracy || 0) + '%') +
            _miniStat('Their accuracy', (d.oppAccuracy || 0) + '%') +
            _miniStat('Your speed', _fmtSpeed(d.mySpeed)) +
            _miniStat('Their speed', _fmtSpeed(d.oppSpeed)) +
            _miniStat('Duration', _fmtDur(d.durationMs)) +
            _miniStat('Time', _fmtTime(d.playedAt)) +
          '</div>' +
          '<div class="ba-detail-foot">' + _esc(who) + ' · ' + _esc(_cap(outcome === 'no_contest' ? 'no contest' : outcome)) +
            '<button class="ba-detail-rival" type="button" data-rival="' + _esc(d.opponentUid || '') + '" data-rivalname="' + _esc(d.opponentName || '') + '">View rivalry →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function _achievementsHtml() {
    var unlocked = (_summary && _summary.achievements) || {};
    var cards = ACHIEVEMENTS.map(function (a) {
      var on = !!unlocked[a.key];
      return '<div class="ba-ach' + (on ? ' is-on' : '') + '" title="' + _esc(a.desc) + '">' +
        '<span class="ba-ach-icon">' + a.icon + '</span>' +
        '<span class="ba-ach-name">' + _esc(a.name) + '</span>' +
        (on ? '<span class="ba-ach-date">' + _fmtDate(unlocked[a.key]) + '</span>' : '<span class="ba-ach-locked">Locked</span>') +
        '</div>';
    }).join('');
    var count = ACHIEVEMENTS.filter(function (a) { return !!unlocked[a.key]; }).length;
    return '<div class="ba-ach-wrap"><div class="ba-ach-head">Achievements <span class="ba-count">' + count + '/' + ACHIEVEMENTS.length + '</span></div>' +
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
          _refreshList();
        });
      });
    });
    var search = document.getElementById('baSearch');
    if (search) {
      var t;
      search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { _f.search = search.value.trim(); _refreshListOnly(); }, 180); });
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
        var sec = _el(); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    var more = document.getElementById('baLoadMore');
    if (more) more.addEventListener('click', function () { more.textContent = 'Loading…'; _loadPage(false).then(function () { _refreshListOnly(); }); });
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
    if (_expanded) _renderExpanded(); else _renderHeader();
  }

  return {
    render: render,
    onLocalDuelComplete: onLocalDuelComplete,
    // exposed for tests / debugging
    _applyFilterForTest: function (f) { Object.assign(_f, f); }
  };
})();

if (typeof window !== 'undefined') window.DuelArchive = DuelArchive;
