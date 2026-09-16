const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const WorkerPrivate = require('../models/WorkerPrivate');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Society = require('../models/Society');
const Region = require('../models/Region');
const Complaint = require('../models/Complaint');
const { authenticateJwt } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');

router.use(authenticateJwt);
router.use(requireAdmin);

/**
 * GET /api/admin/analytics
 * Scoped dashboard metric counters
 */
router.get('/analytics', async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'SOCIETY_ADMIN') {
      filter.societyId = req.user.societyId;
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      filter.federationId = req.user.federationId;
    }

    const bookingFilter = {};
    if (req.user.role === 'SOCIETY_ADMIN') {
      bookingFilter.servicingSocietyId = req.user.societyId;
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      bookingFilter.federationId = req.user.federationId;
    }

    const [totalWorkers, pendingKyc, activeBookings, completedBookings, totalUsers] = await Promise.all([
      Worker.countDocuments(filter),
      Worker.countDocuments({
        ...(req.user.role === 'SOCIETY_ADMIN' ? { $or: [{ societyId: req.user.societyId }, { societyId: null }, { societyId: { $exists: false } }] } : req.user.role === 'FEDERATION_ADMIN' ? { $or: [{ federationId: req.user.federationId }, { federationId: null }, { federationId: { $exists: false } }] } : {}),
        kycVerificationStatus: { $in: ['PENDING', 'IN_REVIEW'] }
      }),
      Booking.countDocuments({ ...bookingFilter, status: { $in: ['REQUESTED', 'ALLOCATED', 'ACCEPTED', 'IN_TRANSIT', 'ARRIVED', 'IN_PROGRESS'] } }),
      Booking.countDocuments({ ...bookingFilter, status: 'COMPLETED' }),
      User.countDocuments({ role: 'CUSTOMER' })
    ]);

    const completedJobs = await Booking.find({ ...bookingFilter, status: 'COMPLETED' }).select('pricing');
    const totalRevenue = completedJobs.reduce((sum, b) => sum + (b.pricing?.totalAmount || 0), 0);

    res.json({
      success: true,
      data: {
        totalWorkers,
        pendingKyc,
        activeBookings,
        completedBookings,
        totalUsers,
        totalRevenue
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/workers
 * Scoped worker list
 */
router.get('/workers', async (req, res, next) => {
  try {
    const { kycStatus, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (req.user.role === 'SOCIETY_ADMIN') {
      filter.$or = [
        { societyId: req.user.societyId },
        { societyId: null },
        { societyId: { $exists: false } }
      ];
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      filter.$or = [
        { federationId: req.user.federationId },
        { federationId: null },
        { federationId: { $exists: false } }
      ];
    } else if (req.query.societyId) {
      filter.societyId = req.query.societyId;
    }

    if (kycStatus) filter.kycVerificationStatus = kycStatus;
    if (search) {
      const searchOr = [
        { fullName: { $regex: search, $options: 'i' } },
        { workerCode: { $regex: search, $options: 'i' } }
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const workers = await Worker.find(filter)
      .populate('userId', 'mobileNumber email')
      .populate('societyId', 'name societyCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const workerIds = workers.map(w => w._id);
    const privates = await WorkerPrivate.find({ workerId: { $in: workerIds } });
    const privateMap = {};
    privates.forEach(p => { privateMap[p.workerId.toString()] = p; });

    const combined = workers.map(w => ({
      ...w.toObject(),
      privateData: privateMap[w._id.toString()] || null
    }));

    const total = await Worker.countDocuments(filter);

    res.json({
      success: true,
      data: {
        workers: combined,
        pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/workers/:id/kyc
 * Approve or reject worker KYC with strict society scope check
 */
router.put('/workers/:id/kyc', async (req, res, next) => {
  try {
    const { status, notes, rejectionReason } = req.body;
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'status must be VERIFIED or REJECTED' } });
    }

    let worker = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      worker = await Worker.findById(req.params.id);
    }
    if (!worker) {
      worker = await Worker.findOne({ workerCode: req.params.id });
    }
    if (!worker) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker not found' } });

    // Scope check: only deny if worker has a different society/federation explicitly assigned
    if (req.user.role === 'SOCIETY_ADMIN' && worker.societyId && worker.societyId.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Worker belongs to a different cooperative society.' } });
    }
    if (req.user.role === 'FEDERATION_ADMIN' && worker.federationId && worker.federationId.toString() !== req.user.federationId?.toString()) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Worker belongs to a different federation.' } });
    }

    worker.kycVerificationStatus = status;
    if (status === 'VERIFIED') {
      worker.membershipStatus = 'ACTIVE_MEMBER';
      worker.rejectionReason = undefined;
      if (!worker.societyId && req.user.societyId) {
        worker.societyId = req.user.societyId;
      }
      if (!worker.federationId && req.user.federationId) {
        worker.federationId = req.user.federationId;
      }
      if (!worker.workerCode) {
        worker.workerCode = `WK-${Date.now().toString().slice(-6)}`;
      }
    } else if (status === 'REJECTED') {
      worker.rejectionReason = rejectionReason || notes || 'Application rejected by Administrator';
    }
    await worker.save();

    await WorkerPrivate.findOneAndUpdate(
      { workerId: worker._id },
      {
        $set: {
          'verificationAudit.verifiedByAdminId': req.user._id,
          'verificationAudit.verifiedAt': new Date(),
          'verificationAudit.notes': notes || '',
          'verificationAudit.rejectionReason': rejectionReason || ''
        }
      }
    );

    res.json({ success: true, data: worker });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({ role: 'CUSTOMER' }).select('-passwordHash').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/users/:id/status
 */
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { isBlocked } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.isBlocked = Boolean(isBlocked);
    await user.save();
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/bookings
 */
router.get('/bookings', async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'SOCIETY_ADMIN') {
      filter.servicingSocietyId = req.user.societyId;
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      filter.federationId = req.user.federationId;
    }

    const bookings = await Booking.find(filter)
      .populate('userId', 'fullName mobileNumber')
      .populate('workerId', 'fullName workerCode')
      .populate('serviceId', 'name category')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/societies
 */
router.get('/societies', async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'SOCIETY_ADMIN') {
      filter._id = req.user.societyId;
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      filter.federationId = req.user.federationId;
    }

    const societies = await Society.find(filter).populate('federationId', 'name state');
    res.json({ success: true, data: societies });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/regions
 */
router.get('/regions', async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'SOCIETY_ADMIN') {
      filter.societyId = req.user.societyId;
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      filter.federationId = req.user.federationId;
    }

    const regions = await Region.find(filter).populate('societyId', 'name');
    res.json({ success: true, data: regions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;