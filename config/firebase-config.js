// backend/config/firebase-config.js
const admin = require('firebase-admin');
const path = require('path');

function initializeFirebaseAdmin() {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'FIREBASE_PROJECT_ID',
            'FIREBASE_CLIENT_EMAIL',
            'FIREBASE_PRIVATE_KEY'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            throw new Error(`Missing Firebase configuration variables: ${missingVars.join(', ')}`);
        }

        // Only initialize if not already initialized
        if (admin.apps.length === 0) {
            // Sanitize private key
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

            // Initialize Firebase Admin
            const firebaseApp = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                }),
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET
            });

            // Initialize services
            const firestore = admin.firestore();
            const storage = admin.storage();
            const auth = admin.auth();

            // Configure Firestore settings
            try {
                firestore.settings({
                    timestampsInSnapshots: true,
                    ignoreUndefinedProperties: true,
                    cacheSizeBytes: admin.firestore.CACHE_SIZE_UNLIMITED
                });
            } catch (error) {
                console.error('Firestore configuration error:', error);
            }

            // Configure advanced authentication
            const configureAuth = async () => {
                try {
                    await auth.setCustomUserClaims(auth.currentUser?.uid || '', {
                        role: 'user'
                    });

                    await auth.sessionCookie({
                        maxAge: 24 * 60 * 60 * 1000,
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production'
                    });
                } catch (authConfigError) {
                    console.error('Authentication configuration error:', authConfigError);
                }
            };

            // Security configuration
            const securityConfig = {
                setUserRole: async (uid, role) => {
                    try {
                        await auth.setCustomUserClaims(uid, { role });
                        console.log(`User ${uid} assigned role: ${role}`);
                    } catch (roleError) {
                        console.error(`Failed to set user role for ${uid}:`, roleError);
                    }
                },

                auditLog: (action, userId, details = {}) => {
                    firestore.collection('audit_logs').add({
                        action,
                        userId,
                        details,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    }).catch(console.error);
                }
            };

            // Error monitoring
            process.on('unhandledRejection', (reason, promise) => {
                console.error('Unhandled Rejection at:', promise, 'reason:', reason);
                securityConfig.auditLog('unhandled_rejection', 'system', { reason: reason.toString() });
            });

            return {
                app: firebaseApp,
                admin,
                firestore,
                storage,
                auth,
                configureAuth,
                securityConfig
            };
        }

        return {
            admin,
            firestore: admin.firestore(),
            storage: admin.storage(),
            auth: admin.auth()
        };
    } catch (error) {
        console.error('Firebase Admin Initialization Error:', error);

        // Error logging
        const errorLog = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };

        if (admin.firestore) {
            admin.firestore().collection('initialization_errors').add(errorLog)
                .catch(console.error);
        }

        throw error;
    }
}

module.exports = {
    initializeFirebaseAdmin,
    admin
};