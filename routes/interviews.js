// backend/routes/interviews.js

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const path = require('path');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/email.service');

// Authentication middleware
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Interview access verification endpoint
router.get('/:id/verify-access', async (req, res) => {
    try {
        const { id } = req.params;
        const db = admin.firestore();
        const interviewDoc = await db.collection('interviews').doc(id).get();

        if (!interviewDoc.exists) {
            return res.status(404).json({ 
                error: 'Interview not found',
                details: 'No interview exists with this ID'
            });
        }

        const interviewData = interviewDoc.data();

        // Validate interview status
        if (!['scheduled', 'invited'].includes(interviewData.status)) {
            return res.status(400).json({
                error: 'Interview is not active',
                details: `Current status: ${interviewData.status}`
            });
        }

        // Return key interview details
        return res.json({
            id: interviewDoc.id,
            candidateName: interviewData.candidateName,
            candidateEmail: interviewData.candidateEmail,
            type: interviewData.type || 'technical',
            level: interviewData.level || 'mid',
            duration: interviewData.duration || 45,
            status: interviewData.status
        });
    } catch (error) {
        console.error('[DEBUG] Interview Access Verification Error:', error);
        res.status(500).json({ 
            error: 'Server error during interview access validation',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Schedule new interview
router.post('/schedule', authenticateUser, [
    body('candidateName').trim().notEmpty().withMessage('Candidate name is required'),
    body('candidateEmail').isEmail().withMessage('Valid email is required'),
    body('date').isISO8601().withMessage('Valid date is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { 
            candidateName, 
            candidateEmail, 
            date, 
            type = 'technical', 
            level = 'mid',
            duration = 45 
        } = req.body;

        const interviewDate = new Date(date);
        
        if (interviewDate <= new Date()) {
            return res.status(400).json({ 
                error: 'Interview must be scheduled in the future' 
            });
        }

        const db = admin.firestore();
        const interviewData = {
            candidateName,
            candidateEmail,
            date: admin.firestore.Timestamp.fromDate(interviewDate),
            type,
            level,
            duration,
            status: 'scheduled',
            interviewerId: req.user.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const interviewRef = await db.collection('interviews').add(interviewData);
        
        res.status(201).json({
            id: interviewRef.id,
            ...interviewData,
            date: interviewDate.toISOString()
        });
    } catch (error) {
        console.error('Schedule interview error:', error);
        res.status(500).json({ 
            error: 'Failed to schedule interview',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get interview room page
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[DEBUG] Accessing interview room: ${id}`);

        const db = admin.firestore();
        const interviewDoc = await db.collection('interviews').doc(id).get();

        if (!interviewDoc.exists) {
            console.log(`[DEBUG] Interview not found: ${id}`);
            return res.redirect('/');
        }

        const interviewData = interviewDoc.data();
        
        // Verify interview status
        if (!['scheduled', 'invited'].includes(interviewData.status)) {
            console.log(`[DEBUG] Invalid interview status: ${interviewData.status}`);
            return res.redirect('/');
        }

        // Send the interview room template
        res.sendFile(path.join(__dirname, '../../frontend/public/templates/interview-room.html'));
    } catch (error) {
        console.error('[DEBUG] Interview Room Access Error:', error);
        res.redirect('/');
    }
});

// Get all interviews for interviewer
router.get('/', authenticateUser, async (req, res) => {
    try {
        const db = admin.firestore();
        const { status } = req.query;

        let query = db.collection('interviews')
            .where('interviewerId', '==', req.user.uid)
            .orderBy('date', 'desc');

        if (status && status !== 'all') {
            query = query.where('status', '==', status);
        }

        const snapshot = await query.get();
        const interviews = [];

        snapshot.forEach(doc => {
            interviews.push({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date.toDate().toISOString()
            });
        });

        res.json(interviews);
    } catch (error) {
        console.error('Get interviews error:', error);
        res.status(500).json({
            error: 'Failed to fetch interviews',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Cancel interview
router.patch('/:id/cancel', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const db = admin.firestore();
        const interviewRef = db.collection('interviews').doc(id);

        const interview = await interviewRef.get();
        if (!interview.exists) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        if (interview.data().interviewerId !== req.user.uid) {
            return res.status(403).json({ error: 'Not authorized to cancel this interview' });
        }

        await interviewRef.update({
            status: 'cancelled',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelledBy: req.user.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
 
        res.json({
            message: 'Interview cancelled successfully',
            id
        });
    } catch (error) {
        console.error('Cancel interview error:', error);
        res.status(500).json({
            error: 'Failed to cancel interview',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Complete interview
router.post('/complete', async (req, res) => {
    try {
        const { interviewId, questions, responses, duration, completedAt } = req.body;
 
        const db = admin.firestore();
        const interviewRef = db.collection('interviews').doc(interviewId);
 
        const completionData = {
            status: 'completed',
            questions,
            responses,
            duration,
            completedAt: admin.firestore.Timestamp.fromDate(new Date(completedAt)),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
 
        await interviewRef.update(completionData);
 
        res.json({
            message: 'Interview completed successfully',
            id: interviewId
        });
    } catch (error) {
        console.error('Complete interview error:', error);
        res.status(500).json({
            error: 'Failed to complete interview',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Send interview invite
router.post('/:id/send-invite', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const db = admin.firestore();
        const interviewDoc = await db.collection('interviews').doc(id).get();

        if (!interviewDoc.exists) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        const interviewData = interviewDoc.data();
        const meetingLink = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/interview/${id}`;
        
        await emailService.sendInterviewInvite({
            id,
            candidateName: interviewData.candidateName,
            candidateEmail: interviewData.candidateEmail,
            date: interviewData.date,
            meetingLink
        });

        await interviewDoc.ref.update({
            inviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'invited'
        });

        res.json({ 
            success: true,
            message: 'Interview invitation sent successfully'
        });
    } catch (error) {
        console.error('Send invite error:', error);
        res.status(500).json({ 
            error: 'Failed to send interview invitation'
        });
    }
});

module.exports = router;