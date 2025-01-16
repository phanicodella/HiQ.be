// backend/src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import interviewRoutes from './routes/interview.routes.js';
import { router as publicRoutes } from './routes/public.routes.js';
import accessRoutes from './routes/access.routes.js';

// Load environment variables
dotenv.config();
process.env.NODE_ENV = 'development';

const allowedOrigins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());

const app = express();
const PORT = process.env.PORT || 3000;

// Request parsing - at the top
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security middleware
app.use(helmet());

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Rate limiting
const accessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  message: { 
    error: 'Too many access requests from this IP, please try again after an hour' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    return req.path.includes('/fraud-detection') || 
           req.path.includes('/answer') ||
           req.path.includes('/speech-analysis');
  }
});

// Logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes
app.use('/api/auth', authRoutes);  // Auth routes first for token verification
app.use('/api/access', accessLimiter, accessRoutes);
app.use('/api/interviews', apiLimiter, interviewRoutes);
app.use('/api/public', apiLimiter, publicRoutes);

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message 
  });
});

// Start server
const startServer = () => {
  try {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;