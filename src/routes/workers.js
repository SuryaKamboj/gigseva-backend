const express = require('express');
const router = express.Router();
const Worker = require('../models/Worker');
const WorkerPrivate = require('../models/WorkerPrivate');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const mockAadhaarService = require('../services/mockAadhaarService');
const workerProfileService = require('../services/workerProfileService');
const { authenticateJwt } = require('../middleware/auth');
const { requireWorker } = require('../middleware/rbac');

/**
 * GET /api/workers
 * Public worker search with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, societyId, experienceTier, availabilityStatus, isOnline, limit = 20, page = 1 } = req.query;
    const filter = {};

    if (category) filter.primaryServiceCategory = category;
    if (societyId) filter.societyId = societyId;
    if (experienceTier) filter.experienceTier = experienceTier;
    if (availabilityStatus) filter.availabilityStatus = availabilityStatus;
    if (isOnline !== undefined) filter.isOnline = isOnline === 'true';

    // By default only show verified workers publicly
    filter.kycVerificationStatus = 'VERIFIED';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const workers = await Worker.find(filter)
      .populate('societyId', 'name societyCode')
      .populate('primaryRegionId', 'name')
      .populate('userId', 'fullName mobileNumber email')
      .sort({ 'metrics.averageRating': -1, 'metrics.trustScore': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Worker.countDocuments(filter);

    res.json({
      success: true,
      data: {
        workers,
        pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workers/me
 * Worker profile for logged in worker (includes private KYC / earnings info)
 */
