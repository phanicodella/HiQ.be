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
/**
 * Fraud Detection Analysis
 */
router.post('/fraud-detection', upload.single('frame'), async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body;
    const frameBlob = req.file;

    // Validate required parameters
    if (!sessionId || !timestamp || !frameBlob) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: {
          sessionId: !!sessionId,
          timestamp: !!timestamp,
          frameBlob: !!frameBlob
        }
      });
    }

    // Verify interview exists and is active
    const interviews = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .where('status', '==', 'in_progress')
      .limit(1)
      .get();

    if (interviews.empty) {
      return res.status(404).json({
        error: 'Active interview session not found',
        details: 'Invalid session or interview not in progress'
      });
    }

    const detectFacesResponse = await rekognition.detectFaces({
      Image: {
        Bytes: frameBlob.buffer
      },
      Attributes: ['ALL']
    });

    const analysis = {
      timestamp: new Date(parseInt(timestamp)),
      sessionId,
      metrics: {
        facesDetected: detectFacesResponse.FaceDetails.length,
        isValidFrame: true,
        confidence: detectFacesResponse.FaceDetails[0]?.Confidence || 0,
        warnings: []
      }
    };

    // Validate face detection results
    if (detectFacesResponse.FaceDetails.length > 1) {
      analysis.metrics.isValidFrame = false;
      analysis.metrics.warnings.push('Multiple faces detected');
    }

    if (detectFacesResponse.FaceDetails.length === 0) {
      analysis.metrics.isValidFrame = false;
      analysis.metrics.warnings.push('No face detected');
    }

    // Additional checks if face is detected
    if (detectFacesResponse.FaceDetails.length === 1) {
      const face = detectFacesResponse.FaceDetails[0];
      
      // Check if person is looking at camera
      if (face.Pose.Pitch < -20 || face.Pose.Pitch > 20 || 
          face.Pose.Yaw < -20 || face.Pose.Yaw > 20) {
        analysis.metrics.warnings.push('Face not properly aligned with camera');
      }

      // Check for eye visibility
      if (face.EyesOpen?.Value === false) {
        analysis.metrics.warnings.push('Eyes not fully visible');
      }

      // Add confidence scores
      analysis.metrics.faceConfidence = face.Confidence;
      analysis.metrics.eyeOpenConfidence = face.EyesOpen?.Confidence;
    }

    // Store analysis in Firestore
    const interviewRef = interviews.docs[0].ref;
    await interviewRef.update({
      fraudDetection: admin.firestore.FieldValue.arrayUnion(analysis),
      lastFraudCheck: new Date()
    });

    res.json({ 
      success: true, 
      analysis,
      message: analysis.metrics.warnings.length > 0 
        ? 'Face detection completed with warnings' 
        : 'Face detection completed successfully'
    });

  } catch (error) {
    console.error('Fraud detection error:', error);
    
    // Handle specific AWS errors
    if (error.code === 'InvalidImageFormatException') {
      return res.status(400).json({
        error: 'Invalid image format',
        details: 'Please ensure the image is in a supported format (JPG/PNG)'
      });
    }

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
    const { huggingFaceService } = await import('../services/huggingface.service.js');
const { type = 'behavioral', level = 'mid' } = interviewData;
const questions = await huggingFaceService.generateBehavioralQuestions({
  type,
  level,
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
const questions = await openAIService.generateBehavioralQuestions({
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
          let analysis = null;
          const interviewData = interviews.docs[0].data();
          const currentQuestion = interviewData.questions?.find(
            q => q.id === parseInt(questionId)
          );
        
          if (transcript && currentQuestion) {
            try {
              analysis = await openAIService.analyzeResponse(
                currentQuestion.text,
                transcript
              );
            } catch (err) {
              console.error('Response analysis error:', err);
              // Set default analysis if OpenAI fails
              analysis = {
                analysis: "Failed to analyze response",
                timestamp: new Date()
              };
            }
          }
        
          const answer = {
            questionId: parseInt(questionId),
            transcript,
            timestamp: new Date(),
            behaviorAnalysis: behaviorAnalysis ? JSON.parse(behaviorAnalysis) : null,
            analysis
          };

      res.json({ 
        success: true,
        analysis: analysis || null
      });}
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