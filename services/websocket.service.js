const WebSocket = require('ws');
const logger = require('winston');
const admin = require('firebase-admin');

class WebSocketService {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map(); // Store client connections
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.wss.on('connection', async (ws, req) => {
            try {
                logger.info('New WebSocket connection established');
                
                // Send initial connection confirmation
                ws.send(JSON.stringify({
                    type: 'connection',
                    status: 'connected',
                    timestamp: new Date().toISOString()
                }));

                ws.on('message', async (message) => {
                    try {
                        const data = JSON.parse(message);
                        await this.handleMessage(ws, data);
                    } catch (error) {
                        logger.error('WebSocket message handling error:', error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to process message'
                        }));
                    }
                });

                ws.on('close', () => {
                    this.handleDisconnection(ws);
                });

                ws.on('error', (error) => {
                    logger.error('WebSocket error:', error);
                });

                // Ping to keep connection alive
                ws.isAlive = true;
                ws.on('pong', () => { ws.isAlive = true; });

            } catch (error) {
                logger.error('WebSocket setup error:', error);
            }
        });

        // Setup ping interval
        this.setupPingInterval();
    }

    async handleMessage(ws, data) {
        switch (data.type) {
            case 'join':
                await this.handleJoin(ws, data);
                break;
            case 'interview_start':
                await this.handleInterviewStart(ws, data);
                break;
            case 'question':
                await this.handleQuestion(ws, data);
                break;
            case 'response':
                await this.handleResponse(ws, data);
                break;
            case 'transcript':
                await this.handleTranscript(ws, data);
                break;
            case 'analysis':
                await this.handleAnalysis(ws, data);
                break;
            default:
                logger.warn('Unknown message type:', data.type);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown message type'
                }));
        }
    }

    async handleJoin(ws, data) {
        const { interviewId, role } = data;
        
        // Store client info
        this.clients.set(ws, {
            interviewId,
            role,
            joinedAt: new Date()
        });

        // Log join event
        await admin.firestore().collection('interview_sessions').add({
            interviewId,
            role,
            event: 'join',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Notify room of new participant
        this.broadcastToInterview(interviewId, {
            type: 'participant_joined',
            role,
            timestamp: new Date().toISOString()
        }, ws);
    }

    async handleInterviewStart(ws, data) {
        const clientInfo = this.clients.get(ws);
        if (!clientInfo) return;

        await admin.firestore().collection('interviews')
            .doc(data.interviewId)
            .update({
                status: 'in_progress',
                startedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        this.broadcastToInterview(clientInfo.interviewId, {
            type: 'interview_started',
            timestamp: new Date().toISOString()
        });
    }

    async handleQuestion(ws, data) {
        const clientInfo = this.clients.get(ws);
        if (!clientInfo || clientInfo.role !== 'interviewer') return;

        this.broadcastToInterview(clientInfo.interviewId, {
            type: 'question',
            question: data.question,
            timestamp: new Date().toISOString()
        });
    }

    async handleResponse(ws, data) {
        const clientInfo = this.clients.get(ws);
        if (!clientInfo) return;

        // Store response
        await admin.firestore().collection('interview_responses').add({
            interviewId: clientInfo.interviewId,
            response: data.response,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        this.broadcastToInterview(clientInfo.interviewId, {
            type: 'response_received',
            timestamp: new Date().toISOString()
        });
    }

    handleDisconnection(ws) {
        const clientInfo = this.clients.get(ws);
        if (clientInfo) {
            logger.info(`Client disconnected from interview ${clientInfo.interviewId}`);
            this.clients.delete(ws);
        }
    }

    setupPingInterval() {
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    this.handleDisconnection(ws);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    broadcastToInterview(interviewId, message, excludeWs = null) {
        this.wss.clients.forEach((client) => {
            if (client !== excludeWs && 
                client.readyState === WebSocket.OPEN &&
                this.clients.get(client)?.interviewId === interviewId) {
                client.send(JSON.stringify(message));
            }
        });
    }

    broadcast(message) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

module.exports = WebSocketService;