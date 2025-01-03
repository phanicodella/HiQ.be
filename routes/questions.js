const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const openAIService = require('../services/openai.service');
const admin = require('firebase-admin');

const validateQuestionRequest = [
    body('type')
        .optional()
        .isIn(['technical', 'behavioral', 'situational'])
        .withMessage('Invalid interview type'),
    body('level')
        .optional()
        .isIn(['jr', 'mid', 'senior', 'expert'])
        .withMessage('Invalid experience level'),
    body('count')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Question count must be between 1 and 10')
];

router.post('/generate', validateQuestionRequest, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { 
            type = 'technical', 
            level = 'mid', 
            count = 5,
            interviewId 
        } = req.body;

        const questions = await openAIService.generateQuestions({
            type,
            level,
            count
        });

        if (interviewId) {
            try {
                const db = admin.firestore();
                await db.collection('interviews').doc(interviewId).update({
                    generatedQuestions: questions,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (storageError) {
                console.error('Failed to store questions:', storageError);
            }
        }

        res.json(questions);
    } catch (error) {
        console.error('Question generation error:', error);
        res.status(500).json({
            error: 'Failed to generate questions',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

router.get('/:interviewId', async (req, res) => {
    try {
        const { interviewId } = req.params;
        const db = admin.firestore();

        const interviewDoc = await db.collection('interviews').doc(interviewId).get();
        
        if (!interviewDoc.exists) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        const interviewData = interviewDoc.data();
        const questions = interviewData.generatedQuestions || [];

        res.json(questions);
    } catch (error) {
        console.error('Retrieve questions error:', error);
        res.status(500).json({
            error: 'Failed to retrieve questions',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

module.exports = router;