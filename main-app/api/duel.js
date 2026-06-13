/**
 * duel.js — Duel V2 server-authoritative endpoint (ADR-031). ONE Vercel function, action-routed.
 *
 * The ONLY writer of: questions, the answer key, grading, the winner, room status, and duel history.
 * Clients never grade or decide outcomes. Premium is enforced here (req.userPremium via withAuth →
 * aiService.resolvePlan — works for coaching-granted premium, no custom claim).
 *
 * Actions (POST `?action=...`, JSON body): create | join | editConfig | start | finish | state | abandon.
 * Plus cron-sweep (GET, CRON_SECRET-authed) — the daily backstop reaper; bypasses withAuth.
 *
 * Model: split docs (FIRESTORE_BLUEPRINT) — duels/{code} (prompts text-only + presence),
 * duels/{code}/private/key (server-only answers), duels/{code}/players/{uid} (own answers; the endpoint
 * grades from here). Recovery via users/{uid}.activeDuelId. Exit = finalized submission, NO resume.
 */
'use strict';

const { withAuth, parseBody, formatError } = require('./_lib/middleware');
const { generateQuickQuestions } = require('./_lib/duel-questions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp(sa
      ? { credential: admin.credential.cert(JSON.parse(sa)), projectId: 'quant-reflex-trainer' }
      : { projectId: 'quant-reflex-trainer' });
  } catch (e) { console.error('[duel] admin init failed:', e); }
}
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const DUELS = 'duels';
const USERS = 'users';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars (0/O/1/I)
const CODE_LEN = 6;
const MAX_Q = 30;
const PAR_MS_PER_Q = 15000;   // "par" solve time per question — anchors the speed bonus
const MAX_MS_PER_Q = 90000;   // generous per-question hard cap → total deadline
const GRACE_MS = 15000;       // buffer after the hard cap before the server force-finalizes
const COUNTDOWN_MS = 3500;    // 3-2-1-GO, server-anchored
const SPEED_BONUS_MAX = 300;  // < 1000 (one correct answer) ⇒ accuracy strictly dominates

/* ───────────────────────── helpers ───────────────────────── */

