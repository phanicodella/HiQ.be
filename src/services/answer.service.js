// backend/src/services/answer.service.js
import { CohereClient } from 'cohere-ai';
import dotenv from 'dotenv';

dotenv.config();

const cohereClient = new CohereClient({ 
  token: process.env.COHERE_API_KEY 
});

class AnswerAnalysisService {
  async analyzeAnswer(question, answer) {
    try {
      const response = await cohereClient.generate({
        model: 'command',
        prompt: `Analyze this technical interview response:
Question: ${question}
Answer: ${answer}

Provide analysis in this JSON format:
{
  "score": number between 1-10,
  "clarity": number between 1-10,
  "technical_accuracy": number between 1-10,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "red_flags": ["flag1", "flag2"]
}`,
        maxTokens: 500,
        temperature: 0.7,
        k: 0,
        p: 0.75
      });

      // Extract JSON from response
      const generatedText = response.generations[0]?.text || '';
      const startIndex = generatedText.indexOf('{');
      const endIndex = generatedText.lastIndexOf('}') + 1;
      
      if (startIndex === -1 || endIndex <= startIndex) {
        throw new Error('Invalid analysis format received');
      }

      const jsonText = generatedText.substring(startIndex, endIndex);
      return JSON.parse(jsonText);

    } catch (error) {
      console.error('Answer analysis error:', error);
      throw new Error('Failed to analyze answer');
    }
  }
}

export const answerAnalysisService = new AnswerAnalysisService();