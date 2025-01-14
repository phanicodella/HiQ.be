// backend/src/controllers/access.controller.js
import { db, auth } from '../config/firebase.js';
import { sendAccessRequestEmail, sendAccessApprovalEmail, sendAccessRejectionEmail } from '../services/email.service.js';
import { tokenService } from '../services/token.service.js';
import crypto from 'crypto';

class AccessController {
  constructor() {
    this.submitRequest = this.submitRequest.bind(this);
    this.listRequests = this.listRequests.bind(this);
    this.approveRequest = this.approveRequest.bind(this);
    this.rejectRequest = this.rejectRequest.bind(this);
    this.validateEmail = this.validateEmail.bind(this);
    this.validateWorkDomain = this.validateWorkDomain.bind(this);
    this.verifyToken = this.verifyToken.bind(this);
    this.generateRegistrationToken = this.generateRegistrationToken.bind(this);
  }

  validateWorkDomain(domain) {
    if (!domain) return 'Work domain is required';
    if (domain.length < 3) return 'Domain name is too short';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain)) {
      return 'Please enter a valid domain (e.g., company.com)';
    }
    return null;
  }

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Invalid email format';
    }

    const domain = email.split('@')[1].toLowerCase();
    if (genericDomains.includes(domain)) {
      return 'Please use a work email address';
    }

    return null;
  }

  async generateRegistrationToken(email) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours

    await db.collection('registrationTokens').doc(token).set({
      email,
      used: false,
      createdAt: now,
      expiresAt,
      attempts: 0,
      lastAttemptAt: null
    });

    return token;
  }

  async verifyToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          error: 'Token is required'
        });
      }

      console.log('Verifying token:', token);
      const tokenDoc = await db.collection('registrationTokens').doc(token).get();

      if (!tokenDoc.exists) {
        console.log('Token not found');
        return res.status(404).json({
          error: 'Invalid registration token'
        });
      }

      const tokenData = tokenDoc.data();
      console.log('Token data:', tokenData);

      if (tokenData.used) {
        return res.status(400).json({
          error: 'This registration link has already been used'
        });
      }

      const expiresAt = tokenData.expiresAt.toDate();
      if (new Date() > expiresAt) {
        return res.status(400).json({
          error: 'Registration link has expired'
        });
      }

      // Update last attempt
      await tokenDoc.ref.update({
        lastAttemptAt: new Date(),
        attempts: tokenData.attempts + 1
      });

      res.json({
        email: tokenData.email,
        valid: true
      });

    } catch (error) {
      console.error('Token verification error:', error);
      res.status(500).json({
        error: 'Failed to verify registration token',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async submitRequest(req, res) {
    try {
      const {
        workDomain,
        email,
        teamSize,
        message
      } = req.body;

      // Validation checks
      const validationErrors = {};

      const emailError = this.validateEmail(email);
      if (emailError) {
        validationErrors.email = emailError;
      }

      const domainError = this.validateWorkDomain(workDomain);
      if (domainError) {
        validationErrors.workDomain = domainError;
      }

      if (teamSize !== undefined && teamSize !== '') {
        const teamSizeNum = parseInt(teamSize);
        if (isNaN(teamSizeNum) || teamSizeNum < 1) {
          validationErrors.teamSize = 'Team size must be a positive number';
        }
      }

      if (message && message.length > 1000) {
        validationErrors.message = 'Message is too long (max 1000 characters)';
      }

      if (Object.keys(validationErrors).length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validationErrors
        });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const normalizedDomain = workDomain.toLowerCase().trim();

      const pendingRequest = await db.collection('accessRequests')
        .where('email', '==', normalizedEmail)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!pendingRequest.empty) {
        return res.status(400).json({
          error: 'A request from this email is already pending'
        });
      }
      const requestRef = db.collection('accessRequests').doc();
      const now = new Date();
      
      const requestData = {
        workDomain: normalizedDomain,
        email: normalizedEmail,
        teamSize: teamSize ? parseInt(teamSize) : null,
        message: message || null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      await requestRef.set(requestData);

      try {
        await sendAccessRequestEmail({
          to: process.env.ADMIN_EMAIL || 'getHiQaccess@talentsync.tech',
          requestData: {
            id: requestRef.id,
            workDomain: normalizedDomain,
            email: normalizedEmail,
            teamSize: teamSize || 'Not specified'
          }
        });
      } catch (emailError) {
        console.error('Failed to send admin notification:', emailError);
      }

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
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
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

      const registrationToken = await this.generateRegistrationToken(requestData.email);

      await requestRef.update({
        status: 'approved',
        approvedBy: req.user.uid,
        approvedAt: new Date(),
        updatedAt: new Date(),
        registrationToken
      });

      try {
        await sendAccessApprovalEmail({
          to: requestData.email,
          name: requestData.workDomain,
          registrationToken,
          registrationUrl: `${process.env.FRONTEND_URL}/register/${registrationToken}`
        });
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
      }

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

      try {
        await sendAccessRejectionEmail({
          to: requestData.email,
          name: requestData.workDomain,
          reason: reason || 'No specific reason provided'
        });
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
      }

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
}

export const accessController = new AccessController();