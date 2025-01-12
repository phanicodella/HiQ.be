// backend/src/routes/auth.routes.js
import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { verifyAuth, requireEmailVerified, requireRole } from '../middleware/auth.middleware.js';
import { auth } from '../config/firebase.js';


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

// Debug claims route - use this to set admin privileges
router.get('/debug-claims', async (req, res) => {
 try {
   // First check current status
   const userRecord = await auth.getUser('6JXLOmnd2nf8HtOiSFcR4Ct2ziy1');
   console.log('Current user record:', userRecord);
   console.log('Current custom claims:', userRecord.customClaims);
   
   // Set admin claims
   await auth.setCustomUserClaims('6JXLOmnd2nf8HtOiSFcR4Ct2ziy1', {
     role: 'admin',
     lastLogin: new Date().toISOString()
   });

   // Verify the update
   const updatedUser = await auth.getUser('6JXLOmnd2nf8HtOiSFcR4Ct2ziy1');
   
   // Return before and after state
   res.json({
     message: 'Admin privileges updated successfully',
     before: userRecord.customClaims,
     after: updatedUser.customClaims,
     success: true
   });

 } catch (error) {
   console.error('Debug claims error:', error);
   res.status(500).json({ 
     error: error.message,
     details: error.stack 
   });
 }
});

// Add a route to verify current claims
router.get('/verify-claims', verifyAuth, async (req, res) => {
 try {
   const { uid } = req.user;
   const userRecord = await auth.getUser(uid);
   res.json({
     uid: userRecord.uid,
     email: userRecord.email,
     customClaims: userRecord.customClaims,
     currentUser: req.user
   });
 } catch (error) {
   console.error('Verify claims error:', error);
   res.status(500).json({ error: error.message });
 }
});

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