// backend/services/analysis.service.js

const admin = require('firebase-admin');
const OpenAI = require('openai');
const config = require('../config');

class AnalysisService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: config.openai.apiKey
        });
    }

    async analyzeFraudDetection(frameData) {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4-vision-preview",
                messages: [{
                    role: "system",
                    content: "Analyze this image for signs of interview fraud such as: multiple people, unauthorized devices, screen reflections, or suspicious objects."
                }, {
                    role: "user",
                    content: [{
                        type: "image",
                        image: frameData
                    }]
                }],
                max_tokens: 150
            });

            const analysis = response.choices[0].message.content;
            const fraudDetected = this.detectFraudFromAnalysis(analysis);

            await this.storeAnalysisResult({
                type: 'fraud_detection',
                result: fraudDetected,
                analysis: analysis,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                fraudDetected: fraudDetected.detected,
                confidence: fraudDetected.confidence,
                details: fraudDetected.details,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Fraud detection error:', error);
            return {
                fraudDetected: false,
                confidence: 0,
                error: 'Analysis failed',
                timestamp: new Date().toISOString()
            };
        }
    }

    async analyzeAudioResponse(audioData) {
        try {
            const audioUrl = await this.uploadAudioToStorage(audioData);
            const transcript = await this.transcribeAudio(audioUrl);
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [{
                    role: "system",
                    content: "Analyze this interview response for authenticity, clarity, and potential fraud indicators."
                }, {
                    role: "user",
                    content: transcript
                }],
                temperature: 0.3
            });

            return {
                transcript,
                analysis: response.choices[0].message.content,
                fraudProbability: this.calculateFraudProbability(response.choices[0].message.content)
            };
        } catch (error) {
            console.error('Audio analysis error:', error);
            throw error;
        }
    }

    async transcribeAudio(audioUrl) {
        try {
            const response = await this.openai.audio.transcriptions.create({
                file: audioUrl,
                model: "whisper-1",
                language: "en"
            });
            return response.text;
        } catch (error) {
            console.error('Transcription error:', error);
            throw error;
        }
    }

    detectFraudFromAnalysis(analysis) {
        const fraudIndicators = [
            'multiple people',
            'phone',
            'screen',
            'reflection',
            'device',
            'notebook',
            'paper',
            'suspicious'
        ];

        const matches = fraudIndicators.filter(indicator => 
            analysis.toLowerCase().includes(indicator)
        );

        const confidence = matches.length / fraudIndicators.length;

        return {
            detected: matches.length > 0,
            confidence: confidence,
            details: matches.length > 0 ? matches : [],
            rawAnalysis: analysis
        };
    }

    calculateFraudProbability(analysisText) {
        const fraudKeywords = [
            'hesitation',
            'unnatural pauses',
            'reading',
            'prompted',
            'assisted',
            'inconsistent'
        ];

        let fraudScore = 0;
        fraudKeywords.forEach(keyword => {
            if (analysisText.toLowerCase().includes(keyword)) {
                fraudScore += 1;
            }
        });

        return fraudScore / fraudKeywords.length;
    }

    async uploadAudioToStorage(audioData) {
        try {
            const bucket = admin.storage().bucket();
            const filename = `interviews/audio/${Date.now()}.wav`;
            const file = bucket.file(filename);

            await file.save(audioData, {
                contentType: 'audio/wav'
            });

            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 3600 * 1000 // 1 hour
            });

            return url;
        } catch (error) {
            console.error('Audio upload error:', error);
            throw error;
        }
    }

    async storeAnalysisResult(data) {
        try {
            await admin.firestore()
                .collection('analysis_results')
                .add({
                    ...data,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('Error storing analysis result:', error);
        }
    }
}

module.exports = new AnalysisService();