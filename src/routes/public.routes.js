/* 
 * backend/src/routes/public.routes.js
 * Handles public interview sessions
 */

import express from 'express';
import { db } from '../config/firebase.js';

const router = express.Router();

// Get interview details by session ID
router.get('/interviews/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Query interview by sessionId
    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .where('status', '==', 'scheduled')
      .get();

    if (interviews.empty) {
      return res.status(404).json({
        error: 'Interview not found or no longer available'
      });
    }

    const interview = {
      id: interviews.docs[0].id,
      ...interviews.docs[0].data()
    };

    // Don't expose sensitive information
    delete interview.interviewerId;

    res.json({ interview });
  } catch (error) {
    console.error('Get public interview error:', error);
    res.status(500).json({
      error: 'Failed to fetch interview details'
    });
  }
});

// Start interview session
router.post('/interviews/:sessionId/start', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interview = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .where('status', '==', 'scheduled')
      .get();

    if (interview.empty) {
      return res.status(404).json({
        error: 'Interview not found or already completed'
      });
    }

    const interviewRef = db.collection('interviews').doc(interview.docs[0].id);

    // Get first question based on interview type and level
    const question = {
      id: '1',
      text: 'Tell me about yourself and your background.',
      hint: 'Focus on relevant experience and skills'
    };

    // Update interview status
    await interviewRef.update({
      status: 'in_progress',
      currentQuestion: question,
      startedAt: new Date()
    });

    res.json({ 
      question,
      message: 'Interview started successfully'
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({
      error: 'Failed to start interview'
    });
  }
});

// Submit answer and get next question
router.post('/interviews/:sessionId/answer', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { audioBlob } = req.body;

    // Store answer and get next question
    const nextQuestion = {
      id: '2',
      text: 'What interests you about this position?',
      hint: 'Consider discussing both the role and company culture'
    };

    res.json({
      success: true,
      nextQuestion
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({
      error: 'Failed to submit answer'
    });
  }
});

// Get next question
router.get('/interviews/:sessionId/next-question', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get next question based on progress
    const nextQuestion = {
      id: '3',
      text: 'Describe a challenging project you worked on.',
      hint: 'Include your role, challenges faced, and outcomes'
    };

    res.json({ 
      question: nextQuestion,
      complete: false
    });
  } catch (error) {
    console.error('Next question error:', error);
    res.status(500).json({
      error: 'Failed to fetch next question'
    });
  }
});

export default router;