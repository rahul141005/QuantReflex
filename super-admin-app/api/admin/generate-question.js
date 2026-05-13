const { withAdmin } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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

    // Remove markdown code blocks if they exist
    if (content.startsWith('```json')) {
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsedContent = JSON.parse(content);

    // Validate the parsed content
    if (!parsedContent.question || typeof parsedContent.answer !== 'number' || !Array.isArray(parsedContent.options) || !parsedContent.explanation) {
      throw new Error('Generated content did not match the required schema.');
    }

    res.status(200).json(parsedContent);
  } catch (error) {
    console.error('[generate-question] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
