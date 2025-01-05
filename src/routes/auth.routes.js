// backend/src/routes/auth.routes.js
import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { verifyAuth, requireEmailVerified, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * User Management Routes
 */

// Get current user profile
router.get('/me', 
  verifyAuth, 
  authController.getCurrentUser
);

// Update user profile
router.put('/me',
  verifyAuth,
  requireEmailVerified,
  authController.updateProfile
);

// Delete account
router.delete('/me',
  verifyAuth,
  requireEmailVerified,
  authController.deleteAccount
);

/**
 * Admin Routes
 */

// Get user by ID
router.get('/users/:userId',
  verifyAuth,
  requireEmailVerified,
  requireRole(['admin']),
  authController.getUserById
);

// Update user role
router.put('/users/:userId/role',
  verifyAuth,
  requireEmailVerified,
  requireRole(['admin']),
  authController.updateUserRole
);

// List all users (with pagination)
router.get('/users',
  verifyAuth,
  requireEmailVerified,
  requireRole(['admin']),
  authController.listUsers
);

/**
 * Error handling for auth routes
 */
router.use((err, req, res, next) => {
  console.error('Auth Route Error:', err);
  
  // Handle specific errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.details,
        code: 'auth/validation-failed'
      }
    });
  }

  // Default error response
  res.status(err.statusCode || 500).json({
    error: {
      message: err.message || 'Internal server error',
      code: err.code || 'auth/unknown-error'
    }
  });
});

export default router;

// Usage in app.js:
/*
import authRoutes from './routes/auth.routes.js';
app.use('/api/auth', authRoutes);
*/