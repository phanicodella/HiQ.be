/* 
 * backend/src/routes/public.routes.js
 */

import express from 'express';
import { db, storage } from '../config/firebase.js';
import multer from 'multer';
import { OpenAI } from 'openai';
import { nanoid } from 'nanoid';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Initialize OpenAI for Whisper transcription
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

    // First question based on interview type
    const question = {
      id: '1',
      text: 'Please introduce yourself and tell us about your background.',
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

// Submit answer with media
router.post('/interviews/:sessionId/answer', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { transcript } = req.body;

    const interview = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (interview.empty) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interviewRef = interview.docs[0].ref;
    const answerId = nanoid();
    
    // Upload files to Firebase Storage
    const timestamp = Date.now();
    const uploadPromises = [];

    // Handle audio upload
    if (req.files.audio) {
      const audioFile = req.files.audio[0];
      const audioPath = `interviews/${sessionId}/answers/${answerId}/audio.webm`;
      const audioRef = storage.file(audioPath);
      
      uploadPromises.push(
        audioRef.save(audioFile.buffer, {
          metadata: {
            contentType: 'audio/webm',
            metadata: { timestamp }
          }
        }).then(() => audioRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hour access
        }))
      );

      // Transcribe with Whisper if needed
      try {
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile.buffer,
          model: "whisper-1",
          language: "en"
        });
        
        // Store both transcripts for verification
        transcript.whisper = transcription.text;
        transcript.browser = transcript;
      } catch (err) {
        console.error('Whisper transcription error:', err);
      }
    }

    // Handle video upload
    if (req.files.video) {
      const videoFile = req.files.video[0];
      const videoPath = `interviews/${sessionId}/answers/${answerId}/video.webm`;
      const videoRef = storage.file(videoPath);
      
      uploadPromises.push(
        videoRef.save(videoFile.buffer, {
          metadata: {
            contentType: 'video/webm',
            metadata: { timestamp }
          }
        }).then(() => videoRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hour access
        }))
      );
    }

    // Wait for all uploads to complete
    const [audioUrl, videoUrl] = await Promise.all(uploadPromises);

    // Save answer in Firestore
    await db.collection('interview_answers').add({
      interviewId: interview.docs[0].id,
      answerId,
      transcript,
      audioUrl: audioUrl?.[0],
      videoUrl: videoUrl?.[0],
      timestamp,
      createdAt: new Date()
    });

    // Update interview
    await interviewRef.update({
      lastAnswerAt: new Date(),
      answers: interview.docs[0].data().answers 
        ? [...interview.docs[0].data().answers, answerId]
        : [answerId]
    });

    res.json({ 
      success: true,
      message: 'Answer submitted successfully'
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

    const interview = await db.collection('interviews')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (interview.empty) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interviewData = interview.docs[0].data();
    const currentQuestionId = interviewData.currentQuestion?.id || '0';
    const nextQuestionId = String(parseInt(currentQuestionId) + 1);

    // Check if interview should complete
    if (nextQuestionId > '5') {
      await interview.docs[0].ref.update({
        status: 'completed',
        completedAt: new Date()
      });

      return res.json({ 
        complete: true,
        message: 'Interview completed'
      });
    }

    // Get next question based on interview type
    const nextQuestion = {
      id: nextQuestionId,
      text: getQuestionText(nextQuestionId, interviewData.type),
      hint: getQuestionHint(nextQuestionId, interviewData.type)
    };

    // Update current question
    await interview.docs[0].ref.update({
      currentQuestion: nextQuestion,
      updatedAt: new Date()
    });

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

// Helper functions for questions
function getQuestionText(id, type) {
  const questions = {
    technical: {
      '2': 'What are your strongest technical skills and how have you applied them in your work?',
      '3': 'Describe a challenging technical problem you solved recently.',
      '4': 'How do you stay updated with new technologies in your field?',
      '5': 'What\'s your approach to debugging complex issues?'
    },
    behavioral: {
      '2': 'Tell me about a time you had to work under pressure.',
      '3': 'Describe a situation where you had to resolve a conflict with a coworker.',
      '4': 'How do you handle feedback and criticism?',
      '5': 'Tell me about a project you\'re particularly proud of.'
    }
  };

  return questions[type.toLowerCase()]?.[id] || 
         'Could you elaborate more on your previous answer?';
}

function getQuestionHint(id, type) {
  const hints = {
    technical: {
      '2': 'Include specific examples and technologies',
      '3': 'Explain your problem-solving process',
      '4': 'Mention specific learning resources or methods',
      '5': 'Walk through your debugging methodology'
    },
    behavioral: {
      '2': 'Use the STAR method: Situation, Task, Action, Result',
      '3': 'Focus on how you maintained professionalism',
      '4': 'Include both positive and constructive feedback examples',
      '5': 'Highlight your role and specific contributions'
    }
  };

  return hints[type.toLowerCase()]?.[id] || 
         'Provide specific examples to support your answer';
}

export default router;