const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const { authenticateJwt } = require('../middleware/auth');

/**
 * POST /api/reviews
 * Customer submits a review for a completed booking
 */
router.post('/', authenticateJwt, async (req, res, next) => {
  try {
    const { bookingId, rating, categoryRatings, tags, comment } = req.body;

    if (!bookingId || !rating) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'bookingId and rating are required' } });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (String(booking.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the customer who booked this service can review it' } });
    }

    if (booking.status !== 'COMPLETED') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only review completed bookings' } });
    }

    const existingReview = await Review.findOne({ bookingId });
    if (existingReview) {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_REVIEWED', message: 'This booking has already been reviewed' } });
    }

    const review = new Review({
      bookingId,
      userId: req.user._id,
      workerId: booking.workerId,
      rating: parseFloat(rating),
      categoryRatings: categoryRatings || {},
      tags: tags || [],
      comment
    });

    await review.save();

    // Update worker rating metrics
    if (booking.workerId) {
      const workerReviews = await Review.find({ workerId: booking.workerId });
      const avg = workerReviews.reduce((sum, r) => sum + r.rating, 0) / workerReviews.length;
      await Worker.findByIdAndUpdate(booking.workerId, {
        $set: {
          'metrics.averageRating': Math.round(avg * 10) / 10,
          'metrics.reviewCount': workerReviews.length
        }
      });
    }

    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reviews/booking/:bookingId
 */
router.get('/booking/:bookingId', async (req, res, next) => {
  try {
    const review = await Review.findOne({ bookingId: req.params.bookingId })
      .populate('userId', 'fullName avatarUrl');
    res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reviews/worker/:workerId
 */
router.get('/worker/:workerId', async (req, res, next) => {
  try {
    const reviews = await Review.find({ workerId: req.params.workerId })
      .populate('userId', 'fullName avatarUrl')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
});

module.exports = router;