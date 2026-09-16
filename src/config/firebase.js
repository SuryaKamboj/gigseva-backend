const admin = require('firebase-admin');

let firebaseInitialized = false;

const initFirebase = () => {
  if (firebaseInitialized) return;
  try {
    const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? admin.credential.cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
      : admin.credential.applicationDefault();

    admin.initializeApp({ credential, projectId: process.env.FIREBASE_PROJECT_ID });
    firebaseInitialized = true;
    console.log('[Firebase] Admin SDK initialized');
  } catch (err) {
    console.warn('[Firebase] SDK init skipped (dev mode):', err.message);
  }
};

/**
 * Verify a Firebase ID token and return the decoded phone number.
 * In development (no service account), fall through to dev-mode bypass
 * while strictly preserving the caller's actual phone number.
 */
const verifyFirebaseToken = async (idToken, fallbackPhone) => {
  if (!firebaseInitialized) {
    // DEV MODE: dynamically resolve phone without hardcoded fallback
    if (idToken && typeof idToken === 'string') {
      if (idToken.startsWith('worker_uid_')) {
        const clean = idToken.replace('worker_uid_', '').replace(/\D/g, '').slice(-10);
        if (clean.length === 10) return { phone_number: `+91${clean}`, uid: idToken };
      }
      const rawDigits = idToken.replace(/\D/g, '');
      if (rawDigits.length >= 10) {
        return { phone_number: `+91${rawDigits.slice(-10)}`, uid: idToken };
      }
    }
    if (fallbackPhone) {
      const clean = String(fallbackPhone).replace(/\D/g, '').slice(-10);
      if (clean.length === 10) {
        return { phone_number: `+91${clean}`, uid: idToken || `sim_${clean}` };
      }
    }
    return null;
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
};

module.exports = { initFirebase, verifyFirebaseToken };
