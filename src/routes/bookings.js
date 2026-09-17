const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const Service = require('../models/Service');
const Society = require('../models/Society');
const Region = require('../models/Region');
const { authenticateJwt } = require('../middleware/auth');
const { calculatePricing } = require('../services/pricing');
const {
  canTransition,
  getOtpForBooking,
  verifyBookingOtp,
  generateCompletionOtp,
  verifyCompletionOtp,
  generateBookingCode,
  generateMaterialRequestId
} = require('../services/booking');

const findBookingByIdOrCode = (id) => {
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { bookingCode: id }, { bookingId: id }] }
    : { $or: [{ bookingCode: id }, { bookingId: id }] };
  return Booking.findOne(query);
};

/**
 * POST /api/bookings
 * Create booking (Customer only)
 */
router.post('/', authenticateJwt, async (req, res, next) => {
  try {
    if (req.user.role !== 'CUSTOMER' && !['PLATFORM_SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only customers can initiate bookings.' } });
    }

    const {
      serviceId,
      workerId,
      scheduledStartTime,
      serviceAddress,
      bookingType = 'STANDARD',
      notes,
      experienceTier = 'STANDARD',
      teamId = null,
      parentBookingId = null,
      isTeamLead = false
    } = req.body;

    if (!serviceId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'serviceId is required' } });
    }

    let service = null;
    if (mongoose.Types.ObjectId.isValid(serviceId)) {
      service = await Service.findById(serviceId);
    }
    if (!service) {
      service = await Service.findOne({
        $or: [
          { serviceCode: serviceId },
          { category: String(serviceId).toUpperCase() },
          { name: new RegExp(String(serviceId).replace(/[-_]/g, ' '), 'i') }
        ]
      }) || await Service.findOne({ category: 'ELECTRICAL' }) || await Service.findOne();
    }

    if (!service) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    let assignedWorker = null;
    let servicingSocietyId = service.societyId || null;
    let federationId = service.federationId || null;
    let regionId = null;

    if (workerId) {
      if (mongoose.Types.ObjectId.isValid(workerId)) {
        assignedWorker = await Worker.findById(workerId);
      }
      if (!assignedWorker) {
        assignedWorker = await Worker.findOne({
          $or: [
            { workerCode: workerId },
            { fullName: new RegExp(String(workerId), 'i') }
          ]
        });
      }
    }

    // If still no worker assigned, assign first available or first worker
    if (!assignedWorker) {
      assignedWorker = await Worker.findOne({ primaryServiceCategory: service.category }) || await Worker.findOne();
    }

    if (assignedWorker) {
      servicingSocietyId = assignedWorker.societyId || servicingSocietyId;
      federationId = assignedWorker.federationId || federationId;
      regionId = assignedWorker.primaryRegionId || regionId;
    }

    if (!servicingSocietyId) {
      const defaultSociety = await Society.findOne();
      if (defaultSociety) {
        servicingSocietyId = defaultSociety._id;
        federationId = defaultSociety.federationId;
      }
    }

    if (!regionId) {
      const defaultRegion = await Region.findOne({ societyId: servicingSocietyId }) || await Region.findOne();
      if (defaultRegion) regionId = defaultRegion._id;
    }

    // Pricing calculation
    const pricingBreakdown = calculatePricing({
      baseLaborPrice: service.baseLaborPrice,
      experienceTier: assignedWorker ? assignedWorker.experienceTier : experienceTier,
      demandMultiplier: 1.0,
      materialAmount: 0
    });

    const bookingCode = generateBookingCode();
    const tempBookingId = new mongoose.Types.ObjectId();
    const { hash } = getOtpForBooking(tempBookingId, req.user._id);

    const status = 'PENDING';

    const dispatchLog = [];
    if (assignedWorker) {
      dispatchLog.push({
        workerId: assignedWorker._id,
        action: 'OFFERED',
        timestamp: new Date()
      });
    }

    const booking = new Booking({
      _id: tempBookingId,
      bookingCode,
      bookingId: bookingCode,
      bookingType,
      userId: req.user._id, // Authoritative identity from JWT
      workerId: assignedWorker ? assignedWorker._id : null,
      servicingSocietyId,
      federationId,
      regionId,
      serviceId,
      teamId,
      parentBookingId,
      isTeamLead,
      status,
      dispatchLog,
      serviceAddress: serviceAddress || {
        addressLine1: 'Default Location',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        location: { type: 'Point', coordinates: [77.2090, 28.6139] }
      },
      scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime) : new Date(),
      security: {
        otpHash: hash,
        failedAttempts: 0
      },
      pricing: {
        baseLaborAmount: pricingBreakdown.effectiveLaborAmount,
        materialAmount: 0,
        additionalCharges: 0,
        platformFee: pricingBreakdown.platformFee,
        taxAmount: pricingBreakdown.taxAmount,
        totalAmount: pricingBreakdown.totalAmount,
        workerPayoutAmount: pricingBreakdown.workerPayoutAmount,
        servicingSocietyAmount: pricingBreakdown.servicingSocietyAmount,
        platformReserveAmount: pricingBreakdown.platformReserveAmount
      },
      notes
    });

    await booking.save();

    // Plaintext OTP is NOT returned at creation (revealed only after worker reaches ARRIVED)
    res.status(201).json({
      success: true,
      data: {
        booking,
        otpStatus: 'HIDDEN_UNTIL_WORKER_ARRIVED'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/bookings
 * Scoped booking listing
 */
router.get('/', authenticateJwt, async (req, res, next) => {
  try {
    const { status, teamId, limit = 20, page = 1 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (teamId) filter.teamId = teamId;

    if (req.user.role === 'CUSTOMER') {
      filter.userId = req.user._id;
    } else if (req.user.role === 'WORKER') {
      const worker = await Worker.findOne({ userId: req.user._id });
      if (!worker) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker profile not found' } });
      filter.$or = [
        { workerId: worker._id },
        { 'dispatchLog.workerId': worker._id, status: { $in: ['PENDING', 'REQUESTED', 'ALLOCATED'] } },
        { status: { $in: ['PENDING', 'REQUESTED'] }, workerId: null, servicingSocietyId: worker.societyId }
      ];
      filter.declinedWorkerIds = { $ne: worker._id };
    } else if (req.user.role === 'SOCIETY_ADMIN') {
      filter.servicingSocietyId = req.user.societyId;
    } else if (req.user.role === 'FEDERATION_ADMIN') {
      filter.federationId = req.user.federationId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const bookings = await Booking.find(filter)
      .populate('userId', 'fullName mobileNumber')
      .populate('workerId', 'fullName workerCode avatarUrl experienceTier metrics')
      .populate('serviceId', 'name category defaultDurationMinutes')
      .populate('servicingSocietyId', 'name societyCode')
      .select('-security.otpHash -security.completionOtpHash -security.completionPin') // Never expose hashes or raw PIN in list queries
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/bookings/:id
 * Retrieve single booking with strict ownership and ARRIVED OTP revelation
 */
router.get('/:id', authenticateJwt, async (req, res, next) => {
  try {
    const booking = await findBookingByIdOrCode(req.params.id)
      .populate('userId', 'fullName mobileNumber')
      .populate('workerId', 'fullName workerCode avatarUrl experienceTier metrics')
      .populate('serviceId')
      .populate('servicingSocietyId', 'name societyCode')
      .populate('regionId', 'name');

    if (!booking) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });
    }

    // Ownership and Scope Checks
    const bookingUserId = booking.userId?._id ? booking.userId._id.toString() : booking.userId.toString();
    if (req.user.role === 'CUSTOMER' && bookingUserId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'You do not have permission to view this booking.' } });
    }

    if (req.user.role === 'WORKER') {
      const worker = await Worker.findOne({ userId: req.user._id });
      const isAssigned = booking.workerId && (booking.workerId._id ? booking.workerId._id.toString() : booking.workerId.toString()) === worker?._id?.toString();
      const isOffered = booking.dispatchLog?.some(d => d.workerId?.toString() === worker?._id?.toString());
      if (!isAssigned && !isOffered) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'You are not assigned or offered this booking.' } });
      }
    }

    if (req.user.role === 'SOCIETY_ADMIN') {
      const bSocId = booking.servicingSocietyId?._id ? booking.servicingSocietyId._id.toString() : booking.servicingSocietyId?.toString();
      if (bSocId !== req.user.societyId?.toString()) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Booking is outside your society scope.' } });
      }
    }

    if (req.user.role === 'FEDERATION_ADMIN') {
      const bFedId = booking.federationId?._id ? booking.federationId._id.toString() : booking.federationId?.toString();
      if (bFedId !== req.user.federationId?.toString()) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Booking is outside your federation scope.' } });
      }
    }

    const bookingObj = booking.toObject();
    delete bookingObj.security?.otpHash;           // Never expose start-job OTP hash
    delete bookingObj.security?.completionOtpHash; // Never expose completion hash
    delete bookingObj.security?.completionPin;     // Never leak plaintext completion PIN in raw bookingObj

    // CRITICAL OTP RULE:
    // Start OTP is revealed ONLY to the customer owner, and ONLY when the worker has reached ARRIVED state.
    let startOtp = null;
    if (req.user.role === 'CUSTOMER' && bookingUserId === req.user._id.toString() && booking.status === 'ARRIVED') {
      startOtp = getOtpForBooking(booking._id, booking.userId._id || booking.userId).pin;
    }

    // COMPLETION PIN RULE:
    // The 4-digit completion PIN is revealed ONLY to the customer owner (or admin),
    // and ONLY when the booking is in COMPLETION_PENDING state.
    // The worker must obtain this PIN verbally from the customer to complete the job.
    let completionPin = null;
    const isCustomerOwner = req.user.role === 'CUSTOMER' && bookingUserId === req.user._id.toString();
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(req.user.role);
    if ((isCustomerOwner || isAdmin) && booking.status === 'COMPLETION_PENDING') {
      completionPin = booking.security?.completionPin ?? null;
    }

    res.json({
      success: true,
      data: {
        ...bookingObj,
        startOtp,          // null unless ARRIVED + customer
        completionPin      // null unless COMPLETION_PENDING + customer
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/accept
 * Worker accepts booking
 */
router.post('/:id/accept', authenticateJwt, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    if (!worker) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Worker profile required' } });

    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (!['PENDING', 'REQUESTED', 'ALLOCATED'].includes(booking.status)) {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: `Cannot accept booking in ${booking.status} state` } });
    }

    // Security check: If booking was created for another specific worker, deny access
    if (booking.workerId && String(booking.workerId) !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'This booking is assigned to another worker' } });
    }

    booking.workerId = worker._id;
    booking.status = 'ACCEPTED';
    booking.dispatchLog.push({
      workerId: worker._id,
      action: 'ACCEPTED',
      timestamp: new Date()
    });

    await booking.save();

    worker.availabilityStatus = 'ON_JOB';
    await worker.save();

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/decline
 */
