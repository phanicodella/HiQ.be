// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { body, validationResult } = require('express-validator');

// Firebase config endpoint
router.get('/firebase-config', (req, res) => {
    try {
        const config = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        };
        
        console.log('[DEBUG] Sending Firebase config');
        res.json(config);
    } catch (error) {
        console.error('[DEBUG] Firebase config error:', error);
        res.status(500).json({ error: 'Failed to retrieve Firebase configuration' });
    }
});

// Token verification endpoint
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ 
                error: 'Token is required' 
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        res.json({ 
            uid: decodedToken.uid,
            email: decodedToken.email
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ 
            error: 'Invalid token' 
        });
    }
});

// Create interviewer endpoint with validation
router.post('/create-interviewer', [
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, password, name } = req.body;

        // Create user in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
            emailVerified: false
        });

        // Set custom claims for interviewer role
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role: 'interviewer',
            createdAt: new Date().toISOString()
        });

        // Optional: Create additional profile in Firestore
        await admin.firestore().collection('interviewers').doc(userRecord.uid).set({
            email,
            name,
            role: 'interviewer',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(201).json({
            message: 'Interviewer created successfully',
            uid: userRecord.uid,
            email: userRecord.email
        });
    } catch (error) {
        console.error('Create interviewer error:', error);
        
        // Handle specific Firebase Auth errors
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({
                error: 'Email already in use',
                code: error.code
            });
        }

        res.status(500).json({
            error: 'Failed to create interviewer',
            message: error.message
        });
    }
});

// Generate custom token for frontend authentication
router.post('/token', async (req, res) => {
    const { uid } = req.body;

    if (!uid) {
        return res.status(400).json({ error: 'UID is required' });
    }

    try {
        const customToken = await admin.auth().createCustomToken(uid);
        res.json({ token: customToken });
    } catch (error) {
        console.error('Error generating custom token:', error);
        res.status(500).json({ 
            error: 'Failed to generate token',
            message: error.message
        });
    }
});

// Password reset endpoint
router.post('/reset-password', [
    body('email').isEmail().withMessage('Invalid email address')
], async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email } = req.body;
        
        // Send password reset email
        await admin.auth().generatePasswordResetLink(email);

        res.json({ 
            message: 'Password reset link sent to email' 
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ 
            error: 'Failed to send password reset link',
            message: error.message
        });
    }
});

module.exports = router;