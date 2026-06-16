const { withAdmin, db, admin } = require('../_lib/firebase-admin');
const { writeAuditLog } = require('../_lib/audit');

const _DIFFICULTIES = ['easy', 'medium', 'hard'];
const _STATUSES = ['draft', 'active', 'archived'];

// gpt-4o rates (USD per 1M tokens) for admin question generation. CANONICAL source is
// main-app/services/aiPricing.js — this single named constant mirrors that 'gpt-4o' entry because Vercel apps
// don't share server code cross-app. Keep in sync if OpenAI pricing changes.
const GPT4O_RATES = { in: 2.50, out: 10.00 };

/**
 * Validate + normalize a question body (shared by create + update — Phase 5, ADR-018).
 * `partial=true` (update): only the provided fields are validated/returned.
 * `partial=false` (create): all required fields must be present and defaults applied.
 * Enforces difficulty/status enums and answer∈options integrity (when both are in the
 * resulting field set) so unsolvable questions never reach students.
 * Returns { error: '<message>' } or { fields: {<normalized>} }.
 */
function _normalizeQuestion(body, partial) {
  body = body || {};
  const out = {};
  const has = function (k) { return body[k] !== undefined && body[k] !== null; };

  if (!partial || has('topic')) {
    if (!body.topic || typeof body.topic !== 'string' || !body.topic.trim()) return { error: 'topic is required.' };
    out.topic = String(body.topic).trim().slice(0, 80);
  }
  if (!partial || has('difficulty')) {
    if (_DIFFICULTIES.indexOf(body.difficulty) === -1) return { error: 'difficulty must be easy, medium, or hard.' };
    out.difficulty = body.difficulty;
  }
  if (!partial || has('question')) {
    if (!body.question || typeof body.question !== 'string' || !body.question.trim()) return { error: 'question text is required.' };
    out.question = String(body.question).slice(0, 2000);
  }
  if (!partial || has('answer')) {
    const ans = Number(body.answer);
    if (!isFinite(ans)) return { error: 'answer must be a number.' };
    out.answer = ans;
  }
  if (!partial || has('options')) {
    out.options = Array.isArray(body.options) ? body.options.map(Number).filter(function (n) { return isFinite(n); }) : [];
  }
  if (has('explanation')) out.explanation = String(body.explanation).slice(0, 4000);
  else if (!partial) out.explanation = '';
  if (has('type')) out.type = String(body.type).slice(0, 40);
  else if (!partial) out.type = 'word_problem';
  if (has('status')) {
    if (_STATUSES.indexOf(body.status) === -1) return { error: 'status must be draft, active, or archived.' };
    out.status = body.status;
  } else if (!partial) out.status = 'active';
  if (has('premiumOnly')) out.premiumOnly = !!body.premiumOnly;
  else if (!partial) out.premiumOnly = false;
  if (has('approved')) out.approved = !!body.approved;
  else if (!partial) out.approved = (out.status === 'active');

  /* answer-in-options integrity (only when both are part of THIS write). */
  if (out.options !== undefined && out.options.length > 0 && out.answer !== undefined && out.options.indexOf(out.answer) === -1) {
    return { error: 'answer must be one of the numeric options.' };
  }
  return { fields: out };
}

