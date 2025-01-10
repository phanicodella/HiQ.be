import { CohereClient } from 'cohere-ai';

const cohereClient = new CohereClient({ 
  token: process.env.COHERE_API_KEY 
});

const generateInterviewQuestions = async ({ type = 'behavioral', level = 'mid', numberOfQuestions = 5 } = {}) => {
  try {
    console.log('Starting Cohere question generation:', { type, level, numberOfQuestions });

    const prompt = `You are a technical interviewer generating interview questions. Generate exactly ${numberOfQuestions} ${type} interview questions for ${level} level software engineers. 

Format each question with correct JSON syntax - be especially careful with quotation marks in the question text.

Return ONLY a JSON array with no additional text or explanation. Format each question exactly like this example:

[
  {
    "id": 1,
    "text": "What is your approach to problem solving?",
    "type": "${type}",
    "category": "problem solving",
    "hint": "Look for structured thinking"
  }
]`;

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
    console.log('Generated text before cleanup:', generatedText);

    // Clean up the response text and fix common JSON issues
    const cleanedText = generatedText
      .trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/"""/g, '"')  // Fix triple quotes
      .replace(/([^\\])"+(?=,|\s*})/g, '$1"')  // Fix double quotes before commas or closing braces
      .replace(/"+(?=:)/g, '"')  // Fix quotes before colons
      .trim();

    try {
      const questions = JSON.parse(cleanedText);
      if (!Array.isArray(questions)) {
        throw new Error('Parsed result is not an array');
      }

      // Format and validate questions
      return questions.map((q, index) => ({
        id: index + 1,
        text: String(q.text || '').trim()
          .replace(/"+/g, '"')  // Clean up any remaining multiple quotes
          .replace(/^"|"$/g, ''), // Remove wrapping quotes
        type: type,
        category: String(q.category || '').trim(),
        hint: String(q.hint || '').trim()
      }));
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Raw text:', cleanedText);
      
      // Attempt to fix common JSON syntax issues
      try {
        const fixedText = cleanedText
          .replace(/,(\s*})/g, '$1')  // Remove trailing commas
          .replace(/,(\s*])/g, '$1')  // Remove trailing commas in arrays
          .replace(/\\/g, '\\\\');    // Escape backslashes
        
        const questions = JSON.parse(fixedText);
        if (!Array.isArray(questions)) {
          throw new Error('Parsed result is not an array');
        }
        
        return questions.map((q, index) => ({
          id: index + 1,
          text: String(q.text || '').trim()
            .replace(/"+/g, '"')
            .replace(/^"|"$/g, ''),
          type: type,
          category: String(q.category || '').trim(),
          hint: String(q.hint || '').trim()
        }));
      } catch (secondaryError) {
        console.error('Secondary parse attempt failed:', secondaryError);
        throw new Error('Invalid question format received from Cohere');
      }
    }
  } catch (error) {
    console.error('Cohere service error:', error);
    throw error;
  }
};

const analyzeInterview = async (questionHistory) => {
  try {
    console.log('Starting Cohere interview analysis');

    const prompt = `As an expert technical interviewer, analyze this interview session. Focus only on the actual content of the responses given:

${questionHistory.map(q => `
Question: ${q.text}
Candidate Response: ${q.response}
`).join('\n\n')}

Based strictly on the candidate's responses above, provide a final evaluation in the following JSON format. Do not include any additional text or explanation outside the JSON:

{
  "overall_score": number (1-10),
  "technical_competency": number (1-10),
  "communication_skills": number (1-10),
  "key_strengths": ["strength1", "strength2"],
  "areas_for_improvement": ["area1", "area2"],
  "hiring_recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "feedback_summary": "detailed summary of performance"
}

Important: Base your analysis ONLY on the actual responses given. Do not make assumptions about skills or knowledge not demonstrated in the responses.`;

    const response = await cohereClient.generate({
      model: 'command',
      prompt,
      maxTokens: 2000,
      temperature: 0.7,
      k: 0,
      p: 0.75
    });

    const generatedText = response.generations[0]?.text || '';
    
    // Clean up the response text
    const cleanedText = generatedText
      .trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    try {
      const analysis = JSON.parse(cleanedText);
      
      // Validate the required fields
      const requiredFields = [
        'overall_score',
        'technical_competency',
        'communication_skills',
        'key_strengths',
        'areas_for_improvement',
        'hiring_recommendation',
        'feedback_summary'
      ];

      for (const field of requiredFields) {
        if (!(field in analysis)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Validate score ranges
      const scores = ['overall_score', 'technical_competency', 'communication_skills'];
      for (const score of scores) {
        if (typeof analysis[score] !== 'number' || analysis[score] < 1 || analysis[score] > 10) {
          throw new Error(`Invalid score for ${score}: must be between 1 and 10`);
        }
      }

      return analysis;

    } catch (parseError) {
      console.error('Analysis parse error:', parseError, 'Raw text:', cleanedText);
      throw new Error('Invalid analysis format received from Cohere');
    }

  } catch (error) {
    console.error('Cohere analysis error:', error);
    throw error;
  }
};

export const cohereService = {
  generateInterviewQuestions,
  analyzeInterview
};