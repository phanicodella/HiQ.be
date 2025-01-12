// backend/src/services/token.service.js
import crypto from 'crypto';
import { db } from '../config/firebase.js';

class TokenService {
  constructor() {
    this.registrationTokensRef = db.collection('registrationTokens');
    this.sessionTokensRef = db.collection('sessionTokens');
  }

  /**
   * Generate a one-time registration token
   */
  async generateOneTimeToken(email) {
    try {
      // Generate random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

      // Store token in Firestore
      await this.registrationTokensRef.doc(token).set({
        email,
        used: false,
        createdAt: new Date(),
        expiresAt,
        attempts: 0,
        lastAttemptAt: null
      });

      return token;
    } catch (error) {
      console.error('Error generating registration token:', error);
      throw new Error('Failed to generate registration token');
    }
  }

  /**
   * Validate a registration token
   */
  async validateToken(token) {
    try {
      const tokenDoc = await this.registrationTokensRef.doc(token).get();
      
      if (!tokenDoc.exists) {
        throw new Error('Invalid registration token');
      }

      const tokenData = tokenDoc.data();

      // Check if token has been used
      if (tokenData.used) {
        throw new Error('Registration token has already been used');
      }

      // Check if token has expired
      if (new Date() > tokenData.expiresAt.toDate()) {
        throw new Error('Registration token has expired');
      }

      // Check for too many attempts (max 5)
      if (tokenData.attempts >= 5) {
        throw new Error('Too many invalid attempts. Token has been locked.');
      }

      return tokenData.email;
    } catch (error) {
      console.error('Token validation error:', error);
      throw error;
    }
  }

  /**
   * Record a failed token attempt
   */
  async recordFailedAttempt(token) {
    try {
      const tokenRef = this.registrationTokensRef.doc(token);
      
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(tokenRef);
        if (!doc.exists) return;

        const data = doc.data();
        transaction.update(tokenRef, {
          attempts: (data.attempts || 0) + 1,
          lastAttemptAt: new Date()
        });
      });
    } catch (error) {
      console.error('Error recording failed attempt:', error);
    }
  }

  /**
   * Mark a registration token as used
   */
  async markTokenAsUsed(token, userId) {
    try {
      await this.registrationTokensRef.doc(token).update({
        used: true,
        usedAt: new Date(),
        usedBy: userId
      });
    } catch (error) {
      console.error('Error marking token as used:', error);
      throw new Error('Failed to update token status');
    }
  }

  /**
   * Generate a session token
   */
  async generateSessionToken(userId) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await this.sessionTokensRef.doc(token).set({
        userId,
        createdAt: new Date(),
        expiresAt,
        lastActivityAt: new Date()
      });

      return token;
    } catch (error) {
      console.error('Error generating session token:', error);
      throw new Error('Failed to generate session token');
    }
  }

  /**
   * Validate a session token
   */
  async validateSessionToken(token) {
    try {
      const tokenDoc = await this.sessionTokensRef.doc(token).get();
      
      if (!tokenDoc.exists) {
        throw new Error('Invalid session token');
      }

      const tokenData = tokenDoc.data();

      if (new Date() > tokenData.expiresAt.toDate()) {
        throw new Error('Session has expired');
      }

      // Update last activity
      await this.sessionTokensRef.doc(token).update({
        lastActivityAt: new Date()
      });

      return tokenData.userId;
    } catch (error) {
      console.error('Session validation error:', error);
      throw error;
    }
  }

  /**
   * Refresh a session token
   */
  async refreshSessionToken(oldToken) {
    try {
      const oldTokenDoc = await this.sessionTokensRef.doc(oldToken).get();
      
      if (!oldTokenDoc.exists) {
        throw new Error('Invalid session token');
      }

      const oldTokenData = oldTokenDoc.data();

      // Generate new token
      const newToken = await this.generateSessionToken(oldTokenData.userId);

      // Invalidate old token
      await this.sessionTokensRef.doc(oldToken).delete();

      return newToken;
    } catch (error) {
      console.error('Session refresh error:', error);
      throw new Error('Failed to refresh session');
    }
  }

  /**
   * Invalidate a session token
   */
  async invalidateSessionToken(token) {
    try {
      await this.sessionTokensRef.doc(token).delete();
    } catch (error) {
      console.error('Error invalidating session token:', error);
      throw new Error('Failed to invalidate session');
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens() {
    try {
      const now = new Date();

      // Clean up registration tokens
      const expiredRegistrationTokens = await this.registrationTokensRef
        .where('expiresAt', '<', now)
        .where('used', '==', false)
        .get();

      const registrationBatch = db.batch();
      expiredRegistrationTokens.docs.forEach(doc => {
        registrationBatch.delete(doc.ref);
      });
      await registrationBatch.commit();

      // Clean up session tokens
      const expiredSessionTokens = await this.sessionTokensRef
        .where('expiresAt', '<', now)
        .get();

      const sessionBatch = db.batch();
      expiredSessionTokens.docs.forEach(doc => {
        sessionBatch.delete(doc.ref);
      });
      await sessionBatch.commit();

      return {
        registrationTokensDeleted: expiredRegistrationTokens.size,
        sessionTokensDeleted: expiredSessionTokens.size
      };
    } catch (error) {
      console.error('Token cleanup error:', error);
      throw new Error('Failed to clean up expired tokens');
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId) {
    try {
      const sessions = await this.sessionTokensRef
        .where('userId', '==', userId)
        .where('expiresAt', '>', new Date())
        .get();

      return sessions.docs.map(doc => ({
        token: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        expiresAt: doc.data().expiresAt.toDate(),
        lastActivityAt: doc.data().lastActivityAt.toDate()
      }));
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      throw new Error('Failed to fetch user sessions');
    }
  }
}

export const tokenService = new TokenService();