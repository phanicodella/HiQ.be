/* 
 * backend/src/middleware/auth.middleware.js
 * Handles authentication using Firebase Admin SDK
 */

import { auth } from '../config/firebase.js';

/* 
 * Verify Firebase authentication token
 */
export const verifyAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: 'interviewer'
    };
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: 'Invalid authentication token' 
    });
  }
};

/* 
 * Require specific role
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied' 
      });
    }
    next();
  };
};

/* 
 * Require email verification
 */
export const requireEmailVerified = (req, res, next) => {
  if (!req.user.emailVerified) {
    return res.status(403).json({ 
      error: 'Email verification required' 
    });
  }
  next();
};

/* 
 * Check resource ownership
 */
export const requireOwnership = (getResourceId) => {
  return async (req, res, next) => {
    try {
      const resourceId = await getResourceId(req);
      if (resourceId !== req.user.uid) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }
      next();
    } catch {
      return res.status(403).json({ 
        error: 'Access denied' 
      });
    }
  };
};