// backend/src/middleware/auth.middleware.js
import { auth } from '../config/firebase.js';

export const requireRecentLogin = async (req, res, next) => {
  try {
    const { lastLogin } = req.user.customClaims || {};
    
    if (!lastLogin) {
      return res.status(401).json({
        error: 'Login required',
        requiresLogin: true
      });
    }

    const lastLoginDate = new Date(lastLogin);
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    if (lastLoginDate < twentyFourHoursAgo) {
      return res.status(401).json({
        error: 'Recent login required',
        requiresLogin: true
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify login status' });
  }
};

// Add the missing exports needed by auth.routes.js
export const verifyAuth = async (req, res, next) => {
  try {
    const { authorization } = req.headers;
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    
    // Get full user data including custom claims
    const user = await auth.getUser(decodedToken.uid);
    req.user = { ...decodedToken, customClaims: user.customClaims };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireEmailVerified = async (req, res, next) => {
  try {
    const user = await auth.getUser(req.user.uid);
    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Email verification required',
        requiresVerification: true
      });
    }
    next();
  } catch (error) {
    console.error('Email verification check error:', error);
    res.status(500).json({ error: 'Failed to verify email status' });
  }
};

export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      const { customClaims } = req.user;
      const userRole = customClaims?.role || 'user';

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: userRole
        });
      }

      // Add role to request for convenience
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Role verification error:', error);
      res.status(500).json({ 
        error: 'Failed to verify user role',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};