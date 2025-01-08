// backend/src/services/huggingface.service.js
import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config();

const hf = new HfInference(process.env.HUGGINGFACE_API_TOKEN);

// Validate environment and API key setup
function validateSetup() {
  if (!process.env.HUGGINGFACE_API_TOKEN) {
    throw new Error('HUGGINGFACE_API_TOKEN is required');
  }

  // Test API key format
  if (process.env.HUGGINGFACE_API_TOKEN.length < 30) {
    throw new Error('Invalid HUGGINGFACE_API_TOKEN format');
  }
}

/**
 * Generate behavioral interview questions using Mistral model
 */
async function generateInterviewQuestions({ type = 'behavioral', level = 'mid', numberOfQuestions = 8 } = {}) {
  try {
    validateSetup();
    console.log('Generating questions using Mistral:', { type, level, numberOfQuestions });
 
    const prompt = `Return a JSON array of ${numberOfQuestions} ${type} interview questions for ${level}-level engineers. Use exactly this format, with no additional text:
 [
  {
    "id": 1,
    "text": "Question text here", 
    "type": "${type}",
    "category": "Category name",
    "hint": "Hint text here"
  }
 ]`;
 
    const response = await hf.textGeneration({
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      inputs: prompt,
      parameters: {
        max_new_tokens: 2000,
        temperature: 0.7,
        top_p: 0.95,
        return_full_text: false,
        stop: ["\n\n", "</s>"]
      }
    });
 
    console.log('Raw response:', response.generated_text);
 
    let questions;
    try {
      const cleanedText = response.generated_text
        .replace(/^[\s\S]*?\[/, '[')
        .replace(/\][\s\S]*$/, ']')
        .trim();
      
      questions = JSON.parse(cleanedText);
      
      if (!Array.isArray(questions) || !questions.length) {
        throw new Error('Invalid questions format received');
      }
 
      return questions.map((q, index) => ({
        ...q,
        id: index + 1,
        type
      }));
 
    } catch (parseError) {
      console.error('Parse error. Received text:', response.generated_text);
      throw new Error('Failed to generate valid interview questions');
    }
 
  } catch (error) {
    console.error('Question generation error:', error);
    throw error;
  }
 }

export const huggingFaceService = {
  generateInterviewQuestions
};