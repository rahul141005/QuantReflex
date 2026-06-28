/**
 * learn-view.js — Learn controller (ADR-069, Phase 2): hub ↔ deep-linkable topic pages.
 *
 * Render-on-route: Router.onShow('learn', params) → renderLearnRoute(params). No path → the HUB (knowledge
 * categories + preserved Quick-Reference tables + bookmarks + custom topics). A path (#learn/<topicId>) → a TOPIC
 * PAGE built from the knowledge object (breadcrumb, sticky section nav, typed blocks via BlockRenderers, related,
 * prev/next). In-Learn navigation goes through Router.showView('learn', {path}) so browser back/forward + shareable
 * URLs work. Reuses tables.js (the loved tables), learn-manager (bookmarks/custom topics), and LearnSearch. No AI.
 */

/* ---- Collapsible section toggle (shared: Quick-Reference tables here + home-view) ---- */
function toggleSection(header) {
  var content = header.nextElementSibling;
  var icon = header.querySelector('.collapse-icon');
  if (content.style.display === 'none' || !content.style.display) {
    content.style.display = 'block';
    if (icon) icon.textContent = '▲';
  } else {
    content.style.display = 'none';
    if (icon) icon.textContent = '▼';
  }
}

var LearnView = (function () {
  'use strict';

  var _hubBuilt = false;
  var _searchTimer = null;
  var _io = null;   // IntersectionObserver for sticky section-nav highlighting (torn down between topics)

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
  var FREQ_LABEL = { 'very-high': 'Very High', high: 'High', medium: 'Medium', low: 'Low' };
  function _diffBadge(d) { return '<span class="kx-badge kx-diff-' + _esc(d) + '">' + _esc(DIFF_LABEL[d] || d) + '</span>'; }
  function _freqBadge(f) { return '<span class="kx-badge kx-freq">' + _esc(FREQ_LABEL[f] || f) + '</span>'; }

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
    btn.innerHTML = on ? '📖 Full notes' : '⚡ Quick revision';
    /* hidden sections can't intersect, so clear any now-stale scroll-spy highlight (re-applies on next scroll) */
    host.querySelectorAll('.kx-sec-pill.is-active').forEach(function (p) { p.classList.remove('is-active'); });
  }

  /* ───────────────────────── hub ───────────────────────── */

  function _buildHub() {
    /* Quick-Reference interactive aids (preserved exactly — tables.js + grids). */
    var tableSelector = document.getElementById('tableSelector');
    var tableDisplay = document.getElementById('tableDisplay');
    if (tableSelector && tableDisplay && typeof renderTableSelector === 'function') renderTableSelector(tableSelector, tableDisplay, 30);

    var sqGrid = document.getElementById('squaresGrid');
    if (sqGrid && !sqGrid.childNodes.length) {
      for (var n = 1; n <= 30; n++) {
        var s = document.createElement('div'); s.className = 'math-grid-item';
        s.innerHTML = '<span class="math-expr">' + padTableNum(n, 2) + '²</span><span class="math-eq">=</span><span class="math-val">' + padTableNum(n * n, 3) + '</span>';
        sqGrid.appendChild(s);
      }
    }
    var cuGrid = document.getElementById('cubesGrid');
    if (cuGrid && !cuGrid.childNodes.length) {
      for (var m = 1; m <= 20; m++) {
        var c = document.createElement('div'); c.className = 'math-grid-item';
        c.innerHTML = '<span class="math-expr">' + padTableNum(m, 2) + '³</span><span class="math-eq">=</span><span class="math-val">' + padTableNum(m * m * m, 4) + '</span>';
        cuGrid.appendChild(c);
      }
    }

    _renderCategories();
    if (typeof renderBookmarksSection === 'function') renderBookmarksSection();
    if (typeof renderCustomTopicSections === 'function') renderCustomTopicSections();

    var addTopicBtn = document.getElementById('addTopicBtn');
    if (addTopicBtn) {
      addTopicBtn.addEventListener('click', function () {
        if (typeof canAccessFeature === 'function' && !canAccessFeature('add_topic')) { if (typeof showPaywall === 'function') showPaywall('add_topic'); return; }
        _createModal('Create New Topic', [{ name: 'name', label: 'Topic Name', placeholder: 'e.g. Number Systems' }], function (values) {
          if (!values.name) return;
          addCustomTopic(values.name);
          renderCustomTopicSections();
        });
      });
    }

    _wireSearch();
  }

  function _topicCardHtml(t) {
    return '<button class="kx-topic-card' + (t.status === 'scaffold' ? ' is-scaffold' : '') + '" type="button" data-topic="' + _esc(t.id) + '">' +
      '<div class="kx-tc-top"><span class="kx-tc-ico">' + _esc(t.icon || '📘') + '</span><span class="kx-tc-title">' + _esc(t.title) + '</span></div>' +
      '<div class="kx-tc-badges">' + _diffBadge(t.difficulty) + _freqBadge(t.examFrequency) +
      (t.status === 'scaffold' ? '<span class="kx-badge kx-status-scaffold">soon</span>' : '') + '</div>' +
      '</button>';
  }

  function _renderCategories() {
    var host = document.getElementById('learnCategories'); if (!host) return;
    var KB = _KB(); if (!KB) { host.innerHTML = ''; return; }
    host.innerHTML = KB.categories().map(function (c) {
      var topics = KB.byCategory(c.id);
      return '<div class="kx-cat">' +
        '<div class="kx-cat-head"><h2 class="kx-cat-title">' + _esc(c.icon) + ' ' + _esc(c.title) + '</h2>' +
        '<span class="kx-cat-count">' + topics.length + (topics.length === 1 ? ' topic' : ' topics') + '</span></div>' +
        (c.blurb ? '<p class="kx-cat-blurb">' + _esc(c.blurb) + '</p>' : '') +
        '<div class="kx-topic-grid">' + topics.map(_topicCardHtml).join('') + '</div></div>';
    }).join('');
    host.querySelectorAll('.kx-topic-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-topic');
        var KB = _KB(); var t = KB && KB.get(id);
        /* A scaffold ("coming soon") topic has no content yet — don't strand the user on a near-empty page;
           give clear feedback and stay on the hub. Direct deep links still render a graceful coming-soon page. */
        if (t && t.status === 'scaffold') {
          if (typeof showToast === 'function') showToast('“' + t.title + '” is coming soon — full notes are on the way.');
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

  function _runSearch(q) {
    var box = document.getElementById('learnSearchResults'); if (!box) return;
    q = (q || '').trim();
    if (!q || typeof LearnSearch === 'undefined') { box.hidden = true; box.innerHTML = ''; return; }
    var res = LearnSearch.query(q).slice(0, 8);
    box.hidden = false;
    if (!res.length) { box.innerHTML = '<div class="kx-search-empty">No topics match “' + _esc(q) + '”.</div>'; return; }
    box.innerHTML = res.map(function (r) {
      return '<a class="kx-search-item" href="#learn/' + encodeURIComponent(r.id) + '" data-topic="' + _esc(r.id) + '">' +
        '<span class="kx-search-ico">' + _esc(r.icon || '📘') + '</span>' +
        '<span class="kx-search-title">' + _esc(r.title) + '</span>' +
        '<span class="kx-search-cat">' + _esc(r.category) + '</span></a>';
    }).join('');
    box.querySelectorAll('.kx-search-item').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); _go(a.getAttribute('data-topic')); });
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

    /* breadcrumb */
    var crumbs = document.createElement('div'); crumbs.className = 'kx-crumbs';
    crumbs.innerHTML = '<button class="kx-crumb" data-go="">Learn</button>' +
      '<span class="kx-crumb-sep">›</span><button class="kx-crumb" data-go="">' + _esc(cat.title) + '</button>' +
      '<span class="kx-crumb-sep">›</span><span class="kx-crumb-cur">' + _esc(topic.title) + '</span>';
    host.appendChild(crumbs);

    /* header + badges */
    var header = document.createElement('div'); header.className = 'kx-topic-header';
    header.innerHTML = '<span class="kx-th-ico">' + _esc(topic.icon || '📘') + '</span><h1 class="kx-th-title">' + _esc(topic.title) + '</h1>';
    host.appendChild(header);
    var badges = document.createElement('div'); badges.className = 'kx-th-badges';
    badges.innerHTML = _diffBadge(topic.difficulty) + _freqBadge(topic.examFrequency) +
      (topic.status === 'scaffold' ? '<span class="kx-badge kx-status-scaffold">Coming soon</span>' : '');
    host.appendChild(badges);

    /* Record the visit (powers Continue / Due-for-revision) and surface the action bar — published topics only. */
    if (topic.status !== 'scaffold') {
      var LP = _LP(); if (LP) LP.markViewed(topic.id);
      var bar = _buildActionBar(topic);
      if (bar) host.appendChild(bar);
    }

    var sections = (topic.sections || []).filter(function (b) { return b && b.type !== 'related'; });
    var labels = (typeof BlockRenderers !== 'undefined') ? BlockRenderers.SECTION_LABELS : {};

    /* sticky section nav (only when there is content to navigate) */
    if (sections.length > 1) {
      var nav = document.createElement('div'); nav.className = 'kx-section-nav';
      sections.forEach(function (b, i) {
        var pill = document.createElement('button');
        pill.className = 'kx-sec-pill' + (_isRevisionType(b.type) ? ' is-revision' : '');
        pill.type = 'button'; pill.setAttribute('data-sec', 'kx-sec-' + i);
        pill.textContent = (labels[b.type] || b.type);
        pill.addEventListener('click', function () {
          var el = document.getElementById('kx-sec-' + i);
          if (el) el.scrollIntoView({ behavior: _scrollBehavior(), block: 'start' });
        });
        nav.appendChild(pill);
      });
      host.appendChild(nav);
    }

    /* body: main reading column + aside (related / prev-next / back) */
    var body = document.createElement('div'); body.className = 'kx-topic-body';
    var main = document.createElement('div'); main.className = 'kx-topic-main';

    if (!sections.length) {
      var soon = document.createElement('p'); soon.className = 'kx-overview';
      soon.textContent = 'This topic is coming soon — full notes, tricks and examples are on the way.';
      main.appendChild(soon);
    }
    sections.forEach(function (b, i) {
      var sec = document.createElement('div'); sec.className = 'kx-section' + (_isRevisionType(b.type) ? ' is-revision' : ''); sec.id = 'kx-sec-' + i;
      var lbl = document.createElement('div'); lbl.className = 'kx-section-label'; lbl.textContent = (labels[b.type] || b.type);
      sec.appendChild(lbl);
      var node = (typeof BlockRenderers !== 'undefined') ? BlockRenderers.render(b) : null;
      if (node) sec.appendChild(node);
      main.appendChild(sec);
    });
    body.appendChild(main);

    var aside = document.createElement('div'); aside.className = 'kx-aside';
    var related = KB ? KB.related(topic.id) : [];
    if (related.length) {
      var rb = document.createElement('div'); rb.className = 'kx-aside-block';
      rb.innerHTML = '<div class="kx-aside-title">Related topics</div>';
      var chips = document.createElement('div'); chips.className = 'kx-related';
      related.forEach(function (rt) {
        var a = document.createElement('a'); a.className = 'kx-chip'; a.textContent = rt.title;
        a.setAttribute('href', '#learn/' + encodeURIComponent(rt.id)); a.setAttribute('data-topic', rt.id);
        a.addEventListener('click', function (e) { e.preventDefault(); _go(rt.id); });
        chips.appendChild(a);
      });
      rb.appendChild(chips); aside.appendChild(rb);
    }
    var sib = KB ? KB.siblings(topic.id) : { prev: null, next: null };
    if (sib.prev || sib.next) {
      var pn = document.createElement('div'); pn.className = 'kx-aside-block';
      pn.innerHTML = '<div class="kx-aside-title">More in ' + _esc(cat.title) + '</div>';
      var row = document.createElement('div'); row.className = 'kx-prevnext';
      [['Prev', sib.prev], ['Next', sib.next]].forEach(function (pair) {
        if (!pair[1]) return;
        var btn = document.createElement('button'); btn.className = 'kx-pn'; btn.type = 'button';
        btn.innerHTML = '<div class="kx-pn-dir">' + pair[0] + '</div><div class="kx-pn-title">' + _esc(pair[1].title) + '</div>';
        btn.addEventListener('click', (function (id) { return function () { _go(id); }; })(pair[1].id));
        row.appendChild(btn);
      });
      pn.appendChild(row); aside.appendChild(pn);
    }
    var backBlock = document.createElement('div'); backBlock.className = 'kx-aside-block';
    var back = document.createElement('button'); back.className = 'kx-back'; back.type = 'button';
    back.innerHTML = '← Back to all topics';
    back.addEventListener('click', function () { _go(null); });
    backBlock.appendChild(back); aside.appendChild(backBlock);
    body.appendChild(aside);

    host.appendChild(body);

    crumbs.querySelectorAll('.kx-crumb').forEach(function (b) { b.addEventListener('click', function () { _go(null); }); });

    _setupSectionSpy(sections.length);
  }

  /* Highlight the section-nav pill for the section currently in view (premium polish; degrades gracefully). */
  function _setupSectionSpy(count) {
    if (count < 2 || typeof IntersectionObserver === 'undefined') return;
    var nav = document.querySelector('#learnTopic .kx-section-nav'); if (!nav) return;
    _io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var pills = nav.querySelectorAll('.kx-sec-pill');
        for (var i = 0; i < pills.length; i++) pills[i].classList.toggle('is-active', pills[i].getAttribute('data-sec') === en.target.id);
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
      pb.innerHTML = '🎯 Practise this';
      pb.addEventListener('click', function () { _launchDrill(topic); });
      bar.appendChild(pb);
    }
    if (_hasRevisionContent(topic)) {
      var qb = document.createElement('button'); qb.className = 'kx-action kx-action-revise'; qb.type = 'button';
      qb.setAttribute('aria-pressed', 'false'); qb.innerHTML = '⚡ Quick revision';
      qb.addEventListener('click', function () { _toggleRevision(qb); });
      bar.appendChild(qb);
    }
    if (LP) {
      var done = LP.isComplete(topic.id);
      var cb = document.createElement('button'); cb.className = 'kx-action kx-action-complete' + (done ? ' is-on' : ''); cb.type = 'button';
      cb.setAttribute('aria-pressed', done ? 'true' : 'false'); cb.innerHTML = done ? '✓ Completed' : '○ Mark complete';
      cb.addEventListener('click', function () {
        var nowDone = LP.toggleComplete(topic.id);
        cb.classList.toggle('is-on', nowDone); cb.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
        cb.innerHTML = nowDone ? '✓ Completed' : '○ Mark complete';
        if (typeof showToast === 'function') showToast(nowDone ? 'Marked “' + topic.title + '” complete' : 'Marked as not complete.');
      });
      bar.appendChild(cb);

      var saved = LP.isBookmarked(topic.id);
      var bb = document.createElement('button'); bb.className = 'kx-action kx-action-save' + (saved ? ' is-on' : ''); bb.type = 'button';
      bb.setAttribute('aria-pressed', saved ? 'true' : 'false'); bb.innerHTML = saved ? '★ Saved' : '☆ Save';
      bb.addEventListener('click', function () {
        var nowSaved = LP.toggleBookmark(topic.id);
        bb.classList.toggle('is-on', nowSaved); bb.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
        bb.innerHTML = nowSaved ? '★ Saved' : '☆ Save';
      });
      bar.appendChild(bb);
    }
    return bar;
  }

  /* ───────────────────────── hub resume strips (Continue + Due for revision) ───────────────────────── */

  function _stripHtml(title, ids, KB) {
    var LP = _LP();
    var cards = ids.map(function (id) {
      var t = KB.get(id); if (!t) return '';
      var done = LP && LP.isComplete(id);
      return '<button class="kx-resume-card" type="button" data-topic="' + _esc(id) + '">' +
        '<span class="kx-rc-ico">' + _esc(t.icon || '📘') + '</span>' +
        '<span class="kx-rc-title">' + _esc(t.title) + '</span>' +
        (done ? '<span class="kx-rc-done" aria-label="completed">✓</span>' : '') + '</button>';
    }).join('');
    return '<div class="kx-resume"><div class="kx-resume-head">' + _esc(title) + '</div><div class="kx-resume-row">' + cards + '</div></div>';
  }

  function _renderResume() {
    var host = document.getElementById('learnResume'); if (!host) return;
    var LP = _LP(); var KB = _KB();
    if (!LP || !KB) { host.innerHTML = ''; return; }
    var html = '';

    var dueInput = KB.all().map(function (t) { return { id: t.id, revisionIntervalDays: t.revisionIntervalDays }; });
    var due = LP.due(dueInput).filter(function (id) { return KB.has(id); }).slice(0, 8);
    if (due.length) html += _stripHtml('🔁 Due for revision', due, KB);

    var recent = LP.recent(8).filter(function (id) { return KB.has(id); });
    if (recent.length) html += _stripHtml('⏱️ Continue learning', recent, KB);

    host.innerHTML = html;
    host.querySelectorAll('.kx-resume-card').forEach(function (c) {
      c.addEventListener('click', function () { _go(c.getAttribute('data-topic')); });
    });
  }

  /* Reflect completion on the category topic cards (the grid is built once; ticks stay live). */
  function _refreshCardTicks() {
    var LP = _LP(); if (!LP) return;
    var cards = document.querySelectorAll('#learnCategories .kx-topic-card');
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('is-complete', LP.isComplete(cards[i].getAttribute('data-topic')));
  }

  /* ───────────────────────── route dispatch ───────────────────────── */

  function renderLearnRoute(params) {
    if (!_hubBuilt) { _buildHub(); _hubBuilt = true; }
    var hub = document.getElementById('learnHub');
    var topicEl = document.getElementById('learnTopic');
    var KB = _KB();
    var path = params && params.path;

    if (path && KB && KB.has(path)) {
      var input = document.getElementById('learnSearch'); if (input) input.value = '';
      var box = document.getElementById('learnSearchResults'); if (box) { box.hidden = true; box.innerHTML = ''; }
      if (hub) hub.hidden = true;
      _buildTopicPage(KB.get(path));
      if (topicEl) topicEl.hidden = false;
      _scrollTop();
    } else {
      if (_io) { try { _io.disconnect(); } catch (_) {} _io = null; }
      if (topicEl) { topicEl.hidden = true; topicEl.innerHTML = ''; }
      if (hub) hub.hidden = false;
      _renderResume();      // refresh Continue / Due strips with any topics viewed this session
      _refreshCardTicks();  // keep completion ticks live on the category cards
    }
  }

  return { renderLearnRoute: renderLearnRoute };
})();

/* Global entry point: app.js calls renderLearnRoute(params) on every Learn show (builds the hub once internally). */
function renderLearnRoute(params) { LearnView.renderLearnRoute(params); }
