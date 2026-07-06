/**
 * Reports triage API (ADR-096) — Super-Admin Reports section. withAdminAuth; the Reports dashboard is the
 * SOURCE OF TRUTH for every user-submitted report (no email / external notification exists).
 *
 *   GET  ?action=list         → cursor-paginated list (server filters: status, type, priority; page-local text search)
 *   GET  ?action=details      → one report + questionReports aggregate + related-by-signature + auditLogs
 *   GET  ?action=analytics    → dashboard aggregates (status/priority/type counts, today/week, oldest-open, top questions)
 *   POST ?action=update-status→ change lifecycle.status (maintains questionReports.openCount)
 *   POST ?action=assign       → assign/unassign (assignTo:'me'|uid|null)
 *   POST ?action=priority     → set classification.priority
 *   POST ?action=label        → add/remove a triage label (op:'add'|'remove')
 *   POST ?action=note         → append an admin-only internal note
 *   POST ?action=merge-duplicate → mark duplicate of another report (confirm required)
 *
 * Every mutation appends an auditLogs row (category:'report'). Client access to reports/questionReports is
 * all-deny in firestore.rules — this Admin-SDK endpoint is the only reader/writer. No reply-to-reporter in v1.
 */
const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

/* Enums — inline copy (LOCKSTEP with shared/constants/report-types.js; the super-admin Vercel bundle can't
   require ../shared). Used only to validate admin mutations. */
var STATUSES = ['open', 'investigating', 'needs_info', 'resolved', 'dismissed', 'duplicate', 'archived'];
var OPEN_STATUSES = ['open', 'investigating', 'needs_info'];
var PRIORITIES = ['critical', 'high', 'medium', 'low'];
var CLOSED_ON = { resolved: true, dismissed: true };   /* statuses that stamp resolvedAt/resolvedBy */
var LABEL_MAX = 40, LABELS_MAX = 12, NOTE_MAX = 2000;

function _isOpen(s) { return OPEN_STATUSES.indexOf(s) !== -1; }

function _safeTS(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') { try { return val.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof val === 'string') { var d = new Date(val); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if (val instanceof Date) { return isNaN(val.getTime()) ? null : val.toISOString(); }
  if (typeof val === 'number' && isFinite(val)) { return new Date(val < 1e12 ? val * 1000 : val).toISOString(); }
  if (typeof val === 'object' && val._seconds != null) { try { return new Date(val._seconds * 1000).toISOString(); } catch (_) { return null; } }
  return null;
}

