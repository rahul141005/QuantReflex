/**
 * learn-view.js — Learn controller (ADR-069 hub/topics · ADR-092 reimagined around Study / Revise / Look up).
 *
 * Render-on-route: Router.onShow('learn', params) → renderLearnRoute(params). No path → the HUB ("Up next"
 * recommended chapter, "Revise today" card, Continue/Needs-practice/Saved strips, Quick-Reference entry + times
 * tables, category browse, My notes). #learn/<topicId> → a TOPIC PAGE (back link, sticky section nav, typed blocks
 * via BlockRenderers, end-of-chapter footer with complete/practise/next-up/related). #learn/quick-ref → the
 * Quick-Reference library (ADR-084). #learn/revise → the Guided Revision flow (revise-flow.js). In-Learn navigation
 * goes through Router.showView('learn', {path}) so browser back/forward + shareable URLs work. Reuses tables.js
 * (the loved tables), learn-manager (My notes), LearnSearch (topics + quick-ref cards) and LearnProgress. No AI.
 */

/* ---- Collapsible section toggle (shared: Quick-Reference tables here + home-view) ---- */
function toggleSection(header) {
  var content = header.nextElementSibling;
  var icon = header.querySelector('.collapse-icon');
  var open;
  if (content.style.display === 'none' || !content.style.display) {
    content.style.display = 'block';
    if (icon) icon.textContent = '▲';
    open = true;
  } else {
    content.style.display = 'none';
    if (icon) icon.textContent = '▼';
    open = false;
  }
  /* a11y: keep the header's expanded state in sync for assistive tech (set on every collapsible-header). */
  if (header.hasAttribute && header.hasAttribute('aria-expanded')) header.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* a11y: collapsible headers are role="button" tabindex="0" — make Enter/Space activate them like a real button.
   Delegated once at the document level so every collapsible-header (Learn + home) is keyboard-operable. */
if (typeof document !== 'undefined' && !window.__collapsibleKeydownWired) {
  window.__collapsibleKeydownWired = true;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var h = e.target && e.target.closest && e.target.closest('.collapsible-header');
    if (!h) return;
    e.preventDefault();
    toggleSection(h);
  });
}

