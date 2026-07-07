/**
 * learn/revise-flow.js — the Guided Revision flow (ADR-092): #learn/revise.
 *
 * Turns spaced revision from "reopen the chapter and re-read" into an intentional recall session: every topic that
 * is due (LearnProgress.due, oldest-first) is presented one at a time as its condensed revision projection — ONLY
 * the formula / trick / trap / revision blocks, the exact material the per-topic "⚡ Quick revision" toggle shows —
 * with a progress bar and a "Revised ✓" action that re-arms the topic's spaced interval (markViewed resets
 * viewedAt, which is precisely what clears due-ness). No new storage, no new content format, no flashcard engine:
 * the flow is a SEQUENCER over machinery that already exists (LearnProgress + KnowledgeSchema + BlockRenderers).
 * Every render() starts a fresh pass over what is still due, so leaving mid-flow loses nothing.
 * buildQueue is pure and dual-exported for the node check.
 */
var ReviseFlow = (function () {
  'use strict';

  var CAP = 10;        // a long backlog stays one sitting, not a wall — the rest is simply still due tomorrow
  var _queue = [];
  var _pos = 0;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function _KB() { return (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null; }
  function _LP() { return (typeof LearnProgress !== 'undefined') ? LearnProgress : null; }
  function _revisionTypes() {
    return (typeof KnowledgeSchema !== 'undefined' && KnowledgeSchema.REVISION_BLOCK_TYPES) || ['formula', 'trick', 'trap', 'revision'];
  }
  function _goHub() { try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn'); } catch (_) {} }
  function _goTopic(id) { try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn', { path: id }); } catch (_) {} }
  function _scrollTop() { var c = document.querySelector('.container'); if (c) c.scrollTop = 0; }

  /** PURE: due ids (already oldest-first from LearnProgress.due) → this pass's queue. */
  function buildQueue(dueIds, cap) {
    return (dueIds || []).slice(0, cap || CAP);
  }

  /* ADR-109 cert fix (CERT-1): a Premium topic the CURRENT user can't access must never surface its condensed
     revision content here — this flow is the ONE topic-content renderer outside the renderLearnRoute gate. A
     lapsed-premium user's progress map can contain gated ids (viewed while subscribed; progress persists in
     localStorage + Firestore), so those ids would otherwise age into the due queue and leak their cheat-sheet
     blocks. Fail-closed like learn-view's _isTopicLockedForUser: hasPremiumAccess unavailable ⇒ treat as locked. */
  function _lockedForUser(id) {
    if (typeof LearnEntitlements === 'undefined' || !LearnEntitlements.isPremiumLearnTopic(id)) return false;
    return !((typeof hasPremiumAccess === 'function') && hasPremiumAccess());
  }

  function _dueNow() {
    var LP = _LP(), KB = _KB();
    if (!LP || !KB) return [];
    var input = KB.all().map(function (t) { return { id: t.id, revisionIntervalDays: t.revisionIntervalDays }; });
    return LP.due(input).filter(function (id) { return KB.has(id) && !_lockedForUser(id); });
  }

  /* ---- screens ---- */

  function _caughtUpHtml() {
    return '<div class="kx-rev-done">' +
      '<div class="kx-rev-done-ico" aria-hidden="true">✓</div>' +
      '<h2 class="kx-rev-done-title" tabindex="-1">All caught up</h2>' +
      '<p class="kx-rev-done-sub">Nothing is due right now. Topics return here as they age — that spacing is what makes recall stick.</p>' +
      '<button class="btn-primary kx-rev-home" type="button">Back to Learn</button></div>';
  }

  function _doneHtml(n) {
    return '<div class="kx-rev-done">' +
      '<div class="kx-rev-done-ico" aria-hidden="true">🔁</div>' +
      '<h2 class="kx-rev-done-title" tabindex="-1">Revision done</h2>' +
      '<p class="kx-rev-done-sub">' + n + (n === 1 ? ' topic' : ' topics') + ' refreshed. Each one comes back as it ages — steady spacing beats cramming.</p>' +
      '<button class="btn-primary kx-rev-home" type="button">Done</button></div>';
  }

  function _screen(host) {
    var KB = _KB();
    if (_pos >= _queue.length) {
      host.innerHTML = _doneHtml(_queue.length);
      _wireEnd(host);
      return;
    }
    var topic = KB.get(_queue[_pos]);
    if (!topic) { _pos++; _screen(host); return; }   // topic removed since queueing — skip, never strand
    if (_lockedForUser(topic.id)) { _pos++; _screen(host); return; }   // ADR-109: lapsed mid-flow — skip, never leak

    var types = _revisionTypes();
    var secs = (topic.sections || []).filter(function (b) { return b && types.indexOf(b.type) !== -1; });
    var pct = Math.round((_pos / _queue.length) * 100);
    var last = _pos === _queue.length - 1;

    host.innerHTML =
      '<div class="kx-rev-top">' +
      '<button class="kx-rev-exit" type="button" aria-label="Exit revision">✕</button>' +
      '<span class="kx-rev-count" tabindex="-1">Revising · ' + (_pos + 1) + ' of ' + _queue.length + '</span>' +
      '</div>' +
      '<div class="kx-rev-bar" aria-hidden="true"><div class="kx-rev-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="kx-rev-head"><span class="kx-rev-ico" aria-hidden="true">' + _esc(topic.icon || '📘') + '</span>' +
      '<h2 class="kx-rev-title">' + _esc(topic.title) + '</h2></div>' +
      '<div class="kx-rev-body"></div>' +
      '<div class="kx-rev-actions">' +
      '<button class="kx-rev-full" type="button">Read full chapter →</button>' +
      '<button class="btn-primary kx-rev-next" type="button">' + (last ? 'Revised ✓ · Finish' : 'Revised ✓ · Next') + '</button>' +
      '</div>';

    /* the same typed-block renderers the topic page uses — identical styling, dark-mode, tables */
    var body = host.querySelector('.kx-rev-body');
    secs.forEach(function (b) {
      var sec = document.createElement('div'); sec.className = 'kx-section is-revision';
      var node = (typeof BlockRenderers !== 'undefined') ? BlockRenderers.render(b) : null;
      if (node) sec.appendChild(node);
      body.appendChild(sec);
    });
    if (!secs.length) {
      var p = document.createElement('p'); p.className = 'kx-rev-done-sub';
      p.textContent = 'This chapter has no condensed notes yet — open it in full to revise.';
      body.appendChild(p);
    }

    host.querySelector('.kx-rev-exit').addEventListener('click', _goHub);
    host.querySelector('.kx-rev-full').addEventListener('click', function () { _goTopic(topic.id); });
    host.querySelector('.kx-rev-next').addEventListener('click', function () {
      var LP = _LP(); if (LP) LP.markViewed(topic.id);   // re-arms the spaced interval; clears due-ness
      _pos++;
      _screen(host);
      _scrollTop();
      var c = host.querySelector('.kx-rev-count') || host.querySelector('.kx-rev-done-title');
      if (c && c.focus) { try { c.focus({ preventScroll: true }); } catch (_) {} }
    });

    var cnt = host.querySelector('.kx-rev-count');
    if (cnt && cnt.focus) { try { cnt.focus({ preventScroll: true }); } catch (_) {} }
  }

  function _wireEnd(host) {
    var b = host.querySelector('.kx-rev-home');
    if (b) b.addEventListener('click', _goHub);
    var t = host.querySelector('.kx-rev-done-title');
    if (t && t.focus) { try { t.focus({ preventScroll: true }); } catch (_) {} }
  }

  /** Entry point — renderLearnRoute calls this on #learn/revise. Each call starts a fresh pass over what's due. */
  function render(host) {
    if (!host) host = document.getElementById('learnRevise');
    if (!host) return;
    var due = _dueNow();
    if (!due.length) {
      host.innerHTML = _caughtUpHtml();
      _wireEnd(host);
      return;
    }
    _queue = buildQueue(due, CAP);
    _pos = 0;
    _screen(host);
  }

  var API = { render: render, buildQueue: buildQueue };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.ReviseFlow = API;
  return API;
})();
