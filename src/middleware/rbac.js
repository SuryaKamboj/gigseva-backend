const Worker = require('../models/Worker');
const Region = require('../models/Region');
const Booking = require('../models/Booking');

/**
 * enforceWorkerTenantScope
 * Validates Society/Federation Admin can only access workers in their scope.
 * Attaches req.targetWorker for use in controller.
 */
const enforceWorkerTenantScope = async (req, res, next) => {
  const { role, societyId, federationId } = req.user;
  if (role === 'SYSTEM_ADMIN') return next();

  const workerId = req.params.workerId || req.body.workerId;
  if (!workerId) return next();

  try {
    const worker = await Worker.findById(workerId).lean();
    if (!worker) {
      return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Worker not found.' } });
    }

    if (role === 'SOCIETY_ADMIN') {
      if (worker.societyId?.toString() !== societyId) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Society Admin out of jurisdiction.' } });
      }
    }
    if (role === 'FEDERATION_ADMIN') {
      if (worker.federationId?.toString() !== federationId) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Federation Admin out of scope.' } });
      }
    }
    req.targetWorker = worker;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * enforceBookingOwnership
 * Validates the booking belongs to the caller (CUSTOMER) or is assigned to the caller (WORKER).
 * Attaches req.targetBooking.
 */
const enforceBookingOwnership = async (req, res, next) => {
  const { role, userId, workerId } = req.user;
  if (role === 'SYSTEM_ADMIN' || role === 'SOCIETY_ADMIN' || role === 'FEDERATION_ADMIN') return next();

  try {
    const booking = await Booking.findById(req.params.bookingId).lean();
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Booking not found.' } });
    }
    if (role === 'CUSTOMER' && booking.userId?.toString() !== userId) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'This booking does not belong to you.' } });
    }
    if (role === 'WORKER' && booking.workerId?.toString() !== workerId) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'This booking is not assigned to you.' } });
    }
    req.targetBooking = booking;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * enforceBookingState
 * Validates booking is in one of the allowed states before proceeding.
 */
const enforceBookingState = (allowedStates) => async (req, res, next) => {
  try {
    const booking = req.targetBooking || await Booking.findById(req.params.bookingId).lean();
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Booking not found.' } });
    }
    if (!allowedStates.includes(booking.status)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot perform this action when booking is in state '${booking.status}'. Allowed states: ${allowedStates.join(', ')}.`
        }
      });
    }
    req.targetBooking = booking;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * enforceRegionFederationScope — validates Society/Federation Admin region access
 */
const enforceRegionFederationScope = async (req, res, next) => {
  const { role, societyId, federationId } = req.user;
  if (role === 'SYSTEM_ADMIN') return next();

  try {
    const region = await Region.findById(req.params.regionId).lean();
    if (!region) {
      return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Region not found.' } });
    }
    if (role === 'SOCIETY_ADMIN') {
      const Society = require('../models/Society');
      const society = await Society.findById(societyId).lean();
      if (!society?.jurisdictionRegionIds?.some(r => r.toString() === region._id.toString())) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Region not in Society jurisdiction.' } });
      }
    }
    if (role === 'FEDERATION_ADMIN') {
      if (region.federationId?.toString() !== federationId) {
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Region belongs to a different federation.' } });
      }
    }
    req.targetRegion = region;
    next();
  } catch (err) {
    next(err);
  }
};


const requireWorker = (req, res, next) => {
  if (!req.user || req.user.role !== 'WORKER') {
    return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Worker role required.' } });
  }
  next();
};

const requireCustomer = (req, res, next) => {
  if (!req.user || req.user.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Customer role required.' } });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  const adminRoles = ['SOCIETY_ADMIN', 'FEDERATION_ADMIN', 'SYSTEM_ADMIN', 'PLATFORM_SUPER_ADMIN'];
  if (!req.user || !adminRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Admin role required.' } });
  }
  next();
};

const requirePlatformAdmin = (req, res, next) => {
  const superRoles = ['SYSTEM_ADMIN', 'PLATFORM_SUPER_ADMIN'];
  if (!req.user || !superRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'Platform Admin role required.' } });
  }
  next();
};

const enforceTenantScope = enforceWorkerTenantScope;

module.exports = {
  requireWorker,
  requireCustomer,
  requireAdmin,
  requirePlatformAdmin,
  enforceTenantScope,
  enforceWorkerTenantScope,
  enforceBookingOwnership,
  enforceBookingState,
  enforceRegionFederationScope
};
