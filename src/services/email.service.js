import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const formatDate = (date) => {
  try {
    return new Date(date).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      timeZoneName: 'short'
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return date.toString();
  }
};

export async function sendInterviewInvite({ to, candidateName, type, level, scheduledTime, sessionId }) {
  try {
    const interviewLink = `${process.env.FRONTEND_URL}/${sessionId}`;
    
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'HiQ AI <interviews@talentsync.tech>',
      to: [to],
      subject: `Interview Scheduled: ${type} Interview for ${level} Position`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Interview Confirmation</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; color: #333333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0;">HiQ AI</h1>
              <p style="color: #666666; margin-top: 5px;">Interview Scheduling System</p>
            </div>

            <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
              <h2 style="color: #111827; margin-bottom: 20px;">Interview Confirmation</h2>
              
              <p style="margin-bottom: 20px;">Dear ${candidateName},</p>
              
              <p style="margin-bottom: 20px;">Your ${type.toLowerCase()} interview has been scheduled.</p>
              
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-bottom: 30px;">
                <h3 style="color: #111827; margin-top: 0; margin-bottom: 15px;">Interview Details</h3>
                <ul style="list-style-type: none; padding: 0; margin: 0;">
                  <li style="margin-bottom: 10px;">📅 <strong>Date & Time:</strong> ${formatDate(scheduledTime)}</li>
                  <li style="margin-bottom: 10px;">🎯 <strong>Type:</strong> ${type} Interview</li>
                  <li style="margin-bottom: 10px;">📊 <strong>Level:</strong> ${level}</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${interviewLink}" 
                   style="display: inline-block; background-color: #4f46e5; color: white; 
                          padding: 12px 30px; text-decoration: none; border-radius: 6px;
                          font-weight: 500; letter-spacing: 0.5px;">
                  Join Interview
                </a>
              </div>

              <p style="color: #4b5563; margin-bottom: 10px;">
                You can also access your interview using this link:
                <a href="${interviewLink}" style="color: #4f46e5; word-break: break-all;">
                  ${interviewLink}
                </a>
              </p>

              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-top: 30px;">
                <h3 style="color: #111827; margin-top: 0; margin-bottom: 15px;">Important Reminders</h3>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                  <li style="margin-bottom: 8px;">Join 5 minutes before your scheduled time</li>
                  <li style="margin-bottom: 8px;">Test your microphone before the interview</li>
                  <li style="margin-bottom: 8px;">Ensure you have a stable internet connection</li>
                  <li style="margin-bottom: 8px;">Find a quiet environment for the interview</li>
                </ul>
              </div>

              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; color: #4b5563;">Best regards,</p>
                <p style="margin: 5px 0 0 0; color: #111827; font-weight: 500;">HiQ AI Interview Team</p>
              </div>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #6b7280; font-size: 0.875rem;">
              <p style="margin: 0;">This is an automated message, please do not reply.</p>
              <p style="margin: 5px 0 0 0;">© ${new Date().getFullYear()} HiQ AI. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    return { success: true };
  } catch (error) {
    console.error('Interview invitation email error:', error);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Failed to send interview invitation email');
    }
  }
}

export async function sendAccessRequestEmail({ to, requestData }) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'HiQ AI <admin@talentsync.tech>',
      to: [to],
      subject: `New Access Request: ${requestData.companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Access Request</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333333;">
          <div style="max-width: 600px; margin: 0 auto;">
            <h2>New Access Request Received</h2>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Company:</strong> ${requestData.companyName}</p>
              <p><strong>Name:</strong> ${requestData.name}</p>
              <p><strong>Email:</strong> ${requestData.email}</p>
            </div>
            
            <a href="${process.env.FRONTEND_URL}/admin/access-requests" 
               style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">
              Review Request
            </a>
          </div>
        </body>
        </html>
      `
    });

    return { success: true };
  } catch (error) {
    console.error('Access request email error:', error);
    throw error;
  }
}

export async function sendAccessApprovalEmail({ to, userData }) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'HiQ AI <admin@talentsync.tech>',
      to: [to],
      subject: 'Your HiQ AI Access Request Has Been Approved',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Access Approved</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333333;">
          <div style="max-width: 600px; margin: 0 auto;">
            <h2>Welcome to HiQ AI!</h2>
            
            <p>Dear ${userData.name},</p>
            
            <p>Your access request has been approved. You can now log in to HiQ AI using the following credentials:</p>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Email:</strong> ${userData.email}</p>
              <p><strong>Temporary Password:</strong> ${userData.password}</p>
            </div>
            
            <p>Please change your password after your first login.</p>
            
            <a href="${process.env.FRONTEND_URL}/login" 
               style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">
              Login to HiQ AI
            </a>
          </div>
        </body>
        </html>
      `
    });

    return { success: true };
  } catch (error) {
    console.error('Access approval email error:', error);
    throw error;
  }
}

export async function sendAccessRejectionEmail({ to, name, reason }) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'HiQ AI <admin@talentsync.tech>',
      to: [to],
      subject: 'Update on Your HiQ AI Access Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Access Request Update</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333333;">
          <div style="max-width: 600px; margin: 0 auto;">
            <h2>Access Request Update</h2>
            
            <p>Dear ${name},</p>
            
            <p>Thank you for your interest in HiQ AI. After careful review of your access request, we regret to inform you that we are unable to approve your request at this time.</p>
            
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            
            <p>We encourage you to apply again in the future as our capacity expands.</p>
            
            <p>Best regards,<br>HiQ AI Team</p>
          </div>
        </body>
        </html>
      `
    });

    return { success: true };
  } catch (error) {
    console.error('Access rejection email error:', error);
    throw error;
  }
}