router.get('/me', authenticateJwt, async (req, res, next) => {
  try {
    let worker = await Worker.findOne({ userId: req.user._id });

    if (!worker) {
      const mockIdentity = mockAadhaarService.getMockIdentity(req.user.mobileNumber);
      const workerCode = `WK-${Date.now().toString().slice(-6)}`;
      const resolvedName = (req.user.fullName && req.user.fullName !== 'Worker Partner' && req.user.fullName !== 'Worker Applicant')
        ? req.user.fullName
        : mockIdentity.fullName;

      worker = new Worker({
        userId: req.user._id,
        workerCode,
        fullName: resolvedName,
        aadhaarNumberMasked: mockIdentity.aadhaarNumberMasked,
        aadhaarVerified: false,
        primaryServiceCategory: 'ELECTRICAL',
        experienceTier: 'STANDARD',
        availabilityStatus: 'OFF_DUTY',
        isOnline: false,
        kycVerificationStatus: 'PENDING',
        membershipStatus: 'APPLICANT'
      });
      await worker.save();
    }

    const completeProfile = await workerProfileService.getCompleteWorkerProfile(worker._id);

    res.json({
      success: true,
      data: completeProfile
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/workers/me
 * Worker update own profile details
 */
router.put('/me', authenticateJwt, async (req, res, next) => {
  try {
    const updatedProfile = await workerProfileService.updateWorkerProfile(req.user._id, req.body);
    if (!updatedProfile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker not found' } });
    }

    res.json({ success: true, data: updatedProfile });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/workers/me/availability
 * Worker toggle online / offline / duty status
 */
router.put('/me/availability', authenticateJwt, requireWorker, async (req, res, next) => {
  try {
    const { isOnline, availabilityStatus } = req.body;
    const updates = { lastActiveAt: new Date() };

    if (isOnline !== undefined) {
      updates.isOnline = Boolean(isOnline);
      if (!updates.isOnline) {
        updates.availabilityStatus = 'OFF_DUTY';
      } else if (!availabilityStatus) {
        updates.availabilityStatus = 'AVAILABLE';
      }
    }

    if (availabilityStatus !== undefined) {
      updates.availabilityStatus = availabilityStatus;
    }

    const worker = await Worker.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true }
    );

    res.json({ success: true, data: worker });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/workers/me/location
 * Update worker GPS location
 */
router.put('/me/location', authenticateJwt, requireWorker, async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_LOCATION', message: 'latitude and longitude are required' } });
    }

    const worker = await Worker.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          currentLocation: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          lastActiveAt: new Date()
        }
      },
      { new: true }
    );

    res.json({ success: true, data: worker });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/workers/me/kyc
 * Worker submit KYC documents and bank details
 */
router.post('/me/kyc', authenticateJwt, requireWorker, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    if (!worker) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker not found' } });

    const {
      aadhaarNumberMasked,
      aadhaarFrontDocUrl,
      aadhaarBackDocUrl,
      panNumber,
      policeClearanceCertUrl,
      bankAccount,
      emergencyContact
    } = req.body;

    let privateDoc = await WorkerPrivate.findOne({ workerId: worker._id });
    if (!privateDoc) {
      privateDoc = new WorkerPrivate({
        workerId: worker._id,
        userId: req.user._id
      });
    }

    if (aadhaarNumberMasked) privateDoc.aadhaarNumberMasked = aadhaarNumberMasked;
    if (aadhaarFrontDocUrl) privateDoc.aadhaarFrontDocUrl = aadhaarFrontDocUrl;
    if (aadhaarBackDocUrl) privateDoc.aadhaarBackDocUrl = aadhaarBackDocUrl;
    if (panNumber) privateDoc.panNumber = panNumber;
    if (policeClearanceCertUrl) privateDoc.policeClearanceCertUrl = policeClearanceCertUrl;
    if (bankAccount) privateDoc.bankAccount = bankAccount;
    if (emergencyContact) privateDoc.emergencyContact = emergencyContact;

    await privateDoc.save();

    // Mark worker KYC as IN_REVIEW if was PENDING
    if (worker.kycVerificationStatus === 'PENDING') {
      worker.kycVerificationStatus = 'IN_REVIEW';
      await worker.save();
    }

    res.json({
      success: true,
      data: {
        kycVerificationStatus: worker.kycVerificationStatus,
        privateData: privateDoc
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/workers/me/onboarding
 * Submit worker onboarding profile with Aadhaar, selfie, skills, and location for Admin approval
 */
router.post('/me/onboarding', authenticateJwt, async (req, res, next) => {
  try {
    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user._id, { $set: { role: 'WORKER' } });

    let worker = await Worker.findOne({ userId: req.user._id });
    if (!worker) {
      const workerCode = `WK-${Date.now().toString().slice(-6)}`;
      worker = new Worker({
        userId: req.user._id,
        workerCode,
        fullName: req.body.fullName || req.user.fullName || 'Worker Applicant',
        primaryServiceCategory: req.body.primaryServiceCategory || 'ELECTRICAL',
        experienceTier: 'STANDARD',
        availabilityStatus: 'OFF_DUTY',
        isOnline: false,
        kycVerificationStatus: 'PENDING',
        membershipStatus: 'APPLICANT'
      });
      await worker.save();
    }

    const {
      fullName,
      aadhaarNumber,
      aadhaarVerified,
      selfieUrl,
      skills,
      primaryServiceCategory,
      location,
      serviceArea,
      addressLine
    } = req.body;

    // Format and mask Aadhaar
    let maskedAadhaar = worker.aadhaarNumberMasked || 'XXXX-XXXX-0000';
    if (aadhaarNumber) {
      const cleanDigits = String(aadhaarNumber).replace(/\D/g, '');
      const last4 = cleanDigits.slice(-4);
      maskedAadhaar = cleanDigits.length >= 4 ? `XXXX-XXXX-${last4}` : `XXXX-XXXX-${cleanDigits}`;
    }

    // Format skills array for worker schema
    let formattedSkills = worker.skills || [];
    if (Array.isArray(skills) && skills.length > 0) {
      formattedSkills = skills.map((s) => (typeof s === 'string' ? { category: s, isCertified: true } : s));
    }

    // Update Worker document (preserve legal / mock Aadhaar name if generic placeholder provided)
    if (fullName && fullName !== 'Worker Partner' && fullName !== 'Worker Applicant' && fullName !== 'Worker') {
      worker.fullName = fullName;
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.user._id, { $set: { fullName } });
    }
    worker.aadhaarNumberMasked = maskedAadhaar;
    worker.aadhaarVerified = aadhaarVerified !== undefined ? Boolean(aadhaarVerified) : true;
    if (selfieUrl) {
      worker.selfieUrl = selfieUrl;
      worker.avatarUrl = selfieUrl;
    }
    if (formattedSkills.length > 0) worker.skills = formattedSkills;
    if (primaryServiceCategory) {
      worker.primaryServiceCategory = primaryServiceCategory.toUpperCase();
    } else if (formattedSkills.length > 0 && formattedSkills[0].category) {
      worker.primaryServiceCategory = formattedSkills[0].category.toUpperCase();
    }
    if (serviceArea) worker.serviceArea = serviceArea;
    if (addressLine) worker.addressLine = addressLine;

    if (location && location.latitude !== undefined && location.longitude !== undefined) {
      worker.currentLocation = {
        type: 'Point',
        coordinates: [parseFloat(location.longitude), parseFloat(location.latitude)]
      };
      if (location.name && !worker.serviceArea) {
        worker.serviceArea = location.name;
      }
    }

    // Ensure status is PENDING for admin review
    worker.kycVerificationStatus = 'PENDING';
    worker.membershipStatus = 'APPLICANT';
    worker.rejectionReason = undefined;
    worker.lastActiveAt = new Date();
    await worker.save();

    // Update or create WorkerPrivate record
    let privateDoc = await WorkerPrivate.findOne({ workerId: worker._id });
    if (!privateDoc) {
      privateDoc = new WorkerPrivate({
        workerId: worker._id,
        userId: req.user._id
      });
    }
    privateDoc.aadhaarNumberMasked = maskedAadhaar;
    if (aadhaarNumber) {
      privateDoc.aadhaarVerificationHash = Buffer.from(String(aadhaarNumber)).toString('base64');
    }
    if (selfieUrl) {
      privateDoc.aadhaarFrontDocUrl = selfieUrl;
    }
    await privateDoc.save();

    res.json({
      success: true,
      message: 'Worker onboarding application submitted successfully. Pending admin approval.',
      data: {
        worker,
        kycVerificationStatus: worker.kycVerificationStatus,
        membershipStatus: worker.membershipStatus
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workers/me/jobs
 * List jobs for currently authenticated worker
 */
router.get('/me/jobs', authenticateJwt, requireWorker, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    if (!worker) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker not found' } });

    const { status } = req.query;
    const filter = {
      $or: [
        { workerId: worker._id },
        { assignedWorkerId: worker._id },
        { 'dispatchLog.workerId': worker._id },
        { 'dispatchLogs.candidateWorkerId': worker._id }
      ]
    };

    if (status) {
      filter.status = status;
    }

    const bookings = await Booking.find(filter)
      .populate('userId', 'fullName mobileNumber')
      .populate('serviceId', 'name category defaultDurationMinutes baseLaborPrice')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workers/:id
 * Public worker profile
 */
router.get('/:id', async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id)
      .populate('societyId', 'name societyCode')
      .populate('primaryRegionId', 'name')
      .populate('userId', 'fullName mobileNumber email');

    if (!worker) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker not found' } });
    }

    res.json({ success: true, data: worker });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workers/:id/reviews
 * Reviews for a worker
 */
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const reviews = await Review.find({ workerId: req.params.id, isFlagged: false })
      .populate('customerId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
});

module.exports = router;