function _now() { return Date.now(); }
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function _genCode() {
  const bytes = require('crypto').randomBytes(CODE_LEN);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

function _cleanName(n) {
  return (typeof n === 'string' && n.trim()) ? n.trim().slice(0, 40) : 'Player';
}

function _validConfig(raw) {
  raw = raw || {};
  const diff = (['easy', 'medium', 'hard'].indexOf(raw.difficulty) >= 0) ? raw.difficulty : 'medium';
  const mode = (raw.questionMode === 'wordproblems') ? 'wordproblems' : 'quick';
  let count = parseInt(raw.questionCount, 10); if (isNaN(count)) count = 10;
  count = _clamp(count, 1, MAX_Q);
  const topics = Array.isArray(raw.topics) ? raw.topics.filter(function (t) { return typeof t === 'string'; }).slice(0, 12) : [];
  let perQ = parseInt(raw.timerPerQuestion, 10); if (isNaN(perQ) || perQ <= 0) perQ = null; else perQ = _clamp(perQ, 3, 120);
  let total = parseInt(raw.timerTotal, 10); if (isNaN(total) || total <= 0) total = null; else total = _clamp(total, 10, 3600);
  return { topics: topics, difficulty: diff, questionMode: mode, questionCount: count, timerPerQuestion: perQ, timerTotal: total };
}

/** Server-side correctness check (mirrors drill-engine normalization: trim + numeric equivalence + tolerance). */
function _isCorrect(userVal, expected) {
  if (userVal == null) return false;
  const raw = String(userVal).replace(/\s/g, '');
  const exp = String(expected).replace(/\s/g, '');
  if (raw === '') return false;
  if (raw === exp) return true;
  const rn = parseFloat(raw), en = parseFloat(exp);
  if (!isNaN(rn) && !isNaN(en)) {
    if (rn === en) return true;
    const tol = Math.max(0.05, Math.abs(en) * 0.005);
    if (Math.abs(rn - en) <= tol) return true;
  }
  return false;
}

/** Grade one player's answers map against the answer key → {correctCount, duelScore, totalSolveMs, answeredCount}. */
function _grade(playerAnswers, keyAnswers, startedAt, finishedAt, budgetMs) {
  let correct = 0, answered = 0;
  const byIndex = {};
  (keyAnswers || []).forEach(function (k) { byIndex[k.index] = k.answer; });
  const ans = (playerAnswers && playerAnswers.answers) || {};
  Object.keys(ans).forEach(function (idx) {
    const a = ans[idx];
    if (a && a.value != null && String(a.value) !== '') {
      answered++;
      if (Object.prototype.hasOwnProperty.call(byIndex, Number(idx)) || Object.prototype.hasOwnProperty.call(byIndex, idx)) {
        const exp = byIndex[Number(idx)] !== undefined ? byIndex[Number(idx)] : byIndex[idx];
        if (_isCorrect(a.value, exp)) correct++;
      }
    }
  });
  const solveMs = _clamp((finishedAt || _now()) - (startedAt || _now()), 0, budgetMs);
  const ratio = budgetMs > 0 ? _clamp(solveMs / budgetMs, 0, 1) : 1;
  const speedBonus = Math.round(SPEED_BONUS_MAX * (1 - ratio));
  const duelScore = correct * 1000 + speedBonus;
  return { correctCount: correct, answeredCount: answered, totalSolveMs: solveMs, speedBonus: speedBonus, duelScore: duelScore };
}

/** Decide the winner from two graded results. Accuracy dominates (1000 vs ≤300 bonus); exact tie ⇒ draw. */
function _decideWinner(uidA, a, uidB, b) {
  if (a.duelScore > b.duelScore) return { winnerUid: uidA, result: 'win' };
  if (b.duelScore > a.duelScore) return { winnerUid: uidB, result: 'win' };
  return { winnerUid: null, result: 'draw' };
}

/** Effective per-duel solve budget (ms) — anchors the speed bonus + the total deadline. */
function _budgets(config, n) {
  const parMs = n * PAR_MS_PER_Q;
  let hardMs;
  if (config.timerTotal) hardMs = config.timerTotal * 1000;
  else if (config.timerPerQuestion) hardMs = config.timerPerQuestion * 1000 * n;
  else hardMs = n * MAX_MS_PER_Q;
  return { parMs: parMs, deadlineMs: hardMs + GRACE_MS };
}

/**
 * Sanitize a room doc for a given viewer. Hidden-until-results: the opponent's score/result are revealed
 * ONLY when status==='complete'. During play the viewer sees opponents' presence STATE only (no score).
 */
function _viewRoom(data, viewerUid) {
  const complete = data.status === 'complete';
  const presence = {};
  Object.keys(data.presence || {}).forEach(function (u) {
    const p = data.presence[u] || {};
    presence[u] = { name: p.name || 'Player', state: p.state || 'joined', finishReason: p.finishReason || null, lastSeenAt: p.lastSeenAt || null };
  });
  const out = {
    code: data.code, status: data.status, createdBy: data.createdBy, createdByName: data.createdByName,
    config: data.config, prompts: data.prompts || [], effectiveQuestionCount: data.effectiveQuestionCount || 0,
    participantUids: data.participantUids || [], presence: presence,
    startedAt: data.startedAt || null, totalDeadline: data.totalDeadline || null,
    completedAt: data.completedAt || null
  };
  if (complete) {
    out.winnerUid = data.winnerUid || null;
    out.result = data.result || null;
    out.perPlayer = data.perPlayer || {};
  }
  return out;
}

async function _sendOpponentFinishedFcm(toUid, opponentName, code) {
  try {
    const snap = await db.collection(USERS).doc(toUid).get();
    const token = snap.exists ? snap.data().fcmToken : null;
    if (!token) return;
    await admin.messaging().send({
      token: token,
      notification: { title: '⚔ Duel Finished', body: 'Your duel against ' + (opponentName || 'your opponent') + ' is ready.' },
      data: { type: 'duel_complete', code: String(code) }
    });
  } catch (e) { /* best-effort */ }
}

/* ───────────────────────── completion (shared by finish/state/cron) ───────────────────────── */

/**
 * Finalize-and-maybe-complete inside ONE transaction. Finalizes every participant in `finalizeUids` that
 * isn't already `finished` (grading their own answers), then — if ALL participants are finished —
 * status-CAS to `complete`, compute winner, write perPlayer+history. (activeDuelId is intentionally NOT cleared
 * here — it keeps the Home "Duel ready · View Results" card alive; cleared on ackResult/abandon/cron-expire.)
 * Idempotent: a re-run after `complete` no-ops. Returns { completed, room } (post-state).
 */
async function _finalizeTxn(code, finalizeSpec) {
  // finalizeSpec: { uid: 'completed_all'|'submitted_early'|'timed_out' } for players to finalize now.
  const roomRef = db.collection(DUELS).doc(code);
  let fcmTargets = [];
  const result = await db.runTransaction(async function (txn) {
    const roomSnap = await txn.get(roomRef);
    if (!roomSnap.exists) return { error: 'NOT_FOUND' };
    const room = roomSnap.data();
    if (room.status === 'complete') return { completed: true, room: room };
    if (room.status !== 'active') return { room: room };

    const uids = room.participantUids || [];
    // Read the answer key + the player docs we may need (reads before writes).
    const keySnap = await txn.get(roomRef.collection('private').doc('key'));
    const keyAnswers = keySnap.exists ? (keySnap.data().answers || []) : [];
    const playerSnaps = {};
    for (const u of uids) playerSnaps[u] = await txn.get(roomRef.collection('players').doc(u));

    const presence = room.presence || {};
    const playerResults = {};   // uid -> graded result (from doc or freshly graded)
    const now = _now();
    const budgetMs = room.budgetMs || (room.effectiveQuestionCount || 1) * PAR_MS_PER_Q;

    for (const u of uids) {
      const already = presence[u] && presence[u].state === 'finished';
      const existing = playerSnaps[u].exists ? playerSnaps[u].data() : {};
      if (already && existing.result) { playerResults[u] = existing.result; continue; }
      if (already) { // finished but no stored result (shouldn't happen) → grade defensively
        playerResults[u] = _grade(existing, keyAnswers, room.startedAt, now, budgetMs);
        continue;
      }
      const reason = finalizeSpec[u];
      if (!reason) { playerResults[u] = null; continue; } // still solving and not being finalized now
      // Finalize this player now.
      const graded = _grade(existing, keyAnswers, room.startedAt, now, budgetMs);
      playerResults[u] = graded;
      presence[u] = Object.assign({}, presence[u], { state: 'finished', finishReason: reason, finishedAt: now });
      txn.set(roomRef.collection('players').doc(u), { result: graded, gradedAt: now }, { merge: true });
    }

    const allFinished = uids.length >= 2 && uids.every(function (u) { return presence[u] && presence[u].state === 'finished'; });

    if (!allFinished) {
      txn.update(roomRef, { presence: presence });
      return { room: Object.assign({}, room, { presence: presence }) };
    }

    // Complete: compute winner from both graded results, write the authoritative outcome.
    const a = uids[0], b = uids[1];
    const ra = playerResults[a] || (playerSnaps[a].data() && playerSnaps[a].data().result) || { correctCount: 0, duelScore: 0, totalSolveMs: 0 };
    const rb = playerResults[b] || (playerSnaps[b].data() && playerSnaps[b].data().result) || { correctCount: 0, duelScore: 0, totalSolveMs: 0 };
    const decided = _decideWinner(a, ra, b, rb);
    const perPlayer = {}; perPlayer[a] = ra; perPlayer[b] = rb;
    const completedAt = now;
    txn.update(roomRef, { status: 'complete', presence: presence, winnerUid: decided.winnerUid, result: decided.result, perPlayer: perPlayer, completedAt: completedAt });
    // NOTE: activeDuelId is intentionally NOT cleared here — it keeps the Home "Duel ready · View Results"
    // card alive until the user acks. A 'complete' activeDuelId never blocks a new create (the create guard
    // only blocks on 'lobby'/'active'); the client clears it on result-ack, or the next create overwrites it.
    // History for both (idempotent docId = code).
    const nameA = (presence[a] && presence[a].name) || 'Player';
    const nameB = (presence[b] && presence[b].name) || 'Player';
    function outcome(u) { return decided.winnerUid == null ? 'draw' : (decided.winnerUid === u ? 'win' : 'loss'); }
    function speed(r, count) { return (count > 0 && r.totalSolveMs > 0) ? parseFloat((r.totalSolveMs / 1000 / count).toFixed(1)) : 0; }
    txn.set(db.collection(USERS).doc(a).collection('duelHistory').doc(code), {
      opponentName: nameB, outcome: outcome(a), myScore: ra.correctCount, oppScore: rb.correctCount,
      mySpeed: speed(ra, room.effectiveQuestionCount), oppSpeed: speed(rb, room.effectiveQuestionCount),
      accuracy: ra.answeredCount ? Math.round((ra.correctCount / ra.answeredCount) * 100) : 0, playedAt: completedAt
    }, { merge: true });
    txn.set(db.collection(USERS).doc(b).collection('duelHistory').doc(code), {
      opponentName: nameA, outcome: outcome(b), myScore: rb.correctCount, oppScore: ra.correctCount,
      mySpeed: speed(rb, room.effectiveQuestionCount), oppSpeed: speed(ra, room.effectiveQuestionCount),
      accuracy: rb.answeredCount ? Math.round((rb.correctCount / rb.answeredCount) * 100) : 0, playedAt: completedAt
    }, { merge: true });

    fcmTargets = uids.slice();
    return { completed: true, room: Object.assign({}, room, { status: 'complete', presence: presence, winnerUid: decided.winnerUid, result: decided.result, perPlayer: perPlayer, completedAt: completedAt }) };
  });

  // Fire-and-forget FCM after commit (notify the player(s); the one still on a screen ignores the dupe).
  if (result && result.completed && fcmTargets.length) {
    const room = result.room || {};
    const presence = room.presence || {};
    for (const u of fcmTargets) {
      const other = (room.participantUids || []).find(function (x) { return x !== u; });
      const oppName = (presence[other] && presence[other].name) || 'your opponent';
      _sendOpponentFinishedFcm(u, oppName, code);
    }
  }
  return result || {};
}

/* ───────────────────────── actions ───────────────────────── */

async function _create(req, res) {
  const uid = req.userId;
  if (!req.userPremium) return res.status(403).json({ error: { code: 'PREMIUM_REQUIRED', message: 'Math Duel is a Premium feature.' } });
  const body = parseBody(req);
  const config = _validConfig(body.config || body);
  const name = _cleanName(body.name);

  // Block creating a second duel while one is unfinalized (avoids orphaning the mirror — red-team H3).
  const me = await db.collection(USERS).doc(uid).get();
  const existingId = me.exists ? me.data().activeDuelId : null;
  if (existingId) {
    const ex = await db.collection(DUELS).doc(existingId).get();
    if (ex.exists && ['lobby', 'active'].indexOf(ex.data().status) >= 0) {
      return res.status(409).json({ error: { code: 'DUEL_IN_PROGRESS', message: 'Finish your current duel first.' }, code: existingId });
    }
  }

  // Mint a unique code with .create() (existence guard at the DB level — no .set() clobber).
  let code = null;
  for (let attempt = 0; attempt < 6 && !code; attempt++) {
    const candidate = _genCode();
    const now = _now();
    const presence = {}; presence[uid] = { name: name, state: 'joined', lastSeenAt: now };
    const payload = {
      schemaVersion: 2, code: candidate, createdBy: uid, createdByName: name, status: 'lobby',
      config: config, prompts: [], effectiveQuestionCount: 0, participantUids: [uid], presence: presence,
      startedAt: null, totalDeadline: null, budgetMs: null, winnerUid: null, result: null, perPlayer: {},
      completedAt: null, createdAt: FieldValue.serverTimestamp()
    };
    try { await db.collection(DUELS).doc(candidate).create(payload); code = candidate; }
    catch (e) { if (!(e && (e.code === 6 || /already exists/i.test(e.message)))) throw e; }
  }
  if (!code) return res.status(500).json({ error: { code: 'CODE_COLLISION', message: 'Could not create a room. Try again.' } });

  await db.collection(USERS).doc(uid).set({ activeDuelId: code }, { merge: true });
  const snap = await db.collection(DUELS).doc(code).get();
  return res.status(200).json({ code: code, duel: _viewRoom(snap.data(), uid) });
}

async function _join(req, res) {
  const uid = req.userId;
  if (!req.userPremium) return res.status(403).json({ error: { code: 'PREMIUM_REQUIRED', message: 'Math Duel is a Premium feature.' } });
  const body = parseBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const name = _cleanName(body.name);
  if (!code) return res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Enter a room code.' } });
  const roomRef = db.collection(DUELS).doc(code);

  const out = await db.runTransaction(async function (txn) {
    const snap = await txn.get(roomRef);
    if (!snap.exists) return { err: { s: 404, code: 'ROOM_NOT_FOUND', m: 'Room not found — check the code.' } };
    const data = snap.data();
    if (data.schemaVersion !== 2) return { err: { s: 404, code: 'ROOM_NOT_FOUND', m: 'Room not found — check the code.' } };
    const uids = data.participantUids || [];
    if (uids.indexOf(uid) >= 0) return { data: data };                 // already a participant → rejoin lobby/active
    if (data.status !== 'lobby') return { err: { s: 409, code: 'NOT_JOINABLE', m: 'This duel is no longer accepting players.' } };
    if (uids.length >= 2) return { err: { s: 409, code: 'ROOM_FULL', m: 'This duel room is already full.' } };
    const presence = data.presence || {};
    presence[uid] = { name: name, state: 'ready', lastSeenAt: _now() };
    txn.update(roomRef, { participantUids: uids.concat([uid]), presence: presence });
    return { data: Object.assign({}, data, { participantUids: uids.concat([uid]), presence: presence }) };
  });
  if (out.err) return res.status(out.err.s).json({ error: { code: out.err.code, message: out.err.m } });

  await db.collection(USERS).doc(uid).set({ activeDuelId: code }, { merge: true });
  return res.status(200).json({ code: code, duel: _viewRoom(out.data, uid) });   // full room JSON → client renders, THEN attaches listener
}

async function _editConfig(req, res) {
  const uid = req.userId;
  const body = parseBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const config = _validConfig(body.config || {});
  const roomRef = db.collection(DUELS).doc(code);
  const out = await db.runTransaction(async function (txn) {
    const snap = await txn.get(roomRef);
    if (!snap.exists) return { err: { s: 404, code: 'ROOM_NOT_FOUND', m: 'Room not found.' } };
    const data = snap.data();
    if (data.createdBy !== uid) return { err: { s: 403, code: 'NOT_HOST', m: 'Only the host can edit settings.' } };
    if (data.status !== 'lobby') return { err: { s: 409, code: 'ALREADY_STARTED', m: 'The duel has already started.' } };
    const presence = data.presence || {};
    Object.keys(presence).forEach(function (u) { presence[u] = Object.assign({}, presence[u], { state: u === data.createdBy ? 'joined' : 'ready' }); });
    txn.update(roomRef, { config: config, presence: presence });
    return { data: Object.assign({}, data, { config: config, presence: presence }) };
  });
  if (out.err) return res.status(out.err.s).json({ error: { code: out.err.code, message: out.err.m } });
  return res.status(200).json({ duel: _viewRoom(out.data, uid) });
}

async function _start(req, res) {
  const uid = req.userId;
  const body = parseBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const roomRef = db.collection(DUELS).doc(code);

  const pre = await roomRef.get();
  if (!pre.exists) return res.status(404).json({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } });
  const room = pre.data();
  if (room.createdBy !== uid) return res.status(403).json({ error: { code: 'NOT_HOST', message: 'Only the host can start the duel.' } });
  if (room.status === 'active' || room.status === 'complete') {
    return res.status(200).json({ duel: _viewRoom(room, uid), serverNow: _now() });   // idempotent
  }
  if (room.status !== 'lobby') return res.status(409).json({ error: { code: 'BAD_STATE', message: 'Cannot start this duel.' } });
  if ((room.participantUids || []).length < 2) return res.status(409).json({ error: { code: 'NO_OPPONENT', message: 'Wait for an opponent to join.' } });

  // Generate questions (server-side). Word-problems resolve real bank questions; fall back to quick.
  let questions = [];
  if (room.config.questionMode === 'wordproblems') {
    try {
      let q = db.collection('questions').where('status', '==', 'active').where('type', '==', 'word_problem');
      if (room.config.topics && room.config.topics.length === 1) q = q.where('topic', '==', room.config.topics[0]);
      if (room.config.difficulty) q = q.where('difficulty', '==', room.config.difficulty);
      const bank = await q.limit(room.config.questionCount).get();
      bank.forEach(function (d, i) { const x = d.data(); if (x && x.answer != null) questions.push({ index: questions.length, text: x.question || x.text || '', category: x.topic || 'word_problem', answer: x.answer }); });
    } catch (e) { /* missing index / no bank → fall through to quick */ }
  }
  if (!questions.length) questions = generateQuickQuestions(room.config);
  questions = questions.slice(0, MAX_Q).map(function (q, i) { return { index: i, text: q.text, category: q.category, answer: q.answer }; });
  const n = questions.length;
  if (!n) return res.status(500).json({ error: { code: 'GEN_FAILED', message: 'Could not prepare questions. Try again.' } });

  const prompts = questions.map(function (q) { return { index: q.index, text: q.text, category: q.category }; });
  const answers = questions.map(function (q) { return { index: q.index, answer: q.answer }; });
  const startedAt = _now() + COUNTDOWN_MS;
  const b = _budgets(room.config, n);
  const totalDeadline = startedAt + b.deadlineMs;

  const out = await db.runTransaction(async function (txn) {
    const snap = await txn.get(roomRef);
    const d = snap.data();
    if (d.status !== 'lobby') return { data: d };   // someone already started → idempotent
    txn.set(roomRef.collection('private').doc('key'), { prompts: prompts, answers: answers }, { merge: false });
    txn.update(roomRef, {
      status: 'active', prompts: prompts, effectiveQuestionCount: n,
      startedAt: startedAt, totalDeadline: totalDeadline, budgetMs: b.parMs
    });
    return { data: Object.assign({}, d, { status: 'active', prompts: prompts, effectiveQuestionCount: n, startedAt: startedAt, totalDeadline: totalDeadline }) };
  });
  return res.status(200).json({ duel: _viewRoom(out.data, uid), serverNow: _now() });
}

