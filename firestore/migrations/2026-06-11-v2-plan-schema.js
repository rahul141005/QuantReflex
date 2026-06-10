/**
 * Migration: v2 plan-schema (remove lifetime + Premium+, collapse to one Premium tier)
 * Date: 2026-06-11
 *
 * WHY:
 *   QuantReflex v2 monetization replaces the dual-tier model (lifetime `isPremium`
 *   + time-limited `isPremiumPlus`) with a single canonical `plan` field. There are
 *   ZERO production users, so this is a pre-launch schema normalization (NOT a
 *   grandfathering migration) — it cleans up any test/dev docs to match v2 so the
 *   live DB is consistent. New signups already write v2 via /api/auth/register.
 *
 * MAPPING (per user doc):
 *   active isPremiumPlus (premiumPlusExpiry > now)  → plan:'premium', planType from
 *       premiumPlusPlan (plus_6month→premium_6m, plus_yearly→premium_12m),
 *       planExpiry=premiumPlusExpiry, planSource:'purchase'
 *   active trial (isTrial && trialEnd > now)        → plan:'premium', planType:null,
 *       planExpiry=trialEnd, planSource:'trial', isTrial:true
 *   everything else (incl. old lifetime isPremium)  → plan:'free' (lifetime removed)
 *   Removed fields are deleted: isPremium, hasPaid, isEarlyUser, isPremiumPlus,
 *       premiumPlusPlan, premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId, trialDays
 *
 * SAFETY:
 *   - Dry-run by default. Pass `--apply` to write.
 *   - Idempotent: a doc already in v2 shape with no legacy fields is skipped.
 *   - Batched (≤200 docs/commit).
 *
 * USAGE (credentials via either env var):
 *   FIREBASE_SERVICE_ACCOUNT='<json>'  node 2026-06-11-v2-plan-schema.js          # dry run
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json node 2026-06-11-v2-plan-schema.js --apply
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ projectId: 'quant-reflex-trainer' });
  } else {
    console.error('No credentials. Set FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS (path).');
    process.exit(1);
  }
}

const db = admin.firestore();
const DEL = admin.firestore.FieldValue.delete;
const APPLY = process.argv.includes('--apply');
const PAGE = 500;
const MAX_BATCH = 200;
const LEGACY_FIELDS = ['isPremium', 'hasPaid', 'isEarlyUser', 'isPremiumPlus', 'premiumPlusPlan', 'premiumPlusExpiry', 'premiumPlusStatus', 'lastPremiumPlusPaymentId', 'trialDays'];
const PLAN_MAP = { plus_6month: 'premium_6m', plus_yearly: 'premium_12m', '6_months': 'premium_6m', yearly: 'premium_12m' };

function _ms(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const p = Date.parse(v); return isNaN(p) ? 0 : p; }
  if (v.toMillis) { try { return v.toMillis(); } catch (_) { return 0; } }
  if (v.toDate) { try { return v.toDate().getTime(); } catch (_) { return 0; } }
  return 0;
}
function _iso(v) {
  const ms = _ms(v);
  return ms ? new Date(ms).toISOString() : null;
}

function _hasLegacyFields(d) {
  for (const f of LEGACY_FIELDS) if (Object.prototype.hasOwnProperty.call(d, f)) return true;
  return false;
}

/* A doc is already migrated (idempotency) when it carries a valid v2 `plan`
   and none of the removed v1 fields. Such docs must be left untouched — the
   v1-derivation below cannot reconstruct premium from absent v1 fields. */
function _isAlreadyV2(d) {
  return (d.plan === 'free' || d.plan === 'premium') && !_hasLegacyFields(d);
}

function _targetState(d, now) {
  /* Active Premium+ → premium (purchase) */
  if (d.isPremiumPlus === true && _ms(d.premiumPlusExpiry) > now) {
    return { plan: 'premium', planType: PLAN_MAP[d.premiumPlusPlan] || 'premium_6m', planExpiry: _iso(d.premiumPlusExpiry), planSource: 'purchase', isTrial: false, trialEnd: null };
  }
  /* Active trial → premium (trial) */
  if (d.isTrial === true && _ms(d.trialEnd) > now) {
    return { plan: 'premium', planType: null, planExpiry: _iso(d.trialEnd), planSource: 'trial', isTrial: true, trialEnd: _iso(d.trialEnd) };
  }
  /* Everything else (incl. removed lifetime) → free */
  return { plan: 'free', planType: null, planExpiry: null, planSource: null, isTrial: false, trialEnd: null };
}

function _needsWork(d, target) {
  /* Idempotent: already-migrated docs are never touched (prevents reverting a
     valid v2 premium back to free on a re-run). */
  if (_isAlreadyV2(d)) return false;
  if (d.plan !== target.plan || (d.planType || null) !== target.planType || (d.planExpiry || null) !== target.planExpiry) return true;
  return _hasLegacyFields(d);
}

(async function run() {
  const now = Date.now();
  let lastDoc = null, scanned = 0, changed = 0, batch = db.batch(), inBatch = 0;
  const sample = [];

  /* eslint-disable no-constant-condition */
  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const d = doc.data();
      const target = _targetState(d, now);
      if (!_needsWork(d, target)) continue;
      changed++;
      if (sample.length < 40) sample.push(doc.id + ': → plan=' + target.plan + (target.planType ? '/' + target.planType : '') + (target.isTrial ? ' (trial)' : ''));
      if (APPLY) {
        const update = Object.assign({}, target, { planUpdatedAt: new Date().toISOString() });
        LEGACY_FIELDS.forEach((f) => { if (Object.prototype.hasOwnProperty.call(d, f)) update[f] = DEL(); });
        batch.update(doc.ref, update);
        if (++inBatch >= MAX_BATCH) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(`[v2-plan-schema] scanned=${scanned} changed=${changed} ` + (APPLY ? '(applied)' : '(dry run — re-run with --apply to write)'));
  sample.forEach((l) => console.log('  ' + l));
  if (changed > sample.length) console.log(`  …and ${changed - sample.length} more`);
})().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
