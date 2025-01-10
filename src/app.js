// backend/src/app.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import interviewRoutes from './routes/interview.routes.js';
import { router as publicRoutes } from './routes/public.routes.js';
import compression from 'compression';
import accessRoutes from './routes/access.routes.js';
// Load environment variables
dotenv.config();
process.env.NODE_ENV = 'development';
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://talent-sync-gxapz34ii-phanicodellas-projects.vercel.app',
  credentials: true
}));

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 2000, // Increased for video processing
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    // Skip rate limiting for streaming endpoints
    return req.path.includes('/fraud-detection') || 
           req.path.includes('/answer') ||
           req.path.includes('/speech-analysis');
  }
});

app.use('/api/', limiter);
app.use('/api/access', accessRoutes);

// Request parsing - increased limits for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes - ensure all are prefixed with /api
app.use('/api/auth', authRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/public', publicRoutes);

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

// Start server with error handling
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