// backend/middleware/interview-access.js
const admin = require('firebase-admin');
const logger = require('winston');

const validateInterviewAccess = async (req, res, next) => {
    try {
        const { id } = req.params;
        const db = admin.firestore();
        const userUid = req.user.uid;

        // Fetch interview details
        const interviewDoc = await db.collection('interviews').doc(id).get();
        
        if (!interviewDoc.exists) {
            logger.warn(`Interview not found: ${id}`);
            return res.status(404).json({
                error: 'Interview not found',
                details: 'No interview exists with this ID'
            });
        }

        const interviewData = interviewDoc.data();

        // Validate interview status
        if (!['scheduled', 'invited'].includes(interviewData.status)) {
            logger.warn(`Invalid interview status: ${interviewData.status}`);
            return res.status(400).json({
                error: 'Interview is not active',
                details: `Current status: ${interviewData.status}`
            });
        }

        // Verify interview time window
        const interviewTime = interviewData.date.toDate();
        const now = new Date();
        const timeDiff = interviewTime.getTime() - now.getTime();
        
        // Allow access 15 minutes before and until 1 hour after
        const earlyAccessWindow = 15 * 60 * 1000; // 15 minutes
        const lateAccessWindow = 60 * 60 * 1000;  // 1 hour

        if (timeDiff < -lateAccessWindow || timeDiff > earlyAccessWindow) {
            logger.warn(`Interview time window invalid for ${id}`);
            return res.status(403).json({
                error: 'Interview is not currently accessible',
                details: 'Please check interview time or contact support'
            });
        }

        // Verify participant access rights
        const isInterviewer = interviewData.interviewerId === userUid;
        const isCandidate = req.user.email === interviewData.candidateEmail;

        if (!isInterviewer && !isCandidate) {
            logger.warn(`Unauthorized access attempt for interview ${id} by user ${userUid}`);
            return res.status(403).json({
                error: 'Access denied',
                details: 'You are not authorized to access this interview'
            });
        }

        // Add interview data and access type to request
        req.interviewData = interviewData;
        req.interviewAccess = {
            type: isInterviewer ? 'interviewer' : 'candidate',
            timestamp: now
        };

        // Audit log the access
        await db.collection('interview_access_logs').add({
            interviewId: id,
            userId: userUid,
            userEmail: req.user.email,
            accessType: req.interviewAccess.type,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        next();
    } catch (error) {
        logger.error('Interview access validation error:', {
            error: error.message,
            stack: error.stack,
            interviewId: req.params.id,
            userId: req.user?.uid
        });

        res.status(500).json({
            error: 'Server error during interview access validation',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

module.exports = {
    validateInterviewAccess
};