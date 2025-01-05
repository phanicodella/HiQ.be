/* 
 * backend/src/controllers/interview.controller.js
 * Handles all interview-related operations
 */

import { db } from '../config/firebase.js';
import { nanoid } from 'nanoid';
import { sendInterviewInvite } from '../services/email.service.js';

class InterviewController {
  /* 
   * Create new interview session
   */
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
      
      /* 
       * Validate required fields
       */
      if (!candidateEmail || !scheduledTime || !candidateName) {
        return res.status(400).json({
          error: 'Missing required fields'
        });
      }

      /* 
       * Generate unique session ID
       */
      const sessionId = nanoid(10);

      /* 
       * Create interview document
       */
      const interviewRef = db.collection('interviews').doc();
      const now = new Date();
      const date = new Date(scheduledTime);
      
      await interviewRef.set({
        sessionId,            // Add sessionId to document
        candidateEmail,
        candidateName,
        interviewerId,
        date,
        level,
        type,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now
      });

      /* 
       * Send email to candidate
       */
      await sendInterviewInvite({
        to: candidateEmail,
        candidateName,
        type,
        level,
        scheduledTime: date,
        sessionId           // Pass sessionId to email service
      });

      res.status(201).json({
        message: 'Interview session created',
        sessionId,
        interviewId: interviewRef.id
      });
    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({ 
        error: 'Failed to create interview session' 
      });
    }
  }

  /* 
   * Get all interviews for an interviewer
   */
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

  /* 
   * Cancel interview
   */
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