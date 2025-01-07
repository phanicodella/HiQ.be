/* 
 * backend/src/app.js
 * Main application entry point with Express server configuration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { auth, db, storage } from './config/firebase.js';
import authRoutes from './routes/auth.routes.js';
import interviewRoutes from './routes/interview.routes.js';
import { router as publicRoutes } from './routes/public.routes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: isProduction ? undefined : false,
  crossOriginResourcePolicy: { 
    policy: isProduction ? "same-origin" : "cross-origin" 
  }
}));

// CORS configuration
app.use(cors({
  origin: isProduction 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600 // 10 minutes
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // limit each IP 
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Request parsing
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => { req.rawBody = buf }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' 
}));

// Compression
app.use(compression());

// Logging
if (isProduction) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

app.get('/readiness', async (req, res) => {
  try {
    // Check Firebase connection
    await db.collection('health').doc('probe').get();
    res.status(200).json({ 
      status: 'ok',
      services: {
        firebase: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error',
      services: {
        firebase: 'disconnected'
      },
      error: isProduction ? 'Service unavailable' : error.message
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api', publicRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Handle specific errors
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ 
      error: 'Invalid or expired token' 
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: isProduction ? 'Invalid input' : err.details
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: isProduction 
      ? 'Internal Server Error' 
      : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await cleanup(); // Firebase cleanup from firebase.js
      process.exit(0);
    } catch (error) {
      console.error('Cleanup error:', error);
      process.exit(1);
    }
  });
});

export default app;