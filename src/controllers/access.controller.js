// backend/src/controllers/access.controller.js
import { db } from '../config/firebase.js';
import { sendAccessRequestEmail } from '../services/email.service.js';

class AccessController {
  // Email domain validation method
  validateEmail(email) {
    const genericDomains = [
      'gmail.com', 
      'googlemail.com', 
      'hotmail.com', 
      'hotmail.co.uk', 
      'outlook.com', 
      'yahoo.com', 
      'yahoo.co.uk', 
      'icloud.com', 
      'live.com', 
      'msn.com'
    ];

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Invalid email format';
    }

    // Check against generic domains
    const domain = email.split('@')[1].toLowerCase();
    if (genericDomains.includes(domain)) {
      return 'Please use a work email address';
    }

    return null;
  }

  async submitRequest(req, res) {
    try {
      const {
        workDomain,
        email,
        teamSize,
        message
      } = req.body;

      // Validate email
      const emailError = this.validateEmail(email);
      if (emailError) {
        return res.status(400).json({
          error: emailError
        });
      }

      // Validate required fields
      if (!workDomain) {
        return res.status(400).json({
          error: 'Work domain is required'
        });
      }

      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already has a pending request
      const existingRequests = await db.collection('accessRequests')
        .where('email', '==', normalizedEmail)
        .where('status', '==', 'pending')
        .get();

      if (!existingRequests.empty) {
        return res.status(400).json({
          error: 'A request from this email is already pending'
        });
      }

      // Create access request
      const requestRef = db.collection('accessRequests').doc();
      const now = new Date();
      
      await requestRef.set({
        workDomain,
        email: normalizedEmail,
        teamSize: teamSize || null,
        message: message || null,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      });

      // Send notification email to admin
      await sendAccessRequestEmail({
        to: process.env.ADMIN_EMAIL || 'getHiQaccess@talentsync.tech',
        requestData: {
          id: requestRef.id,
          workDomain,
          email: normalizedEmail,
          teamSize: teamSize || 'Not specified'
        }
      });

      res.status(201).json({
        message: 'Access request submitted successfully',
        requestId: requestRef.id
      });

    } catch (error) {
      console.error('Submit access request error:', error);
      res.status(500).json({
        error: 'Failed to submit access request',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async listRequests(req, res) {
    try {
      const { status = 'pending' } = req.query;

      const requestsSnapshot = await db.collection('accessRequests')
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .get();

      const requests = requestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        updatedAt: doc.data().updatedAt.toDate()
      }));

      res.json({ requests });

    } catch (error) {
      console.error('List access requests error:', error);
      res.status(500).json({
        error: 'Failed to fetch access requests',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async approveRequest(req, res) {
    try {
      const { requestId } = req.params;
      const requestRef = db.collection('accessRequests').doc(requestId);
      const request = await requestRef.get();

      if (!request.exists) {
        return res.status(404).json({
          error: 'Access request not found'
        });
      }

      const requestData = request.data();
      if (requestData.status !== 'pending') {
        return res.status(400).json({
          error: 'Request has already been processed'
        });
      }

      // Generate temporary password
      const temporaryPassword = this.generateTemporaryPassword();

      // Create user account for approved request
      const newUser = await this.createUserAccount({
        email: requestData.email,
        password: temporaryPassword,
        displayName: requestData.workDomain
      });

      // Update request status
      await requestRef.update({
        status: 'approved',
        approvedBy: req.user.uid,
        approvedAt: new Date(),
        updatedAt: new Date()
      });

      // Send approval email with credentials
      await sendAccessApprovalEmail({
        to: requestData.email,
        userData: {
          email: newUser.email,
          password: temporaryPassword,
          name: requestData.workDomain
        }
      });

      res.json({
        message: 'Access request approved successfully'
      });

    } catch (error) {
      console.error('Approve access request error:', error);
      res.status(500).json({
        error: 'Failed to approve access request',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async rejectRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { reason } = req.body;

      const requestRef = db.collection('accessRequests').doc(requestId);
      const request = await requestRef.get();

      if (!request.exists) {
        return res.status(404).json({
          error: 'Access request not found'
        });
      }

      const requestData = request.data();
      if (requestData.status !== 'pending') {
        return res.status(400).json({
          error: 'Request has already been processed'
        });
      }

      await requestRef.update({
        status: 'rejected',
        rejectionReason: reason || 'No specific reason provided',
        rejectedBy: req.user.uid,
        rejectedAt: new Date(),
        updatedAt: new Date()
      });

      // Send rejection email
      await sendAccessRejectionEmail({
        to: requestData.email,
        name: requestData.workDomain,
        reason: reason || 'No specific reason provided'
      });

      res.json({
        message: 'Access request rejected successfully'
      });

    } catch (error) {
      console.error('Reject access request error:', error);
      res.status(500).json({
        error: 'Failed to reject access request',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Helper method to generate temporary password
  generateTemporaryPassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    return password;
  }

  // Placeholder method for user creation (implement in auth controller)
  async createUserAccount({ email, password, displayName }) {
    // This should be implemented in your auth controller
    // Example implementation:
    const userRecord = await auth.createUser({
      email,
      password,
      displayName
    });

    return {
      email: userRecord.email,
      uid: userRecord.uid
    };
  }
}

export const accessController = new AccessController();