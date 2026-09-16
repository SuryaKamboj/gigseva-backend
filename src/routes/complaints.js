const express = require('express');
const router = express.Router();
const Complaint = require('../models/Complaint');
const Booking = require('../models/Booking');
const { authenticateJwt } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');

function generateComplaintCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CMP-${Date.now().toString().slice(-6)}-${rand}`;
}

/**
 * POST /api/complaints
 * File a complaint
 */
router.post('/', authenticateJwt, async (req, res, next) => {
  try {
    const { bookingId, category, severity, description, evidencePhotoUrls } = req.body;

    if (!bookingId || !category || !description) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'bookingId, category and description are required' } });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    const complaint = new Complaint({
      complaintCode: generateComplaintCode(),
      bookingId,
      complainantUserId: req.user._id,
      accusedWorkerId: booking.workerId || null,
      category,
      severity: severity || 'MEDIUM',
      description,
      evidencePhotoUrls: evidencePhotoUrls || []
    });

    await complaint.save();
    res.status(201).json({ success: true, data: complaint });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/complaints
 * List complaints (User views own; Admin views all in scope)
 */
router.get('/', authenticateJwt, async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'CUSTOMER') {
      filter.complainantUserId = req.user._id;
    } else if (req.user.role === 'WORKER') {
      const worker = await require('../models/Worker').findOne({ userId: req.user._id });
      if (worker) filter.accusedWorkerId = worker._id;
    }

    const complaints = await Complaint.find(filter)
      .populate('complainantUserId', 'fullName mobileNumber')
      .populate('accusedWorkerId', 'fullName workerCode')
      .populate('bookingId', 'bookingCode status')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: complaints });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/complaints/:id/resolve
 * Admin resolves or dismisses complaint
 */
router.put('/:id/resolve', authenticateJwt, requireAdmin, async (req, res, next) => {
  try {
    const { action, refundAmount, comments } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Complaint not found' } });

    complaint.status = action === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED';
    complaint.resolution = {
      action,
      refundAmount: refundAmount || 0,
      comments: comments || '',
      resolvedAt: new Date(),
      resolvedByAdminId: req.user._id
    };

    await complaint.save();
    res.json({ success: true, data: complaint });
  } catch (err) {
    next(err);
  }
});

module.exports = router;