// backend/src/routes/access.routes.js
import express from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { accessController } from '../controllers/access.controller.js';

const router = express.Router();

// Public routes
router.post('/request', accessController.submitRequest);

// Protected admin routes
router.get('/admin/requests',
  verifyAuth,
  requireRole(['admin']),
  accessController.listRequests
);

router.post('/admin/requests/:requestId/approve',
  verifyAuth,
  requireRole(['admin']),
  accessController.approveRequest
);

router.post('/admin/requests/:requestId/reject',
  verifyAuth,
  requireRole(['admin']),
  accessController.rejectRequest
);

// backend/src/routes/access.routes.js
import express from 'express';



// Public route for submitting access request
router.post('/request', accessController.submitRequest);

export default router;

