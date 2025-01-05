/* 
 * backend/src/config/firebase.js
 * Firebase Admin SDK initialization with all services
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

// Load environment variables early in the boot process
dotenv.config();

/**
 * Validate all required environment variables
 * @throws {Error} If any required variables are missing
 */
function validateEnvVariables() {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_STORAGE_BUCKET'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required Firebase environment variables: ${missingVars.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }
}

/**
 * Initialize Firebase Admin SDK with all required services
 * @returns {Object} Initialized Firebase services
 * @throws {Error} If initialization fails
 */
function initializeFirebaseAdmin() {
  try {
    validateEnvVariables();

    // Handle private key properly (replace escaped newlines)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    const firebaseConfig = {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      // Production settings
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
      databaseAuthVariableOverride: {
        uid: 'system'
      }
    };

    // Initialize the app
    const app = initializeApp(firebaseConfig);

    // Initialize services
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    // Configure Firestore settings
    db.settings({
      ignoreUndefinedProperties: true,
      timestampsInSnapshots: true
    });

    console.log('Firebase Admin initialized successfully');

    // Return initialized services
    return { 
      app,
      auth, 
      db, 
      storage,
      // Helper method for cleanup
      async cleanup() {
        try {
          await app.delete();
          console.log('Firebase Admin cleanup completed');
        } catch (error) {
          console.error('Firebase Admin cleanup error:', error);
        }
      }
    };
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw new Error(`Failed to initialize Firebase Admin: ${error.message}`);
  }
}

// Initialize services
const firebase = initializeFirebaseAdmin();

// Export initialized services
export const { auth, db, storage, cleanup } = firebase;