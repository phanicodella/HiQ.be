// backend/services/openai.service.js
const OpenAI = require('openai');
const admin = require('firebase-admin');
const logger = require('winston');

class OpenAIService {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key is not configured');
        }
        
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.db = admin.firestore();
    }

    async generateQuestions({ type, level, count = 5, specialization = 'general' }) {
        try {
            // Log request for analytics
            await this.logRequest('generate_questions', { type, level, count, specialization });

            const prompt = this.createQuestionPrompt(type, level, count, specialization);
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: this.getSystemPrompt(type, level)
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            });

            const questionsText = response.choices[0].message.content;
            const questions = this.parseQuestions(questionsText);

            if (!questions) {
                logger.warn('Failed to parse questions, using fallback');
                return this.getFallbackQuestions(type, level, count);
            }

            // Store generated questions
            await this.storeGeneratedQuestions(questions, { type, level, specialization });

            return questions;
        } catch (error) {
            logger.error('OpenAI Question Generation Error:', error);
            return this.getFallbackQuestions(type, level, count);
        }
    }

    async analyzeResponse({transcript, questionId, type, level, userId}) {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert AI interviewer analyzing responses for ${type} interviews at ${level} level. 
                                Evaluate based on: accuracy, completeness, clarity, and depth of understanding.`
                    },
                    {
                        role: "user",
                        content: `Analyze this interview response:\n\n${transcript}`
                    }
                ],
                temperature: 0.3
            });

            const analysis = {
                score: this.calculateScore(response.choices[0].message.content),
                feedback: response.choices[0].message.content,
                timestamp: new Date().toISOString()
            };

            // Store analysis
            await this.storeAnalysis(analysis, { questionId, userId });

            return analysis;
        } catch (error) {
            logger.error('Response analysis error:', error);
            throw error;
        }
    }

    async validateContent(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are a content moderator checking for appropriate interview content."
                    },
                    {
                        role: "user",
                        content: `Validate this content for appropriateness:\n\n${text}`
                    }
                ]
            });

            return {
                isAppropriate: !this.containsInappropriateContent(response.choices[0].message.content),
                feedback: response.choices[0].message.content
            };
        } catch (error) {
            logger.error('Content validation error:', error);
            return { isAppropriate: true }; // Fail open
        }
    }

    async logRequest(type, params) {
        try {
            await this.db.collection('openai_requests').add({
                type,
                params,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            logger.error('Failed to log OpenAI request:', error);
        }
    }

    async storeGeneratedQuestions(questions, metadata) {
        try {
            await this.db.collection('generated_questions').add({
                questions,
                metadata,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            logger.error('Failed to store generated questions:', error);
        }
    }

    async storeAnalysis(analysis, metadata) {
        try {
            await this.db.collection('response_analyses').add({
                analysis,
                metadata,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            logger.error('Failed to store analysis:', error);
        }
    }

    // Helper methods...
    // (All other methods from your original service remain the same)
}

module.exports = new OpenAIService();