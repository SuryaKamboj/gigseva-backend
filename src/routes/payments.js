const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { authenticateJwt } = require('../middleware/auth');

/**
 * POST /api/payments/create-order
 * Initiates payment order for a booking
 */
router.post('/create-order', authenticateJwt, async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'bookingId is required' } });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    const amount = booking.pricing ? booking.pricing.totalAmount : 0;
    const gatewayOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const payment = new Payment({
      bookingId: booking._id,
      userId: req.user._id,
      workerId: booking.workerId || null,
      gatewayProvider: 'RAZORPAY',
      gatewayOrderId,
      amount,
      currency: 'INR',
      status: 'INITIATED',
      pricingSnapshot: booking.pricing
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        gatewayOrderId,
        amount,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mockKey'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/verify
 * Confirms payment completion
 */
router.post('/verify', authenticateJwt, async (req, res, next) => {
  try {
    const { paymentId, gatewayPaymentId } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } });

    payment.gatewayPaymentId = gatewayPaymentId || `pay_${Date.now()}`;
    payment.status = 'CAPTURED';
    await payment.save();

    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/booking/:bookingId
 */
router.get('/booking/:bookingId', authenticateJwt, async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ bookingId: req.params.bookingId });
    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

module.exports = router;