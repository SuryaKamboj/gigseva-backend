const crypto = require('crypto');

// State machine: valid transitions
const STATE_TRANSITIONS = {
  PENDING:            ['ALLOCATED', 'ACCEPTED', 'REQUESTED', 'CANCELLED'],
  REQUESTED:          ['ALLOCATED', 'ACCEPTED', 'CANCELLED'],
  ALLOCATED:          ['ACCEPTED', 'REQUESTED', 'PENDING', 'CANCELLED'],
  ACCEPTED:           ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT:         ['ARRIVED', 'CANCELLED'],
  ARRIVED:            ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS:        ['COMPLETION_PENDING', 'CANCELLED'],
  COMPLETION_PENDING: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'], // IN_PROGRESS = revert if PIN wrong
  COMPLETED:          [],
  CANCELLED:          []
};

function canTransition(from, to) {
  return STATE_TRANSITIONS[from] && STATE_TRANSITIONS[from].includes(to);
}

/**
 * Deterministic cryptographic 4-digit OTP derivation.
 * Plaintext OTP is NEVER stored in database.
 * Only the HMAC-SHA256 hash is persisted in booking.security.otpHash.
 */
function getOtpForBooking(bookingId, userId) {
  const secret = process.env.JWT_SECRET || 'gs_secret_dev_key';
  const hmac = crypto.createHmac('sha256', secret)
    .update(`GS_OTP_DERIVATION:${bookingId.toString()}:${userId.toString()}`)
    .digest('hex');
  const num = parseInt(hmac.substring(0, 8), 16);
  const pin = String(1000 + (num % 9000));
  const hash = crypto.createHmac('sha256', secret)
    .update(`${pin}:${bookingId.toString()}:${userId.toString()}`)
    .digest('hex');
  return { pin, hash };
}

/**
 * Verify OTP entered by worker against stored HMAC hash using timingSafeEqual.
 */
function verifyBookingOtp(enteredPin, storedHash, bookingId, userId) {
  if (!enteredPin || !storedHash) return false;
  const secret = process.env.JWT_SECRET || 'gs_secret_dev_key';
  const expected = crypto.createHmac('sha256', secret)
    .update(`${enteredPin.toString()}:${bookingId.toString()}:${userId.toString()}`)
    .digest('hex');
  if (expected.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(storedHash, 'hex'));
}

/**
 * Generate a secure random 4-digit completion PIN for job completion.
 * Unlike the start-job OTP (which is deterministic), this is random
 * and stored as HMAC-SHA256 hash in security.completionOtpHash.
 * Returns { pin, hash } where pin is shown to customer and hash is stored.
 */
function generateCompletionOtp(bookingId) {
  const secret = process.env.JWT_SECRET || 'gs_secret_dev_key';
  // Use cryptographically random bytes for the PIN
  const randomBytes = crypto.randomBytes(4);
  const num = randomBytes.readUInt32BE(0);
  const pin = String(1000 + (num % 9000)); // always 4 digits, 1000-9999
  const hash = crypto.createHmac('sha256', secret)
    .update(`GS_COMPLETION_OTP:${pin}:${bookingId.toString()}`)
    .digest('hex');
  return { pin, hash };
}

/**
 * Verify the 4-digit completion PIN entered by the worker against the stored hash.
 */
function verifyCompletionOtp(enteredPin, storedHash, bookingId) {
  if (!enteredPin || !storedHash) return false;
  const secret = process.env.JWT_SECRET || 'gs_secret_dev_key';
  const expected = crypto.createHmac('sha256', secret)
    .update(`GS_COMPLETION_OTP:${enteredPin.toString()}:${bookingId.toString()}`)
    .digest('hex');
  if (expected.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(storedHash, 'hex'));
}

/**
 * Generate a unique booking code: GS-YYYYMM-XXXXX
 */
function generateBookingCode() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `GS-${ym}-${rand}`;
}

/**
 * Generate material request ID
 */
function generateMaterialRequestId() {
  return `MR-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = {
  canTransition,
  getOtpForBooking,
  verifyBookingOtp,
  generateCompletionOtp,
  verifyCompletionOtp,
  generateBookingCode,
  generateMaterialRequestId,
  STATE_TRANSITIONS
};