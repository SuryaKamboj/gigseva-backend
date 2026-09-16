/**
 * MOCK AADHAAR IDENTITY SERVICE (DEVELOPMENT / TEST ONLY)
 * 
 * In the future, this service will be replaced by the official UIDAI / DigiLocker
 * Aadhaar e-KYC integration.
 * 
 * For development, this service generates realistic, deterministic Indian artisan/worker
 * identities based on the worker's normalized phone number.
 * 
 * Rules:
 * - Generated once when a worker profile is initialized in MongoDB.
 * - Stored in MongoDB (User.fullName, Worker.fullName, Worker.aadhaarNumberMasked).
 * - Never re-generated on subsequent logins or requests.
 */

const MOCK_WORKER_NAMES = [
  'Ramesh Kumar',
  'Suresh Kumar',
  'Amit Kumar',
  'Vijay Kumar',
  'Sunita Devi',
  'Pooja Devi',
  'Anita Devi',
  'Raj Kumar',
  'Manoj Kumar',
  'Deepak Kumar',
  'Kavita Patel',
  'Sunil Yadav',
  'Vikram Singh',
  'Meena Kumari',
  'Dinesh Sharma',
  'Radha Rani',
  'Santosh Devi',
  'Mohan Lal',
  'Gajodhar Prasad',
  'Praveen Verma'
];

/**
 * Deterministically pick an Indian name based on the phone number digits,
 * ensuring each phone number maps to a consistent name prior to database persistence.
 * @param {string} phoneNumber - Normalized mobile number (+91XXXXXXXXXX)
 * @returns {{ fullName: string, aadhaarNumberMasked: string }}
 */
function getMockIdentity(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  const seed = digits.length >= 4 ? parseInt(digits.slice(-4), 10) : 1000;
  
  const index = Math.abs(seed) % MOCK_WORKER_NAMES.length;
  const fullName = MOCK_WORKER_NAMES[index];

  // Generate a realistic masked Aadhaar using last 4 digits of phone as differentiator
  const last4 = digits.length >= 4 ? digits.slice(-4) : '1234';
  const aadhaarNumberMasked = `XXXX-XXXX-${last4}`;

  return {
    fullName,
    aadhaarNumberMasked,
    isMockIdentity: true,
    provider: 'MOCK_AADHAAR_DEV_SERVICE'
  };
}

module.exports = {
  getMockIdentity,
  MOCK_WORKER_NAMES
};
