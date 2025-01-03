// /backend/routes/feedback.js

const express = require('express');
const router = express.Router();
const openAIService = require('../services/openai.service');
const admin = require('firebase-admin');

router.post('/generate', async (req, res) => {
    try {
        const { interviewId, notes, technicalSkills, communicationSkills } = req.body;

        // Validate input
        if (!notes || !technicalSkills || !communicationSkills) {
            return res.status(400).json({
                error: 'Missing required feedback data'
            });
        }

        // Validate content appropriateness
        const contentValidation = await openAIService.validateContent(notes);
        if (!contentValidation.isAppropriate) {
            return res.status(400).json({
                error: 'Inappropriate content detected'
            });
        }

        // Generate feedback summary
        const summary = await openAIService.generateFeedbackSummary({
            notes,
            technicalSkills,
            communicationSkills
        });

        res.json({ summary });
    } catch (error) {
        console.error('Feedback generation error:', error);
        res.status(500).json({
            error: 'Failed to generate feedback',
            message: error.message
        });
    }
});

router.post('/save', async (req, res) => {
    try {
        const { interviewId, feedback } = req.body;
        const db = admin.firestore();

        // Validate the interview exists and belongs to the interviewer
        const interviewRef = db.collection('interviews').doc(interviewId);
        const interview = await interviewRef.get();

        if (!interview.exists) {
            return res.status(404).json({
                error: 'Interview not found'
            });
        }

        if (interview.data().interviewerId !== req.user.uid) {
            return res.status(403).json({
                error: 'Not authorized to provide feedback for this interview'
            });
        }

        // Save feedback
        await interviewRef.update({
            feedback: {
                ...feedback,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: req.user.uid
            }
        });

        res.json({ 
            message: 'Feedback saved successfully' 
        });
    } catch (error) {
        console.error('Save feedback error:', error);
        res.status(500).json({
            error: 'Failed to save feedback',
            message: error.message
        });
    }
});

module.exports = router;