async function _finish(req, res) {
  const uid = req.userId;
  const body = parseBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const reason = (body.finishReason === 'submitted_early') ? 'submitted_early' : 'completed_all';
  const roomRef = db.collection(DUELS).doc(code);

  const pre = await roomRef.get();
  if (!pre.exists) return res.status(404).json({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } });
  const room0 = pre.data();
  if ((room0.participantUids || []).indexOf(uid) < 0) return res.status(403).json({ error: { code: 'NOT_PARTICIPANT', message: 'You are not in this duel.' } });
  if (room0.status === 'lobby') return res.status(409).json({ error: { code: 'NOT_STARTED', message: 'The duel has not started.' } });

  const spec = {}; spec[uid] = reason;     // finalize ONLY the caller (never the opponent)
  const r = await _finalizeTxn(code, spec);
  if (r.error === 'NOT_FOUND') return res.status(404).json({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } });
  const room = r.room || room0;
  // Return the caller's own stats always; opponent comparison only when complete (_viewRoom enforces this).
  const mine = await roomRef.collection('players').doc(uid).get();
  return res.status(200).json({ complete: room.status === 'complete', duel: _viewRoom(room, uid), my: (mine.exists && mine.data().result) || null });
}

async function _state(req, res) {
  const uid = req.userId;
  const body = parseBody(req);
  const code = String((body.code || (req.query && req.query.code) || '')).trim().toUpperCase();
  const roomRef = db.collection(DUELS).doc(code);
  const snap = await roomRef.get();
  if (!snap.exists) return res.status(404).json({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } });
  let room = snap.data();
  if ((room.participantUids || []).indexOf(uid) < 0) return res.status(403).json({ error: { code: 'NOT_PARTICIPANT', message: 'You are not in this duel.' } });

  // Lazy finalize: if the deadline has passed and the duel isn't complete, finalize any still-solving player.
  if (room.status === 'active' && room.totalDeadline && _now() > room.totalDeadline) {
    const spec = {};
    (room.participantUids || []).forEach(function (u) {
      const st = room.presence && room.presence[u] && room.presence[u].state;
      if (st !== 'finished') spec[u] = 'timed_out';
    });
    if (Object.keys(spec).length) { const r = await _finalizeTxn(code, spec); if (r.room) room = r.room; }
  }
  const mine = await roomRef.collection('players').doc(uid).get();
  return res.status(200).json({ duel: _viewRoom(room, uid), serverNow: _now(), my: (mine.exists && mine.data().result) || null });
}