var LearnView = (function () {
  'use strict';

  var _hubBuilt = false;
  var _searchTimer = null;
  var _io = null;   // IntersectionObserver for sticky section-nav highlighting (torn down between topics)
  var _hubScroll = 0;   // remembered hub scroll position, restored when returning from a topic page

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function _KB() { return (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null; }
  function _go(id) { if (typeof Router !== 'undefined') Router.showView('learn', id ? { path: id } : undefined); }
  function _scrollTop() { var c = document.querySelector('.container'); if (c) c.scrollTop = 0; }
  function _scrollBehavior() {
    try { return (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth'; }
    catch (_) { return 'smooth'; }
  }

  var DIFF_LABEL = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' };
  function _diffLabel(d) { var k = { foundation: 'learn.diffFoundation', core: 'learn.diffCore', advanced: 'learn.diffAdvanced' }[d]; return k ? QRI18n.t(k) : (DIFF_LABEL[d] || d); }
  function _freqLabelTxt(f) { var k = { 'very-high': 'learn.freqVeryHigh', high: 'learn.freqHigh', medium: 'learn.freqMedium', low: 'learn.freqLow' }[f]; return k ? QRI18n.t(k) : (FREQ_LABEL[f] || f); }
  /* ADR-111: Learn category titles/blurbs + LR/DI sub-group titles localize via learn.* keys; the
     registry objects remain the canonical English source. */
  function _lcat(id, field, fallback) { var k = 'learn.cat_' + id + field; var v = QRI18n.t(k); return v === k ? fallback : v; }
  var FREQ_LABEL = { 'very-high': 'Very High', high: 'High', medium: 'Medium', low: 'Low' };
  function _diffBadge(d) { return '<span class="kx-badge kx-diff-' + _esc(d) + '">' + _esc(_diffLabel(d)) + '</span>'; }
  function _freqBadge(f) { return '<span class="kx-badge kx-freq">' + _esc(_freqLabelTxt(f)) + '</span>'; }

  /* ADR-080 — exam-relevance metadata drives ONE subtle, high-value contextual badge per card (never a wall of
     labels). With a target exam set: "⭐ For <exam>" on that exam's top-focus topics. Otherwise: "🔥 Most Asked" on
     perennial topics. Everything else stays clean. */
  function _examRel() { return (typeof QR_EXAMREL !== 'undefined') ? QR_EXAMREL : (typeof window !== 'undefined' ? window.QR_EXAMREL : null); }
  function _targetExam() { try { return (typeof TargetExam !== 'undefined' && TargetExam.get()) || ''; } catch (_) { return ''; } }
  function _ctxBadge(t) {
    var ER = _examRel(); if (!ER || !t || !t.id) return '';
    var exam = _targetExam();
    if (exam) {
      var track = ER.trackForExam(exam);
      if (track && ER.weight(t.id, track) >= 3) return '<span class="kx-badge kx-badge-rec">⭐ For ' + _esc(ER.trackLabel(track)) + '</span>';
      return '';   // exam set but not a top focus → stay clean (no most-asked noise on top)
    }
    if (ER.isMostAsked(t.id)) return '<span class="kx-badge kx-badge-asked">🔥 Most Asked</span>';
    return '';
  }

  /* Presentation-only sub-grouping (ADR-080): Logical Reasoning is 20 topics under one category — too flat. We render
     pedagogical sub-groups WITHIN the category (no change to drillCategory / subjects / analytics). Topics list in a
     sensible learning order. */
  var SUBGROUPS = {
    'lr-reasoning': [
      { titleKey: 'learn.groupFoundations', ids: ['lr-coding-decoding', 'lr-series', 'lr-analogies', 'lr-odd-one-out', 'lr-ranking', 'lr-direction-sense', 'lr-blood-relations'] },
      { titleKey: 'learn.groupAnalytical', ids: ['lr-seating-puzzles', 'lr-syllogisms', 'lr-coded-inequalities', 'lr-input-output', 'lr-calendars', 'lr-clocks'] },
      { titleKey: 'learn.groupCritical', ids: ['lr-critical-reasoning', 'lr-statement-argument', 'lr-decision-making', 'lr-cause-effect', 'lr-course-of-action'] },
      { titleKey: 'learn.groupVisual', ids: ['lr-nonverbal-images', 'lr-figure-series'] }
    ],
    'di-charts': [
      { titleKey: 'learn.groupFoundations', ids: ['di-foundations', 'di-speed-math'] },
      { titleKey: 'learn.groupCharts', ids: ['di-bar-line', 'di-pie-charts'] },
      { titleKey: 'learn.groupTables', ids: ['di-tables-caselets', 'di-sets'] }
    ]
  };
  /* Resolved lazily — parse happens before the boot language applies (ADR-111). */
  function _subjectBlurb(sid) {
    var k = { quant: 'learn.subjBlurbQuant', di: 'learn.subjBlurbDi', lr: 'learn.subjBlurbLr' }[sid];
    return k ? QRI18n.t(k) : '';
  }

  /* ---- Phase-4 integration helpers (progress / revision / practice — all local, NO AI) ---- */
  function _LP() { return (typeof LearnProgress !== 'undefined') ? LearnProgress : null; }
  function _revisionTypes() {
    return (typeof KnowledgeSchema !== 'undefined' && KnowledgeSchema.REVISION_BLOCK_TYPES) || ['formula', 'trick', 'trap', 'revision'];
  }
  function _isRevisionType(t) { return _revisionTypes().indexOf(t) !== -1; }
  function _hasRevisionContent(topic) {
    return (topic.sections || []).some(function (b) { return b && _isRevisionType(b.type); });
  }
  /* Launch a focus drill for this topic's drill category — reuses the existing Practice entry point (ADR-045). */
  function _launchDrill(topic) {
    if (!topic || !topic.drillCategory) return;
    if (typeof _tryPracticeAction === 'function' && !_tryPracticeAction()) return;
    try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('practice'); } catch (_) {}
    var cat = topic.drillCategory, label = topic.title;
    setTimeout(function () { try { if (typeof startDrillFromPractice === 'function') startDrillFromPractice('focus', cat, label); } catch (_) {} }, 60);
  }
  /* Cheat-sheet projection: hide everything except revision-type sections (a filtered VIEW, not duplicated content). */
  function _toggleRevision(btn) {
    var host = document.getElementById('learnTopic'); if (!host) return;
    var on = host.classList.toggle('kx-revision-only');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = on ? QRI18n.t('learn.fullNotes') : QRI18n.t('learn.quickRevision');
    /* hidden sections can't intersect, so clear any now-stale scroll-spy highlight (re-applies on next scroll) */
    host.querySelectorAll('.kx-sec-pill.is-active').forEach(function (p) { p.classList.remove('is-active'); p.removeAttribute('aria-current'); });
  }

  /* ───────────────────────── hub ───────────────────────── */

  function _buildHub() {
    /* The loved multiplication tables (tables.js) — kept on the hub as a first-class revision shortcut (ADR-092).
       All other condensed reference (squares, cubes, fraction↔percent, mental math) now lives ONLY in the
       Quick-Reference library — one intentional home instead of three historical ones. */
    var tableSelector = document.getElementById('tableSelector');
    var tableDisplay = document.getElementById('tableDisplay');
    if (tableSelector && tableDisplay && typeof renderTableSelector === 'function') renderTableSelector(tableSelector, tableDisplay, 30);

    var qrEntry = document.getElementById('quickRefEntry');
    if (qrEntry) qrEntry.addEventListener('click', function () { try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn', { path: 'quick-ref' }); } catch (_) {} });

    _renderCategories();
    if (typeof renderBookmarksSection === 'function') renderBookmarksSection();
    if (typeof renderCustomTopicSections === 'function') renderCustomTopicSections();

    var addTopicBtn = document.getElementById('addTopicBtn');
    if (addTopicBtn) {
      addTopicBtn.addEventListener('click', function () {
        if (typeof canAccessFeature === 'function' && !canAccessFeature('add_topic')) { if (typeof showPaywall === 'function') showPaywall('add_topic'); return; }
        _createModal(QRI18n.t('learn.createTopic'), [{ name: 'name', label: QRI18n.t('learn.topicName'), placeholder: QRI18n.t('learn.topicNamePlaceholder') }], function (values) {
          if (!values.name) return;
          addCustomTopic(values.name);
          renderCustomTopicSections();
        });
      });
    }

    _wireSearch();
  }

  /* ADR-092 de-badging: difficulty + AT MOST one contextual badge per card. Exam frequency stays on the topic
     page where there's room for full metadata — 62 cards × 3 badges was a wall, not information.
     Note (ADR-104): the `status === 'scaffold'` branches here and elsewhere in this file are a RETAINED SEAM —
     dormant today (all 62 topics are 'published') but the intended, honest way to stage future "coming soon"
     topics. Kept deliberately; see schema.js STATUSES. */
  function _topicCardHtml(t) {
    /* ADR-109: a Premium-gated Learn topic that THIS user hasn't unlocked shows a lock badge (still visible +
       clickable — opening it lands on the locked topic page, so Learn reads as a full catalog, not a wall). */
    var locked = _isTopicLockedForUser(t.id, t.category);
    return '<button class="kx-topic-card' + (t.status === 'scaffold' ? ' is-scaffold' : '') + (locked ? ' is-premium' : '') + '" type="button" data-topic="' + _esc(t.id) + '">' +
      '<div class="kx-tc-top"><span class="kx-tc-ico">' + _esc(t.icon || '📘') + '</span><span class="kx-tc-title">' + _esc(t.title) + '</span></div>' +
      '<div class="kx-tc-badges">' + _diffBadge(t.difficulty) + _ctxBadge(t) +
      (t.status === 'scaffold' ? '<span class="kx-badge kx-status-scaffold">' + QRI18n.t('learn.badgeComingSoon') + '</span>' : '') +
      (locked ? '<span class="kx-badge kx-status-premium">' + ((typeof qrIco === 'function') ? qrIco('lock', '🔒') : '🔒') + ' ' + QRI18n.t('learn.badgePremium') + '</span>' : '') +
      '</div>' +
      '</button>';
  }

  /* ADR-109: is `id` a Premium Learn topic the CURRENT user cannot access? Fail-closed — if paywall.js is absent,
     hasPremiumAccess() is unavailable ⇒ a premium topic stays locked. If the ENTITLEMENTS MODULE itself is missing,
     topics resolve as unlocked — a deliberate, documented trade-off (cert pass): blanket-locking would black out ALL
     free Learn content in the same failure window, which is strictly worse; the module is precached + tag-order and
     precache presence are asserted by entitlement-parity.check, and JS is network-first so the state self-heals on
     any online load. We log loudly (once) so the state is at least detectable. */
  var _warnedNoEntitlements = false;
  function _isTopicLockedForUser(id, category) {
    if (typeof LearnEntitlements === 'undefined') {
      if (!_warnedNoEntitlements) { _warnedNoEntitlements = true; try { console.error('[Learn] LearnEntitlements missing — premium Learn gating disabled until it loads'); } catch (_) {} }
      return false;
    }
    if (!LearnEntitlements.isPremiumLearnTopic(id, category)) return false;
    return !((typeof hasPremiumAccess === 'function') && hasPremiumAccess());
  }

  /* Order topics by the exam-relevance recommendedOrder (learning progression — "where to start" first), stably
     falling back to the registration order when no metadata exists. Drives every Learn grid so the sequence is
     consistent with the planner/recommendations. */
  function _byOrder(topics) {
    var ER = _examRel();
    if (!ER) return topics;
    return topics.map(function (t, i) { return { t: t, i: i, o: ER.order ? ER.order(t.id) : 999 }; })
      .sort(function (a, b) { return a.o - b.o || a.i - b.i; })
      .map(function (x) { return x.t; });
  }
  function _gridHtml(topics) { return '<div class="kx-topic-grid">' + _byOrder(topics).map(_topicCardHtml).join('') + '</div>'; }

  /* "7 topics · 3 read" — shared by the initial build and the live refresh (_refreshCardTicks). */
  function _catCountText(catId) {
    var KB = _KB(), LP = _LP();
    var topics = KB ? KB.byCategory(catId) : [];
    var done = 0;
    if (LP) topics.forEach(function (t) { if (LP.isComplete(t.id)) done++; });
    return QRI18n.t('learn.topicCount', { count: topics.length }) + (done > 0 ? ' · ' + QRI18n.t('learn.readCount', { count: done }) : '');
  }

  function _catHtml(c, hideHead) {
    var KB = _KB(); var topics = KB.byCategory(c.id);
    /* hideHead: when a subject has a single category, its rich subject header already names it — repeating the
       category title right below would be redundant, so we drop it and let the sub-groups carry the structure. */
    /* data-cat lets _refreshCardTicks keep the "· N read" count live after a completion (hub builds once). */
    var head = hideHead ? '' : ('<div class="kx-cat-head"><h2 class="kx-cat-title">' + _esc(c.icon) + ' ' + _esc(_lcat(c.id, 'Title', c.title)) + '</h2>' +
      '<span class="kx-cat-count" data-cat="' + _esc(c.id) + '">' + _catCountText(c.id) + '</span></div>' +
      (c.blurb ? '<p class="kx-cat-blurb">' + _esc(_lcat(c.id, 'Blurb', c.blurb)) + '</p>' : ''));
    var groups = SUBGROUPS[c.id], body;
    if (groups) {
      var byId = {}; topics.forEach(function (t) { byId[t.id] = t; });
      var used = {};
      body = groups.map(function (g) {
        var gt = g.ids.map(function (id) { return byId[id]; }).filter(Boolean);
        gt.forEach(function (t) { used[t.id] = 1; });
        if (!gt.length) return '';
        return '<div class="kx-subgroup"><h3 class="kx-subgroup-head">' + _esc(QRI18n.t(g.titleKey)) +
          '<span class="kx-subgroup-count">' + gt.length + '</span></h3>' + _gridHtml(gt) + '</div>';
      }).join('');
      var rest = topics.filter(function (t) { return !used[t.id]; });
      if (rest.length) body += '<div class="kx-subgroup">' + _gridHtml(rest) + '</div>';
    } else {
      body = _gridHtml(topics);
    }
    return '<div class="kx-cat">' + head + body + '</div>';
  }

  /* A subject section header that breathes: title + short blurb + topic count + difficulty coverage. */
  function _subjectHeaderHtml(sid, label, cats) {
    var KB = _KB(); var topics = [];
    cats.forEach(function (c) { topics = topics.concat(KB.byCategory(c.id)); });
    var n = topics.length, diffs = {};
    topics.forEach(function (t) { diffs[t.difficulty] = 1; });
    var order = ['foundation', 'core', 'advanced'], present = order.filter(function (d) { return diffs[d]; });
    var coverage = present.length ? (DIFF_LABEL[present[0]] + (present.length > 1 ? ' → ' + DIFF_LABEL[present[present.length - 1]] : '')) : '';
    var blurb = _subjectBlurb(sid);
    /* subtle progress — a quiet "x read" using the completion the app already tracks (no gamification). */
    var LP = _LP(), done = 0;
    if (LP) topics.forEach(function (t) { if (LP.isComplete(t.id)) done++; });
    var read = done > 0 ? ' · ' + QRI18n.t('learn.readCount', { count: done }) : '';
    return '<div class="kx-subject-head-wrap">' +
      '<h2 class="kx-subject-head">' + _esc(label) + '</h2>' +
      (blurb ? '<p class="kx-subject-blurb">' + _esc(blurb) + '</p>' : '') +
      '<div class="kx-subject-meta">' + n + (n === 1 ? ' topic' : ' topics') + (coverage ? ' · ' + _esc(coverage) : '') + read + '</div>' +
      '</div>';
  }

  /* ─────────────────── subject filter (ADR-082) ─────────────────── */
  /* Remembered choice — a plain localStorage key, mirroring qr_active_exam. 'all' or a subject id. */
  function _loadFilter() { try { return localStorage.getItem('qr_learn_filter') || 'all'; } catch (_) { return 'all'; } }
  function _saveFilter(v) { try { localStorage.setItem('qr_learn_filter', v); } catch (_) {} }

  function _subjectFilterHtml(ordered, label, sel) {
    var pill = function (id, text) {
      return '<button class="kx-filter-pill' + (sel === id ? ' is-active' : '') + '" type="button" role="tab"' +
        ' aria-selected="' + (sel === id ? 'true' : 'false') + '" data-filter="' + _esc(id) + '">' + _esc(text) + '</button>';
    };
    var pills = pill('all', QRI18n.t('learn.allPill'));
    ordered.forEach(function (sid) { pills += pill(sid, label[sid] || sid); });
    return '<div class="kx-filter" role="tablist" aria-label="' + QRI18n.t('learn.filterAria') + '">' + pills + '</div>';
  }

  function _applyFilter(host, sel) {
    host.querySelectorAll('.kx-subject-group').forEach(function (sec) {
      var sid = sec.getAttribute('data-subject');
      sec.classList.toggle('is-hidden', sel !== 'all' && sid !== sel);
    });
    host.querySelectorAll('.kx-filter-pill').forEach(function (p) {
      var on = p.getAttribute('data-filter') === sel;
      p.classList.toggle('is-active', on);
      p.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function _wireFilter(host) {
    host.querySelectorAll('.kx-filter-pill').forEach(function (p) {
      p.addEventListener('click', function () {
        var sel = p.getAttribute('data-filter');
        _saveFilter(sel);
        _applyFilter(host, sel);
        _renderUpNext();   // the "Up next" pick is filter-aware (ADR-092)
        if (typeof SoundEngine !== 'undefined' && SoundEngine.play) { try { SoundEngine.play('tabSwitch'); } catch (_) {} }
      });
    });
  }

  function _renderCategories() {
    var host = document.getElementById('learnCategories'); if (!host) return;
    var KB = _KB(); if (!KB) { host.innerHTML = ''; return; }
    var cats = KB.categories();
    /* Group categories under their Speed-Aptitude subject (ADR-073/074), in subject-registry order. With a single
       subject this is byte-identical to the old flat hub; once a 2nd subject (DI) has content the headers appear. */
    var label = {}, ord = [];
    try { if (typeof window !== 'undefined' && window.QR_SUBJECTS) window.QR_SUBJECTS.subjects().forEach(function (s) { ord.push(s.id); label[s.id] = s.label; }); } catch (_) {}
    var groups = {}, seen = [];
    cats.forEach(function (c) { var sid = c.subject || '_'; if (!groups[sid]) { groups[sid] = []; seen.push(sid); } groups[sid].push(c); });
    var ordered = ord.filter(function (id) { return groups[id]; });
    seen.forEach(function (id) { if (ordered.indexOf(id) === -1) ordered.push(id); });
    if (ordered.length <= 1) {
      host.innerHTML = cats.map(_catHtml).join('');
    } else {
      /* Saved subject filter, clamped to a subject that still has content (ADR-082). */
      var sel = _loadFilter();
      if (sel !== 'all' && ordered.indexOf(sel) === -1) sel = 'all';
      host.innerHTML = _subjectFilterHtml(ordered, label, sel) + ordered.map(function (sid) {
        var head = label[sid] ? _subjectHeaderHtml(sid, label[sid], groups[sid]) : '';
        /* single-category subject → suppress the (redundant) per-category head */
        var single = groups[sid].length === 1;
        return '<section class="kx-subject-group" data-subject="' + _esc(sid) + '">' + head + groups[sid].map(function (c) { return _catHtml(c, single); }).join('') + '</section>';
      }).join('');
      _wireFilter(host);
      _applyFilter(host, sel);
    }
    host.querySelectorAll('.kx-topic-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-topic');
        var KB = _KB(); var t = KB && KB.get(id);
        /* A scaffold ("coming soon") topic has no content yet — don't strand the user on a near-empty page;
           give clear feedback and stay on the hub. Direct deep links still render a graceful coming-soon page. */
        if (t && t.status === 'scaffold') {
          if (typeof showToast === 'function') showToast(QRI18n.t('learn.comingSoonToast', { title: t.title }));
          return;
        }
        _go(id);
      });
    });
  }

  /* ───────────────────────── search ───────────────────────── */

  function _wireSearch() {
    var input = document.getElementById('learnSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      if (_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function () { _searchTimer = null; _runSearch(input.value); }, 160);
    });
  }

  /* ADR-092: ONE search over everything — topic chapters AND Quick-Reference cards, rendered as two groups. */
  function _runSearch(q) {
    var box = document.getElementById('learnSearchResults'); if (!box) return;
    q = (q || '').trim();
    if (!q || typeof LearnSearch === 'undefined') { box.hidden = true; box.innerHTML = ''; return; }
    var topics = LearnSearch.query(q).slice(0, 6);
    var cards = (LearnSearch.queryCards ? LearnSearch.queryCards(q) : []).slice(0, 4);
    box.hidden = false;
    if (!topics.length && !cards.length) { box.innerHTML = '<div class="kx-search-empty">' + QRI18n.t('learn.noMatches', { q: _esc(q) }) + '</div>'; return; }
    var html = '';
    if (topics.length) {
      html += '<div class="kx-search-group">Topics</div>' + topics.map(function (r) {
        return '<a class="kx-search-item" href="#learn/' + encodeURIComponent(r.id) + '" data-topic="' + _esc(r.id) + '">' +
          '<span class="kx-search-ico">' + _esc(r.icon || '📘') + '</span>' +
          '<span class="kx-search-title">' + _esc(r.title) + '</span>' +
          '<span class="kx-search-cat">' + _esc(r.category) + '</span></a>';
      }).join('');
    }
    if (cards.length) {
      html += '<div class="kx-search-group">' + _esc(QRI18n.t('learn.searchGroupQuickRef')) + '</div>' + cards.map(function (r) {
        return '<a class="kx-search-item" href="#learn/quick-ref" data-card="' + _esc(r.id) + '">' +
          '<span class="kx-search-ico">' + _esc(r.icon || '⚡') + '</span>' +
          '<span class="kx-search-title">' + _esc(r.title) + '</span>' +
          '<span class="kx-search-cat">' + _esc(r.section) + '</span></a>';
      }).join('');
    }
    box.innerHTML = html;
    box.querySelectorAll('.kx-search-item[data-topic]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); _go(a.getAttribute('data-topic')); });
    });
    box.querySelectorAll('.kx-search-item[data-card]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var id = a.getAttribute('data-card');
        _go('quick-ref');
        /* reveal AFTER the route has rendered + focused (both synchronous) so our scroll wins */
        setTimeout(function () { try { if (typeof QuickRef !== 'undefined' && QuickRef.reveal) QuickRef.reveal(id); } catch (_) {} }, 60);
      });
    });
  }

  /* ───────────────────────── topic page ───────────────────────── */

  function _buildTopicPage(topic) {
    var host = document.getElementById('learnTopic'); if (!host) return;
    if (_io) { try { _io.disconnect(); } catch (_) {} _io = null; }
    var KB = _KB();
    var cat = (KB && KB.categoryMeta(topic.category)) || { title: topic.category, icon: '📘' };
    host.classList.remove('kx-revision-only');   // never carry the cheat-sheet projection across topics
    host.innerHTML = '';

    /* Single honest back affordance (ADR-092): topic pages are one level deep — the old breadcrumb's category
       crumb also just went to the hub, a pretend hierarchy. One link, no lie. Hub scroll position is restored. */
    var backNav = document.createElement('nav'); backNav.className = 'kx-topic-nav'; backNav.setAttribute('aria-label', (typeof QRI18n !== 'undefined') ? QRI18n.t('learn.qrBackAria') : 'Back to Learn');
    var backBtn = document.createElement('button'); backBtn.className = 'kx-back'; backBtn.type = 'button';
    backBtn.innerHTML = '← ' + QRI18n.t('learn.header');
    backBtn.addEventListener('click', function () { _go(null); });
    backNav.appendChild(backBtn);
    host.appendChild(backNav);

    /* header + badges */
    var header = document.createElement('div'); header.className = 'kx-topic-header';
    header.innerHTML = '<span class="kx-th-ico">' + _esc(topic.icon || '📘') + '</span><h1 class="kx-th-title" tabindex="-1">' + _esc(topic.title) + '</h1>';
    host.appendChild(header);
    var badges = document.createElement('div'); badges.className = 'kx-th-badges';
    badges.innerHTML = _diffBadge(topic.difficulty) + _freqBadge(topic.examFrequency) +
      (topic.status === 'scaffold' ? '<span class="kx-badge kx-status-scaffold">' + QRI18n.t('learn.badgeComingSoon') + '</span>' : '');
    host.appendChild(badges);

    /* Record the visit (powers Continue / Due-for-revision) and surface the action bar — published topics only. */
    if (topic.status !== 'scaffold') {
      var LP = _LP(); if (LP) LP.markViewed(topic.id);
      var bar = _buildActionBar(topic);
      if (bar) host.appendChild(bar);
    }

    var sections = (topic.sections || []).filter(function (b) { return b && b.type !== 'related'; });
    var labels = (typeof BlockRenderers !== 'undefined') ? BlockRenderers.SECTION_LABELS : {};
    /* Textbook chapter headings (ADR-081): a concept names itself, a table uses its caption — so the page + sticky TOC
       read like real section titles, not "Concept · Concept · Table". Pills truncate to keep the nav tidy. */
    function _secLabel(b) {
      if (typeof BlockRenderers !== 'undefined' && BlockRenderers.sectionLabel) return BlockRenderers.sectionLabel(b);
      return (labels[b.type] || b.type);
    }
    function _pillLabel(b) { var s = _secLabel(b); return s.length > 22 ? s.slice(0, 21) + '…' : s; }

    /* sticky section nav (only when there is content to navigate) */
    if (sections.length > 1) {
      var nav = document.createElement('nav'); nav.className = 'kx-section-nav'; nav.setAttribute('aria-label', QRI18n.t('learn.onThisPageAria'));
      sections.forEach(function (b, i) {
        var pill = document.createElement('button');
        pill.className = 'kx-sec-pill' + (_isRevisionType(b.type) ? ' is-revision' : '');
        pill.type = 'button'; pill.setAttribute('data-sec', 'kx-sec-' + i);
        pill.textContent = _pillLabel(b);
        pill.addEventListener('click', function () {
          var el = document.getElementById('kx-sec-' + i);
          if (el) el.scrollIntoView({ behavior: _scrollBehavior(), block: 'start' });
        });
        nav.appendChild(pill);
      });
      host.appendChild(nav);
    }

    /* ONE reading column at every width (ADR-092) — the old desktop aside split the reader's attention and hid
       prev/next in a sidebar; everything that matters at the END of a chapter now lives at the end of the chapter. */
    var body = document.createElement('div'); body.className = 'kx-topic-body';
    var main = document.createElement('div'); main.className = 'kx-topic-main';

    if (!sections.length) {
      var soon = document.createElement('p'); soon.className = 'kx-overview';
      soon.textContent = QRI18n.t('learn.comingSoonTopic');
      main.appendChild(soon);
    }
    sections.forEach(function (b, i) {
      var sec = document.createElement('div'); sec.className = 'kx-section' + (_isRevisionType(b.type) ? ' is-revision' : ''); sec.id = 'kx-sec-' + i;
      /* Self-headed blocks already render a prominent heading — a concept's title, a callout's "⚡/⚠️/📌/🧠" head, the
         example's "📝 Solved example", or a captioned table — so adding the eyebrow would just repeat it. We show the
         eyebrow only where it genuinely names the section (overview, key formulae, an uncaptioned table, key takeaways). */
      var _selfHeaded = (b.type === 'concept' || b.type === 'trick' || b.type === 'trap' || b.type === 'exam' || b.type === 'memory' || b.type === 'example' || (b.type === 'table' && b.caption));
      if (!_selfHeaded) {
        var lbl = document.createElement('h2'); lbl.className = 'kx-section-label'; lbl.textContent = _secLabel(b);
        sec.appendChild(lbl);
      }
      var node = (typeof BlockRenderers !== 'undefined') ? BlockRenderers.render(b) : null;
      if (node) sec.appendChild(node);
      main.appendChild(sec);
    });

    /* End-of-chapter footer (ADR-092): the read → practise → complete loop at the exact moment of finish,
       then the path onward (Next up / related / previous). Published topics only. */
    if (topic.status !== 'scaffold') main.appendChild(_buildChapterFoot(topic, cat));
    else {
      /* Scaffold ("coming soon") topics skip the chapter footer, but must still expose the report action so EVERY
         topic page is reportable (ADR-101) — e.g. a wrong stub title or a mis-scoped placeholder. */
      var srl = _reportTopicLine(topic, cat);
      if (srl) { srl.style.marginTop = '1.6rem'; main.appendChild(srl); }
    }
    body.appendChild(main);
    host.appendChild(body);

    _setupSectionSpy(sections.length);
  }

  /* Every complete-toggle on the page (action bar + chapter footer) shows the same state. */
  function _syncCompleteButtons(nowDone) {
    document.querySelectorAll('#learnTopic .kx-action-complete').forEach(function (b) {
      b.classList.toggle('is-on', nowDone);
      b.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
      b.innerHTML = nowDone ? QRI18n.t('learn.completed') : QRI18n.t('learn.markComplete');
    });
  }
  function _completeBtn(topic, LP) {
    var done = LP.isComplete(topic.id);
    var cb = document.createElement('button'); cb.className = 'kx-action kx-action-complete' + (done ? ' is-on' : ''); cb.type = 'button';
    cb.setAttribute('aria-pressed', done ? 'true' : 'false'); cb.innerHTML = done ? QRI18n.t('learn.completed') : QRI18n.t('learn.markComplete');
    cb.addEventListener('click', function () {
      var nowDone = LP.toggleComplete(topic.id);
      _syncCompleteButtons(nowDone);
      if (typeof showToast === 'function') showToast(nowDone ? QRI18n.t('learn.markedComplete', { title: topic.title }) : QRI18n.t('learn.markedNotComplete'));
    });
    return cb;
  }

  function _buildChapterFoot(topic, cat) {
    var KB = _KB(), LP = _LP();
    var foot = document.createElement('div'); foot.className = 'kx-chapter-foot';

    /* the moment of finish: complete + practise side by side */
    var row = document.createElement('div'); row.className = 'kx-foot-actions';
    if (LP) row.appendChild(_completeBtn(topic, LP));
    if (topic.drillCategory) {
      var pb = document.createElement('button'); pb.className = 'kx-action kx-action-practise'; pb.type = 'button';
      pb.innerHTML = QRI18n.t('learn.practiseThis');
      pb.addEventListener('click', function () { _launchDrill(topic); });
      row.appendChild(pb);
    }
    if (row.childNodes.length) foot.appendChild(row);

    var sib = KB ? KB.siblings(topic.id) : { prev: null, next: null };
    /* Last topic of a category shouldn't dead-end: continue into the next category of the same subject
       (recommended order), labelled with ITS category so the hand-off is explicit. */
    var next = sib.next, nextCatTitle = cat.title;
    if (!next && KB) {
      var cats = KB.categories().filter(function (c) { return c.subject === (KB.categoryMeta(topic.category) || {}).subject; });
      var ci = cats.map(function (c) { return c.id; }).indexOf(topic.category);
      if (ci !== -1 && ci < cats.length - 1) {
        var candidates = _byOrder(KB.byCategory(cats[ci + 1].id)).filter(function (t) { return t.status !== 'scaffold'; });
        if (candidates.length) { next = candidates[0]; nextCatTitle = cats[ci + 1].title; }
      }
    }
    if (next) {
      var nu = document.createElement('div'); nu.className = 'kx-foot-block';
      nu.innerHTML = '<div class="kx-aside-title">' + QRI18n.t('learn.nextUp') + '</div>';
      var nc = document.createElement('button'); nc.className = 'kx-foot-next'; nc.type = 'button';
      nc.innerHTML = '<span class="kx-fn-ico" aria-hidden="true">' + _esc(next.icon || '📘') + '</span>' +
        '<span class="kx-fn-txt"><span class="kx-fn-title">' + _esc(next.title) + '</span>' +
        '<span class="kx-fn-cat">' + _esc(nextCatTitle) + '</span></span>' +
        '<span class="kx-fn-arrow" aria-hidden="true">›</span>';
      nc.addEventListener('click', (function (id) { return function () { _go(id); }; })(next.id));
      nu.appendChild(nc); foot.appendChild(nu);
    }

    var related = KB ? KB.related(topic.id) : [];
    if (related.length) {
      var rb = document.createElement('div'); rb.className = 'kx-foot-block';
      rb.innerHTML = '<div class="kx-aside-title">' + QRI18n.t('learn.relatedTopics') + '</div>';
      var chips = document.createElement('div'); chips.className = 'kx-related';
      related.forEach(function (rt) {
        var a = document.createElement('a'); a.className = 'kx-chip'; a.textContent = rt.title;
        a.setAttribute('href', '#learn/' + encodeURIComponent(rt.id)); a.setAttribute('data-topic', rt.id);
        a.addEventListener('click', function (e) { e.preventDefault(); _go(rt.id); });
        chips.appendChild(a);
      });
      rb.appendChild(chips); foot.appendChild(rb);
    }

    if (sib.prev) {
      var pv = document.createElement('button'); pv.className = 'kx-foot-prev'; pv.type = 'button';
      pv.innerHTML = QRI18n.t('learn.prevChapter', { title: _esc(sib.prev.title) });
      pv.addEventListener('click', (function (id) { return function () { _go(id); }; })(sib.prev.id));
      foot.appendChild(pv);
    }

    /* Report an issue (ADR-100) — a deliberate, low-emphasis affordance closing the reading spine: secondary to the
       finish actions, always discoverable, never competing with "Practise this". */
    var rl = _reportTopicLine(topic, cat);
    if (rl) foot.appendChild(rl);
    return foot;
  }

  /* The "Report an issue" line — opens the purpose-built Learn report flow pre-scoped to THIS chapter (topic
     metadata auto-attached; the user picks a reason, 2 taps). Shared by the chapter footer (published topics) and
     the scaffold topic page (ADR-101 — so EVERY topic page exposes the report action). Returns null if reporting
     is unavailable. */
  function _reportTopicLine(topic, cat) {
    if (typeof ReportModal === 'undefined' || !ReportModal.open) return null;
    var rep = document.createElement('button'); rep.className = 'kx-report-line'; rep.type = 'button';
    rep.innerHTML = '<span class="kx-report-ico" aria-hidden="true">⚑</span> ' + QRI18n.t('learn.reportPrompt') + ' <span class="kx-report-cta">' + QRI18n.t('learn.reportCta') + '</span>';
    rep.addEventListener('click', function () {
      ReportModal.open({ source: 'learn', topic: {
        id: topic.id, title: topic.title, category: topic.category,
        subject: (cat && cat.subject) || null,
        difficulty: topic.difficulty, examFrequency: topic.examFrequency,
        route: '#learn/' + topic.id
      } });
    });
    return rep;
  }

  /* Highlight the section-nav pill for the section currently in view (premium polish; degrades gracefully). */
  function _setupSectionSpy(count) {
    if (count < 2 || typeof IntersectionObserver === 'undefined') return;
    var nav = document.querySelector('#learnTopic .kx-section-nav'); if (!nav) return;
    _io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var pills = nav.querySelectorAll('.kx-sec-pill');
        for (var i = 0; i < pills.length; i++) {
          var active = pills[i].getAttribute('data-sec') === en.target.id;
          pills[i].classList.toggle('is-active', active);
          if (active) pills[i].setAttribute('aria-current', 'true'); else pills[i].removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-15% 0px -75% 0px', threshold: 0 });
    for (var i = 0; i < count; i++) { var el = document.getElementById('kx-sec-' + i); if (el) _io.observe(el); }
  }

  /* Topic action bar: Practise this · Quick revision (cheat-sheet) · Mark complete · Save. All local, NO AI. */
  function _buildActionBar(topic) {
    var bar = document.createElement('div'); bar.className = 'kx-actionbar';
    var LP = _LP();

    if (topic.drillCategory) {
      var pb = document.createElement('button'); pb.className = 'kx-action kx-action-practise'; pb.type = 'button';
      pb.innerHTML = QRI18n.t('learn.practiseThis');
      pb.addEventListener('click', function () { _launchDrill(topic); });
      bar.appendChild(pb);
    } else if (topic.drillComingSoon) {
      /* Practice is intentionally pending (no dedicated bank yet) — a non-interactive cue, never wrong content. */
      var soon = document.createElement('span'); soon.className = 'kx-action kx-action-soon';
      soon.setAttribute('aria-disabled', 'true'); soon.textContent = QRI18n.t('learn.practiceComingSoon');
      bar.appendChild(soon);
    }
    if (_hasRevisionContent(topic)) {
      var qb = document.createElement('button'); qb.className = 'kx-action kx-action-revise'; qb.type = 'button';
      qb.setAttribute('aria-pressed', 'false'); qb.innerHTML = QRI18n.t('learn.quickRevision');
      qb.addEventListener('click', function () { _toggleRevision(qb); });
      bar.appendChild(qb);
    }
    if (LP) {
      bar.appendChild(_completeBtn(topic, LP));   // shared with the chapter footer — the two toggles stay in sync

      var saved = LP.isBookmarked(topic.id);
      var bb = document.createElement('button'); bb.className = 'kx-action kx-action-save' + (saved ? ' is-on' : ''); bb.type = 'button';
      bb.setAttribute('aria-pressed', saved ? 'true' : 'false'); bb.innerHTML = saved ? QRI18n.t('learn.savedBtn') : QRI18n.t('learn.saveBtn');
      bb.addEventListener('click', function () {
        var nowSaved = LP.toggleBookmark(topic.id);
        bb.classList.toggle('is-on', nowSaved); bb.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
        bb.innerHTML = nowSaved ? QRI18n.t('learn.savedBtn') : QRI18n.t('learn.saveBtn');
        if (typeof showToast === 'function') showToast(nowSaved ? QRI18n.t('learn.savedToast', { title: topic.title }) : QRI18n.t('learn.removedSaved'));
      });
      bar.appendChild(bb);
    }
    return bar;
  }

  /* ───────────────────────── "Up next" + "Revise today" (ADR-092) ───────────────────────── */

  /* All topic ids currently due for spaced revision (shared by the Revise-today card and the revise flow).
     ADR-109 cert fix (CERT-1): topics locked for THIS user (lapsed-premium progress on gated chapters) are excluded,
     matching ReviseFlow._dueNow — so the hub card's count never advertises a session the flow won't deliver. */
  function _dueIds() {
    var LP = _LP(), KB = _KB();
    if (!LP || !KB) return [];
    var input = KB.all().map(function (t) { return { id: t.id, revisionIntervalDays: t.revisionIntervalDays }; });
    return LP.due(input).filter(function (id) { return KB.has(id) && !_isTopicLockedForUser(id); });
  }

  /* ONE recommended next chapter — the study spine made visible. First not-completed topic by the exam-relevance
     recommended order, honouring the saved subject filter and (when a target exam is set) preferring that exam's
     focus topics. Hidden once everything is read. */
  function _renderUpNext() {
    var host = document.getElementById('learnUpNext'); if (!host) return;
    var KB = _KB(), LP = _LP(), ER = _examRel();
    if (!KB) { host.innerHTML = ''; return; }
    var subjOf = {};
    KB.categories().forEach(function (c) { subjOf[c.id] = c.subject || '_'; });
    var subjRank = {};
    try { if (typeof window !== 'undefined' && window.QR_SUBJECTS) window.QR_SUBJECTS.subjects().forEach(function (s, i) { subjRank[s.id] = i; }); } catch (_) {}
    var cands = KB.all().filter(function (t) { return t.status !== 'scaffold' && !(LP && LP.isComplete(t.id)); });
    var sel = _loadFilter();
    if (sel !== 'all') {
      var inSubj = cands.filter(function (t) { return subjOf[t.category] === sel; });
      if (inSubj.length) cands = inSubj;   // filter subject fully read → fall back to everything
    }
    if (!cands.length) { host.innerHTML = ''; return; }
    var exam = _targetExam(), track = (exam && ER) ? ER.trackForExam(exam) : null;
    if (track) {
      var focus = cands.filter(function (t) { return ER.weight(t.id, track) >= 2; });
      if (focus.length) cands = focus;
    }
    cands.sort(function (a, b) {
      var sa = subjRank[subjOf[a.category]] || 0, sb = subjRank[subjOf[b.category]] || 0;
      if (sa !== sb) return sa - sb;
      return (ER ? ER.order(a.id) : 999) - (ER ? ER.order(b.id) : 999);
    });
    var t = cands[0];
    var cat = KB.categoryMeta(t.category) || { title: t.category };
    var why = [_diffLabel(t.difficulty) || '', _lcat(t.category, 'Title', cat.title)];
    if (track && ER.weight(t.id, track) >= 3) why.push(QRI18n.t('learn.highPriority', { track: ER.trackLabel(track) }));
    else if (ER && ER.isMostAsked(t.id)) why.push(QRI18n.t('learn.mostAsked'));
    host.innerHTML = '<button class="kx-upnext" type="button" data-topic="' + _esc(t.id) + '">' +
      '<span class="kx-upnext-eyebrow">' + QRI18n.t('learn.upNextEyebrow') + '</span>' +
      '<span class="kx-upnext-row">' +
      '<span class="kx-upnext-ico" aria-hidden="true">' + _esc(t.icon || '📘') + '</span>' +
      '<span class="kx-upnext-txt"><span class="kx-upnext-title">' + _esc(t.title) + '</span>' +
      '<span class="kx-upnext-why">' + why.filter(Boolean).map(_esc).join(' · ') + '</span></span>' +
      '<span class="kx-upnext-arrow" aria-hidden="true">›</span></span></button>';
    host.querySelector('.kx-upnext').addEventListener('click', function () { _go(t.id); });
  }

  /* The daily recall entry point — visible only when spaced revision actually has something due. */
  function _renderReviseCard() {
    var host = document.getElementById('learnReviseCard'); if (!host) return;
    var due = _dueIds();
    if (!due.length) { host.innerHTML = ''; return; }
    var n = due.length;
    host.innerHTML = '<button class="kx-revise-card" type="button">' +
      '<span class="kx-revise-ico" aria-hidden="true">🔁</span>' +
      '<span class="kx-revise-txt"><strong>' + QRI18n.t('learn.reviseToday') + '</strong>' +
      '<small>' + QRI18n.t('learn.reviseDue', { count: n }) + '</small></span>' +
      '<span class="kx-revise-cta">' + QRI18n.t('home.start') + '</span></button>';
    host.querySelector('.kx-revise-card').addEventListener('click', function () {
      try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn', { path: 'revise' }); } catch (_) {}
    });
  }

  /* ───────────────────────── hub resume strips (Continue + Needs practice + Saved) ───────────────────────── */

  function _stripHtml(title, ids, KB) {
    var LP = _LP();
    var cards = ids.map(function (id) {
      var t = KB.get(id); if (!t) return '';
      var done = LP && LP.isComplete(id);
      /* ADR-109 cert fix (CERT-5): strips show the same lock affordance as hub cards — the click was already
         gated (routes through renderLearnRoute), this keeps the promise honest before the tap. */
      var locked = _isTopicLockedForUser(id, t.category);
      return '<button class="kx-resume-card" type="button" data-topic="' + _esc(id) + '">' +
        '<span class="kx-rc-ico">' + _esc(t.icon || '📘') + '</span>' +
        '<span class="kx-rc-title">' + _esc(t.title) + '</span>' +
        (locked ? '<span class="kx-rc-lock" aria-label="' + _esc(QRI18n.t('learn.badgePremium')) + '">🔒</span>' : '') +
        (done ? '<span class="kx-rc-done" aria-label="' + _esc(QRI18n.t('learn.ariaCompleted')) + '">✓</span>' : '') + '</button>';
    }).join('');
    return '<div class="kx-resume"><div class="kx-resume-head">' + _esc(title) + '</div><div class="kx-resume-row" data-no-swipe>' + cards + '</div></div>';
  }

  /* "Needs practice" (ADR-092): the drill→learn loop. The SAME weakest derivation Stats shows (QR_STATMATH via
     loadProgress) mapped onto Learn topics through drillCategory — Learn and Analytics can never disagree. */
  function _weakStripHtml(KB) {
    try {
      if (typeof QR_STATMATH === 'undefined' || typeof loadProgress !== 'function') return '';
      var weak = QR_STATMATH.weakestTopics(loadProgress(), 4);
      if (!weak || !weak.length) return '';
      var byCat = {};
      KB.all().forEach(function (t) { if (t.drillCategory && !byCat[t.drillCategory]) byCat[t.drillCategory] = t; });
      var cards = weak.map(function (m) {
        var t = byCat[m.cat]; if (!t) return '';
        var locked = _isTopicLockedForUser(t.id, t.category);   /* ADR-109 cert fix (CERT-5) */
        return '<button class="kx-resume-card kx-weak-card" type="button" data-topic="' + _esc(t.id) + '">' +
          '<span class="kx-rc-ico">' + _esc(t.icon || '📘') + '</span>' +
          '<span class="kx-rc-title">' + _esc(t.title) + '</span>' +
          (locked ? '<span class="kx-rc-lock" aria-label="' + _esc(QRI18n.t('learn.badgePremium')) + '">🔒</span>' : '') +
          '<span class="kx-rc-acc">' + Math.round((m.acc || 0) * 100) + '%</span></button>';
      }).join('');
      if (!cards) return '';
      return '<div class="kx-resume"><div class="kx-resume-head">🎯 ' + QRI18n.t('learn.needsPractice') + '</div><div class="kx-resume-row" data-no-swipe>' + cards + '</div></div>';
    } catch (_) { return ''; }
  }

  function _renderResume() {
    var host = document.getElementById('learnResume'); if (!host) return;
    var LP = _LP(); var KB = _KB();
    if (!LP || !KB) { host.innerHTML = ''; return; }
    var html = '';

    /* Continue excludes anything currently due (the Revise-today card is the more urgent framing) — no dup cards. */
    var due = _dueIds();
    var recent = LP.recent(8).filter(function (id) { return KB.has(id) && due.indexOf(id) === -1; });
    if (recent.length) html += _stripHtml('⏱️ ' + QRI18n.t('learn.continueLearning'), recent, KB);

    html += _weakStripHtml(KB);

    /* Saved stays authoritative (an explicit user list) — every saved topic shows, even if also Due/Continue. */
    var saved = LP.bookmarkedIds().filter(function (id) { return KB.has(id); }).slice(0, 8);
    if (saved.length) html += _stripHtml('★ ' + QRI18n.t('learn.savedStrip'), saved, KB);

    host.innerHTML = html;
    host.querySelectorAll('.kx-resume-card').forEach(function (c) {
      c.addEventListener('click', function () { _go(c.getAttribute('data-topic')); });
    });
  }

  /* Reflect completion on the built-once grid: card ticks AND the "· N read" category counts stay live. */
  function _refreshCardTicks() {
    var LP = _LP(); if (!LP) return;
    var cards = document.querySelectorAll('#learnCategories .kx-topic-card');
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('is-complete', LP.isComplete(cards[i].getAttribute('data-topic')));
    document.querySelectorAll('#learnCategories .kx-cat-count[data-cat]').forEach(function (el) {
      el.textContent = _catCountText(el.getAttribute('data-cat'));
    });
  }

  /* ───────────────────────── route dispatch ───────────────────────── */

  /* Stash the hub scroll position + clear the search box before leaving the hub for any sub-view. */
  function _leaveHub(hub) {
    if (hub && !hub.hidden) { var c = document.querySelector('.container'); _hubScroll = c ? c.scrollTop : 0; }
    var input = document.getElementById('learnSearch'); if (input) input.value = '';
    var box = document.getElementById('learnSearchResults'); if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  /* ADR-109: the Premium-locked topic page. Rendered INSTEAD of _buildTopicPage for a gated topic the user hasn't
     unlocked — same reading-spine shell (back link + header) so it feels like the app, with a Premium hero + Upgrade
     CTA instead of the chapter body. Never markViewed (they didn't read it). This is the single render chokepoint, so
     it covers URL / deep link / history / back uniformly. */
  function _buildLockedTopicPage(topic) {
    var host = document.getElementById('learnTopic'); if (!host) return;
    if (_io) { try { _io.disconnect(); } catch (_) {} _io = null; }
    host.classList.remove('kx-revision-only');
    host.innerHTML = '';

    var backNav = document.createElement('nav'); backNav.className = 'kx-topic-nav'; backNav.setAttribute('aria-label', (typeof QRI18n !== 'undefined') ? QRI18n.t('learn.qrBackAria') : 'Back to Learn');
    var backBtn = document.createElement('button'); backBtn.className = 'kx-back'; backBtn.type = 'button';
    backBtn.innerHTML = '← ' + QRI18n.t('learn.header');
    backBtn.addEventListener('click', function () { _go(null); });
    backNav.appendChild(backBtn);
    host.appendChild(backNav);

    var header = document.createElement('div'); header.className = 'kx-topic-header';
    header.innerHTML = '<span class="kx-th-ico">' + _esc(topic.icon || '📘') + '</span><h1 class="kx-th-title" tabindex="-1">' + _esc(topic.title) + '</h1>';
    host.appendChild(header);

    var lock = document.createElement('div'); lock.className = 'kx-topic-locked';
    lock.innerHTML =
      '<div class="kx-locked-icon" aria-hidden="true">' + ((typeof qrIco === 'function') ? qrIco('lock', '🔒') : '🔒') + '</div>' +
      '<h2 class="kx-locked-title">' + QRI18n.t('learn.lockedTitle') + '</h2>' +
      '<p class="kx-locked-sub">' + QRI18n.t('learn.lockedSub', { title: _esc(topic.title) }) + '</p>' +
      '<button class="btn-primary kx-locked-cta" type="button">' + QRI18n.t('learn.lockedCta') + '</button>';
    host.appendChild(lock);
    var cta = lock.querySelector('.kx-locked-cta');
    if (cta) cta.addEventListener('click', function () {
      /* ADR-109 cert fix (CERT-2): seamless unlock IN PLACE. The payment-success handler's default refresh calls
         Router.showView(getCurrentView()) — view id only, no {path} — which would drop the user on the Learn hub
         instead of the chapter they just paid to read. Arm the same one-shot resume hook the drill quota-pause uses:
         payment-success prefers it over the default refresh, and router.showView invalidates it on any real
         navigation (dismissing the paywall and going elsewhere falls back to the normal flow). The re-shown route
         re-runs the entitlement gate — now premium — and renders the full chapter. */
      window.__qrResumeAfterUpgrade = function () {
        window.__qrResumeAfterUpgrade = null;
        if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn', { path: topic.id });
      };
      if (typeof requirePremium === 'function') requirePremium('learn_premium');
      else if (typeof showPaywall === 'function') showPaywall('learn_premium');
    });
  }

  /* ADR-109 (cert fix CERT-5): keep the (build-once) hub's lock badges in sync with the LIVE entitlement in BOTH
     directions, without a full rebuild — badges clear after an in-session upgrade AND appear after a mid-session
     lapse (getAccessState self-heals expired premium in-memory, so a lapse CAN flip mid-session; the render gate
     already re-locks content, this keeps the affordance honest too). */
  function _syncPremiumLocks() {
    var cards = document.querySelectorAll('#learnCategories .kx-topic-card[data-topic]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var locked = _isTopicLockedForUser(card.getAttribute('data-topic'));
      var badge = card.querySelector('.kx-status-premium');
      if (!locked && (badge || card.classList.contains('is-premium'))) {
        card.classList.remove('is-premium');
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
      } else if (locked && !badge) {
        card.classList.add('is-premium');
        var row = card.querySelector('.kx-tc-badges');
        if (row) {
          var b = document.createElement('span');
          b.className = 'kx-badge kx-status-premium';
          b.innerHTML = ((typeof qrIco === 'function') ? qrIco('lock', '🔒') : '🔒') + ' ' + QRI18n.t('learn.badgePremium');
          row.appendChild(b);
        }
      }
    }
  }

  function renderLearnRoute(params) {
    if (!_hubBuilt) { _buildHub(); _hubBuilt = true; }
    var hub = document.getElementById('learnHub');
    var topicEl = document.getElementById('learnTopic');
    var qrEl = document.getElementById('learnQuickRef');
    var revEl = document.getElementById('learnRevise');
    var KB = _KB();
    var path = params && params.path;

    if (path === 'quick-ref' && qrEl && typeof QuickRef !== 'undefined') {
      /* Quick-Reference revision library sub-view (ADR-084) — hub/topic hidden, library shown. */
      _leaveHub(hub);
      if (hub) hub.hidden = true;
      if (topicEl) { topicEl.hidden = true; topicEl.innerHTML = ''; }
      if (revEl) { revEl.hidden = true; revEl.innerHTML = ''; }
      QuickRef.render(qrEl);
      qrEl.hidden = false;
      _scrollTop();
      var qh = qrEl.querySelector('.kx-hub-head');
      if (qh && qh.focus) { try { qh.setAttribute('tabindex', '-1'); qh.focus({ preventScroll: true }); } catch (_) {} }
      return;
    }
    if (qrEl) qrEl.hidden = true;

    if (path === 'revise' && revEl && typeof ReviseFlow !== 'undefined') {
      /* Guided Revision flow (ADR-092) — a fresh pass over whatever is currently due. The search bar hides for
         the duration: a recall session is a focused mode, not a browsing surface. */
      _leaveHub(hub);
      if (hub) hub.hidden = true;
      if (topicEl) { topicEl.hidden = true; topicEl.innerHTML = ''; }
      var sc = document.querySelector('#view-learn .learn-search-container'); if (sc) sc.hidden = true;
      ReviseFlow.render(revEl);
      revEl.hidden = false;
      _scrollTop();
      return;
    }
    if (revEl) { revEl.hidden = true; revEl.innerHTML = ''; }
    var sc2 = document.querySelector('#view-learn .learn-search-container'); if (sc2) sc2.hidden = false;

    if (path && KB && KB.has(path)) {
      /* remember where the hub was scrolled to, so Back restores the reading position instead of jumping to top */
      _leaveHub(hub);
      if (hub) hub.hidden = true;
      var _topic = KB.get(path);
      /* ADR-109 Premium gate — the SINGLE topic-render chokepoint. A gated topic the user hasn't unlocked renders the
         locked page instead of the chapter, so URL/deep-link/history/back all funnel through the same enforcement.
         Fail-closed: hasPremiumAccess absent ⇒ locked. */
      if (_isTopicLockedForUser(path, _topic && _topic.category)) {
        _buildLockedTopicPage(_topic);
      } else {
        _buildTopicPage(_topic);
      }
      if (topicEl) {
        topicEl.hidden = false;
        /* WCAG 3.1.2: topic content follows the STUDY language (merged KB view) — mark it for screen readers. */
        try { topicEl.setAttribute('lang', ((typeof QRI18n !== 'undefined' && QRI18n.studyLang) ? QRI18n.studyLang() : 'en')); } catch (_) {}
      }
      _scrollTop();
      /* a11y: move focus to the new topic heading so keyboard/SR users land on the content (no scroll jump for mouse) */
      var th = document.querySelector('#learnTopic .kx-th-title');
      if (th && th.focus) { try { th.focus({ preventScroll: true }); } catch (_) { th.focus(); } }
    } else {
      /* An unknown/stale topic id (e.g. a shared link to a removed topic) falls back to the hub — canonicalize the
         address bar from #learn/<bad-id> to #learn so a refresh/re-share doesn't keep the dead path. */
      if (path && typeof location !== 'undefined' && location.hash !== '#learn' && window.history && window.history.replaceState) {
        try { window.history.replaceState(null, '', '#learn'); } catch (_) {}
      }
      if (_io) { try { _io.disconnect(); } catch (_) {} _io = null; }
      if (topicEl) { topicEl.hidden = true; topicEl.innerHTML = ''; }
      if (hub) hub.hidden = false;
      _renderUpNext();      // the recommended-next pick reflects fresh completions (ADR-092)
      _renderReviseCard();  // due count changes as topics are viewed/revised
      _renderResume();      // refresh Continue / Needs-practice / Saved strips
      _refreshCardTicks();  // keep completion ticks live on the category cards
      _syncPremiumLocks();  // ADR-109: badges track live entitlement both ways (upgrade clears, lapse adds)
      /* restore the hub scroll position (set when we left for a topic) now that the hub layout is settled */
      var hc2 = document.querySelector('.container'); if (hc2) hc2.scrollTop = _hubScroll;
      /* a11y: return focus to the Learn heading so keyboard/SR users aren't stranded on the torn-down topic */
      var lh = document.getElementById('learnHeading');
      if (lh && lh.focus) { try { lh.focus({ preventScroll: true }); } catch (_) { lh.focus(); } }
    }
  }

  return { renderLearnRoute: renderLearnRoute, invalidateHub: function () { _hubBuilt = false; } };
})();

/* Global entry point: app.js calls renderLearnRoute(params) on every Learn show (builds the hub once internally). */
function renderLearnRoute(params) { LearnView.renderLearnRoute(params); }

/* ADR-111: the Learn hub is built once (_hubBuilt) — a language switch must force a rebuild so the
   next visit renders localized. */
if (typeof QRI18n !== 'undefined' && QRI18n.onChange) QRI18n.onChange(function () {
  try { if (typeof LearnView !== 'undefined' && LearnView.invalidateHub) LearnView.invalidateHub(); } catch (_) { /* ignore */ }
});
