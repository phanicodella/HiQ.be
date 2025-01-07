// backend/src/routes/public.routes.js

import express from 'express';
import multer from 'multer';
import axios from 'axios';
import { getStorage } from 'firebase-admin/storage';
import { db, admin } from '../config/firebase.js';
import { openAIService } from '../services/openai.service.js';
import { rekognition } from '../config/aws.js';

const router = express.Router();

// Keep your existing multer configuration
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Keep your existing API Keys configuration
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
 * Fraud Detection Analysis
 */
router.post('/fraud-detection', upload.single('frame'), async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body;
    const frameBlob = req.file;

    if (!frameBlob) {
      return res.status(400).json({ error: 'Video frame required' });
    }

    const detectFacesResponse = await rekognition.detectFaces({
      Image: {
        Bytes: frameBlob.buffer
      },
      Attributes: ['ALL']
    }).promise();

    const analysis = {
      timestamp: new Date(timestamp),
      metrics: {
        facesDetected: detectFacesResponse.FaceDetails.length,
        isValidFrame: true,
        confidence: detectFacesResponse.FaceDetails[0]?.Confidence || 0,
        warnings: []
      }
    };

    if (detectFacesResponse.FaceDetails.length > 1) {
      analysis.metrics.isValidFrame = false;
      analysis.metrics.warnings.push('Multiple faces detected');
    }

    if (detectFacesResponse.FaceDetails.length === 0) {
      analysis.metrics.isValidFrame = false;
      analysis.metrics.warnings.push('No face detected');
    }

    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!interviews.empty) {
      await interviews.docs[0].ref.update({
        fraudDetection: admin.firestore.FieldValue.arrayUnion(analysis)
      });

      if (!analysis.metrics.isValidFrame) {
        await interviews.docs[0].ref.update({
          fraudDetected: true,
          fraudWarnings: admin.firestore.FieldValue.arrayUnion(...analysis.metrics.warnings)
        });
      }
    }

    res.json({ success: true, analysis });

  } catch (error) {
    console.error('Fraud detection error:', error);
    res.status(500).json({
      error: 'Fraud detection failed',
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
    console.error('Error getting transcription token:', error.response?.data || error);
    res.status(500).json({ 
      error: 'Failed to get transcription token',
      details: error.response?.data || error.message 
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
          exp: Math.floor(Date.now() / 1000) + 3600, // Expire in 1 hour
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

    // Store meeting URL in interview document
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
    console.error('Failed to generate meeting URL:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate meeting URL',
      details: error.response?.data || error.message
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
      return res.status(404).json({ 
        error: 'Interview not found' 
      });
    }

    const interviewDoc = interviews.docs[0];
    const interviewData = interviewDoc.data();
    
    if (interviewData.questions?.length > 0) {
      return res.json({ 
        questions: interviewData.questions,
        cached: true 
      });
    }

    // Generate behavioral questions using the new service
    const questions = await openAIService.generateBehavioralQuestions({
      numberOfQuestions: 8
    });

    await interviewDoc.ref.update({
      questions,
      questionsGeneratedAt: new Date()
    });

    res.json({ 
      questions,
      cached: false 
    });
  } catch (error) {
    console.error('Question generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate questions',
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
      .where('status', '==', 'scheduled')
      .limit(1)
      .get();

    if (interviews.empty) {
      return res.status(404).json({ 
        error: 'Interview not found or already in progress' 
      });
    }

    const interviewRef = interviews.docs[0].ref;
    const interviewData = interviews.docs[0].data();

    // Generate behavioral questions if not already present
    if (!interviewData.questions?.length) {
      const questions = await openAIService.generateBehavioralQuestions({
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
      startedAt: new Date(),
      currentQuestionId: 1,
      answers: []  // Initialize empty answers array
    });

    res.json({ 
      question: interviewData.questions[0],
      questionNumber: 1,
      totalQuestions: interviewData.questions.length 
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({ 
      error: 'Failed to start interview',
      details: error.message 
    });
  }
});

/**
 * Submit Answer
 */
router.post('/interviews/:sessionId/answer', 
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]), 
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { transcript, questionId, behaviorAnalysis } = req.body;

      const interviews = await db.collection('interviews')
        .where('sessionId', '==', sessionId)
        .limit(1)
        .get();

      if (!interviews.empty) {
        // Get interview data to find the current question
        const interviewData = interviews.docs[0].data();
        const currentQuestion = interviewData.questions?.find(
          q => q.id === parseInt(questionId)
        );

        // If we have transcript and current question, analyze the response
        let analysis = null;
        if (transcript && currentQuestion) {
          try {
            analysis = await openAIService.analyzeResponse(
              currentQuestion.text,
              transcript
            );
          } catch (err) {
            console.error('Response analysis error:', err);
          }
        }

        const answer = {
          questionId: parseInt(questionId),
          transcript,
          timestamp: new Date(),
          behaviorAnalysis: behaviorAnalysis ? JSON.parse(behaviorAnalysis) : null,
          analysis // Add AI analysis if available
        };

        await interviews.docs[0].ref.update({
          answers: admin.firestore.FieldValue.arrayUnion(answer),
          lastAnswerAt: new Date()
        });
      }

      res.json({ 
        success: true,
        analysis: analysis || null
      });
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
      return res.status(404).json({ 
        error: 'Interview not found' 
      });
    }

    const interviewData = interviews.docs[0].data();
    
    if (currentQuestionId >= interviewData.questions.length) {
      await interviews.docs[0].ref.update({
        status: 'completed',
        completedAt: new Date()
      });

      return res.json({ 
        isComplete: true,
        completedAt: new Date().toISOString()
      });
    }

    const nextQuestion = interviewData.questions[currentQuestionId];
    await interviews.docs[0].ref.update({
      currentQuestionId: currentQuestionId + 1,
      lastQuestionAt: new Date()
    });

    res.json({
      question: nextQuestion,
      questionNumber: currentQuestionId + 1,
      totalQuestions: interviewData.questions.length,
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

// Export the router
export { router };