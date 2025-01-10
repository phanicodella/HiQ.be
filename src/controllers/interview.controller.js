// backend/src/controllers/interview.controller.js
import { db } from '../config/firebase.js';
import { nanoid } from 'nanoid';
import { sendInterviewInvite } from '../services/email.service.js';
import { cohereService } from '../services/cohere.service.js';

class InterviewController {
  async createSession(req, res) {
    try {
      const { 
        candidateEmail, 
        candidateName, 
        scheduledTime, 
        level = 'mid',
        type = 'technical'
      } = req.body;
      
      const interviewerId = req.user.uid;
      const interviewerEmail = req.user.email;
      
      if (!candidateEmail || !scheduledTime || !candidateName) {
        return res.status(400).json({
          error: 'Missing required fields'
        });
      }

      const sessionId = nanoid(10);
      const interviewRef = db.collection('interviews').doc();
      const now = new Date();
      
      // Create interview document with initial state
      await interviewRef.set({
        sessionId,
        candidateEmail,
        candidateName,
        interviewerId,
        interviewerEmail,
        date: new Date(scheduledTime),
        level,
        type,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now
      });

      // Return success response immediately
      res.status(201).json({
        message: 'Interview session created',
        sessionId,
        interviewId: interviewRef.id
      });

      // Process remaining tasks asynchronously
      this.processBackgroundTasks(interviewRef, {
        type,
        level,
        candidateEmail,
        candidateName,
        scheduledTime,
        sessionId
      });

    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({ 
        error: 'Failed to create interview session' 
      });
    }
  }

  async processBackgroundTasks(interviewRef, params) {
    const {
      type,
      level,
      candidateEmail,
      candidateName,
      scheduledTime,
      sessionId
    } = params;

    try {
      // Generate questions asynchronously
      const questions = await cohereService.generateInterviewQuestions({
        type,
        level,
        numberOfQuestions: 3
      });

      // Update interview with questions
      await interviewRef.update({
        questions,
        questionsGeneratedAt: new Date()
      });

      // Send email invitation only after questions are generated
      await sendInterviewInvite({
        to: candidateEmail,
        candidateName,
        type,
        level,
        scheduledTime: new Date(scheduledTime),
        sessionId
      });
    } catch (error) {
      console.error('Background tasks error:', error);
      // Update interview document with error status if needed
      await interviewRef.update({
        backgroundTasksError: error.message,
        updatedAt: new Date()
      });
    }
  }

  async getInterviews(req, res) {
    try {
      const interviewerId = req.user.uid;
      
      const interviews = await db.collection('interviews')
        .where('interviewerId', '==', interviewerId)
        .orderBy('date', 'desc')
        .get();

      const interviewList = interviews.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()?.toISOString(),
        updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
        cancelledAt: doc.data().cancelledAt?.toDate()?.toISOString(),
        date: doc.data().date?.toDate()?.toISOString()
      }));

      res.json({ interviews: interviewList });
    } catch (error) {
      console.error('Get interviews error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch interviews' 
      });
    }
  }

  async cancelInterview(req, res) {
    try {
      const { id } = req.params;
      const interviewerId = req.user.uid;
      const now = new Date();

      const interviewRef = db.collection('interviews').doc(id);
      const interview = await interviewRef.get();

      if (!interview.exists) {
        return res.status(404).json({ 
          error: 'Interview not found' 
        });
      }

      if (interview.data().interviewerId !== interviewerId) {
        return res.status(403).json({ 
          error: 'Unauthorized to cancel this interview' 
        });
      }

      await interviewRef.update({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: interviewerId,
        updatedAt: now
      });

      res.json({ message: 'Interview cancelled successfully' });
    } catch (error) {
      console.error('Cancel interview error:', error);
      res.status(500).json({ 
        error: 'Failed to cancel interview' 
      });
    }
  }
}

export const interviewController = new InterviewController();