module.exports = withAdmin(async function (req, res) {
  const action = req.query.action || 'list';

  if (action === 'list' && req.method === 'GET') {
    try {
      /* Newest-first; optional client-supplied topic/status/difficulty filter applied in
         code (avoids a [filter + createdAt] composite index). Bumped 100→500 for Content
         Management (Phase 5, ADR-018); pagination is a future upgrade for very large banks. */
      const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit || '500', 10)));
      const snapshot = await db.collection('questions').orderBy('createdAt', 'desc').limit(limit).get();
      const fTopic = req.query.topic || '';
      const fStatus = req.query.status || '';
      const fDiff = req.query.difficulty || '';
      const questions = [];
      snapshot.forEach(function (doc) {
        const d = doc.data();
        if (fTopic && d.topic !== fTopic) return;
        if (fStatus && (d.status || 'active') !== fStatus) return;
        if (fDiff && d.difficulty !== fDiff) return;
        questions.push({ id: doc.id, ...d });
      });

      return res.status(200).json({ questions: questions });
    } catch (error) {
      console.error('[questions] GET Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (action === 'list' && req.method === 'POST') {
    try {
      const norm = _normalizeQuestion(req.body, false);
      if (norm.error) return res.status(400).json({ error: norm.error });

      const payload = Object.assign({}, norm.fields, { createdAt: new Date().toISOString() });
      const docRef = await db.collection('questions').add(payload);
      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'create_question', category: 'content', targetType: 'question', targetId: docRef.id,
        summary: 'created question (' + payload.topic + ' / ' + payload.difficulty + ')'
      });
      return res.status(200).json({ success: true, question: { id: docRef.id, ...payload } });
    } catch (error) {
      console.error('[questions] POST Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /* ── update (Phase 5, ADR-018) — edit in place by id; fixes the prior bug where editing created a duplicate ── */
  if (action === 'update' && req.method === 'POST') {
    try {
      const id = req.body && req.body.id;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing question id' });
      const norm = _normalizeQuestion(req.body, true);
      if (norm.error) return res.status(400).json({ error: norm.error });
      const ref = db.collection('questions').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Question not found' });
      const before = snap.data();
      /* answer∈options integrity across the MERGE: validate the effective post-update
         pair, since a partial update may change only one of answer/options. */
      const effAnswer = ('answer' in norm.fields) ? norm.fields.answer : before.answer;
      const effOptions = ('options' in norm.fields) ? norm.fields.options : before.options;
      if (Array.isArray(effOptions) && effOptions.length > 0 && typeof effAnswer === 'number' && effOptions.indexOf(effAnswer) === -1) {
        return res.status(400).json({ error: 'answer must be one of the numeric options.' });
      }
      const update = Object.assign({}, norm.fields, { updatedAt: new Date().toISOString() });
      await ref.set(update, { merge: true });
      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'update_question', category: 'content', targetType: 'question', targetId: id,
        summary: 'edited question ' + id,
        before: { topic: before.topic, difficulty: before.difficulty, status: before.status, premiumOnly: before.premiumOnly },
        after: norm.fields
      });
      return res.status(200).json({ success: true, id: id });
    } catch (error) {
      console.error('[questions] UPDATE Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /* ── archive (Phase 5, ADR-018) — soft unpublish (status:'archived'; hidden from students) ── */
  if (action === 'archive' && req.method === 'POST') {
    try {
      const id = req.body && req.body.id;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing question id' });
      const ref = db.collection('questions').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Question not found' });
      await ref.set({ status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'archive_question', category: 'content', targetType: 'question', targetId: id,
        summary: 'archived (unpublished) question ' + id
      });
      return res.status(200).json({ success: true, id: id });
    } catch (error) {
      console.error('[questions] ARCHIVE Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /* ── delete (Phase 5, ADR-018) — hard delete; requires confirm:'DELETE' (destructive-action posture) ── */
  if (action === 'delete' && req.method === 'POST') {
    try {
      const id = req.body && req.body.id;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing question id' });
      if (req.body.confirm !== 'DELETE') return res.status(400).json({ error: { code: 'CONFIRM_REQUIRED', message: 'Pass confirm:"DELETE" to permanently delete a question. Prefer archive for a reversible unpublish.' } });
      const ref = db.collection('questions').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Question not found' });
      const before = snap.data();
      await ref.delete();
      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'delete_question', category: 'content', targetType: 'question', targetId: id,
        summary: 'permanently deleted question ' + id + ' (' + (before.topic || '?') + ' / ' + (before.difficulty || '?') + ')',
        before: { topic: before.topic, difficulty: before.difficulty, status: before.status }
      });
      return res.status(200).json({ success: true, id: id });
    } catch (error) {
      console.error('[questions] DELETE Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (action === 'generate' && req.method === 'POST') {
    try {
      const { topic, difficulty } = req.body;
      if (!topic || !difficulty) {
        return res.status(400).json({ error: 'topic and difficulty are required' });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
      }

      const prompt = `Generate a quantitative aptitude word problem for the topic "${topic}" at a "${difficulty}" difficulty level.
The response must be strictly valid JSON without any markdown formatting, backticks, or extra text.
The JSON object must have exactly these keys:
- "question": (string) The word problem text.
- "answer": (number) The correct numeric answer.
- "options": (array of numbers) An array of exactly 4 numeric options, including the correct answer.
- "explanation": (string) A clear, step-by-step explanation of how to solve the problem.

Example valid output:
{
  "question": "A shopkeeper sells an article at a loss of 10%. Had he sold it for $24 more, he would have gained 10%. Find the cost price of the article.",
  "answer": 120,
  "options": [100, 110, 120, 130],
  "explanation": "Let CP be x.\\nLoss = 10%, SP1 = 0.9x\\nGain = 10%, SP2 = 1.1x\\nDifference = 1.1x - 0.9x = 0.2x\\n0.2x = 24 => x = 120."
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      let content = data.choices[0].message.content.trim();

      if (content.startsWith('```json')) {
        content = content.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (content.startsWith('```')) {
        content = content.replace(/^```/, '').replace(/```$/, '').trim();
      }

      const parsedContent = JSON.parse(content);

      if (!parsedContent.question || typeof parsedContent.answer !== 'number' || !Array.isArray(parsedContent.options) || !parsedContent.explanation) {
        throw new Error('Generated content did not match the required schema.');
      }

      // GPT cost telemetry — admin question generation uses gpt-4o. Rates mirror main-app/services/aiPricing.js
      // (the canonical pricing source); this is the one cross-app spot that can't import it. Writes the SAME
      // ai_daily_{date} shape as recordAiRequest (top-level totals + nested byFeature/byModel) so the AI Command
      // Center's feature/model breakdown includes admin generation.
      try {
        if (data.usage) {
          const inc = admin.firestore.FieldValue.increment;
          const inT = data.usage.prompt_tokens || 0;
          const outT = data.usage.completion_tokens || 0;
          const cost = (inT / 1000000) * GPT4O_RATES.in + (outT / 1000000) * GPT4O_RATES.out;   // gpt-4o
          const dayKey = new Date().toISOString().split('T')[0];
          const byFeature = { admin_questiongen: { requests: inc(1), inTok: inc(inT), outTok: inc(outT), costUSD: inc(cost), errors: inc(0), cacheHits: inc(0), latSumMs: inc(0), latCount: inc(0) } };
          const byModel = { 'gpt-4o': { requests: inc(1), inTok: inc(inT), outTok: inc(outT), costUSD: inc(cost) } };
          await db.collection('systemMetrics').doc('ai_daily_' + dayKey).set({
            totalTokensInput: inc(inT), totalTokensOutput: inc(outT), estimatedCostUSD: inc(cost), gptCalls: inc(1),
            requests: inc(1), byFeature: byFeature, byModel: byModel,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (e) { console.warn('[questions:generate] cost telemetry failed:', e.message); }

      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'generate_question', category: 'ai', targetType: 'question', targetId: null,
        summary: 'AI-generated a ' + difficulty + ' question for "' + topic + '"'
      });

      return res.status(200).json(parsedContent);
    } catch (error) {
      console.error('[generate-question] Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (action === 'import' && req.method === 'POST') {
    try {
      const questions = req.body.questions;
      
      if (!Array.isArray(questions)) {
        return res.status(400).json({ error: 'Payload must contain an array of questions' });
      }

      if (questions.length === 0) {
        return res.status(400).json({ error: 'Array is empty' });
      }

      if (questions.length > 500) {
        return res.status(400).json({ error: 'Cannot upload more than 500 questions in one batch' });
      }

      let batch = db.batch();
      let totalAdded = 0;
      
      questions.forEach((q) => {
        if (!q.topic || !q.difficulty || !q.question || q.answer === undefined) {
          return; 
        }
        
        const payload = {
          type: q.type || 'word_problem',
          topic: String(q.topic),
          difficulty: String(q.difficulty),
          question: String(q.question),
          options: Array.isArray(q.options) ? q.options : [],
          answer: Number(q.answer),
          explanation: q.explanation ? String(q.explanation) : '',
          approved: q.approved !== undefined ? !!q.approved : true,
          status: q.status || 'active',
          premiumOnly: !!q.premiumOnly,
          createdAt: new Date().toISOString()
        };

        const docRef = db.collection('questions').doc();
        batch.set(docRef, payload);
        totalAdded++;
      });

      if (totalAdded === 0) {
        return res.status(400).json({ error: 'No valid questions found in the array to upload.' });
      }

      await batch.commit();

      await writeAuditLog(db, {
        actorUid: req.userId, actorEmail: req.adminEmail,
        action: 'import_questions', category: 'content', targetType: 'bulk', targetId: null,
        summary: 'imported ' + totalAdded + ' questions'
      });

      return res.status(200).json({ success: true, count: totalAdded });
    } catch (error) {
      console.error('[questions-import] POST Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method/Action Not Allowed' });
});
