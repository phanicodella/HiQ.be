// backend/config.js

require('dotenv').config();

const config = {
    app: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development',
        jwtSecret: process.env.JWT_SECRET
    },
    firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        maxTokens: 2000
    },
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
        emailFrom: process.env.EMAIL_FROM
    },
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? 'https://talentsync.tech' 
            : 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    },
    security: {
        rateLimitWindow: 15 * 60 * 1000, // 15 minutes
        rateLimitMax: 100, // requests per window
        jwtSecret: process.env.JWT_SECRET
    },
    interview: {
        maxDuration: 60, // minutes
        minDuration: 15, // minutes
        defaultQuestionCount: 5,
        types: ['technical', 'behavioral'],
        levels: ['jr', 'mid', 'senior', 'expert']
    }
};

// Validation
const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_STORAGE_BUCKET',
    'OPENAI_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'JWT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    console.error('Please check your .env file');
    process.exit(1);
}

module.exports = config;