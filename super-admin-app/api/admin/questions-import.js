const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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
    
    // Process each valid question
    questions.forEach((q) => {
      // Validate schema on the server
      if (!q.topic || !q.difficulty || !q.question || q.answer === undefined) {
        return; // Skip invalid
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

    return res.status(200).json({ success: true, count: totalAdded });
  } catch (error) {
    console.error('[questions-import] POST Error:', error);
    return res.status(500).json({ error: error.message });
  }
});