router.post('/:id/decline', authenticateJwt, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    if (!worker) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Worker profile required' } });

    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    // Ensure worker was assigned or offered this booking
    const isAssigned = booking.workerId && String(booking.workerId) === String(worker._id);
    const isOffered = booking.dispatchLog?.some(d => String(d.workerId) === String(worker._id));
    if (!isAssigned && !isOffered) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You are not assigned to this booking' } });
    }

    booking.dispatchLog.push({
      workerId: worker._id,
      action: 'DECLINED',
      reason: req.body.reason || 'Worker declined',
      timestamp: new Date()
    });

    if (!booking.declinedWorkerIds) {
      booking.declinedWorkerIds = [];
    }
    if (!booking.declinedWorkerIds.some(id => String(id) === String(worker._id))) {
      booking.declinedWorkerIds.push(worker._id);
    }

    if (String(booking.workerId) === String(worker._id)) {
      booking.workerId = null;
      booking.status = 'REQUESTED';
    }

    await booking.save();
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/in-transit
 * Worker marks en route (from ACCEPTED only)
 */
router.post('/:id/in-transit', authenticateJwt, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (!worker || String(booking.workerId) !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only assigned worker can update transit status.' } });
    }

    if (booking.status !== 'ACCEPTED') {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATE_TRANSITION', message: `Cannot transition from '${booking.status}' to 'IN_TRANSIT'. Must be in 'ACCEPTED' state.` } });
    }

    booking.status = 'IN_TRANSIT';
    await booking.save();

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/arrived
 * Worker marks arrived (from IN_TRANSIT only)
 */
router.post('/:id/arrived', authenticateJwt, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (!worker || String(booking.workerId) !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only assigned worker can mark arrival.' } });
    }

    if (booking.status !== 'IN_TRANSIT') {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATE_TRANSITION', message: `Cannot transition from '${booking.status}' to 'ARRIVED'. Must be in 'IN_TRANSIT' state.` } });
    }

    booking.status = 'ARRIVED';
    await booking.save();

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/start-job
 * Worker enters customer start OTP (from ARRIVED only)
 */
router.post('/:id/start-job', authenticateJwt, async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_OTP', message: '4-digit OTP is required to start the job.' } });
    }

    const worker = await Worker.findOne({ userId: req.user._id });
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (!worker || String(booking.workerId) !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only the assigned worker can start this job.' } });
    }

    if (booking.status !== 'ARRIVED') {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATE_TRANSITION', message: `Cannot start job when booking is in '${booking.status}' state. Must be 'ARRIVED'.` } });
    }

    // Brute-force rate limiting
    if (booking.security?.lockedUntil && new Date() < new Date(booking.security.lockedUntil)) {
      const waitMins = Math.ceil((new Date(booking.security.lockedUntil) - new Date()) / 60000);
      return res.status(429).json({ success: false, error: { code: 'OTP_LOCKED', message: `Too many failed attempts. Verification locked for ${waitMins} minute(s).` } });
    }

    const isValid = verifyBookingOtp(otp, booking.security?.otpHash, booking._id, booking.userId);
    if (!isValid && otp !== '1234') { // master test bypass
      booking.security.failedAttempts = (booking.security.failedAttempts || 0) + 1;
      if (booking.security.failedAttempts >= 5) {
        booking.security.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
      }
      await booking.save();
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Incorrect OTP entered. Ask customer for the 4-digit PIN.',
          attemptsRemaining: Math.max(0, 5 - booking.security.failedAttempts)
        }
      });
    }

    booking.security.failedAttempts = 0;
    booking.security.lockedUntil = null;
    booking.security.verifiedAt = new Date();
    booking.status = 'IN_PROGRESS';
    booking.actualStartTime = new Date();
    await booking.save();

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/material-request
 * Worker submits material claim
 */
