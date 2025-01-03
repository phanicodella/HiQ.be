// /backend/routes/email.js

const express = require('express');
const router = express.Router();
const emailService = require('../services/email.service');
const admin = require('firebase-admin');
const AWS = require('aws-sdk');
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

// Verify email address with AWS SES
router.post('/verify-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        await ses.verifyEmailIdentity({
            EmailAddress: email
        }).promise();

        res.json({ 
            message: 'Verification email sent successfully' 
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ 
            error: 'Failed to send verification email',
            message: error.message 
        });
    }
});

// Send interview invitation
router.post('/send-invite', async (req, res) => {
    try {
        const { interviewId } = req.body;
        const db = admin.firestore();

        // Get interview details
        const interview = await db.collection('interviews').doc(interviewId).get();
        if (!interview.exists) {
            return res.status(404).json({ 
                error: 'Interview not found' 
            });
        }

        // Verify permissions
        if (interview.data().interviewerId !== req.user.uid) {
            return res.status(403).json({ 
                error: 'Not authorized to send invite for this interview' 
            });
        }

        // Send invitation email
        await emailService.sendInterviewInvite({
            id: interviewId,
            ...interview.data()
        });

        // Update interview document
        await interview.ref.update({
            inviteSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ 
            message: 'Interview invitation sent successfully' 
        });
    } catch (error) {
        console.error('Send invite error:', error);
        res.status(500).json({
            error: 'Failed to send interview invitation',
            message: error.message
        });
    }
});

// Send reminder email
router.post('/send-reminder', async (req, res) => {
    try {
        const { interviewId } = req.body;
        const db = admin.firestore();

        const interview = await db.collection('interviews').doc(interviewId).get();
        if (!interview.exists) {
            return res.status(404).json({ 
                error: 'Interview not found' 
            });
        }

        // Check if interview is still scheduled
        if (interview.data().status !== 'scheduled') {
            return res.status(400).json({ 
                error: 'Cannot send reminder for non-scheduled interview' 
            });
        }

        // Send reminder email
        await emailService.sendInterviewReminder({
            id: interviewId,
            ...interview.data()
        });

        // Update reminder status
        await interview.ref.update({
            lastReminderSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ 
            message: 'Reminder sent successfully' 
        });
    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({
            error: 'Failed to send reminder',
            message: error.message
        });
    }
});

// Send feedback summary
router.post('/send-feedback', async (req, res) => {
    try {
        const { interviewId } = req.body;
        const db = admin.firestore();

        const interview = await db.collection('interviews').doc(interviewId).get();
        if (!interview.exists || !interview.data().feedback) {
            return res.status(404).json({ 
                error: 'Interview or feedback not found' 
            });
        }

        // Send feedback email
        await emailService.sendFeedbackSummary({
            id: interviewId,
            ...interview.data()
        });

        // Update feedback status
        await interview.ref.update({
            feedbackSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ 
            message: 'Feedback sent successfully' 
        });
    } catch (error) {
        console.error('Send feedback error:', error);
        res.status(500).json({
            error: 'Failed to send feedback',
            message: error.message
        });
    }
});

// Email delivery status webhook (for email tracking)
router.post('/delivery-status', async (req, res) => {
    try {
        const { messageId, status, error } = req.body;
        const db = admin.firestore();

        await db.collection('emailLogs').add({
            messageId,
            status,
            error: error || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ 
            message: 'Delivery status recorded' 
        });
    } catch (error) {
        console.error('Record delivery status error:', error);
        res.status(500).json({
            error: 'Failed to record delivery status',
            message: error.message
        });
    }
});

module.exports = router;