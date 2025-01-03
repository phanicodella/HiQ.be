// backend/middleware/auth.js
const admin = require('firebase-admin');
const logger = require('winston');

const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Unauthorized', 
                message: 'No token provided',
                details: 'Authentication token is required'
            });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Add user info to request
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            role: decodedToken.role || 'user',
            emailVerified: decodedToken.email_verified
        };

        // Audit log the authentication
        const db = admin.firestore();
        await db.collection('auth_logs').add({
            userId: req.user.uid,
            email: req.user.email,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            path: req.path,
            method: req.method,
            ip: req.ip
        });

        next();
    } catch (error) {
        logger.error('Authentication error:', {
            error: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method
        });

        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Please login again'
            });
        }

        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid token',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Role-based authorization middleware
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions'
            });
        }
        next();
    };
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    logger.error('Auth Error:', {
        error: err.message,
        stack: err.stack,
        user: req.user?.uid,
        path: req.path
    });

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message
        });
    }

    if (err.name === 'FirebaseError') {
        return res.status(401).json({
            error: 'Authentication Error',
            message: 'Invalid authentication'
        });
    }

    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 
            'Something went wrong' : err.message
    });
};

// Rate limiting middleware for sensitive routes
const rateLimiter = require('express-rate-limit');
const loginLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 failed attempts
    message: 'Too many login attempts, please try again later'
});

module.exports = {
    authenticateUser,
    authorizeRoles,
    errorHandler,
    loginLimiter
};