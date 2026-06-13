/**
 * duel-ui.js — Duel V2 screen renderers (ADR-031). Pure-ish render helpers; DuelManager owns state.
 *
 * Calm, premium dark styling (no gamer neon). Hidden-until-results: the opponent surface is presence
 * only (Connected / Solving / Finished) during play — never score/progress. The in-duel SOLVING runner
 * lives in DuelManager (it is stateful + answerless); this module renders setup/join/lobby/waiting/results
 * + the Submit-&-Leave modal.
 */
var DuelUI = (function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }
  function _el(id) { return document.getElementById(id); }

  var SURFACE = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;';
  var ACCENT = 'var(--color-accent,#6366f1)';
  var TOPICS = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Squares', 'Percentages'];
  var DIFFS = ['easy', 'medium', 'hard'];

  function _backBar(label, onBack) {
    var b = document.createElement('button');
    b.className = 'btn btn-sm btn-secondary'; b.textContent = '‹ ' + (label || 'Back');
    b.style.cssText = 'margin-bottom:1rem;';
    b.onclick = onBack;
    return b;
  }

  /* ───────── Setup (create) ───────── */
  function renderSetup(container, opts) {
    container.style.display = 'block';
    container.innerHTML =
      '<div class="view-pad" style="max-width:520px;margin:0 auto;">' +
        '<h2 style="font-size:1.4rem;font-weight:800;margin:0 0 .25rem;">Create a Duel</h2>' +
        '<div style="color:#94a3b8;font-size:.9rem;margin-bottom:1.25rem;">Challenge a friend to a math speed battle.</div>' +
        '<div style="' + SURFACE + 'padding:1.1rem;margin-bottom:1rem;">' +
          '<label style="display:block;font-weight:600;margin-bottom:.5rem;">Question type</label>' +
          '<div style="display:flex;gap:.5rem;">' +
            '<button id="duTypeQuick" style="flex:1;padding:.7rem;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:' + ACCENT + ';color:#fff;font-weight:600;">Quick Math</button>' +
            '<button id="duTypeWord" style="flex:1;position:relative;padding:.7rem;border-radius:12px;border:1px solid rgba(129,140,248,.4);background:rgba(129,140,248,.08);color:#c7d2fe;font-weight:600;cursor:pointer;">Word Problems' +
              '<span style="position:absolute;top:-8px;right:-6px;font-size:.55rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:.15rem .4rem;border-radius:999px;color:#0b1120;background:#818cf8;">Soon</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1.1rem;margin-bottom:1rem;">' +
          '<label style="display:block;font-weight:600;margin-bottom:.5rem;">Questions</label>' +
          '<div id="duQ" style="display:flex;gap:.4rem;">' +
            [5, 10, 15, 20].map(function (n) { return '<button data-q="' + n + '" style="flex:1;padding:.6rem;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:' + (n === 10 ? ACCENT : 'transparent') + ';color:#fff;">' + n + '</button>'; }).join('') +
          '</div>' +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1.1rem;margin-bottom:1rem;">' +
          '<label style="display:block;font-weight:600;margin-bottom:.5rem;">Difficulty</label>' +
          '<div id="duD" style="display:flex;gap:.4rem;">' +
            DIFFS.map(function (d) { return '<button data-d="' + d + '" style="flex:1;padding:.6rem;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:' + (d === 'medium' ? ACCENT : 'transparent') + ';color:#fff;text-transform:capitalize;">' + d + '</button>'; }).join('') +
          '</div>' +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1.1rem;margin-bottom:1rem;">' +
          '<label style="display:block;font-weight:600;margin-bottom:.5rem;">Topics <span style="color:#64748b;font-weight:400;">— none = mixed</span></label>' +
          '<div id="duT" style="display:flex;flex-wrap:wrap;gap:.4rem;">' +
            TOPICS.map(function (t) { return '<button data-t="' + t.toLowerCase() + '" style="padding:.45rem .8rem;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;font-size:.85rem;">' + t + '</button>'; }).join('') +
          '</div>' +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1.1rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;">' +
          '<div><div style="font-weight:600;">Allow skipping questions</div><div style="color:#64748b;font-size:.8rem;">Off = every question must be answered</div></div>' +
          '<label class="toggle"><input type="checkbox" id="duSkipChk" /><span class="toggle-slider"></span></label>' +
        '</div>' +
        '<button id="duCreateBtn" class="btn btn-primary" style="width:100%;padding:.9rem;font-size:1rem;font-weight:700;">Create Duel</button>' +
      '</div>';
    container.insertBefore(_backBar('Home', opts.onBack), container.firstChild);

    var qSel = 10, dSel = 'medium', tSel = {};
    function _segActivate(sel, btn) { container.querySelectorAll(sel + ' button').forEach(function (x) { x.style.background = 'transparent'; }); btn.style.background = ACCENT; }
    container.querySelectorAll('#duQ button').forEach(function (b) { b.onclick = function () { qSel = parseInt(b.getAttribute('data-q'), 10); _segActivate('#duQ', b); }; });
    container.querySelectorAll('#duD button').forEach(function (b) { b.onclick = function () { dSel = b.getAttribute('data-d'); _segActivate('#duD', b); }; });
    container.querySelectorAll('#duT button').forEach(function (b) {
      b.onclick = function () { var k = b.getAttribute('data-t'); if (tSel[k]) { delete tSel[k]; b.style.background = 'transparent'; } else { tSel[k] = 1; b.style.background = ACCENT; } };
    });

    // Question type: Quick Math is the only selectable type this release. Word Problems is staged — tapping
    // it opens the Coming Soon modal and never selects it (questionMode stays 'quick' in onCreate). ADR-031.
    var typeWord = _el('duTypeWord');
    if (typeWord) typeWord.onclick = function () {
      if (typeof showComingSoon === 'function') showComingSoon({ title: 'Word Problems Duels', blurb: 'Battle a friend with AI-crafted, exam-style word problems. We’re putting the final polish on it. Launching soon for Premium.' });
    };

    var createBtn = _el('duCreateBtn');
    createBtn.onclick = function () {
      createBtn.disabled = true; createBtn.textContent = 'Creating…';
      opts.onCreate({ questionCount: qSel, difficulty: dSel, topics: Object.keys(tSel), questionMode: 'quick', allowSkip: !!(_el('duSkipChk') && _el('duSkipChk').checked) }, function () { createBtn.disabled = false; createBtn.textContent = 'Create Duel'; });
    };
  }

  /* ───────── Join (by code) ───────── */
  function renderJoin(container, opts) {
    container.style.display = 'block';
    container.innerHTML =
      '<div class="view-pad" style="max-width:420px;margin:0 auto;">' +
        '<h2 style="font-size:1.4rem;font-weight:800;margin:0 0 .25rem;">Join a Duel</h2>' +
        '<div style="color:#94a3b8;font-size:.9rem;margin-bottom:1.25rem;">Enter the room code your friend shared.</div>' +
        '<input id="duJoinCode" inputmode="text" autocapitalize="characters" maxlength="6" placeholder="ABC123" ' +
          'style="width:100%;text-align:center;letter-spacing:.35em;font-size:1.8rem;font-weight:700;text-transform:uppercase;padding:1rem;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;margin-bottom:1rem;" />' +
        '<div id="duJoinErr" style="color:#f87171;font-size:.85rem;min-height:1.1rem;margin-bottom:.5rem;text-align:center;"></div>' +
        '<button id="duJoinBtn" class="btn btn-primary" style="width:100%;padding:.9rem;font-size:1rem;font-weight:700;">Join Duel</button>' +
      '</div>';
    container.insertBefore(_backBar('Home', opts.onBack), container.firstChild);
    var input = _el('duJoinCode'), btn = _el('duJoinBtn'), err = _el('duJoinErr');
    function go() {
      var code = (input.value || '').trim().toUpperCase();
      if (code.length < 4) { err.textContent = 'Enter the full room code.'; return; }
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Joining…';
      opts.onJoin(code, function (msg) { btn.disabled = false; btn.textContent = 'Join Duel'; if (msg) err.textContent = msg; });
    }
    btn.onclick = go;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    try { input.focus(); } catch (_) {}
  }

  /* ───────── Lobby ───────── */
  function renderLobby(container, opts) {
    var d = opts.duel || {}, code = opts.code, isHost = opts.isHost;
    var uids = d.participantUids || [];
    var opp = uids.find(function (u) { return u !== opts.myUid; });
    var oppName = (opp && d.presence && d.presence[opp]) ? d.presence[opp].name : null;
    container.style.display = 'block';
    container.innerHTML =
      '<div class="view-pad" style="max-width:480px;margin:0 auto;">' +
        '<div style="' + SURFACE + 'padding:1.25rem;text-align:center;margin-bottom:1rem;">' +
          '<div style="color:#94a3b8;font-size:.8rem;letter-spacing:.05em;text-transform:uppercase;">Room code</div>' +
          '<div id="duCode" style="font-size:2.2rem;font-weight:800;letter-spacing:.25em;margin:.25rem 0 .75rem;">' + _esc(code) + '</div>' +
          '<div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;">' +
            '<button id="duCopy" class="btn btn-sm btn-secondary">Copy</button>' +
            '<button id="duWhats" class="btn btn-sm btn-secondary">WhatsApp</button>' +
            '<button id="duShare" class="btn btn-sm btn-secondary">Share</button>' +
          '</div>' +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1rem;margin-bottom:1rem;">' +
          _player(d, opts.myUid, opts.myUid, 'You') +
          _player(d, opp, opts.myUid, oppName || 'Waiting for opponent…') +
        '</div>' +
        '<div style="color:#94a3b8;font-size:.85rem;text-align:center;margin-bottom:1rem;">' +
          _esc(String((d.config && d.config.questionCount) || '?')) + ' questions · ' + _esc((d.config && d.config.difficulty) || 'medium') +
        '</div>' +
        (isHost
          ? '<button id="duStart" class="btn btn-primary" style="width:100%;padding:.9rem;font-weight:700;" ' + (uids.length < 2 ? 'disabled' : '') + '>' + (uids.length < 2 ? 'Waiting for opponent…' : 'Start Duel') + '</button>'
          : '<div style="text-align:center;color:#94a3b8;padding:.75rem;">Waiting for the host to start…</div>') +
        '<button id="duLeave" class="btn btn-sm btn-secondary" style="width:100%;margin-top:.75rem;">Leave</button>' +
      '</div>';

    var inviteText = 'Join my QuantReflex duel — code ' + code + '\n' + _inviteUrl(code);
    var copyBtn = _el('duCopy'); if (copyBtn) copyBtn.onclick = function () { _copy(code); copyBtn.textContent = 'Copied!'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500); };
    var wBtn = _el('duWhats'); if (wBtn) wBtn.onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent(inviteText), '_blank'); };
    var sBtn = _el('duShare'); if (sBtn) sBtn.onclick = function () { _nativeShare('Join my QuantReflex duel', inviteText); };
    var startBtn = _el('duStart'); if (startBtn) startBtn.onclick = function () { startBtn.disabled = true; startBtn.textContent = 'Starting…'; opts.onStart(function () { startBtn.disabled = false; startBtn.textContent = 'Start Duel'; }); };
    var leaveBtn = _el('duLeave'); if (leaveBtn) leaveBtn.onclick = opts.onLeave;
  }

  function _player(d, uid, myUid, fallback) {
    var p = (uid && d.presence && d.presence[uid]) ? d.presence[uid] : null;
    var name = p ? p.name : fallback;
    var ready = p && (p.state === 'ready' || uid === d.createdBy);
    var dotColor = p ? (ready ? '#34d399' : '#fbbf24') : '#64748b';
    return '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem 0;">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' + dotColor + ';flex:none;"></span>' +
      '<span style="font-weight:600;">' + _esc(name) + (uid === myUid ? ' <span style="color:#64748b;font-weight:400;">(you)</span>' : '') + (uid === d.createdBy ? ' <span style="color:#64748b;font-weight:400;font-size:.8rem;">host</span>' : '') + '</span>' +
      '<span style="margin-left:auto;color:#94a3b8;font-size:.8rem;">' + (p ? (ready ? 'Ready' : 'Joined') : 'Empty') + '</span>' +
    '</div>';
  }

  /* ───────── Finished-waiting ───────── */
  function renderWaiting(container, opts) {
    var oppName = opts.opponentName || 'your opponent';
    var oppState = opts.opponentState || 'solving';
    var chip = oppState === 'finished' ? 'Finished' : (opts.opponentStale ? 'Reconnecting…' : 'Solving');
    container.style.display = 'block';
    container.innerHTML =
      '<div class="view-pad" style="max-width:440px;margin:0 auto;text-align:center;padding-top:2rem;">' +
        '<div style="font-size:2.6rem;margin-bottom:.5rem;">⚔</div>' +
        '<h2 style="font-size:1.4rem;font-weight:800;margin:0 0 .5rem;">Waiting for ' + _esc(oppName) + '…</h2>' +
        '<div style="color:#94a3b8;margin-bottom:1.25rem;">Your responses have been submitted. Results will be available once both players finish.</div>' +
        '<div style="' + SURFACE + 'padding:1rem;display:inline-flex;align-items:center;gap:.6rem;margin-bottom:1.5rem;">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + (oppState === 'finished' ? '#34d399' : '#fbbf24') + ';"></span>' +
          '<span>' + _esc(oppName) + ': ' + chip + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem;justify-content:center;">' +
          '<button id="duStay" class="btn btn-secondary">Stay Here</button>' +
          '<button id="duHome" class="btn btn-primary">Return to Home</button>' +
        '</div>' +
      '</div>';
    var stay = _el('duStay'); if (stay) stay.onclick = function () { /* already here */ };
    var home = _el('duHome'); if (home) home.onclick = opts.onHome;
  }

  /* ───────── Result (premium head-to-head) ───────── */
  function renderResults(container, opts) {
    var d = opts.duel || {}, myUid = opts.myUid;
    var uids = d.participantUids || [];
    var opp = uids.find(function (u) { return u !== myUid; });
    var per = d.perPlayer || {};
    var me = per[myUid] || { correctCount: 0, totalSolveMs: 0 };
    var op = per[opp] || { correctCount: 0, totalSolveMs: 0 };
    var myName = (d.presence && d.presence[myUid] && d.presence[myUid].name) || 'You';
    var opName = (d.presence && opp && d.presence[opp] && d.presence[opp].name) || 'Opponent';
    var n = d.effectiveQuestionCount || 1;
    var draw = d.result === 'draw';
    var iWon = d.winnerUid === myUid;
    var banner = draw ? 'Draw' : (iWon ? 'You win' : opName + ' wins');
    var bannerColor = draw ? '#94a3b8' : (iWon ? '#34d399' : '#f87171');
    function spd(r) { return (r.totalSolveMs > 0) ? (r.totalSolveMs / 1000 / n).toFixed(1) + 's/q' : '—'; }
    function why() {
      if (draw) return 'Dead even — same score and speed.';
      var w = iWon ? me : op, l = iWon ? op : me, wn = iWon ? 'You' : opName;
      if (w.correctCount > l.correctCount) return wn + ' won on accuracy (' + w.correctCount + ' vs ' + l.correctCount + ' correct).';
      return wn + ' won on speed — same accuracy, faster solving.';
    }
    container.style.display = 'block';
    container.innerHTML =
      '<div class="view-pad" style="max-width:480px;margin:0 auto;">' +
        '<div style="text-align:center;margin:1rem 0 1.25rem;">' +
          '<div style="font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Duel result</div>' +
          '<div style="font-size:2rem;font-weight:800;color:' + bannerColor + ';margin-top:.25rem;">' + _esc(banner) + '</div>' +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1.25rem;display:flex;align-items:stretch;margin-bottom:1rem;">' +
          _resultCol(myName + ' (you)', me, iWon && !draw) +
          '<div style="display:flex;align-items:center;color:#64748b;font-weight:700;padding:0 .5rem;">VS</div>' +
          _resultCol(opName, op, !iWon && !draw) +
        '</div>' +
        '<div style="' + SURFACE + 'padding:1rem;margin-bottom:1rem;">' +
          _metricRow('Correct', me.correctCount + ' / ' + n, op.correctCount + ' / ' + n) +
          _metricRow('Speed', spd(me), spd(op)) +
          _metricRow('Accuracy', _acc(me) + '%', _acc(op) + '%') +
        '</div>' +
        '<div style="text-align:center;color:#cbd5e1;font-size:.95rem;margin-bottom:1.25rem;">' + _esc(why()) + '</div>' +
        '<div style="display:flex;gap:.5rem;">' +
          '<button id="duRematch" class="btn btn-secondary" style="flex:1;">Rematch</button>' +
          '<button id="duShareRes" class="btn btn-primary" style="flex:1;">Share</button>' +
        '</div>' +
        '<button id="duDone" class="btn btn-sm btn-secondary" style="width:100%;margin-top:.75rem;">Done</button>' +
      '</div>';
    var rm = _el('duRematch'); if (rm) rm.onclick = opts.onRematch;
    var sh = _el('duShareRes'); if (sh) sh.onclick = function () {
      var data = { result: d.result, myName: myName, opName: opName, myScore: me.correctCount, opScore: op.correctCount, winner: d.winnerUid, myUid: myUid, myAccuracy: _acc(me), opAccuracy: _acc(op), myAttempted: (me.answeredCount != null ? me.answeredCount : me.correctCount), opAttempted: (op.answeredCount != null ? op.answeredCount : op.correctCount) };
      if (typeof ShareService !== 'undefined' && ShareService.shareDuelAsImage) ShareService.shareDuelAsImage(data);
      else _nativeShare('QuantReflex Duel', (iWon ? myName + ' defeated ' + opName : opName + ' defeated ' + myName) + ' · ' + n + ' Q · ' + spd(me) + ' · ' + _acc(me) + '%');
    };
    var dn = _el('duDone'); if (dn) dn.onclick = opts.onDone;
  }
  function _resultCol(name, r, win) {
    return '<div style="flex:1;text-align:center;' + (win ? 'opacity:1;' : 'opacity:.85;') + '">' +
      '<div style="color:#94a3b8;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _esc(name) + '</div>' +
      '<div style="font-size:2.4rem;font-weight:800;margin:.2rem 0;">' + r.correctCount + '</div>' +
      '<div style="color:#64748b;font-size:.75rem;">correct</div>' + (win ? '<div style="color:#34d399;font-size:.75rem;margin-top:.2rem;">winner</div>' : '') +
    '</div>';
  }
  function _metricRow(label, a, b) {
    return '<div style="display:flex;align-items:center;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
      '<span style="flex:1;text-align:right;font-weight:600;">' + _esc(a) + '</span>' +
      '<span style="color:#64748b;font-size:.75rem;padding:0 1rem;min-width:90px;text-align:center;">' + _esc(label) + '</span>' +
      '<span style="flex:1;text-align:left;font-weight:600;">' + _esc(b) + '</span>' +
    '</div>';
  }
  function _acc(r) { var a = (r.answeredCount != null) ? r.answeredCount : r.correctCount; return a > 0 ? Math.round((r.correctCount / a) * 100) : 0; }

  /* ───────── Submit & Leave modal ───────── */
  function showExitModal(opts) {
    var modal = _el('exitDuelModal'); if (!modal) { opts.onConfirm(); return; }
    modal.innerHTML =
      '<div class="modal-content" style="max-width:380px;">' +
        '<h3 style="font-size:1.3rem;margin:0 0 .75rem;">Leave Duel?</h3>' +
        '<p style="color:#cbd5e1;font-size:.95rem;margin-bottom:1rem;">You have completed <strong>' + opts.answered + ' / ' + opts.total + '</strong> questions. Your current responses will be permanently submitted. <strong>You will not be able to rejoin this duel.</strong> The result will be available after your opponent finishes.</p>' +
        '<div style="display:flex;flex-direction:column;gap:.5rem;">' +
          '<button id="duExitCancel" class="btn btn-secondary" style="width:100%;">Continue Duel</button>' +
          '<button id="duExitConfirm" class="btn btn-primary" style="width:100%;">Submit &amp; Leave</button>' +
        '</div>' +
      '</div>';
    modal.style.display = 'flex'; document.body.classList.add('modal-open');
    _el('duExitCancel').onclick = function () { hideExitModal(); if (opts.onCancel) opts.onCancel(); };
    _el('duExitConfirm').onclick = function () { hideExitModal(); opts.onConfirm(); };
  }
  function hideExitModal() { var m = _el('exitDuelModal'); if (m) { m.style.display = 'none'; m.innerHTML = ''; } document.body.classList.remove('modal-open'); }

  /* ───────── shared share/clipboard helpers ───────── */
  function _inviteUrl(code) {
    try { return location.origin + '/?duel=' + encodeURIComponent(code); } catch (_) { return 'https://quantreflex.app/?duel=' + code; }
  }
  function _copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    else { try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (_) {} }
  }
  function _nativeShare(title, text) {
    if (navigator.share) navigator.share({ title: title, text: text }).catch(function () {});
    else _copy(text);
  }

  return {
    renderSetup: renderSetup, renderJoin: renderJoin, renderLobby: renderLobby,
    renderWaiting: renderWaiting, renderResults: renderResults,
    showExitModal: showExitModal, hideExitModal: hideExitModal,
    inviteUrl: _inviteUrl
  };
})();
