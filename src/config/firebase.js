/* 
 * backend/src/config/firebase.js
 * Firebase Admin initialization with Auth, Firestore, and Storage
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

/* 
 * Load environment variables
 */
dotenv.config();

/* 
 * Validate required environment variables
 */
function validateEnvVariables() {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required Firebase environment variables: ${missingVars.join(', ')}`);
  }
}

/* 
 * Initialize Firebase Admin SDK
 */
function initializeFirebaseAdmin() {
  try {
    validateEnvVariables();

    /* 
     * Handle private key properly (replace escaped newlines)
     */
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    const firebaseConfig = {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    console.log('Firebase Admin initialized successfully');
    return { auth, db, storage };
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    throw new Error('Failed to initialize Firebase Admin: ' + error.message);
  }
}

/* 
 * Initialize services and export them
 */
const { auth, db, storage } = initializeFirebaseAdmin();

export { auth, db, storage };