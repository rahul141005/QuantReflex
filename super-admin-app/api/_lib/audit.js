/**
 * Shared immutable audit logger for the Super Admin Control Center (ADR-012).
 *
 * Every privileged mutation endpoint calls writeAuditLog(...) to append ONE row to
 * the root `auditLogs` collection. The collection is append-only / admin-read-only
 * (Firestore rules deny client create/update/delete; only the Admin SDK writes).
 *
 * This NEVER throws — a logging failure must not fail the underlying admin action.
 */
const admin = require('firebase-admin');

/**
 * @param {FirebaseFirestore.Firestore} db   Admin Firestore instance (caller-provided)
 * @param {object} entry
 * @param {string}  entry.actorUid
 * @param {string} [entry.actorEmail]
 * @param {string}  entry.action       e.g. 'grant_premium_6m', 'delete_coaching'
 * @param {string}  entry.category     'entitlement'|'coaching'|'content'|'ai'|'user'|'system'
 * @param {string} [entry.targetType]  'user'|'coaching'|'question'|'bulk'|...
 * @param {string} [entry.targetId]
 * @param {string} [entry.summary]     human-readable one-liner
 * @param {*}      [entry.before]      prior-state snapshot (optional)
 * @param {*}      [entry.after]       new-state snapshot (optional)
 */
async function writeAuditLog(db, entry) {
  try {
    if (!db || !entry || !entry.action) return;
    var doc = {
      ts: admin.firestore.FieldValue.serverTimestamp(),
      actorUid: entry.actorUid || null,
      actorEmail: entry.actorEmail || null,
      action: entry.action,
      category: entry.category || 'system',
      targetType: entry.targetType || null,
      targetId: entry.targetId || null,
      summary: entry.summary || null
    };
    if (entry.before !== undefined) doc.before = entry.before;
    if (entry.after !== undefined) doc.after = entry.after;
    await db.collection('auditLogs').add(doc);
  } catch (err) {
    console.warn('[audit:writeAuditLog] failed (non-fatal):', err.message);
  }
}

module.exports = { writeAuditLog };
