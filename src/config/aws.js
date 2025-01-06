// backend/src/config/aws.js

import { RekognitionClient } from "@aws-sdk/client-rekognition";
import dotenv from 'dotenv';

dotenv.config();

/**
 * Validate required AWS environment variables
 */
function validateAwsConfig() {
  const required = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required AWS environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }
}

/**
 * Initialize AWS Rekognition client with configuration
 */
function initializeRekognition() {
  try {
    validateAwsConfig();

    const rekognition = new RekognitionClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
      maxAttempts: 3, // Retry configuration
      retryMode: 'adaptive'
    });

    console.log('AWS Rekognition initialized successfully');
    return rekognition;
  } catch (error) {
    console.error('AWS Rekognition initialization error:', error);
    throw new Error('Failed to initialize AWS Rekognition');
  }
}

// Initialize Rekognition client
const rekognition = initializeRekognition();

export { rekognition };