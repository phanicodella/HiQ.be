// backend/src/routes/public.routes.js

import express from 'express';
import multer from 'multer';
import axios from 'axios';
import { db, admin } from '../config/firebase.js';
const { cohereService } = await import('../services/cohere.service.js');
import { CohereClient } from 'cohere-ai';
import { sendInterviewFeedback } from '../services/email.feedback.js';
const router = express.Router();
const { answerAnalysisService } = await import('../services/answer.service.js');

import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// API Keys configuration
const DAILY_API_KEY = process.env.DAILY_API_KEY;
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY;

/**
 * Real-time Speech Analysis
 */
router.post('/speech-analysis', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId, questionId } = req.body;
    const audioBlob = req.file;

    if (!audioBlob) {
      return res.status(400).json({ error: 'Audio data required' });
    }

    const transcriptionResponse = await axios.post(
      'https://api.assemblyai.com/v2/stream',
      audioBlob.buffer,
      {
        headers: {
          'Authorization': ASSEMBLY_API_KEY,
          'Content-Type': 'application/octet-stream'
        },
        params: {
          sample_rate: 16000
        }
      }
    );

    const analysis = {
      timestamp: new Date(),
      questionId,
      metrics: {
        sentiment: transcriptionResponse.data.sentiment,
        confidence: transcriptionResponse.data.confidence,
        speed: transcriptionResponse.data.words_per_minute,
        clarity: transcriptionResponse.data.quality_score
      }
    };

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!interviews.empty) {
      await interviews.docs[0].ref.update({
        speechAnalysis: admin.firestore.FieldValue.arrayUnion(analysis)
      });
    }

    res.json({ success: true, analysis });

  } catch (error) {
    console.error('Speech analysis error:', error);
    res.status(500).json({
      error: 'Speech analysis failed',
      details: error.message
    });
  }
});

/**
 * AssemblyAI Transcription Token
 */
router.post('/transcription-token', async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.assemblyai.com/v2/realtime/token',
      { expires_in: 3600 },
      {
        headers: {
          'Authorization': ASSEMBLY_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ token: response.data.token });
  } catch (error) {
    console.error('Error getting transcription token:', error);
    res.status(500).json({
      error: 'Failed to get transcription token',
      details: error.message
    });
  }
});

/**
 * Daily.co Meeting URL Generation
 */
router.get('/interviews/:sessionId/meeting-url', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const response = await axios.post(
      'https://api.daily.co/v1/rooms',
      {
        name: `interview-${sessionId}`,
        properties: {
          enable_screenshare: true,
          enable_recording: 'cloud',
          exp: Math.floor(Date.now() / 1000) + 3600,
          max_participants: 2,
          enable_chat: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const meetingUrl = response.data.url;
    if (!meetingUrl) {
      throw new Error('Meeting URL missing in Daily.co API response');
    }

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!interviews.empty) {
      await interviews.docs[0].ref.update({
        meetingUrl,
        meetingCreatedAt: new Date()
      });
    }

    res.json({ url: meetingUrl });
  } catch (error) {
    console.error('Failed to generate meeting URL:', error);
    res.status(500).json({
      error: 'Failed to generate meeting URL',
      details: error.message
    });
  }
});

/**
 * Get/Generate Interview Questions
 */
router.get('/interviews/:sessionId/questions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (interviews.empty) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interviewData = interviews.docs[0].data();
    
    if (!interviewData.questions?.length) {
      return res.status(500).json({ 
        error: 'No questions found for this interview' 
      });
    }

    res.json({
      questions: interviewData.questions,
      type: interviewData.type,
      level: interviewData.level
    });

  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({
      error: error.message || 'Failed to get interview questions'
    });
  }
});

/**
 * Submit Answer
 */
router.post('/interviews/:sessionId/answer', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { transcript, questionId } = req.body;

    if (!transcript) {
      return res.status(200).json({ success: true });
    }

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!interviews.empty) {
      const interview = interviews.docs[0];
      const answer = {
        questionId: parseInt(questionId),
        transcript,
        timestamp: new Date(),
        audioUrl: req.file ? await storeAudio(req.file, sessionId, questionId) : null
      };

      await interview.ref.update({
        answers: admin.firestore.FieldValue.arrayUnion(answer)
      });

      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Interview not found' });
    }
  } catch (error) {
    console.error('Error processing answer:', error);
    res.status(500).json({
      error: 'Failed to process answer',
      details: error.message
    });
  }
});

/**
 * Complete Interview - Updated for immediate response
 */
router.post('/interviews/:sessionId/complete', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questionHistory } = req.body;

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (interviews.empty) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interviewData = interviews.docs[0].data();
    const interviewRef = interviews.docs[0].ref;

    // Update interview status immediately
    await interviewRef.update({
      status: 'completed',
      completedAt: new Date(),
      questionHistory
    });

    // Send immediate success response to candidate
    res.json({ 
      success: true, 
      message: 'Thank you for completing the interview. Our team will review your responses and get back to you soon.'
    });

    // Process analysis and send feedback asynchronously
    processInterviewAnalysis(interviewRef, interviewData, questionHistory).catch(error => {
      console.error('Async analysis error:', error);
    });

  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({
      error: 'Failed to complete interview',
      details: error.message
    });
  }
});

// Helper function to process interview analysis asynchronously
async function processInterviewAnalysis(interviewRef, interviewData, questionHistory) {
  try {
    // Generate analysis
    const analysis = await cohereService.analyzeInterview(questionHistory);

    // Update interview document with analysis
    await interviewRef.update({
      analysis,
      analysisCompletedAt: new Date()
    });

    // Send feedback email if interviewer email exists
    if (interviewData.interviewerEmail) {
      await sendInterviewFeedback({
        to: interviewData.interviewerEmail,
        candidateName: interviewData.candidateName,
        interviewType: interviewData.type,
        analysis,
        questionHistory,
        isInterviewer: true
      });
    }

  } catch (error) {
    console.error('Interview analysis processing error:', error);
    // Update document with error status
    await interviewRef.update({
      analysisError: error.message,
      analysisErrorAt: new Date()
    });
  }
}

/**
 * Start Interview
 */
router.post('/interviews/:sessionId/start', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (interviews.empty) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interviewRef = interviews.docs[0].ref;
    const interviewData = interviews.docs[0].data();

    if (interviewData.status !== 'scheduled') {
      return res.status(400).json({
        error: 'Interview cannot be started',
        details: `Current status: ${interviewData.status}`
      });
    }

    if (!interviewData.questions?.length) {
      console.error('No pre-generated questions found for session:', sessionId);
      return res.status(500).json({ 
        error: 'Interview questions not found' 
      });
    }

    await interviewRef.update({
      status: 'in_progress',
      startedAt: new Date()
    });

    res.json({
      questions: interviewData.questions,
      question: interviewData.questions[0],
      totalQuestions: interviewData.questions.length,
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Route error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export { router };