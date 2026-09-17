const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { verifyFirebaseToken } = require('../config/firebase');
const mockAadhaarService = require('../services/mockAadhaarService');
const User = require('../models/User');
const Worker = require('../models/Worker');

const signTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/login
 * Request OTP
 */
router.post('/login', [
  body('mobileNumber').matches(/^\+91[6-9]\d{9}$/).withMessage('Invalid mobile number format. Use +91XXXXXXXXXX'),
  body('role').isIn(['CUSTOMER', 'WORKER']).withMessage('Role must be CUSTOMER or WORKER')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg } });
  }
  res.json({ success: true, data: { message: 'OTP dispatched by platform authentication service.' } });
});

/**
 * POST /api/auth/verify-otp
 * Verifies OTP or Firebase token, creates user if not exists, and issues JWT
 */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { firebaseIdToken, mobileNumber, role = 'CUSTOMER', fullName } = req.body;

    // Resolve caller mobile number reliably
    let rawPhone = mobileNumber;
    if (firebaseIdToken) {
      const decoded = await verifyFirebaseToken(firebaseIdToken, mobileNumber);
      if (decoded && decoded.phone_number) {
        rawPhone = decoded.phone_number;
      }
    }

    if (!rawPhone) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Mobile number is required for verification.' }
      });
    }

    // Canonical phone normalization: +91 followed by 10 digits
    const cleanDigits = String(rawPhone).replace(/\D/g, '').slice(-10);
    if (cleanDigits.length !== 10) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Enter a valid 10-digit mobile number.' }
      });
    }
    const phone = `+91${cleanDigits}`;

    const isWorkerRole = (role && role.toUpperCase() === 'WORKER');

    let user = await User.findOne({ mobileNumber: phone });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      let initialName = fullName;

      // If worker and no name supplied, assign a persistent Mock Aadhaar identity name
      if (isWorkerRole && (!initialName || initialName === 'Worker Partner' || initialName === 'Worker Applicant' || initialName === 'Worker')) {
        const mockIdentity = mockAadhaarService.getMockIdentity(phone);
        initialName = mockIdentity.fullName;
      } else if (!initialName) {
        initialName = 'New Customer';
      }

      user = new User({
        mobileNumber: phone,
        fullName: initialName,
        role: isWorkerRole ? 'WORKER' : role.toUpperCase(),
        preferredLanguage: 'en',
        languagePreference: 'en',
        addresses: []
      });
      await user.save();
    } else if (isWorkerRole && user.role !== 'WORKER') {
      // Do NOT permanently overwrite the user's stored role.
      // A user can act as both CUSTOMER and WORKER from different frontends.
      // The JWT will carry the session-specific role.
      // If user had generic placeholder name, assign mock Aadhaar name
      if (!user.fullName || user.fullName === 'New Customer' || user.fullName === 'Worker Partner') {
        const mockIdentity = mockAadhaarService.getMockIdentity(phone);
        user.fullName = mockIdentity.fullName;
        await user.save();
      }
    }

    // Lookup worker profile if worker, or create if missing
    let workerDoc = null;
    if (user.role === 'WORKER' || isWorkerRole) {
      workerDoc = await Worker.findOne({ userId: user._id });
      if (!workerDoc) {
        // Generate mock Aadhaar profile for new worker
        const mockIdentity = mockAadhaarService.getMockIdentity(phone);
        const resolvedName = (user.fullName && user.fullName !== 'Worker Partner' && user.fullName !== 'Worker Applicant')
          ? user.fullName
          : mockIdentity.fullName;

        // Ensure user name matches
        if (user.fullName !== resolvedName) {
          user.fullName = resolvedName;
          await user.save();
        }

        const workerCode = `WK-${Date.now().toString().slice(-6)}`;
        workerDoc = new Worker({
          userId: user._id,
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
        await workerDoc.save();
      }
    }

    // Use the REQUESTED session role for the JWT, not the stored DB role.
    // This allows a user to act as CUSTOMER from user-frontend and WORKER from worker-frontend.
    const sessionRole = isWorkerRole ? 'WORKER' : (role ? role.toUpperCase() : user.role);

    const payload = {
      userId: user._id.toString(),
      role: sessionRole,
      societyId: user.societyId ? user.societyId.toString() : null,
      federationId: user.federationId ? user.federationId.toString() : null,
      workerId: workerDoc ? workerDoc._id.toString() : null
    };

    const { accessToken, refreshToken } = signTokens(payload);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          userId: user._id,
          fullName: workerDoc ? workerDoc.fullName : user.fullName,
          mobileNumber: user.mobileNumber,
          role: sessionRole,
          workerId: workerDoc ? workerDoc._id : null,
          workerCode: workerDoc ? workerDoc.workerCode : null,
          kycVerificationStatus: workerDoc ? workerDoc.kycVerificationStatus : null,
          membershipStatus: workerDoc ? workerDoc.membershipStatus : null,
          addresses: user.addresses || []
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Handle Admin Login
 * Accepts email, username, or userId
 */
const handleAdminLogin = async (req, res, next) => {
  try {
    const identifier = req.body.userId || req.body.email || req.body.username;
    const password = req.body.password;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email/Username and Password are required' } });
    }

    const user = await User.findOne({
      $or: [{ mobileNumber: identifier }, { email: identifier }, { fullName: identifier }],
      role: { $in: ['SOCIETY_ADMIN', 'FEDERATION_ADMIN', 'SYSTEM_ADMIN', 'PLATFORM_SUPER_ADMIN'] }
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials or non-admin user.' } });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials.' } });
    }

    const payload = {
      userId: user._id.toString(),
      role: user.role,
      societyId: user.societyId ? user.societyId.toString() : null,
      federationId: user.federationId ? user.federationId.toString() : null
    };

    const { accessToken, refreshToken } = signTokens(payload);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          userId: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          societyId: user.societyId,
          federationId: user.federationId
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

router.post('/admin/login', handleAdminLogin);
router.post('/admin-login', handleAdminLogin);

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' } });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId).lean();
    if (!user || user.isBlocked) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'User not found or blocked.' } });
    }

    const payload = {
      userId: user._id.toString(),
      role: user.role,
      societyId: decoded.societyId,
      federationId: decoded.federationId
    };

    const tokens = signTokens(payload);
    res.json({ success: true, data: { accessToken: tokens.accessToken } });
  } catch (err) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired refresh token.' } });
  }
});

module.exports = router;