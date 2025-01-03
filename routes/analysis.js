// backend/routes/analysis.js

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const openAIService = require('../services/openai.service');
const analysisService = require('../services/analysis.service');

// Validation middleware
const validateAnalysisRequest = [
    body('transcript').notEmpty().withMessage('Transcript is required'),
    body('questionId').notEmpty().withMessage('Question ID is required'),
    body('type').isIn(['technical', 'behavioral']).withMessage('Invalid interview type'),
    body('level').isIn(['jr', 'mid', 'senior', 'expert']).withMessage('Invalid level')
];

const validateFraudRequest = [
    body('frame').notEmpty().withMessage('Video frame data is required')
        .isString().withMessage('Frame must be base64 string')
];

// Response Analysis Endpoint
router.post('/response', validateAnalysisRequest, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { transcript, questionId, type, level } = req.body;
        
        // Get user info from auth middleware
        const userId = req.user.uid;
        
        // Log analysis request
        console.log(`Analysis request from user ${userId} for question ${questionId}`);

        const analysis = await openAIService.analyzeResponse({
            transcript,
            questionId,
            type,
            level,
            userId
        });

        // Store analysis result in Firebase (optional)
        // await admin.firestore().collection('analyses').add({
        //     userId,
        //     questionId,
        //     analysis,
        //     timestamp: admin.firestore.FieldValue.serverTimestamp()
        // });

        res.json(analysis);
    } catch (error) {
        console.error('Response analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze response',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Fraud Detection Endpoint
router.post('/fraud-detection', validateFraudRequest, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { frame } = req.body;
        const userId = req.user.uid;

        // Rate limiting check (prevent abuse)
        const userKey = `fraud_detection_${userId}`;
        const requestCount = await req.rateLimit.get(userKey) || 0;
        
        if (requestCount > 10) { // Max 10 requests per minute
            return res.status(429).json({
                error: 'Too many requests',
                message: 'Please wait before sending more frames'
            });
        }
        await req.rateLimit.set(userKey, requestCount + 1, 60); // 60 seconds expiry

        const analysis = await analysisService.analyzeFraudDetection(frame);

        // If fraud detected with high confidence, log it
        if (analysis.fraudDetected && analysis.confidenceScore > 0.8) {
            console.warn(`Potential fraud detected for user ${userId}`, analysis);
            // Could also store in Firebase or trigger notifications
        }

        res.json(analysis);
    } catch (error) {
        console.error('Fraud detection error:', error);
        res.status(500).json({
            error: 'Failed to analyze video frame',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Speech Analysis Endpoint (for real-time transcription analysis)
router.post('/speech', [
    body('audio').notEmpty().withMessage('Audio data is required'),
    body('interviewId').notEmpty().withMessage('Interview ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { audio, interviewId } = req.body;
        const userId = req.user.uid;

        // TODO: Implement real-time speech analysis
        // This could be expanded based on requirements

        res.json({
            success: true,
            message: 'Speech analysis received'
        });
    } catch (error) {
        console.error('Speech analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze speech',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get Analysis Results (for retrieving past analyses)
router.get('/results/:interviewId', async (req, res) => {
    try {
        const { interviewId } = req.params;
        const userId = req.user.uid;

        // TODO: Implement retrieval of analysis results
        // This would typically fetch from your database

        res.json({
            message: 'Analysis results endpoint placeholder'
        });
    } catch (error) {
        console.error('Get analysis results error:', error);
        res.status(500).json({
            error: 'Failed to retrieve analysis results',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

module.exports = router;