async function _ackResult(req, res) {
  // Clear the caller's recovery mirror after they've viewed a finished/abandoned duel's result, so the
  // Home "Active Duel" card disappears. Only clears if it still points to THIS code (no race with a new duel).
  const uid = req.userId;
  const body = parseBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const meRef = db.collection(USERS).doc(uid);
  await db.runTransaction(async function (txn) {
    const me = await txn.get(meRef);
    if (me.exists && me.data().activeDuelId === code) txn.set(meRef, { activeDuelId: null }, { merge: true });
  });
  return res.status(200).json({ success: true });
}

async function _abandon(req, res) {
  const uid = req.userId;
  const body = parseBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const roomRef = db.collection(DUELS).doc(code);
  const out = await db.runTransaction(async function (txn) {
    const snap = await txn.get(roomRef);
    if (!snap.exists) return { ok: true };
    const d = snap.data();
    if (d.createdBy !== uid) return { err: { s: 403, code: 'NOT_HOST', m: 'Only the host can cancel the lobby.' } };
    if (d.status !== 'lobby') return { err: { s: 409, code: 'ALREADY_STARTED', m: 'The duel has already started — finish it instead.' } };
    txn.update(roomRef, { status: 'abandoned' });
    (d.participantUids || []).forEach(function (u) { txn.set(db.collection(USERS).doc(u), { activeDuelId: null }, { merge: true }); });
    return { ok: true };
  });
  if (out.err) return res.status(out.err.s).json({ error: { code: out.err.code, message: out.err.m } });
  return res.status(200).json({ success: true });
}

