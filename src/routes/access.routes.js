// backend/src/routes/access.routes.js
import express from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { accessController } from '../controllers/access.controller.js';

const router = express.Router();

// Public route for submitting access request
router.post('/request', accessController.submitRequest);

// Protected admin routes
router.get('/requests',
  verifyAuth,
  requireRole(['admin']),
  accessController.listRequests
);

router.post('/requests/:requestId/approve',
  verifyAuth,
  requireRole(['admin']),
  accessController.approveRequest
);

router.post('/requests/:requestId/reject',
  verifyAuth,
  requireRole(['admin']),
  accessController.rejectRequest
);
router.post('/verify-email',
  async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          error: 'Verification token is required'
        });
      }

      // Verify the token
      const decodedToken = await auth.verifyIdToken(token);
      
      // Update user's email verified status
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
  }
);

export default router;