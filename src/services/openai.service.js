// backend/src/services/openai.service.js
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate behavioral interview questions
 * @param {Object} params - Question generation parameters
 * @param {string} params.level - Candidate level (e.g., junior, senior, expert)
 * @param {string} params.type - Interview type (e.g., behavioral, technical)
 * @param {number} params.numberOfQuestions - Number of questions to generate
 * @returns {Promise<Array>} Array of generated questions
 */
async function generateInterviewQuestions({ type = 'behavioral', level = 'mid', numberOfQuestions = 8 } = {}) {
  console.log('OpenAI Service - Starting question generation with:', { type, level, numberOfQuestions });
  console.log('OpenAI API Key length:', process.env.OPENAI_API_KEY?.length || 0);
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is missing');
    }
    const prompt = `Generate ${numberOfQuestions} unique interview questions...; - Type: ${type} interview
    - Level: ${level} level candidate
    - Format: Questions should be open-ended and encourage detailed responses
    
    Return the questions as a JSON array with this format:
    [
      {
        "id": 1,
        "text": "question text",
        "category": "question category",
        "hint": "helpful hint for answering"
      }
    ]`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert HR interviewer specializing in generating interview questions."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const parsedResponse = JSON.parse(response.choices[0].message.content);

    if (!Array.isArray(parsedResponse)) {
      throw new Error('Invalid response format from OpenAI');
    }

    return parsedResponse;
  } catch (error) {
    console.error('OpenAI question generation error:', error);
    console.log('Falling back to HuggingFace service...');
    const { huggingFaceService } = await import('./huggingface.service.js');
    return huggingFaceService.generateInterviewQuestions({ type, level, numberOfQuestions });

  }
}

/**
 * Analyze candidate's response
 * @param {string} question - The interview question
 * @param {string} response - Candidate's response
 * @returns {Promise<Object>} Analysis of the response
 */
async function analyzeResponse(question, response) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert interviewer analyzing behavioral interview responses."
        },
        {
          role: "user",
          content: `
Question: ${question}
Response: ${response}

Analyze the response considering:
1. Completeness and relevance
2. Structure (STAR method usage)
3. Specific examples provided
4. Communication clarity
5. Key behavioral indicators

Provide a JSON response with:
{
  "score": number (1-10),
  "strengths": ["strength1", "strength2"],
  "areas_for_improvement": ["area1", "area2"],
  "behavioral_indicators": ["indicator1", "indicator2"],
  "follow_up_recommended": boolean,
  "follow_up_questions": ["question1", "question2"]
}`
        }
      ],
      temperature: 0.5
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Response analysis error:', error);
    throw new Error('Failed to analyze response');
  }
}

export const openAIService = {
  generateInterviewQuestions,
  analyzeResponse
};