/* ───────────────────────── cron backstop (CRON_SECRET-authed; bypasses withAuth) ───────────────────────── */

function _safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

async function _cronSweep(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: { code: 'CRON_SECRET_MISSING', message: 'CRON_SECRET not configured.' } });
  const header = req.headers['authorization'] || '';
  const provided = header.indexOf('Bearer ') === 0 ? header.substring(7) : header;
  if (!_safeEqual(provided, secret)) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret.' } });

  const now = _now();
  const result = { finalized: 0, lobbiesExpired: 0 };
  try {
    // Finalize abandoned active duels past their deadline (lazy path missed them — both players gone).
    const active = await db.collection(DUELS).where('status', '==', 'active').limit(300).get();
    for (const doc of active.docs) {
      const d = doc.data();
      if (d.totalDeadline && now > d.totalDeadline) {
        const spec = {};
        (d.participantUids || []).forEach(function (u) {
          const st = d.presence && d.presence[u] && d.presence[u].state;
          if (st !== 'finished') spec[u] = 'timed_out';
        });
        if (Object.keys(spec).length) { try { await _finalizeTxn(doc.id, spec); result.finalized++; } catch (e) { /* skip */ } }
      }
    }
    // Expire stale lobbies (created >2h ago, never started).
    const staleBefore = admin.firestore.Timestamp.fromMillis(now - 2 * 60 * 60 * 1000);
    const lobbies = await db.collection(DUELS).where('status', '==', 'lobby').limit(300).get();
    for (const doc of lobbies.docs) {
      const d = doc.data();
      const created = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
      if (created && created < staleBefore.toMillis()) {
        try {
          await doc.ref.update({ status: 'expired' });
          (d.participantUids || []).forEach(function (u) { db.collection(USERS).doc(u).set({ activeDuelId: null }, { merge: true }).catch(function () {}); });
          result.lobbiesExpired++;
        } catch (e) { /* skip */ }
      }
    }
    return res.status(200).json(Object.assign({ success: true }, result));
  } catch (err) {
    console.error('[duel/cron-sweep] failed:', err);
    return res.status(500).json({ error: { code: 'SWEEP_FAILED', message: err.message }, partial: result });
  }
}

/* ───────────────────────── router ───────────────────────── */

async function handler(req, res) {
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';
  try {
    switch (action) {
      case 'create': return await _create(req, res);
      case 'join': return await _join(req, res);
      case 'editConfig': return await _editConfig(req, res);
      case 'start': return await _start(req, res);
      case 'finish': return await _finish(req, res);
      case 'state': return await _state(req, res);
      case 'ackResult': return await _ackResult(req, res);
      case 'abandon': return await _abandon(req, res);
      default: return res.status(404).json({ error: { code: 'UNKNOWN_ACTION', message: 'Unknown action.' } });
    }
  } catch (err) {
    console.error('[duel] action ' + action + ' failed:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

const _authed = withAuth(handler, { rateLimitClass: 'duel' });   /* ADR-033/D1: dedicated 120/hr duel bucket */

module.exports = function (req, res) {
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';
  if (action === 'cron-sweep') return _cronSweep(req, res);   // CRON_SECRET-authed, no user token
  return _authed(req, res);
};
