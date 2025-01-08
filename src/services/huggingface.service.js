import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config();

const hf = new HfInference(process.env.HUGGINGFACE_API_TOKEN);
console.log('HuggingFace Service - Token check:', {
    hasToken: !!process.env.HUGGINGFACE_API_TOKEN,
    tokenLength: process.env.HUGGINGFACE_API_TOKEN?.length
});
console.log('HuggingFace Service - Initialized with token length:', process.env.HUGGINGFACE_API_TOKEN?.length);

async function generateBehavioralQuestions({ type = 'behavioral', level = 'mid', numberOfQuestions = 8 } = {}) {
    try {
        // Create the prompt
        // Create level-specific criteria
const levelCriteria = {
    junior: "Focus on fundamental knowledge, enthusiasm for learning, and basic problem-solving abilities",
    mid: "Evaluate practical experience, team collaboration, and intermediate technical skills",
    senior: "Assess leadership abilities, system design experience, architectural decisions, and advanced problem-solving"
};

// Create type-specific focus areas
const typeFocus = {
    "system-design": {
        junior: "basic component design, API architecture, and simple scalability concepts",
        mid: "distributed systems, scalability patterns, and system integration",
        senior: "large-scale distributed systems, complex architectural decisions, and enterprise-level solutions"
    },
    technical: {
        junior: "basic programming concepts, data structures, simple algorithms",
        mid: "system integration, code optimization, testing strategies",
        senior: "architecture patterns, scalability, technical leadership"
    },
    behavioral: {
        junior: "learning ability, teamwork, basic workplace scenarios",
        mid: "project management, conflict resolution, mentoring",
        senior: "leadership challenges, strategic thinking, organizational impact"
    },
    "system-design": {
        junior: "basic component design, simple API design",
        mid: "distributed systems, scalability considerations",
        senior: "complex architectures, system trade-offs, large-scale design"
    }
};

// Create the prompt with specific context
const prompt = `Generate ${numberOfQuestions} unique interview questions for a ${level} level ${type} interview.
Level context: ${levelCriteria[level]}
Type focus: ${typeFocus[type][level]}

Questions should be challenging and relevant to assess candidate capabilities in these areas.
Format each question to start with a number and provide context for evaluation.

Example format:
1. [Technical Question] Explain how you would implement...
2. [System Design Question] Design a system that...
3. [Behavioral Question] Tell me about a time when...`;

        // Make the API call
        const response = await hf.textGeneration({
            model: 'gpt2',  // or another appropriate model
            inputs: prompt,
            parameters: {
                max_length: 1000,
                num_return_sequences: 1
            }
        });

        // Get the raw response
        const rawResponse = response.generated_text;
        
        // Extract just the questions (removing the prompt)
        const questionLines = rawResponse
          .split('\n')
          .filter(line => /^\d+\./.test(line))  // Lines starting with numbers
          .map(line => line.trim());
      
        // Convert to our required JSON format
        const formattedQuestions = questionLines.map((line, index) => {
          // Remove the number prefix (e.g., "1. ")
          const questionText = line.replace(/^\d+\.\s*/, '');
          
          return {
            id: index + 1,
            text: questionText,
            category: getCategoryForQuestion(questionText),
            hint: getHintForQuestion(questionText)
          };
        });
      
        console.log('Formatted questions:', JSON.stringify(formattedQuestions, null, 2));
        
        // If no questions were generated, return fallback questions
        if (formattedQuestions.length === 0) {
            console.log('No questions generated, using fallback questions');
            return getFallbackQuestions();
        }

        return formattedQuestions;
      
    } catch (error) {
        console.error('Failed to generate questions:', error);
        console.log('Using fallback questions due to error');
        return getFallbackQuestions();
    }}