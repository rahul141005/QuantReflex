/**
 * quick-ref-renderer.js — renders the curated Quick-Reference library (ADR-084 Batch 3).
 *
 * Turns QR_QUICKREF data into the Learn sub-view at #learn/quick-ref: collapsible sections (reusing the global
 * toggleSection() + .collapsible-card pattern), an instant search, and per-card Learn/Practice cross-links. Tables
 * render through the shared BlockRenderers.table (identical .math-table markup + dark-mode); grids reuse .math-grid.
 * Expand state is remembered per session (localStorage), matching the category picker.
 *
 * Public: QuickRef.render(host) builds once into `host`; QuickRef.filter(query) filters live.
 */
var QuickRef = (function () {
  'use strict';

  var OPEN_KEY = 'qr_quickref_open';
  var _built = false;

  function _data() { return (typeof QR_QUICKREF !== 'undefined') ? QR_QUICKREF : (typeof window !== 'undefined' ? window.QR_QUICKREF : null); }
  function _KB() { return (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null; }
  /* Card CONTENT localizes to the STUDY language via the overlay resolver (title / block, keyed by immutable id). */
  function _resolve(card) {
    var i18n = (typeof QRQuickRefI18n !== 'undefined') ? QRQuickRefI18n : (typeof window !== 'undefined' ? window.QRQuickRefI18n : null);
    return (i18n && i18n.resolve) ? i18n.resolve(card) : card;
  }
  /* Library CHROME (section titles, heading, links) follows the APP language via t() — a diverged app=en/study=hi page
     shows Devanagari card content under English chrome. Guarded; flag-off returns the English catalog value byte-for-byte. */
  function _t(key, fallback) {
    try { if (typeof QRI18n !== 'undefined' && QRI18n.t) { var v = QRI18n.t('learn.' + key); if (v && v !== 'learn.' + key) return v; } } catch (_) {}
    return fallback;
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }

  function _openState() { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function _setOpen(sec, on) { try { var s = _openState(); s[sec] = !!on; localStorage.setItem(OPEN_KEY, JSON.stringify(s)); } catch (_) {} }

  /* Render one card's data block into a DOM node (table via the shared renderer; grid mirrors the hub squares/cubes). */
  function _blockNode(block) {
    if (!block) return document.createElement('div');
    if (block.kind === 'grid') {
      var g = document.createElement('div');
      g.className = 'math-grid qr-grid';
      (block.items || []).forEach(function (it) {
        var cell = document.createElement('div'); cell.className = 'math-grid-item';
        cell.innerHTML = '<span class="math-expr">' + _esc(it.e) + '</span><span class="math-eq">=</span><span class="math-val">' + _esc(it.v) + '</span>';
        g.appendChild(cell);
      });
      return g;
    }
    /* default: table via BlockRenderers so styling + dark-mode + phone horizontal-scroll come for free */
    if (typeof BlockRenderers !== 'undefined' && BlockRenderers.render) {
      return BlockRenderers.render({ type: 'table', caption: block.caption, headers: block.headers, rows: block.rows });
    }
    var fallback = document.createElement('div'); fallback.textContent = '(table)'; return fallback;
  }

  function _cardNode(rawCard) {
    var KB = _KB();
    var card = _resolve(rawCard);   // study-language merged view (EN base + hi/mr overlay); id/section/links unchanged
    var wrap = document.createElement('div');
    wrap.className = 'qref-card';
    wrap.setAttribute('data-card', card.id);
    /* BILINGUAL search: index the translated title + the EN title + the (union) searchTerms, so a query in either script hits. */
    var terms = [card.title, rawCard.title].concat(card.searchTerms || []).join(' ').toLowerCase();
    wrap.setAttribute('data-terms', terms);

    var head = document.createElement('div');
    head.className = 'qref-card-head';
    head.innerHTML = '<span class="qref-card-ico">' + _esc(card.icon || '📎') + '</span><span class="qref-card-title">' + _esc(card.title) + '</span>';
    wrap.appendChild(head);

    wrap.appendChild(_blockNode(card.block));

    /* cross-links — only shown when the target genuinely exists (Learn topic in the registry / Quant drill category) */
    var links = document.createElement('div');
    links.className = 'qref-card-links';
    if (card.learn && KB && KB.has(card.learn)) {
      var lb = document.createElement('button');
      lb.type = 'button'; lb.className = 'qr-link qr-link-learn'; lb.textContent = _t('qrLinkLearn', '📖 Learn');
      lb.addEventListener('click', function () { try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn', { path: card.learn }); } catch (_) {} });
      links.appendChild(lb);
    }
    if (card.drill) {
      var pb = document.createElement('button');
      pb.type = 'button'; pb.className = 'qr-link qr-link-practice'; pb.textContent = _t('qrLinkPractice', '✏️ Practice');
      pb.addEventListener('click', function () { _launchDrill(card.drill, card.title); });
      links.appendChild(pb);
    }
    if (links.childNodes.length) wrap.appendChild(links);
    return wrap;
  }

  function _launchDrill(cat, label) {
    try { if (typeof _tryPracticeAction === 'function' && !_tryPracticeAction()) return; } catch (_) {}
    try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('practice'); } catch (_) {}
    setTimeout(function () { try { if (typeof startDrillFromPractice === 'function') startDrillFromPractice('focus', cat, label); } catch (_) {} }, 60);
  }

  function _sectionNode(sec, cards) {
    var open = _openState()[sec.id];
    var card = document.createElement('div');
    card.className = 'card collapsible-card qr-sec';
    card.setAttribute('data-sec', sec.id);

    var header = document.createElement('div');
    header.className = 'collapsible-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', open ? 'true' : 'false');
    header.innerHTML = '<h3 class="section-title">' + _esc(sec.icon) + ' ' + _esc(_t('qrSec_' + sec.id, sec.title)) +
      ' <span class="qr-sec-count">' + cards.length + '</span></h3><span class="collapse-icon">' + (open ? '▲' : '▼') + '</span>';
    header.addEventListener('click', function () { if (typeof toggleSection === 'function') toggleSection(header); _setOpen(sec.id, header.getAttribute('aria-expanded') === 'true'); });
    card.appendChild(header);

    var content = document.createElement('div');
    content.className = 'collapsible-content';
    content.style.display = open ? 'block' : 'none';
    cards.forEach(function (c) { content.appendChild(_cardNode(c)); });
    card.appendChild(content);
    return card;
  }

  function render(host) {
    if (!host) host = document.getElementById('learnQuickRef');
    if (!host) return;
    var data = _data();
    if (_built || !data) { return; }

    host.innerHTML = '';
    /* WCAG 3.1.2: card content is STUDY-language (overlay-resolved) — mark the host for screen readers. */
    try { host.setAttribute('lang', ((typeof QRI18n !== 'undefined' && QRI18n.studyLang) ? QRI18n.studyLang() : 'en')); } catch (_) {}
    var head = document.createElement('div');
    head.className = 'qr-lib-head';
    head.innerHTML =
      '<button class="qr-lib-back" type="button" aria-label="' + _esc(_t('qrBackAria', 'Back to Learn')) + '">' + _esc(_t('qrBack', '← Learn')) + '</button>' +
      '<h2 class="kx-hub-head">' + _esc(_t('qrLibHeading', '⚡ Quick Reference')) + '</h2>' +
      '<p class="kx-cat-blurb">' + _esc(_t('qrBlurb', 'Every high-value formula, table and standard value — grouped for fast, pre-exam revision.')) + '</p>';
    host.appendChild(head);
    head.querySelector('.qr-lib-back').addEventListener('click', function () { try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn'); } catch (_) {} });

    var searchWrap = document.createElement('div');
    searchWrap.className = 'qr-search-wrap';
    searchWrap.innerHTML = '<input id="quickRefSearch" class="qr-search-input" type="search" inputmode="search" autocomplete="off" placeholder="' + _esc(_t('qrSearchPlaceholder', 'Search formulas, tables, values…')) + '" aria-label="' + _esc(_t('qrSearchAria', 'Search Quick Reference')) + '" />';
    host.appendChild(searchWrap);

    var body = document.createElement('div');
    body.className = 'qr-lib-body';
    data.SECTIONS.forEach(function (sec) {
      var cards = data.CARDS.filter(function (c) { return c.section === sec.id; });
      if (cards.length) body.appendChild(_sectionNode(sec, cards));
    });
    host.appendChild(body);

    var empty = document.createElement('p');
    empty.className = 'qref-empty secondary-text';
    empty.id = 'quickRefEmpty';
    empty.style.display = 'none';
    empty.textContent = _t('qrEmpty', 'No formulas match your search.');
    host.appendChild(empty);

    var input = searchWrap.querySelector('#quickRefSearch');
    if (input) input.addEventListener('input', function () { filter(input.value); });

    _built = true;
  }

  /* Live filter: show only cards whose title/searchTerms match; auto-expand sections with hits, restore on clear. */
  function filter(query) {
    var host = document.getElementById('learnQuickRef');
    if (!host) return;
    var q = String(query || '').trim().toLowerCase();
    var anyGlobal = false;

    host.querySelectorAll('.qr-sec').forEach(function (sec) {
      var content = sec.querySelector('.collapsible-content');
      var header = sec.querySelector('.collapsible-header');
      var icon = sec.querySelector('.collapse-icon');
      var secId = sec.getAttribute('data-sec');
      var anyInSec = false;

      sec.querySelectorAll('.qref-card').forEach(function (cardEl) {
        var match = !q || (cardEl.getAttribute('data-terms') || '').indexOf(q) !== -1;
        cardEl.style.display = match ? '' : 'none';
        if (match) anyInSec = true;
      });

      if (!q) {
        /* restore remembered expand state */
        var open = _openState()[secId];
        sec.style.display = '';
        content.style.display = open ? 'block' : 'none';
        if (icon) icon.textContent = open ? '▲' : '▼';
        if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
      } else {
        sec.style.display = anyInSec ? '' : 'none';
        content.style.display = anyInSec ? 'block' : 'none';   /* auto-expand sections with a hit */
        if (icon) icon.textContent = anyInSec ? '▲' : '▼';
        if (header) header.setAttribute('aria-expanded', anyInSec ? 'true' : 'false');
        if (anyInSec) anyGlobal = true;
      }
    });

    var empty = document.getElementById('quickRefEmpty');
    if (empty) empty.style.display = (q && !anyGlobal) ? 'block' : 'none';
  }

  /* Jump straight to one card (ADR-092 unified search): expand its section, scroll it into view, flash it.
     Safe no-op if the library isn't rendered yet or the id is unknown. */
  function reveal(cardId) {
    var host = document.getElementById('learnQuickRef'); if (!host) return;
    var cardEl = host.querySelector('.qref-card[data-card="' + String(cardId).replace(/"/g, '') + '"]');
    if (!cardEl || !cardEl.closest) return;
    var sec = cardEl.closest('.qr-sec');
    if (sec) {
      var content = sec.querySelector('.collapsible-content');
      var header = sec.querySelector('.collapsible-header');
      var icon = sec.querySelector('.collapse-icon');
      if (content) content.style.display = 'block';
      if (icon) icon.textContent = '▲';
      if (header) header.setAttribute('aria-expanded', 'true');
      _setOpen(sec.getAttribute('data-sec'), true);
    }
    var behavior = 'smooth';
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) behavior = 'auto'; } catch (_) {}
    try { cardEl.scrollIntoView({ behavior: behavior, block: 'start' }); } catch (_) { cardEl.scrollIntoView(); }
    cardEl.classList.add('qref-card-flash');
    setTimeout(function () { cardEl.classList.remove('qref-card-flash'); }, 1600);
  }

  /* ADR-111 stabilization: the library is built once (_built) with language-resolved card content, section chrome
     and the data-terms search index baked in — a language switch must drop the latch so the NEXT visit rebuilds
     localized (render() clears the host before building). Mirrors LearnView.invalidateHub. Guarded for Node. */
  try {
    if (typeof QRI18n !== 'undefined' && QRI18n.onChange) QRI18n.onChange(function () { _built = false; });
  } catch (_) {}

  return { render: render, filter: filter, reveal: reveal };
})();

if (typeof window !== 'undefined') window.QuickRef = QuickRef;
