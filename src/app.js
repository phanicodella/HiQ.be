/* 
 * backend/src/app.js
 * Main application entry point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import interviewRoutes from './routes/interview.routes.js';
import {router as publicRoutes} from './routes/public.routes.js';

/* 
 * Load environment variables
 */
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/* 
 * Security middleware
 */
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

/* 
 * Rate limiting
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

/* 
 * Request parsing
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* 
 * Logging
 */
app.use(morgan('combined'));

/* 
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/* 
 * API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/interviews', interviewRoutes);  
app.use('/api/public', publicRoutes);  // New public routes

/* 
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

/* 
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  /* 
   * Handle specific errors
   */
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  /* 
   * Default error
   */
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message 
  });
});

/* 
 * Start server
 */
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

export default app;