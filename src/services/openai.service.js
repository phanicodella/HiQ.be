/* 
 * backend/src/services/openai.service.js
 * Handles all OpenAI API interactions for interviews
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/* 
 * Initialize OpenAI client
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* 
 * Generate interview questions based on job role
 */
export async function generateQuestions(jobRole) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        role: "system",
        content: "You are an AI interviewer. Generate 5 relevant technical questions for the given job role. Format as JSON array."
      }, {
        role: "user",
        content: `Generate interview questions for ${jobRole} position`
      }],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    return JSON.parse(response.choices[0].message.content).questions;
  } catch (error) {
    console.error('OpenAI Question Generation Error:', error);
    throw new Error('Failed to generate interview questions');
  }
}

/* 
 * Analyze candidate's response
 */
export async function analyzeResponse(question, response, jobRole) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        role: "system",
        content: "You are an AI interviewer. Analyze the candidate's response and provide feedback. Format as JSON with 'score' (0-10) and 'feedback' fields."
      }, {
        role: "user",
        content: `Question: ${question}\nResponse: ${response}\nJob Role: ${jobRole}`
      }],
      response_format: { type: "json_object" },
      temperature: 0.5
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('OpenAI Response Analysis Error:', error);
    throw new Error('Failed to analyze response');
  }
}

/* 
 * Generate overall interview feedback
 */
export async function generateFeedback(responses, jobRole) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        role: "system",
        content: "Generate comprehensive interview feedback based on all responses. Include strengths, areas for improvement, and hiring recommendation."
      }, {
        role: "user",
        content: `Job Role: ${jobRole}\nResponses: ${JSON.stringify(responses)}`
      }],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('OpenAI Feedback Generation Error:', error);
    throw new Error('Failed to generate interview feedback');
  }
}

/* 
 * Export all functions as an object for cleaner imports
 */
export const openAIService = {
  generateQuestions,
  analyzeResponse,
  generateFeedback
};