// backend/src/routes/public.routes.js

import express from 'express';
import multer from 'multer';
import axios from 'axios';
import { db, admin } from '../config/firebase.js';
const { cohereService } = await import('../services/cohere.service.js');
import { CohereClient } from 'cohere-ai';
const router = express.Router();
// At the top of backend/src/routes/public.routes.js with other imports
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
    const { type = 'behavioral', level = 'mid' } = interviewData;

    const { cohereService } = await import('../services/cohere.service.js');
    const questions = await cohereService.generateInterviewQuestions({
      type,
      level,
      numberOfQuestions: 8
    });

    await interviews.docs[0].ref.update({
      questions,
      questionsGeneratedAt: new Date()
    });

    res.json({
      questions,
      type,
      level
    });

  } catch (error) {
    console.error('Question generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate questions'
    });
  }
});

router.post('/interviews/:sessionId/analyze-answer', async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    const analysis = await answerAnalysisService.analyzeAnswer(question, answer);
    res.json({ analysis });

  } catch (error) {
    console.error('Answer analysis error:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze answer'
    });
  }
});
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
    
    console.log('Starting interview analysis for session:', sessionId);
    
    // Use the new analyzeInterview method
    const analysis = await cohereService.analyzeInterview(questionHistory);

    // Store analysis in Firestore
    await interviews.docs[0].ref.update({
      status: 'completed',
      completedAt: new Date(),
      analysis,
      questionHistory
    });

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Interview completion error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to complete interview analysis'
    });
  }
});
router.post('/transcription-token', async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.assemblyai.com/v2/realtime/token',
      { expires_in: 3600 },
      {
        headers: {
          'Authorization': process.env.ASSEMBLY_AI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Got AssemblyAI token:', response.data);
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

    // Ensure questions exist
    if (!interviewData.questions?.length) {
      const { type = 'behavioral', level = 'mid' } = interviewData;
      const { huggingFaceService } = await import('../services/huggingface.service.js');
      const questions = await huggingFaceService.generateInterviewQuestions({
        type,
        level,
        numberOfQuestions: 8
      });

      await interviewRef.update({
        questions,
        questionsGeneratedAt: new Date()
      });

      interviewData.questions = questions;
    }

    await interviewRef.update({
      status: 'in_progress',
      startedAt: new Date()
    });

    res.json({
      question: interviewData.questions[0],
      totalQuestions: interviewData.questions.length
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

/**
 * Submit Answer
 */
router.post('/interviews/:sessionId/answer',
  upload.single('audio'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { transcript, questionId } = req.body;

      // Don't require audio, just transcript
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

        // Store the answer
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
 * Get Next Question
 */
router.get('/interviews/:sessionId/next-question', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const currentQuestionId = parseInt(req.query.current || '1');

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (interviews.empty) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interviewData = interviews.docs[0].data();
    const { questions = [] } = interviewData;

    if (currentQuestionId >= questions.length) {
      await interviews.docs[0].ref.update({
        status: 'completed',
        completedAt: new Date()
      });

      return res.json({
        isComplete: true,
        completedAt: new Date().toISOString()
      });
    }

    const nextQuestion = questions[currentQuestionId];

    // Validate question type matches interview type
    if (nextQuestion.type !== interviewData.type) {
      console.error('Question type mismatch:', {
        expected: interviewData.type,
        got: nextQuestion.type
      });
      return res.status(500).json({ error: 'Invalid question type' });
    }

    await interviews.docs[0].ref.update({
      currentQuestionId: currentQuestionId + 1,
      lastQuestionAt: new Date()
    });

    res.json({
      question: nextQuestion,
      questionNumber: currentQuestionId + 1,
      totalQuestions: questions.length,
      isComplete: false
    });
  } catch (error) {
    console.error('Error fetching next question:', error);
    res.status(500).json({
      error: 'Failed to fetch next question',
      details: error.message
    });
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