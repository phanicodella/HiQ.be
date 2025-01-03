// backend/server.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { initializeFirebaseAdmin } = require('./config/firebase-config');
const admin = require('firebase-admin');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// Initialize Firebase Admin
try {
    initializeFirebaseAdmin();
} catch (error) {
    console.error('Failed to initialize Firebase:', error);
    process.exit(1);
}

// CORS configuration
app.use(cors({
    origin: ['http://localhost:5000', 'http://127.0.0.1:5000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Headers middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5000');
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
        return res.status(200).json({});
    }
    next();
});

// Debug middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Interview Room Route Handler
app.get('/interview/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[DEBUG] Accessing interview room: ${id}`);

        const db = admin.firestore();
        const interviewDoc = await db.collection('interviews').doc(id).get();

        if (!interviewDoc.exists) {
            console.log(`[DEBUG] Interview not found: ${id}`);
            return res.status(404).send('Interview not found');
        }

        const interviewData = interviewDoc.data();
        
        // Verify interview status
        if (!['scheduled', 'invited'].includes(interviewData.status)) {
            console.log(`[DEBUG] Invalid interview status: ${interviewData.status}`);
            return res.status(400).send('Invalid interview status');
        }

        // Verify interview time window
        const interviewTime = interviewData.date.toDate();
        const now = new Date();
        const timeDiff = interviewTime.getTime() - now.getTime();
        
        // Allow access 15 minutes before and until 1 hour after
        const earlyAccessWindow = 15 * 60 * 1000; // 15 minutes
        const lateAccessWindow = 60 * 60 * 1000;  // 1 hour

        if (timeDiff < -lateAccessWindow || timeDiff > earlyAccessWindow) {
            console.log(`[DEBUG] Interview time window invalid for ${id}`);
            return res.status(403).send('Interview is not currently accessible');
        }

        // Set headers to prevent caching
        res.set({
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Serve the interview room template
        res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'templates', 'interview-room.html'));
    } catch (error) {
        console.error('[DEBUG] Interview Room Access Error:', error);
        res.status(500).send('Server error during interview access');
    }
});

// Static file handling for interview assets
app.use('/interview/:id', (req, res, next) => {
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico)$/)) {
        const actualPath = req.path.replace(/^\/interview\/[^/]+/, '');
        res.sendFile(path.join(__dirname, '..', 'frontend', 'public', actualPath));
    } else {
        next();
    }
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/interviews', require('./routes/interviews'));

// General static file serving
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// WebSocket setup
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch(data.type) {
                case 'interview_start':
                    console.log('Interview started:', data);
                    break;
                case 'candidate_response':
                    console.log('Candidate response received:', data);
                    break;
                default:
                    console.log('Received message:', data);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 
            'Internal Server Error' : err.message
    });
});

// Catch-all route - Must be last
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = server;