function _safeDocId(sig) { return String(sig).replace(/\//g, '_').slice(0, 300); }

/* Shape one report doc for the list (compact) or detail (full). */
function _shapeRow(doc, full) {
  var d = doc.data() || {};
  var cls = d.classification || {}, life = d.lifecycle || {}, rep = d.reporter || {};
  var row = {
    id: doc.id,
    shortId: d.shortId || null,
    type: cls.type || null,
    subReason: cls.subReason || null,
    title: cls.title || null,
    priority: cls.priority || 'medium',
    status: life.status || 'open',
    assignedTo: life.assignedTo || null,
    assignedToEmail: life.assignedToEmail || null,
    reporterEmail: rep.email || null,
    reporterPlan: rep.plan || 'free',
    questionSignature: d.questionSignature || null,
    source: (d.context && d.context.app && d.context.app.source) || null,
    createdAt: _safeTS(d.createdAt) || _safeTS(d.createdAtMs),
    createdAtMs: typeof d.createdAtMs === 'number' ? d.createdAtMs : 0,
    updatedAt: _safeTS(d.updatedAt)
  };
  if (full) {
    row.description = cls.description || null;
    row.fields = cls.fields || {};
    row.reporter = { uid: rep.uid || null, email: rep.email || null, name: rep.name || null, plan: rep.plan || 'free', coachingId: rep.coachingId || null };
    row.lifecycle = {
      status: life.status || 'open', assignedTo: life.assignedTo || null, assignedToEmail: life.assignedToEmail || null,
      resolvedAt: _safeTS(life.resolvedAt), resolvedBy: life.resolvedBy || null, duplicateOf: life.duplicateOf || null,
      labels: Array.isArray(life.labels) ? life.labels : [],
      internalNotes: (Array.isArray(life.internalNotes) ? life.internalNotes : []).map(function (n) {
        return { by: n.by || null, email: n.email || null, text: n.text || '', at: _safeTS(n.at) };
      })
    };
    row.context = d.context || {};
    row.question = d.question || null;
    row.ai = d.ai || null;   // ADR-097: AI explanation metadata (explanation text + model + promptId)
  }
  return row;
}

async function handler(req, res) {
  const db = admin.firestore();
  const action = req.query.action || 'list';

  try {
    /* ── list ── */
    if (action === 'list' && req.method === 'GET') {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '40', 10)));
      const status = req.query.status && STATUSES.indexOf(req.query.status) !== -1 ? req.query.status : null;
      const type = req.query.type || null;
      const priority = req.query.priority && PRIORITIES.indexOf(req.query.priority) !== -1 ? req.query.priority : null;
      const search = (req.query.q || '').toString().trim().toLowerCase();

      let query = db.collection('reports');
      /* Apply the most-selective indexed equality filter. status+priority has a dedicated composite; otherwise
         a single equality + createdAtMs order. Extra filters (and text search) refine the page in memory. */
      if (status) query = query.where('lifecycle.status', '==', status);
      else if (type) query = query.where('classification.type', '==', type);
      else if (priority) query = query.where('classification.priority', '==', priority);
      if (status && priority) query = query.where('classification.priority', '==', priority);
      query = query.orderBy('createdAtMs', 'desc');

      /* Over-fetch a little when we'll refine in memory (type/priority not used as the primary filter, or search). */
      const needsMemFilter = !!search || (!!type && !!status) || (!!priority && !status && !!type);
      const fetchN = needsMemFilter ? Math.min(200, limit * 4) : limit;

      if (req.query.startAfter) {
        const cur = await db.collection('reports').doc(req.query.startAfter).get();
        if (cur.exists) query = query.startAfter(cur);
      }
      const snap = await query.limit(fetchN).get();
      const fetchedFullWindow = snap.docs.length >= fetchN;   // more docs may exist beyond this window
      const lastFetchedId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : null;

      /* in-memory refinement (type as a secondary filter + text search; status/priority handled by the query) */
      let matched = [];
      snap.forEach(function (doc) { matched.push(_shapeRow(doc, false)); });
      if (type && status) matched = matched.filter(function (r) { return r.type === type; });
      if (priority && type && !status) matched = matched.filter(function (r) { return r.priority === priority; });
      if (search) {
        matched = matched.filter(function (r) {
          return (r.shortId && r.shortId.toLowerCase().indexOf(search) !== -1) ||
                 (r.title && r.title.toLowerCase().indexOf(search) !== -1) ||
                 (r.reporterEmail && r.reporterEmail.toLowerCase().indexOf(search) !== -1) ||
                 (r.type && r.type.toLowerCase().indexOf(search) !== -1);
        });
      }

      const shown = matched.slice(0, limit);
      /* There is more to load if the query window was full (more docs beyond it) OR we truncated extra matches
         from this window. CURSOR = the last DISPLAYED row's id so "Load more" resumes immediately after it and
         re-scans everything past it — this is lossless (the old bug set the cursor to the last *fetched* doc,
         which skipped matches that sat between the shown page and the window end). If a full window yielded zero
         shown rows (all filtered out), advance from the last fetched doc so scanning continues instead of dead-ending. */
      const hasMore = fetchedFullWindow || matched.length > limit;
      const nextCursor = hasMore ? (shown.length ? shown[shown.length - 1].id : lastFetchedId) : null;

      return res.status(200).json({
        reports: shown,
        nextCursor: nextCursor,
        pageLocalSearch: needsMemFilter   // flag so the UI can note search matches are within loaded pages
      });
    }

    /* ── details ── */
    if (action === 'details' && req.method === 'GET') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Report id is required.' } });
      const doc = await db.collection('reports').doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } });
      const report = _shapeRow(doc, true);

      /* questionReports aggregate + related reports for the same signature ("reported N times"). */
      let aggregate = null, related = [];
      const sig = report.questionSignature;
      if (sig) {
        try {
          const aggSnap = await db.collection('questionReports').doc(_safeDocId(sig)).get();
          if (aggSnap.exists) {
            const a = aggSnap.data() || {};
            aggregate = {
              signature: a.signature || sig, count: a.count || 0, openCount: a.openCount || 0,
              firstAtMs: a.firstAtMs || null, lastAtMs: a.lastAtMs || null,
              category: a.category || null, subtype: a.subtype || null, topReasons: a.topReasons || {}
            };
          }
        } catch (_) {}
        try {
          const relSnap = await db.collection('reports').where('questionSignature', '==', sig).orderBy('createdAtMs', 'desc').limit(20).get();
          relSnap.forEach(function (r) { if (r.id !== id) related.push(_shapeRow(r, false)); });
        } catch (_) {}
      }

      /* audit history for this report */
      let history = [];
      try {
        const hSnap = await db.collection('auditLogs').where('targetId', '==', id).orderBy('ts', 'desc').limit(40).get();
        hSnap.forEach(function (h) { const hd = h.data(); history.push({ id: h.id, action: hd.action || 'unknown', actor: hd.actorEmail || hd.actorUid || 'System', summary: hd.summary || null, timestamp: _safeTS(hd.ts) }); });
      } catch (_) {}

      return res.status(200).json({ report: report, aggregate: aggregate, related: related, history: history });
    }

    /* ── analytics ── */
    if (action === 'analytics' && req.method === 'GET') {
      const out = { byStatus: {}, byPriority: {}, openTotal: 0, today: 0, week: 0, topQuestions: [], oldestOpenMs: null };
      const now = Date.now();

      async function _count(q) { try { return (await q.count().get()).data().count; } catch (_) { return null; } }

      /* status counts (count() aggregation — O(1), scales to thousands) */
      for (let i = 0; i < STATUSES.length; i++) {
        out.byStatus[STATUSES[i]] = await _count(db.collection('reports').where('lifecycle.status', '==', STATUSES[i]));
      }
      for (let p = 0; p < PRIORITIES.length; p++) {
        out.byPriority[PRIORITIES[p]] = await _count(db.collection('reports').where('classification.priority', '==', PRIORITIES[p]));
      }
      out.openTotal = OPEN_STATUSES.reduce(function (s, st) { return s + (out.byStatus[st] || 0); }, 0);
      out.today = await _count(db.collection('reports').where('createdAtMs', '>=', now - 24 * 60 * 60 * 1000));
      out.week = await _count(db.collection('reports').where('createdAtMs', '>=', now - 7 * 24 * 60 * 60 * 1000));

      /* oldest open report age (single doc read) */
      try {
        const oSnap = await db.collection('reports').where('lifecycle.status', '==', 'open').orderBy('createdAtMs', 'asc').limit(1).get();
        if (!oSnap.empty) { const od = oSnap.docs[0].data(); out.oldestOpenMs = typeof od.createdAtMs === 'number' ? (now - od.createdAtMs) : null; }
      } catch (_) {}

      /* top reported questions */
      try {
        const tSnap = await db.collection('questionReports').orderBy('count', 'desc').limit(10).get();
        tSnap.forEach(function (q) {
          const qd = q.data() || {};
          out.topQuestions.push({ signature: qd.signature || q.id, count: qd.count || 0, openCount: qd.openCount || 0, category: qd.category || null, subtype: qd.subtype || null, sampleReportId: qd.sampleReportId || null, lastAtMs: qd.lastAtMs || null });
        });
      } catch (_) {}

      return res.status(200).json(out);
    }

    /* ── all mutations below require POST ── */
    if (req.method !== 'POST') return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } });
    const body = parseBody(req);
    const id = body.id;
    if (!id) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Report id is required.' } });
    const ref = db.collection('reports').doc(id);

    /* Shared: apply an openCount delta to the questionReports aggregate when a report's open-ness flips. */
    async function _adjustOpenCount(sig, delta) {
      if (!sig || !delta) return;
      try { await db.collection('questionReports').doc(_safeDocId(sig)).update({ openCount: admin.firestore.FieldValue.increment(delta) }); } catch (_) {}
    }

    /* ── update-status ── */
    if (action === 'update-status') {
      const status = body.status;
      if (STATUSES.indexOf(status) === -1) return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Unknown status.' } });
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } });
      const d = snap.data() || {};
      const before = (d.lifecycle && d.lifecycle.status) || 'open';
      const sig = d.questionSignature || null;
      const nowIso = new Date().toISOString();

      const upd = { 'lifecycle.status': status, updatedAt: nowIso, updatedAtMs: Date.now() };
      if (CLOSED_ON[status]) { upd['lifecycle.resolvedAt'] = nowIso; upd['lifecycle.resolvedBy'] = req.adminUid; }
      else if (before !== status) { upd['lifecycle.resolvedAt'] = null; upd['lifecycle.resolvedBy'] = null; }
      await ref.update(upd);

      /* openCount: open→closed = -1, closed→open = +1 */
      const wasOpen = _isOpen(before), nowOpen = _isOpen(status);
      if (wasOpen && !nowOpen) await _adjustOpenCount(sig, -1);
      else if (!wasOpen && nowOpen) await _adjustOpenCount(sig, 1);

      await writeAuditLog(db, { actorUid: req.adminUid, actorEmail: req.adminEmail, action: 'report_status_' + status, category: 'report', targetType: 'report', targetId: id, summary: 'report ' + (d.shortId || id) + ' status ' + before + ' → ' + status, before: { status: before }, after: { status: status } });
      return res.status(200).json({ success: true, id: id, status: status });
    }

    /* ── assign ── */
    if (action === 'assign') {
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } });
      let assignTo = body.assignTo, assignEmail = body.assignToEmail || null;
      if (assignTo === 'me') { assignTo = req.adminUid; assignEmail = req.adminEmail; }
      if (assignTo === '' ) assignTo = null;
      await ref.update({ 'lifecycle.assignedTo': assignTo || null, 'lifecycle.assignedToEmail': assignTo ? assignEmail : null, updatedAt: new Date().toISOString(), updatedAtMs: Date.now() });
      await writeAuditLog(db, { actorUid: req.adminUid, actorEmail: req.adminEmail, action: assignTo ? 'report_assign' : 'report_unassign', category: 'report', targetType: 'report', targetId: id, summary: assignTo ? ('assigned report to ' + (assignEmail || assignTo)) : 'unassigned report', after: { assignedTo: assignTo || null } });
      return res.status(200).json({ success: true, id: id, assignedTo: assignTo || null, assignedToEmail: assignTo ? assignEmail : null });
    }

    /* ── priority ── */
    if (action === 'priority') {
      const priority = body.priority;
      if (PRIORITIES.indexOf(priority) === -1) return res.status(400).json({ error: { code: 'INVALID_PRIORITY', message: 'Unknown priority.' } });
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } });
      const before = (snap.data().classification && snap.data().classification.priority) || 'medium';
      await ref.update({ 'classification.priority': priority, updatedAt: new Date().toISOString(), updatedAtMs: Date.now() });
      await writeAuditLog(db, { actorUid: req.adminUid, actorEmail: req.adminEmail, action: 'report_priority', category: 'report', targetType: 'report', targetId: id, summary: 'priority ' + before + ' → ' + priority, before: { priority: before }, after: { priority: priority } });
      return res.status(200).json({ success: true, id: id, priority: priority });
    }

    /* ── label ── */
    if (action === 'label') {
      const label = (body.label || '').toString().trim().slice(0, LABEL_MAX);
      const op = body.op === 'remove' ? 'remove' : 'add';
      if (!label) return res.status(400).json({ error: { code: 'INVALID_LABEL', message: 'Label text required.' } });
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } });
      let labels = (snap.data().lifecycle && snap.data().lifecycle.labels) || [];
      if (op === 'add') { if (labels.indexOf(label) === -1) { if (labels.length >= LABELS_MAX) return res.status(400).json({ error: { code: 'TOO_MANY_LABELS', message: 'Label limit reached.' } }); labels = labels.concat([label]); } }
      else { labels = labels.filter(function (l) { return l !== label; }); }
      await ref.update({ 'lifecycle.labels': labels, updatedAt: new Date().toISOString(), updatedAtMs: Date.now() });
      await writeAuditLog(db, { actorUid: req.adminUid, actorEmail: req.adminEmail, action: 'report_label_' + op, category: 'report', targetType: 'report', targetId: id, summary: op + ' label "' + label + '"', after: { labels: labels } });
      return res.status(200).json({ success: true, id: id, labels: labels });
    }

    /* ── note ── */
    if (action === 'note') {
      const text = (body.text || '').toString().trim().slice(0, NOTE_MAX);
      if (!text) return res.status(400).json({ error: { code: 'INVALID_NOTE', message: 'Note text required.' } });
      const note = { by: req.adminUid, email: req.adminEmail || null, text: text, at: new Date().toISOString() };
      await ref.update({ 'lifecycle.internalNotes': admin.firestore.FieldValue.arrayUnion(note), updatedAt: new Date().toISOString(), updatedAtMs: Date.now() });
      await writeAuditLog(db, { actorUid: req.adminUid, actorEmail: req.adminEmail, action: 'report_note', category: 'report', targetType: 'report', targetId: id, summary: 'added an internal note' });
      return res.status(200).json({ success: true, id: id, note: note });
    }

    /* ── merge-duplicate ── */
    if (action === 'merge-duplicate') {
      const dupOf = body.duplicateOf;
      if (!dupOf || dupOf === id) return res.status(400).json({ error: { code: 'INVALID_TARGET', message: 'A different target report id is required.' } });
      if (body.confirm !== 'MERGE') return res.status(400).json({ error: { code: 'CONFIRM_REQUIRED', message: 'Pass confirm:"MERGE" to merge this report.' } });
      const [snap, tgt] = await Promise.all([ref.get(), db.collection('reports').doc(dupOf).get()]);
      if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } });
      if (!tgt.exists) return res.status(404).json({ error: { code: 'TARGET_NOT_FOUND', message: 'Target report not found.' } });
      const d = snap.data() || {};
      const before = (d.lifecycle && d.lifecycle.status) || 'open';
      const sig = d.questionSignature || null;
      await ref.update({ 'lifecycle.status': 'duplicate', 'lifecycle.duplicateOf': dupOf, updatedAt: new Date().toISOString(), updatedAtMs: Date.now() });
      if (_isOpen(before)) await _adjustOpenCount(sig, -1);
      await writeAuditLog(db, { actorUid: req.adminUid, actorEmail: req.adminEmail, action: 'report_merge_duplicate', category: 'report', targetType: 'report', targetId: id, summary: 'merged report ' + (d.shortId || id) + ' as duplicate of ' + dupOf, before: { status: before }, after: { status: 'duplicate', duplicateOf: dupOf } });
      return res.status(200).json({ success: true, id: id, duplicateOf: dupOf });
    }

    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown report action: ' + action } });
  } catch (err) {
    console.error('[Reports API] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
