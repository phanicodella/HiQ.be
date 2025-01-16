// src/middleware/admin.middleware.js
import { auth, db } from '../config/firebase.js';

/**
 * Middleware to verify admin privileges
 * Checks both Firebase custom claims and Firestore admin records
 */
export const requireAdmin = async (req, res, next) => {
  try {
    // Ensure user exists in request
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const { uid } = req.user;
    
    try {
      // Get user from Firebase Auth
      const userRecord = await auth.getUser(uid);
      
      // Primary Check: Firebase Custom Claims
      const customClaims = userRecord.customClaims || {};
      if (customClaims.isAdmin && customClaims.role === 'admin') {
        // Add admin info to request for use in controllers
        req.isAdmin = true;
        req.adminData = {
          email: userRecord.email,
          uid: userRecord.uid,
          role: 'admin'
        };
        return next();
      }

      // Secondary Check: Admin Email List
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail && userRecord.email === adminEmail) {
        // If email matches but claims aren't set, update them
        await auth.setCustomUserClaims(uid, {
          role: 'admin',
          isAdmin: true,
          updatedAt: new Date().toISOString()
        });

        // Also update Firestore
        await db.collection('users').doc(uid).set({
          email: userRecord.email,
          role: 'admin',
          isAdmin: true,
          updatedAt: new Date()
        }, { merge: true });

        // Update access control list
        await db.collection('accessControl').doc('admins').set({
          emails: [userRecord.email],
          updatedAt: new Date()
        }, { merge: true });

        req.isAdmin = true;
        req.adminData = {
          email: userRecord.email,
          uid: userRecord.uid,
          role: 'admin'
        };
        return next();
      }

      // Tertiary Check: Firestore Admin Records
      const accessControlDoc = await db.collection('accessControl').doc('admins').get();
      const adminEmails = accessControlDoc.data()?.emails || [];
      
      if (adminEmails.includes(userRecord.email)) {
        // Update custom claims if they're missing
        await auth.setCustomUserClaims(uid, {
          role: 'admin',
          isAdmin: true,
          updatedAt: new Date().toISOString()
        });

        req.isAdmin = true;
        req.adminData = {
          email: userRecord.email,
          uid: userRecord.uid,
          role: 'admin'
        };
        return next();
      }

      // If all checks fail, deny access
      return res.status(403).json({
        error: 'Access denied. Admin privileges required.',
        details: process.env.NODE_ENV === 'development' ? 
          'User does not have admin privileges in any verification method.' : undefined
      });

    } catch (authError) {
      console.error('Firebase auth error in admin middleware:', authError);
      
      // Special handling for specific Firebase errors
      if (authError.code === 'auth/user-not-found') {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      throw authError; // Re-throw for general error handler
    }

  } catch (error) {
    console.error('Admin middleware error:', error);
    
    // Don't expose internal error details in production
    return res.status(500).json({
      error: 'Failed to verify admin privileges',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Optional: Middleware to check if user has specific admin capabilities
 * Usage: requireAdminCapability(['manage_users', 'approve_requests'])
 */
export const requireAdminCapability = (capabilities = []) => {
  return async (req, res, next) => {
    try {
      // First ensure user is admin
      await requireAdmin(req, res, async () => {
        // If no specific capabilities required, proceed
        if (!capabilities.length) return next();

        // Get user's admin capabilities from Firestore
        const adminDoc = await db.collection('users').doc(req.user.uid).get();
        const userCapabilities = adminDoc.data()?.capabilities || [];

        // Check if user has all required capabilities
        const hasAllCapabilities = capabilities.every(cap => 
          userCapabilities.includes(cap)
        );

        if (!hasAllCapabilities) {
          return res.status(403).json({
            error: 'Insufficient admin privileges',
            required: capabilities,
            current: userCapabilities
          });
        }

        next();
      });
    } catch (error) {
      console.error('Admin capability check error:', error);
      res.status(500).json({
        error: 'Failed to verify admin capabilities',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Helper to check if a user is admin without blocking the request
 * Useful for conditional UI rendering or non-critical admin checks
 */
export const isUserAdmin = async (uid) => {
  try {
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};
    
    if (customClaims.isAdmin) return true;

    const accessControlDoc = await db.collection('accessControl').doc('admins').get();
    const adminEmails = accessControlDoc.data()?.emails || [];
    
    return adminEmails.includes(userRecord.email);
  } catch (error) {
    console.error('Admin check error:', error);
    return false;
  }
};
