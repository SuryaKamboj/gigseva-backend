const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TrackingEvent = require('../models/TrackingEvent');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const { authenticateJwt } = require('../middleware/auth');
const { requireWorker } = require('../middleware/rbac');

/**
 * POST /api/tracking/events
 * Worker pushes GPS tracking point
 */
router.post('/events', authenticateJwt, requireWorker, async (req, res, next) => {
  try {
    const { bookingId, latitude, longitude, heading, speedKmh } = req.body;
    if (!bookingId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'bookingId, latitude, and longitude are required' } });
    }

    const worker = await Worker.findOne({ userId: req.user._id });
    if (!worker) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Worker profile not found' } });

    const event = new TrackingEvent({
      bookingId,
      workerId: worker._id,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      heading,
      speedKmh,
      timestamp: new Date()
    });

    await event.save();

    // Also update worker current location
    await Worker.findByIdAndUpdate(worker._id, {
      $set: {
        currentLocation: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        lastActiveAt: new Date()
      }
    });

    res.status(201).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tracking/booking/:bookingId
 * Get current tracking location + recent trail + dual coordinates
 */
router.get('/booking/:bookingId', authenticateJwt, async (req, res, next) => {
  try {
    const rawId = req.params.bookingId;
    const query = mongoose.Types.ObjectId.isValid(rawId) ? { _id: rawId } : { bookingCode: rawId };
    const booking = await Booking.findOne(query)
      .populate('workerId', 'fullName workerCode currentLocation avatarUrl')
      .select('serviceAddress status workerId bookingCode');

    const effectiveBookingId = booking ? booking._id : (mongoose.Types.ObjectId.isValid(rawId) ? rawId : null);

    const events = effectiveBookingId ? await TrackingEvent.find({ bookingId: effectiveBookingId })
      .sort({ timestamp: -1 })
      .limit(30) : [];

    // Derive worker current location
    let workerCoords = null;
    if (events.length > 0 && events[0].location?.coordinates) {
      workerCoords = events[0].location.coordinates; // [lng, lat]
    } else if (booking?.workerId?.currentLocation?.coordinates) {
      workerCoords = booking.workerId.currentLocation.coordinates;
    } else {
      workerCoords = [77.2090, 28.5300]; // Default New Delhi worker coordinate
    }

    // Customer destination coords
    let customerCoords = null;
    const rawCoords = booking?.serviceAddress?.location?.coordinates;
    if (Array.isArray(rawCoords) && rawCoords.length === 2 && (rawCoords[0] !== 0 || rawCoords[1] !== 0)) {
      customerCoords = rawCoords;
    } else {
      customerCoords = [77.2060, 28.5244]; // Default Saket/Lajpat Nagar customer coordinate
    }

    res.json({
      success: true,
      data: {
        workerLocation: {
          latitude: workerCoords[1],
          longitude: workerCoords[0],
          name: booking?.workerId?.fullName || 'Assigned Worker',
          workerCode: booking?.workerId?.workerCode || 'WK-ASSIGNED'
        },
        customerLocation: {
          latitude: customerCoords[1],
          longitude: customerCoords[0],
          address: booking?.serviceAddress?.addressLine1 ? `${booking.serviceAddress.addressLine1}, ${booking.serviceAddress.city || 'Delhi'}` : 'Customer Address'
        },
        currentLocation: {
          type: 'Point',
          coordinates: workerCoords
        },
        destination: booking ? booking.serviceAddress : null,
        trail: events,
        status: booking ? booking.status : 'ALLOCATED',
        bookingCode: booking?.bookingCode || rawId
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;