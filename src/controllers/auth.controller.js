// backend/src/controllers/auth.controller.js
import { auth, db } from '../config/firebase.js';

class AuthController {
  /**
   * Get current user's profile
   */
  async getCurrentUser(req, res) {
    try {
      const { uid } = req.user;
      const userRecord = await auth.getUser(uid);
      
      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        role: userRecord.customClaims?.role || 'user',
        lastLogin: userRecord.customClaims?.lastLogin,
        createdAt: userRecord.metadata.creationTime,
        lastSignIn: userRecord.metadata.lastSignInTime
      };

      res.json({ user: userData });
    } catch (error) {
      console.error('Get Current User Error:', error);
      res.status(500).json({
        error: {
          message: 'Failed to fetch user data',
          code: error.code || 'auth/unknown-error'
        }
      });
    }
  }

  /**
   * Register new user with one-time token
   */
  async registerWithToken(req, res) {
    try {
      const { token, email, password, displayName } = req.body;

      // Token verification is handled by middleware
      const { tokenData } = req;

      if (email !== tokenData.email) {
        return res.status(400).json({
          error: 'Email does not match registration token'
        });
      }

      // Create user account
      const userRecord = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: true
      });

      // Set custom claims for interviewer role
      await auth.setCustomUserClaims(userRecord.uid, {
        role: 'interviewer',
        lastLogin: new Date().toISOString()
      });

      // Mark token as used
      await db.collection('registrationTokens')
        .doc(token)
        .update({
          used: true,
          usedAt: new Date(),
          userId: userRecord.uid
        });

      // Create user profile
      await db.collection('users').doc(userRecord.uid).set({
        email: userRecord.email,
        displayName: userRecord.displayName,
        role: 'interviewer',
        createdAt: new Date(),
        lastLoginAt: new Date()
      });

      res.status(201).json({
        message: 'Account created successfully',
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName
        }
      });

    } catch (error) {
      console.error('Register with token error:', error);
      res.status(500).json({
        error: 'Failed to create account',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(req, res) {
    try {
      const { uid } = req.user;
      const now = new Date().toISOString();

      // Update custom claims
      const customClaims = (await auth.getUser(uid)).customClaims || {};
      await auth.setCustomUserClaims(uid, {
        ...customClaims,
        lastLogin: now
      });

      // Update user profile
      await db.collection('users').doc(uid).update({
        lastLoginAt: new Date()
      });

      res.json({ 
        message: 'Last login updated successfully',
        lastLogin: now
      });
    } catch (error) {
      console.error('Update last login error:', error);
      res.status(500).json({ 
        error: 'Failed to update last login',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req, res) {
    try {
      const { uid } = req.user;
      const { displayName, photoURL } = req.body;

      const updateData = {};
      if (displayName) updateData.displayName = displayName;
      if (photoURL) updateData.photoURL = photoURL;

      await auth.updateUser(uid, updateData);

      // Update profile in Firestore
      if (Object.keys(updateData).length > 0) {
        await db.collection('users').doc(uid).update({
          ...updateData,
          updatedAt: new Date()
        });
      }

      res.json({ 
        message: 'Profile updated successfully',
        updates: updateData 
      });
    } catch (error) {
      console.error('Update Profile Error:', error);
      res.status(500).json({
        error: {
          message: 'Failed to update profile',
          code: error.code || 'auth/update-failed'
        }
      });
    }
  }

  /**
   * Delete user account
   */
  async deleteAccount(req, res) {
    try {
      const { uid } = req.user;
      
      // Delete user data from Firestore first
      await db.collection('users').doc(uid).delete();
      
      // Delete user authentication record
      await auth.deleteUser(uid);

      res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      console.error('Delete Account Error:', error);
      res.status(500).json({
        error: {
          message: 'Failed to delete account',
          code: error.code || 'auth/delete-failed'
        }
      });
    }
  }

  /**
   * Admin: Get user by ID
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const userRecord = await auth.getUser(userId);
      const userProfile = await db.collection('users').doc(userId).get();

      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        role: userRecord.customClaims?.role || 'user',
        createdAt: userRecord.metadata.creationTime,
        lastLogin: userRecord.customClaims?.lastLogin,
        disabled: userRecord.disabled,
        profile: userProfile.exists ? userProfile.data() : null
      };

      res.json({ user: userData });
    } catch (error) {
      console.error('Get User By ID Error:', error);
      
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({
          error: {
            message: 'User not found',
            code: error.code
          }
        });
      }

      res.status(500).json({
        error: {
          message: 'Failed to fetch user data',
          code: error.code || 'auth/unknown-error'
        }
      });
    }
  }

  /**
   * Admin: List users with pagination
   */
  async listUsers(req, res) {
    try {
      const { pageSize = 100, pageToken } = req.query;
      
      const listUsersResult = await auth.listUsers(parseInt(pageSize), pageToken);
      
      const users = await Promise.all(listUsersResult.users.map(async userRecord => {
        const userProfile = await db.collection('users').doc(userRecord.uid).get();
        return {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          role: userRecord.customClaims?.role || 'user',
          lastLogin: userRecord.customClaims?.lastLogin,
          disabled: userRecord.disabled,
          profile: userProfile.exists ? userProfile.data() : null
        };
      }));

      res.json({
        users,
        pageToken: listUsersResult.pageToken
      });
    } catch (error) {
      console.error('List Users Error:', error);
      res.status(500).json({
        error: {
          message: 'Failed to list users',
          code: error.code || 'auth/unknown-error'
        }
      });
    }
  }

  /**
   * Admin: Update user role
   */
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      const allowedRoles = ['user', 'admin', 'interviewer', 'moderator'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          error: {
            message: 'Invalid role specified',
            code: 'auth/invalid-role'
          }
        });
      }

      const userRecord = await auth.getUser(userId);
      const customClaims = userRecord.customClaims || {};

      await auth.setCustomUserClaims(userId, { 
        ...customClaims,
        role 
      });

      await db.collection('users').doc(userId).update({
        role,
        updatedAt: new Date()
      });

      res.json({ 
        message: 'User role updated successfully',
        updates: { role } 
      });
    } catch (error) {
      console.error('Update User Role Error:', error);
      
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({
          error: {
            message: 'User not found',
            code: error.code
          }
        });
      }

      res.status(500).json({
        error: {
          message: 'Failed to update user role',
          code: error.code || 'auth/update-failed'
        }
      });
    }
  }
}

export const authController = new AuthController();