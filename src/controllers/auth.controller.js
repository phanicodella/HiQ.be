// backend/src/controllers/auth.controller.js
import { auth } from '../config/firebase.js';

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
      
      // Add any cleanup tasks here (e.g., deleting user data)
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

      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        role: userRecord.customClaims?.role || 'user',
        createdAt: userRecord.metadata.creationTime,
        lastSignIn: userRecord.metadata.lastSignInTime,
        disabled: userRecord.disabled
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
   * Admin: Update user role
   */
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      const allowedRoles = ['user', 'admin', 'moderator'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          error: {
            message: 'Invalid role specified',
            code: 'auth/invalid-role'
          }
        });
      }

      await auth.setCustomUserClaims(userId, { role });

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

  /**
   * Admin: List users with pagination
   */
  async listUsers(req, res) {
    try {
      const { pageSize = 100, pageToken } = req.query;
      
      const listUsersResult = await auth.listUsers(parseInt(pageSize), pageToken);
      
      const users = listUsersResult.users.map(userRecord => ({
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        role: userRecord.customClaims?.role || 'user',
        disabled: userRecord.disabled
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
}

export const authController = new AuthController();