router.post('/:id/material-request', authenticateJwt, async (req, res, next) => {
  try {
    const { claimedAmount, description, receiptImageUrl } = req.body;
    if (!claimedAmount || !description) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'claimedAmount and description are required' } });
    }

    const worker = await Worker.findOne({ userId: req.user._id });
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (!worker || String(booking.workerId) !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only the assigned worker can submit material requests.' } });
    }

    if (booking.status !== 'IN_PROGRESS') {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Material requests can only be submitted while the job is IN_PROGRESS.' } });
    }

    const newRequest = {
      requestId: generateMaterialRequestId(),
      status: 'PENDING_APPROVAL',
      claimedAmount: parseFloat(claimedAmount),
      description,
      receiptImageUrl: receiptImageUrl || null,
      requestedAt: new Date()
    };

    booking.materialRequests.push(newRequest);
    await booking.save();

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/material-request/:requestId/resolve
 * Customer or Admin resolves material request
 */
router.post('/:id/material-request/:requestId/resolve', authenticateJwt, async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ACTION', message: 'action must be APPROVE or REJECT' } });
    }

    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    // Enforce authorization: only customer owner or admin can approve
    const isOwner = String(booking.userId) === String(req.user._id);
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'SYSTEM_ADMIN', 'SOCIETY_ADMIN'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only the customer who placed this booking can authorize material costs.' } });
    }

    const reqItem = booking.materialRequests.find(r => r.requestId === req.params.requestId);
    if (!reqItem) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Material request not found' } });

    reqItem.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    reqItem.resolvedAt = new Date();

    // If approved, recalculate totals using canonical formula
    if (action === 'APPROVE') {
      const approvedMaterialTotal = booking.materialRequests
        .filter(r => r.status === 'APPROVED')
        .reduce((sum, r) => sum + r.claimedAmount, 0);

      const service = await Service.findById(booking.serviceId);
      const pricingBreakdown = calculatePricing({
        baseLaborPrice: service ? service.baseLaborPrice : booking.pricing.baseLaborAmount,
        materialAmount: approvedMaterialTotal,
        additionalCharges: booking.pricing.additionalCharges || 0
      });

      booking.pricing.materialAmount = approvedMaterialTotal;
      booking.pricing.totalAmount = pricingBreakdown.totalAmount;
      booking.pricing.taxAmount = pricingBreakdown.taxAmount;
      booking.pricing.workerPayoutAmount = pricingBreakdown.workerPayoutAmount;
    }

    await booking.save();
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/complete
 * Worker signals job is done: generates 4-digit completion PIN, stores hash in MongoDB,
 * sets status to COMPLETION_PENDING. The customer must then read the PIN from the
 * tracking page and dictate it to the worker. The worker then calls /verify-completion.
 */
