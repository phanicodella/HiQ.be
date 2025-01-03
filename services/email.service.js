// backend/services/email.service.js
const { Resend } = require('resend');
const winston = require('winston');

// Check for required environment variable
if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Configure logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'email-service' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ 
            filename: 'logs/email-error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'logs/email-combined.log' 
        })
    ]
});

function formatDateTime(date) {
    try {
        const interviewDate = date.toDate();
        return {
            date: interviewDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            time: interviewDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'UTC'  // Adjust based on your needs
            })
        };
    } catch (error) {
        logger.error('Date formatting error', { error, date });
        throw new Error('Invalid date format');
    }
}

const emailService = {
    async validateEmailParams({ id, candidateName, candidateEmail, date, meetingLink }) {
        const errors = [];
        if (!id) errors.push('Interview ID is required');
        if (!candidateName) errors.push('Candidate name is required');
        if (!candidateEmail) errors.push('Candidate email is required');
        if (!date) errors.push('Interview date is required');
        if (!meetingLink) errors.push('Meeting link is required');

        if (errors.length > 0) {
            throw new Error('Invalid email parameters: ' + errors.join(', '));
        }
    },

    async sendInterviewInvite({ id, candidateName, candidateEmail, date, meetingLink }) {
        logger.info('Preparing to send interview invitation', {
            interviewId: id,
            candidateEmail,
            meetingLink
        });

        try {
            // Validate parameters
            await this.validateEmailParams({ id, candidateName, candidateEmail, date, meetingLink });

            const { date: formattedDate, time: formattedTime } = formatDateTime(date);

            // Debug logging in development
            if (process.env.NODE_ENV !== 'production') {
                logger.debug('Email configuration', {
                    to: candidateEmail,
                    meetingLink,
                    apiKeyPrefix: process.env.RESEND_API_KEY.substring(0, 8) + '...'
                });
            }

            const { data, error } = await resend.emails.send({
                from: 'TalentSync HR <hr@talentsync.tech>',
                to: candidateEmail,
                reply_to: 'hr@talentsync.tech',
                subject: 'Interview Invitation - TalentSync',
                headers: {
                    'List-Unsubscribe': '<mailto:unsubscribe@talentsync.tech>',
                    'Feedback-ID': 'interview-invite:talentsync',
                    'X-Entity-Ref-ID': id  // your interview ID
                },
                
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    </head>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f9fafb;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                                <h2 style="color: #111827; margin-top: 0;">Interview Invitation</h2>
                                
                                <p>Dear ${candidateName},</p>
                                
                                <p>You have been invited to an interview session with TalentSync.</p>
                                
                                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
                                    <p style="margin: 0 0 10px 0;"><strong>Interview Details:</strong></p>
                                    <p style="margin: 5px 0;">📅 <strong>Date:</strong> ${formattedDate}</p>
                                    <p style="margin: 5px 0;">⏰ <strong>Time:</strong> ${formattedTime}</p>
                                    <p style="margin: 5px 0;">⏱️ <strong>Duration:</strong> 45 minutes</p>
                                </div>

                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${meetingLink}" 
                                       style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                        Join Interview
                                    </a>
                                </div>

                                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
                                    <p style="margin: 0 0 10px 0;"><strong>Please ensure you have:</strong></p>
                                    <ul style="margin: 0; padding-left: 20px;">
                                        <li>A stable internet connection</li>
                                        <li>A quiet environment</li>
                                        <li>A working camera and microphone</li>
                                        <li>Any necessary documentation ready</li>
                                    </ul>
                                </div>

                                <p>If you need to reschedule or have any questions, please contact us immediately.</p>

                                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                                
                                <p style="margin: 0;">Best regards,<br>TalentSync Team</p>
                            </div>
                            
                            <div style="text-align: center; color: #6b7280; font-size: 0.875rem; margin-top: 20px;">
                                <p style="margin: 0;">© ${new Date().getFullYear()} TalentSync. All rights reserved.</p>
                                <p style="margin: 5px 0; font-size: 0.75rem;">This is an automated message, please do not reply directly to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            });

            if (error) {
                logger.error('Resend API error', {
                    error: error.message,
                    interviewId: id,
                    candidateEmail
                });
                throw new Error(`Failed to send email: ${error.message}`);
            }

            logger.info('Email sent successfully', {
                emailId: data?.id,
                interviewId: id,
                recipient: candidateEmail
            });

            return {
                success: true,
                emailId: data?.id,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to send email', {
                error: error.message,
                interviewId: id,
                candidateEmail,
                stack: error.stack
            });
            throw error;
        }
    }
};

module.exports = emailService;