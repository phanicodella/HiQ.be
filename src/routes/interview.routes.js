/* 
 * backend/src/routes/interview.routes.js
 * Interview routes configuration
 */

import express from 'express';
import { interviewController } from '../controllers/interview.controller.js';
import { verifyAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

/* 
 * Protected routes - require authentication
 */
router.use(verifyAuth);

// Get all interviews for interviewer
router.get('/', interviewController.getInterviews.bind(interviewController));

// Create new interview
router.post('/', interviewController.createSession.bind(interviewController));

// Cancel interview
router.post('/:id/cancel', interviewController.cancelInterview.bind(interviewController));

export default router;