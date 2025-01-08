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
        const prompt = `Generate ${numberOfQuestions} unique interview questions for a ${level} level ${type} interview. 
        Questions should be challenging and relevant to assess candidate capabilities.`;

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
    }
}

// Helper functions
function getCategoryForQuestion(question) {
    const questionLower = question.toLowerCase();
    if (questionLower.includes('problem')) return 'Problem Solving';
    if (questionLower.includes('team') || questionLower.includes('work')) return 'Teamwork';
    if (questionLower.includes('challenge')) return 'Challenges';
    if (questionLower.includes('design') || questionLower.includes('implement')) return 'Technical Design';
    if (questionLower.includes('organize') || questionLower.includes('prioritize')) return 'Organization';
    return 'General';
}

function getHintForQuestion(question) {
    const questionLower = question.toLowerCase();
    if (questionLower.includes('problem')) return 'Describe specific steps taken and outcome achieved';
    if (questionLower.includes('team')) return 'Focus on collaboration and your specific role';
    if (questionLower.includes('challenge')) return 'Use the STAR method to structure your response';
    if (questionLower.includes('design')) return 'Explain your thought process and design decisions';
    if (questionLower.includes('organize')) return 'Provide specific examples and tools used';
    return 'Provide concrete examples from your experience';
}

function getFallbackQuestions() {
    return [
        {
            id: 1,
            text: "Tell me about a challenging project you've worked on.",
            category: "Problem Solving",
            hint: "Focus on your specific role and the outcome"
        },
        {
            id: 2,
            text: "How do you handle conflicts in a team setting?",
            category: "Teamwork",
            hint: "Use a specific example with resolution"
        },
        {
            id: 3,
            text: "Describe a situation where you had to meet a tight deadline.",
            category: "Organization",
            hint: "Explain your prioritization and time management"
        },
        {
            id: 4,
            text: "Tell me about a time you had to learn a new technology quickly.",
            category: "Technical Design",
            hint: "Focus on your learning approach and application"
        },
        {
            id: 5,
            text: "How do you handle feedback and criticism?",
            category: "General",
            hint: "Provide specific examples of receiving and implementing feedback"
        },
        {
            id: 6,
            text: "Describe a situation where you had to lead a team.",
            category: "Teamwork",
            hint: "Highlight your leadership style and results"
        },
        {
            id: 7,
            text: "Tell me about a time you had to deal with a difficult stakeholder.",
            category: "Challenges",
            hint: "Focus on communication and resolution strategies"
        },
        {
            id: 8,
            text: "How do you stay updated with industry trends?",
            category: "General",
            hint: "Share specific learning resources and methods"
        }
    ];
}

export const huggingFaceService = {
    generateBehavioralQuestions
};