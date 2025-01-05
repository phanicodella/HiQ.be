// backend/src/routes/public.routes.
import express from 'express';
const router = express.Router();
import multer from 'multer';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Firebase storage bucket reference
const bucket = getStorage().bucket();

// AssemblyAI configuration
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY;

// Get real-time transcription token
router.post('/transcription-token', async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.assemblyai.com/v2/realtime/token',
      { expires_in: 3600 },  // Token expires in 1 hour
      {
        headers: {
          'Authorization': ASSEMBLY_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Got transcription token:', response.data);
    res.json({ token: response.data.token });
  } catch (error) {
    console.error('Error getting transcription token:', error.response?.data || error);
    res.status(500).json({ 
      error: 'Failed to get transcription token',
      details: error.response?.data || error.message 
    });
  }
});

// Interview questions (in production, fetch from database)
const questions = [
  { id: 1, text: "Tell me about yourself and your background." },
  { id: 2, text: "What are your greatest strengths?" },
  { id: 3, text: "Why are you interested in this position?" },
  { id: 4, text: "Where do you see yourself in five years?" },
  { id: 5, text: "Describe a challenging situation you've faced at work and how you handled it." }
];

// Get interview details
router.get('/interviews/:sessionId', async (req, res) => {
  try {
    const interview = {
      id: req.params.sessionId,
      totalQuestions: questions.length,
      status: 'pending'
    };
    res.json(interview);
  } catch (error) {
    console.error('Error fetching interview:', error);
    res.status(500).json({ error: 'Failed to fetch interview details' });
  }
});

// Start interview
router.post('/interviews/:sessionId/start', async (req, res) => {
  try {
    const question = questions[0];
    res.json({ 
      question, 
      questionNumber: 1,
      totalQuestions: questions.length 
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// Submit answer
router.post('/interviews/:sessionId/answer', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { transcript } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Upload audio to Firebase Storage
    const fileName = `interviews/${sessionId}/${Date.now()}.webm`;
    const file = bucket.file(fileName);
    
    await file.save(audioFile.buffer, {
      metadata: {
        contentType: 'audio/webm',
        customMetadata: {
          transcript: transcript || '',
          uploadedAt: new Date().toISOString()
        }
      }
    });

    // Get signed URL for the audio file
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 1 week
    });

    res.json({ success: true, audioUrl: url });
  } catch (error) {
    console.error('Error processing answer:', error);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// Get next question
router.get('/interviews/:sessionId/next-question', async (req, res) => {
  try {
    const currentQuestionNumber = parseInt(req.query.current || 1);
    
    if (currentQuestionNumber >= questions.length) {
      return res.json({ 
        isComplete: true,
        completedAt: new Date().toISOString()
      });
    }

    const nextQuestion = questions[currentQuestionNumber];
    res.json({
      question: nextQuestion,
      questionNumber: currentQuestionNumber + 1,
      totalQuestions: questions.length,
      isComplete: false
    });
  } catch (error) {
    console.error('Error fetching next question:', error);
    res.status(500).json({ error: 'Failed to fetch next question' });
  }
});

export{router};