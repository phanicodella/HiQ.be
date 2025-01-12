// backend/src/services/session.service.js
import { db } from '../config/firebase.js';
import { tokenService } from './token.service.js';
import { sendSessionExpiryWarningEmail, sendSessionExpiredEmail } from './email.service.js';

class SessionService {
  constructor() {
    this.sessionsRef = db.collection('sessions');
    this.usersRef = db.collection('users');
  }

  /**
   * Create a new session for a user
   */
  async createSession(userId, metadata = {}) {
    try {
      const sessionToken = await tokenService.generateSessionToken(userId);
      const now = new Date();
      
      const session = {
        userId,
        token: sessionToken,
        status: 'active',
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours
        deviceInfo: {
          userAgent: metadata.userAgent || '',
          ip: metadata.ip || '',
          location: metadata.location || '',
          device: metadata.device || ''
        }
      };

      await this.sessionsRef.doc(sessionToken).set(session);
      
      // Update user's last activity
      await this.usersRef.doc(userId).update({
        lastLoginAt: now,
        lastActivityAt: now
      });

      return {
        sessionToken,
        expiresAt: session.expiresAt
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw new Error('Failed to create session');
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionToken) {
    try {
      const now = new Date();
      await this.sessionsRef.doc(sessionToken).update({
        lastActivityAt: now
      });

      const session = await this.sessionsRef.doc(sessionToken).get();
      if (session.exists) {
        await this.usersRef.doc(session.data().userId).update({
          lastActivityAt: now
        });
      }
    } catch (error) {
      console.error('Error updating session activity:', error);
      throw new Error('Failed to update session activity');
    }
  }

  /**
   * Validate session and check expiry
   */
  async validateSession(sessionToken) {
    try {
      const session = await this.sessionsRef.doc(sessionToken).get();
      
      if (!session.exists) {
        throw new Error('Invalid session');
      }

      const sessionData = session.data();
      const now = new Date();

      if (now > sessionData.expiresAt.toDate()) {
        await this.expireSession(sessionToken);
        throw new Error('Session expired');
      }

      // Check for inactivity (2 hours without activity)
      const inactivityThreshold = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      if (sessionData.lastActivityAt.toDate() < inactivityThreshold) {
        await this.sendExpiryWarning(sessionData.userId);
      }

      return {
        userId: sessionData.userId,
        expiresAt: sessionData.expiresAt.toDate()
      };
    } catch (error) {
      console.error('Session validation error:', error);
      throw error;
    }
  }

  /**
   * Send expiry warning to user
   */
  async sendExpiryWarning(userId) {
    try {
      const user = await this.usersRef.doc(userId).get();
      if (user.exists) {
        const userData = user.data();
        await sendSessionExpiryWarningEmail({
          to: userData.email,
          name: userData.displayName || userData.email
        });
      }
    } catch (error) {
      console.error('Error sending expiry warning:', error);
    }
  }

  /**
   * Expire a session and notify user
   */
  async expireSession(sessionToken) {
    try {
      const session = await this.sessionsRef.doc(sessionToken).get();
      
      if (session.exists) {
        const sessionData = session.data();
        
        // Update session status
        await this.sessionsRef.doc(sessionToken).update({
          status: 'expired',
          expiredAt: new Date()
        });

        // Notify user
        const user = await this.usersRef.doc(sessionData.userId).get();
        if (user.exists) {
          const userData = user.data();
          await sendSessionExpiredEmail({
            to: userData.email,
            name: userData.displayName || userData.email
          });
        }
      }
    } catch (error) {
      console.error('Error expiring session:', error);
      throw new Error('Failed to expire session');
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId) {
    try {
      const sessions = await this.sessionsRef
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .get();

      return sessions.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        lastActivityAt: doc.data().lastActivityAt.toDate(),
        expiresAt: doc.data().expiresAt.toDate()
      }));
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      throw new Error('Failed to fetch user sessions');
    }
  }

  /**
   * End all active sessions for a user
   */
  async endAllUserSessions(userId) {
    try {
      const sessions = await this.sessionsRef
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .get();

      const batch = db.batch();
      const now = new Date();

      sessions.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'terminated',
          terminatedAt: now,
          terminationReason: 'user_logout_all'
        });
      });

      await batch.commit();

      return sessions.size;
    } catch (error) {
      console.error('Error ending user sessions:', error);
      throw new Error('Failed to end user sessions');
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const now = new Date();
      const expiredSessions = await this.sessionsRef
        .where('expiresAt', '<', now)
        .where('status', '==', 'active')
        .get();

      const batch = db.batch();
      
      expiredSessions.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'expired',
          expiredAt: now
        });
      });

      await batch.commit();
      return expiredSessions.size;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      throw new Error('Failed to clean up expired sessions');
    }
  }

  /**
   * Get session analytics for admin
   */
  async getSessionAnalytics() {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [activeSessions, expiredSessions, recentLogins] = await Promise.all([
        this.sessionsRef.where('status', '==', 'active').count().get(),
        this.sessionsRef.where('status', '==', 'expired').count().get(),
        this.sessionsRef.where('createdAt', '>', twentyFourHoursAgo).count().get()
      ]);

      return {
        activeSessions: activeSessions.data().count,
        expiredSessions: expiredSessions.data().count,
        recentLogins: recentLogins.data().count,
        timestamp: now
      };
    } catch (error) {
      console.error('Error getting session analytics:', error);
      throw new Error('Failed to get session analytics');
    }
  }
}

export const sessionService = new SessionService();