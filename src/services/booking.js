const crypto = require('crypto');

// State machine: valid transitions
const STATE_TRANSITIONS = {
  PENDING:     ['ALLOCATED', 'ACCEPTED', 'REQUESTED', 'CANCELLED'],
  REQUESTED:   ['ALLOCATED', 'ACCEPTED', 'CANCELLED'],
  ALLOCATED:   ['ACCEPTED', 'REQUESTED', 'PENDING', 'CANCELLED'],
  ACCEPTED:    ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT:  ['ARRIVED', 'CANCELLED'],
  ARRIVED:     ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   []
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
  generateBookingCode,
  generateMaterialRequestId,
  STATE_TRANSITIONS
};