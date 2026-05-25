const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  const action = req.query.action || 'list';

  if (action === 'list' && req.method === 'GET') {
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

  if (action === 'list' && req.method === 'POST') {
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

      return res.status(200).json({ success: true, count: totalAdded });
    } catch (error) {
      console.error('[questions-import] POST Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method/Action Not Allowed' });
});
