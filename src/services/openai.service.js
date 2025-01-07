// backend/src/services/openai.service.js
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Behavioral question categories
const QUESTION_CATEGORIES = {
  leadership: {
    focus: 'Leadership experience and team management',
    weight: 0.2
  },
  problemSolving: {
    focus: 'Problem-solving abilities and decision making',
    weight: 0.2
  },
  communication: {
    focus: 'Communication skills and team collaboration',
    weight: 0.2
  },
  achievement: {
    focus: 'Past achievements and project success stories',
    weight: 0.15
  },
  challenges: {
    focus: 'Handling challenges and difficult situations',
    weight: 0.15
  },
  growth: {
    focus: 'Learning, adaptability, and career growth',
    weight: 0.1
  }
};

/**
 * Generate behavioral interview questions
 * @param {Object} params - Question generation parameters
 * @returns {Promise<Array>} Array of generated questions
 */
async function generateBehavioralQuestions({ numberOfQuestions = 8 } = {}) {
  try {
    const prompt = `Generate ${numberOfQuestions} unique behavioral interview questions. 

Requirements:
1. Questions should cover these categories with their approximate weights:
${Object.entries(QUESTION_CATEGORIES)
  .map(([category, { focus, weight }]) => 
    `- ${category} (${weight * 100}%): ${focus}`)
  .join('\n')}

2. Each question should:
   - Be open-ended
   - Encourage detailed responses
   - Focus on past experiences
   - Not be leading or biased

3. Format each question as a JSON object:
{
  "id": number,
  "text": "question text",
  "category": "category name",
  "expectedDuration": "time in minutes",
  "evaluationCriteria": ["criterion1", "criterion2", "criterion3"],
  "followUp": ["potential follow-up question 1", "potential follow-up question 2"]
}

Return the questions as a JSON array.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert HR interviewer specializing in behavioral interviews."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const parsedResponse = JSON.parse(response.choices[0].message.content);
    
    // Basic validation of the response format
    if (!Array.isArray(parsedResponse.questions)) {
      throw new Error('Invalid response format from OpenAI');
    }

    return parsedResponse.questions;
  } catch (error) {
    console.error('Question generation error:', error);
    
    // Return backup questions in case of API failure
    return getBackupQuestions(numberOfQuestions);
  }
}

/**
 * Get backup questions in case of API failure
 */
function getBackupQuestions(count = 8) {
  const backupQuestions = [
    {
      id: 1,
      text: "Tell me about a challenging situation at work and how you handled it.",
      category: "challenges",
      expectedDuration: 3,
      evaluationCriteria: [
        "Problem-solving ability",
        "Decision-making process",
        "Learning from experience"
      ],
      followUp: [
        "What would you do differently now?",
        "How did this experience change your approach to similar situations?"
      ]
    },
    {
      id: 2,
      text: "Describe a project where you had to lead a team. What was your approach and what were the results?",
      category: "leadership",
      expectedDuration: 4,
      evaluationCriteria: [
        "Leadership style",
        "Team management",
        "Project outcome"
      ],
      followUp: [
        "How did you handle any conflicts within the team?",
        "What was your biggest learning from this experience?"
      ]
    }
    // Add more backup questions as needed
  ];

  return backupQuestions.slice(0, count);
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
}
`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Response analysis error:', error);
    throw new Error('Failed to analyze response');
  }
}

export const openAIService = {
  generateBehavioralQuestions,
  analyzeResponse
};

//empty commit 