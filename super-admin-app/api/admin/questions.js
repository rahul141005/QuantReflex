const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('questions').orderBy('createdAt', 'desc').limit(100).get();
      const questions = [];
      snapshot.forEach(function (doc) {
        questions.push({ id: doc.id, ...doc.data() });
      });

      return res.status(200).json({ questions: questions });
    } catch (error) {
      console.error('[questions] GET Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { type, topic, difficulty, question, options, answer, explanation, approved, status, premiumOnly } = req.body;
      
      if (!topic || !difficulty || !question || answer === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const payload = {
        type: type || 'word_problem',
        topic: topic,
        difficulty: difficulty,
        question: question,
        options: options || [],
        answer: Number(answer),
        explanation: explanation || '',
        approved: approved !== undefined ? !!approved : true,
        status: status || 'active',
        premiumOnly: !!premiumOnly,
        createdAt: new Date().toISOString()
      };

      const docRef = await db.collection('questions').add(payload);
      return res.status(200).json({ success: true, question: { id: docRef.id, ...payload } });
    } catch (error) {
      console.error('[questions] POST Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
});

