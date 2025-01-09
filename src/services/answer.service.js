// backend/src/services/analysis/answer.service.js
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class AnswerAnalysisService {
  async analyzeAnswer(question, answer) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert technical interviewer analyzing candidate responses. Provide analysis in JSON format."
          },
          {
            role: "user",
            content: `
              Analyze this technical interview response:
              Question: ${question}
              Answer: ${answer}
              
              Provide analysis in this JSON format:
              {
                "score": number (1-10),
                "clarity": number (1-10),
                "technical_accuracy": number (1-10),
                "strengths": string[],
                "weaknesses": string[],
                "red_flags": string[]
              }
            `
          }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Answer analysis error:', error);
      throw new Error('Failed to analyze answer');
    }
  }
}

export const answerAnalysisService = new AnswerAnalysisService();