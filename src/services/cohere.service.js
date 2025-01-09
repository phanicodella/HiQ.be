import { CohereClient } from 'cohere-ai';

const cohereClient = new CohereClient({ 
  token: process.env.COHERE_API_KEY 
});

const generateInterviewQuestions = async ({ type = 'behavioral', level = 'mid', numberOfQuestions = 8 } = {}) => {
  try {
    console.log('Starting Cohere question generation:', { type, level, numberOfQuestions });

    const prompt = `Generate ${numberOfQuestions} ${type} interview questions for ${level} level software engineers. Format the response as a JSON array. Each question should be formatted exactly like this:
{
  "id": 1,
  "text": "question text here",
  "type": "${type}",
  "category": "category here",
  "hint": "helpful hint here"
}`;

    const response = await cohereClient.generate({
      model: 'command',
      prompt,
      maxTokens: 2000,
      temperature: 0.7,
      k: 0,
      p: 0.75,
      returnLikelihoods: 'NONE'
    });

    const generatedText = response.generations[0]?.text || '';
    console.log('Generated text before cleanup:', generatedText);

    // Extract just the JSON array part
    const startIndex = generatedText.indexOf('[');
    const endIndex = generatedText.lastIndexOf(']') + 1;
    
    if (startIndex === -1 || endIndex <= startIndex) {
      throw new Error('Could not find valid JSON array in response');
    }

    const jsonText = generatedText.substring(startIndex, endIndex)
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Parse JSON with validation
    let questions;
    try {
      questions = JSON.parse(jsonText);
      if (!Array.isArray(questions)) {
        throw new Error('Parsed result is not an array');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error(`Invalid JSON format: ${parseError.message}`);
    }

    // Validate and format questions
    return questions.map((q, index) => ({
      id: index + 1,
      text: String(q.text || '').trim(),
      type: type,
      category: String(q.category || '').trim(),
      hint: String(q.hint || '').trim()
    }));

  } catch (error) {
    console.error('Cohere service error:', error);
    throw error;
  }
};

export const cohereService = {
  generateInterviewQuestions
};