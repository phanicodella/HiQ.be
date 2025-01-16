// scripts/setupAdmin.js
import { admin, auth, db } from '../src/config/firebase.js';
import dotenv from 'dotenv';

dotenv.config();

const setupAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      throw new Error('ADMIN_EMAIL not found in environment variables');
    }

    // Get user by email
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(adminEmail);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Create admin user if doesn't exist
        userRecord = await auth.createUser({
          email: adminEmail,
          password: process.env.ADMIN_INITIAL_PASSWORD || 'TemporaryPass123!',
          emailVerified: true
        });
        
        console.log('Created new admin user:', adminEmail);
      } else {
        throw error;
      }
    }

    // Set custom claims for admin
    await auth.setCustomUserClaims(userRecord.uid, {
      role: 'admin',
      isAdmin: true
    });

    // Create or update admin document in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email: adminEmail,
      role: 'admin',
      isAdmin: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update access control rules
    await db.collection('accessControl').doc('admins').set({
      emails: admin.firestore.FieldValue.arrayUnion(adminEmail)
    }, { merge: true });

    console.log(`Successfully set up admin privileges for ${adminEmail}`);

  } catch (error) {
    console.error('Error setting up admin:', error);
    process.exit(1);
  }
};

setupAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