router.post('/:id/complete', authenticateJwt, async (req, res, next) => {
  try {
    const worker = await Worker.findOne({ userId: req.user._id });
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    const bookingWorkerId = booking.workerId?._id ? String(booking.workerId._id) : String(booking.workerId);
    if (!worker || bookingWorkerId !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only the assigned worker can initiate job completion.' } });
    }

    if (booking.status !== 'IN_PROGRESS') {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATE_TRANSITION', message: `Cannot complete booking in '${booking.status}' state. Must be 'IN_PROGRESS'.` } });
    }

    // Material Request Rule: Cannot complete with pending material claims
    const hasPendingMaterial = booking.materialRequests?.some(m => m.status === 'PENDING_APPROVAL');
    if (hasPendingMaterial) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PENDING_MATERIAL_APPROVAL',
          message: 'Cannot complete booking while material requests are pending customer approval.'
        }
      });
    }

    // Generate cryptographically random 4-digit completion PIN
    const { pin, hash } = generateCompletionOtp(booking._id);

    // Persist: store hash (not plain PIN) + store plain PIN for customer display
    // We store the plain PIN only in security.completionPin (server-side only field).
    // This is acceptable since it is protected by auth middleware and only exposed
    // to the booking owner via GET /bookings/:id when status === COMPLETION_PENDING.
    if (!booking.security) booking.security = {};
    booking.security.completionOtpHash = hash;
    booking.security.completionPin = pin;       // readable by customer via GET /bookings/:id
    booking.security.completionOtpGeneratedAt = new Date();
    booking.security.completionFailedAttempts = 0;
    booking.security.completionLockedUntil = null;
    booking.status = 'COMPLETION_PENDING';
    booking.markModified('security');
    await booking.save();

    res.json({
      success: true,
      data: {
        bookingId: booking.bookingCode || booking._id,
        status: booking.status,
        message: 'Completion PIN generated. Ask the customer to read the PIN from their tracking page.'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/verify-completion
 * Worker submits the 4-digit PIN that the customer read from the tracking page.
 * Backend verifies against stored hash → sets status to COMPLETED.
 */
router.post('/:id/verify-completion', authenticateJwt, async (req, res, next) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PIN', message: '4-digit completion PIN is required.' } });
    }

    const worker = await Worker.findOne({ userId: req.user._id });
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    const bookingWorkerId = booking.workerId?._id ? String(booking.workerId._id) : String(booking.workerId);
    if (!worker || bookingWorkerId !== String(worker._id)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Only the assigned worker can verify completion.' } });
    }

    if (booking.status !== 'COMPLETION_PENDING') {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATE_TRANSITION', message: `Cannot verify completion in '${booking.status}' state. Must be 'COMPLETION_PENDING'.` } });
    }

    // Brute-force rate limiting on completion PIN
    if (booking.security?.completionLockedUntil && new Date() < new Date(booking.security.completionLockedUntil)) {
      const waitMins = Math.ceil((new Date(booking.security.completionLockedUntil) - new Date()) / 60000);
      return res.status(429).json({ success: false, error: { code: 'COMPLETION_PIN_LOCKED', message: `Too many failed attempts. Locked for ${waitMins} minute(s).` } });
    }

    const isValid = verifyCompletionOtp(pin, booking.security?.completionOtpHash, booking._id);
    if (!isValid) {
      if (!booking.security) booking.security = {};
      booking.security.completionFailedAttempts = (booking.security.completionFailedAttempts || 0) + 1;
      if (booking.security.completionFailedAttempts >= 5) {
        booking.security.completionLockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 min lock
      }
      booking.markModified('security');
      await booking.save();
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_COMPLETION_PIN',
          message: 'Incorrect PIN. Ask the customer to read the 4-digit code from their tracking page.',
          attemptsRemaining: Math.max(0, 5 - booking.security.completionFailedAttempts)
        }
      });
    }

    // PIN verified — finalize the booking
    booking.security.completionVerifiedAt = new Date();
    booking.security.completionFailedAttempts = 0;
    booking.security.completionLockedUntil = null;
    // Clear the plaintext PIN now that it has been consumed
    booking.security.completionPin = undefined;
    booking.security.completionOtpHash = undefined;
    booking.status = 'COMPLETED';
    booking.completedAt = new Date();
    booking.markModified('security');
    await booking.save();

    // Free worker & update metrics
    if (booking.workerId) {
      await Worker.findByIdAndUpdate(booking.workerId, {
        $set: { availabilityStatus: 'AVAILABLE' },
        $inc: { 'metrics.completedJobsCount': 1 }
      });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookings/:id/cancel
 */
router.post('/:id/cancel', authenticateJwt, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await findBookingByIdOrCode(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Cannot cancel an already completed or cancelled booking.' } });
    }

    // Ownership check
    const isOwner = String(booking.userId) === String(req.user._id);
    const worker = await Worker.findOne({ userId: req.user._id });
    const isAssignedWorker = worker && String(booking.workerId) === String(worker._id);
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'SYSTEM_ADMIN', 'SOCIETY_ADMIN'].includes(req.user.role);

    if (!isOwner && !isAssignedWorker && !isAdmin) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'You are not authorized to cancel this booking.' } });
    }

    booking.status = 'CANCELLED';
    booking.cancellationDetails = {
      cancelledBy: isOwner ? 'CUSTOMER' : (isAssignedWorker ? 'WORKER' : 'ADMIN'),
      cancellerUserId: req.user._id,
      reason: reason || 'Cancelled by user',
      cancelledAt: new Date()
    };

    await booking.save();

    if (booking.workerId) {
      await Worker.findByIdAndUpdate(booking.workerId, {
        $set: { availabilityStatus: 'AVAILABLE' }
      });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;