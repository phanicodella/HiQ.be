import { CohereClient } from 'cohere-ai';

const cohereClient = new CohereClient({ 
  token: process.env.COHERE_API_KEY 
});

async function generateInterviewQuestions({ type = 'behavioral', level = 'mid', numberOfQuestions = 8 } = {}) {
    try {
      console.log('Starting Cohere question generation:', { type, level, numberOfQuestions });
  
      const prompt = `Generate a JSON array of ${numberOfQuestions} ${type} interview questions for ${level} level software engineers.
  Each array element must be an object with this exact structure:
  {
    "id": (number),
    "text": (question text),
    "type": "${type}",
    "category": (relevant category),
    "hint": (helpful hint for answering)
  }
  
  Do not include any explanatory text or code block markers.`;
  
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
      console.log('Generated text:', generatedText);
  
      // Find the first '[' and last ']' to extract just the JSON array
      const startIndex = generatedText.indexOf('[');
      const endIndex = generatedText.lastIndexOf(']') + 1;
      
      if (startIndex === -1 || endIndex === 0) {
        throw new Error('No JSON array found in response');
      }
  
      const jsonText = generatedText.substring(startIndex, endIndex);
      const questions = JSON.parse(jsonText);
  
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Invalid questions format');
      }
  
      return questions.map((q, index) => ({
        ...q,
        id: index + 1,
        type
      }));
  
    } catch (error) {
      console.error('Cohere service error:', error);
      throw new Error(`Failed to generate questions: ${error.message}`);
    }
  }

export const cohereService = {
  generateInterviewQuestions
};