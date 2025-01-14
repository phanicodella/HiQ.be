// backend/src/routes/auth.routes.js
import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { verifyAuth, requireEmailVerified, requireRole } from '../middleware/auth.middleware.js';
import { auth, db } from '../config/firebase.js';  // Add db import here
import { accessController } from '../controllers/access.controller.js';

const router = express.Router();

// Public routes (no auth required)
router.post('/verify-token', accessController.verifyToken);
router.post('/validate-token', accessController.verifyToken);

// User Management Routes
router.get('/me', 
  verifyAuth, 
  authController.getCurrentUser
);

router.put('/me',
  verifyAuth,
  requireEmailVerified,
  authController.updateProfile
);

router.delete('/me',
  verifyAuth,
  requireEmailVerified,
  authController.deleteAccount
);

// Admin Routes
router.get('/users/:userId',
  verifyAuth,
  requireEmailVerified,
  requireRole(['admin']),
  authController.getUserById
);

router.put('/users/:userId/role',
  verifyAuth,
  requireEmailVerified,
  requireRole(['admin']),
  authController.updateUserRole
);

router.get('/users',
  verifyAuth,
  requireEmailVerified,
  requireRole(['admin']),
  authController.listUsers
);

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: 'Verification token is required'
      });
    }

    const decodedToken = await auth.verifyIdToken(token);
    await auth.updateUser(decodedToken.uid, {
      emailVerified: true
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(400).json({
      error: 'Invalid or expired verification token'
    });
  }
});

router.post('/complete-registration', async (req, res) => {
  try {
    const { token, uid } = req.body;

    if (!token || !uid) {
      return res.status(400).json({
        error: 'Token and user ID are required'
      });
    }

    const tokenDoc = await db.collection('registrationTokens').doc(token).get();
    if (!tokenDoc.exists) {
      return res.status(404).json({
        error: 'Invalid registration token'
      });
    }

    const tokenData = tokenDoc.data();
    if (tokenData.used) {
      return res.status(400).json({
        error: 'Registration token has already been used'
      });
    }

    await tokenDoc.ref.update({
      used: true,
      usedAt: new Date(),
      usedBy: uid
    });

    // Create user document in users collection
    await db.collection('users').doc(uid).set({
      email: tokenData.email,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({ message: 'Registration completed successfully' });
  } catch (error) {
    console.error('Complete registration error:', error);
    res.status(500).json({
      error: 'Failed to complete registration'
    });
  }
});


export default router;