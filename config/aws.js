const AWS = require('aws-sdk');
const admin = require('firebase-admin');

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const ses = new AWS.SES({ apiVersion: '2010-12-01' });

function verifySESSetup() {
    try {
        const params = {
            Identities: [process.env.EMAIL_FROM]
        };
        
        return ses.getIdentityVerificationAttributes(params).promise()
            .then(data => {
                const identityStatus = data.VerificationAttributes[process.env.EMAIL_FROM];
                
                if (identityStatus && identityStatus.VerificationStatus === 'Success') {
                    console.log('SES Identity verified successfully');
                    return true;
                } else {
                    console.warn('SES Identity not fully verified');
                    return false;
                }
            })
            .catch(error => {
                console.error('SES Identity verification failed:', error);
                return false;
            });
    } catch (error) {
        console.error('Error checking SES setup:', error);
        return false;
    }
}

async function verifyEmailSender() {
    try {
        const params = {
            EmailAddress: process.env.EMAIL_FROM
        };
        
        await ses.verifyEmailIdentity(params).promise();
        console.log('Verification email sent to:', process.env.EMAIL_FROM);
        return true;
    } catch (error) {
        console.error('Failed to initiate email verification:', error);
        throw error;
    }
}

module.exports = {
    ses,
    verifySESSetup,
    verifyEmailSender
};