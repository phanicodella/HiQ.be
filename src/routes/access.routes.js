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

export default router;