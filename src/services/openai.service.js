// backend/src/services/openai.service.js

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { z } from 'zod'; // Add zod for runtime type validation

dotenv.config();

// Initialize OpenAI with error handling
let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    timeout: 30000
  });
} catch (error) {
  console.error('OpenAI initialization failed:', error);
  throw new Error('OpenAI service initialization failed');
}

// Validation schemas for OpenAI responses
const QuestionSchema = z.object({
  text: z.string().min(10),
  hints: z.array(z.string()).min(1),
  complexity: z.number().min(1).max(5),
  expectedTime: z.number().min(1).max(30),
  evaluationPoints: z.array(z.string()).min(1),
  type: z.string(),
  level: z.string()
});

const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionSchema)
});

// Interview type-specific prompts
const INTERVIEW_PROMPTS = {
  technical: {
    junior: {
      focus: [
        "Basic programming concepts",
        "Simple coding problems",
        "Version control basics",
        "Testing fundamentals",
        "Basic debugging skills"
      ],
      complexity: "Start easy (level 1-2) and gradually increase to moderate (level 3)"
    },
    mid: {
      focus: [
        "System design fundamentals",
        "Code optimization",
        "Design patterns",
        "Advanced debugging",
        "Technical decision making"
      ],
      complexity: "Mix of moderate (level 2-3) and challenging (level 4) questions"
    },
    senior: {
      focus: [
        "Complex system design",
        "Architecture decisions",
        "Team leadership",
        "Performance optimization",
        "Technical strategy"
      ],
      complexity: "Primarily challenging (level 4-5) questions"
    }
  },
  behavioral: {
    junior: {
      focus: [
        "Team collaboration",
        "Learning ability",
        "Basic problem-solving",
        "Communication skills",
        "Adaptability"
      ],
      complexity: "Focus on foundational scenarios (level 1-3)"
    },
    mid: {
      focus: [
        "Project management",
        "Conflict resolution",
        "Mentoring",
        "Process improvement",
        "Cross-team collaboration"
      ],
      complexity: "Mix of moderate scenarios (level 2-4)"
    },
    senior: {
      focus: [
        "Leadership challenges",
        "Strategic thinking",
        "Organizational impact",
        "Change management",
        "Team building"
      ],
      complexity: "Complex scenarios (level 3-5)"
    }
  }
};

// Fallback questions in case of API failure
const FALLBACK_QUESTIONS = {
  technical: {
    junior: [
      {
        text: "Explain the concept of variables and data types in programming.",
        hints: [
          "Think about different types of data you work with",
          "Consider how variables store information"
        ],
        complexity: 1,
        expectedTime: 5,
        evaluationPoints: [
          "Understanding of basic concepts",
          "Ability to explain clearly",
          "Knowledge of common data types"
        ]
      },
      // Add more fallback questions...
    ]
  },
  // Add more fallback categories...
};

/**
 * Generates interview questions using OpenAI
 * @param {string} type - Interview type (technical/behavioral)
 * @param {string} level - Experience level (junior/mid/senior)
 * @returns {Promise<Array>} Array of generated questions
 */
export async function generateQuestions(type = 'technical', level = 'mid') {
  try {
    // Input validation
    if (!INTERVIEW_PROMPTS[type]?.[level]) {
      throw new Error(`Invalid interview type (${type}) or level (${level})`);
    }

    const prompt = generatePrompt(type, level);
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an expert ${type} interviewer with extensive experience in conducting interviews for ${level}-level positions. Generate questions that accurately assess a candidate's capabilities at this level.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000
    });

    const parsedResponse = JSON.parse(response.choices[0].message.content);
    
    // Validate response format
    const validatedQuestions = QuestionsResponseSchema.parse(parsedResponse);
    
    // Add IDs and metadata
    return validatedQuestions.questions.map((q, index) => ({
      ...q,
      id: index + 1,
      type,
      level
    }));
  } catch (error) {
    console.error('Question generation error:', error);

    // Handle specific error types
    if (error instanceof z.ZodError) {
      console.error('Response validation failed:', error.errors);
      return getFallbackQuestions(type, level);
    }

    if (error.response?.status === 429) {
      console.error('OpenAI rate limit exceeded');
      return getFallbackQuestions(type, level);
    }

    throw new Error('Failed to generate interview questions');
  }
}

/**
 * Generates the prompt for OpenAI based on interview type and level
 */
function generatePrompt(type, level) {
  const { focus, complexity } = INTERVIEW_PROMPTS[type][level];
  
  return `Generate 5 interview questions for a ${level}-level ${type} position.

Focus areas:
${focus.map(f => `- ${f}`).join('\n')}

Complexity requirement: ${complexity}

Requirements for each question:
1. Clear, specific question text
2. 2-3 helpful hints for struggling candidates
3. Complexity level (${complexity})
4. Expected answer time in minutes
5. 3-5 key evaluation points for assessing answers

Format each question as a JSON object with:
{
  "text": "question text",
  "hints": ["hint1", "hint2", "hint3"],
  "complexity": number (1-5),
  "expectedTime": number (minutes),
  "evaluationPoints": ["point1", "point2", "point3"]
}

Return an array of exactly 5 questions formatted as:
{
  "questions": [... question objects ...]
}`;
}

/**
 * Returns fallback questions when API fails
 */
function getFallbackQuestions(type, level) {
  console.log(`Using fallback questions for ${type}-${level}`);
  return FALLBACK_QUESTIONS[type]?.[level] || [];
}

/**
 * Analyzes candidate's response using OpenAI
 * @param {string} question - The interview question
 * @param {string} response - Candidate's response
 * @param {string} type - Interview type
 * @param {string} level - Experience level
 * @returns {Promise<Object>} Analysis of the response
 */
export async function analyzeResponse(question, response, type, level) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an expert interviewer evaluating a ${level}-level ${type} interview response.`
        },
        {
          role: "user",
          content: `
Question: ${question.text}
Response: ${response}
Level: ${level}

Evaluate the response considering:
1. Technical accuracy (if applicable)
2. Clarity of explanation
3. Depth of understanding
4. Relevant experience demonstrated
5. Areas for improvement

Provide a JSON response with:
{
  "score": number (1-10),
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "feedback": "detailed feedback",
  "followUpQuestions": ["question1", "question2"]
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

// Export the service
export const openAIService = {
  generateQuestions,
  analyzeResponse
};