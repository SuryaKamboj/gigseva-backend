const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * authenticateJwt - verifies Bearer token and attaches req.user
 */
const authenticateJwt = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'No token provided.' } });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).lean();
    if (!user || user.isBlocked) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'User not found or blocked.' } });
    }
    req.user = {
      _id: user._id,
      userId: user._id.toString(),
      role: user.role,
      societyId: decoded.societyId || user.societyId || null,
      federationId: decoded.federationId || user.federationId || null,
      workerId: decoded.workerId || null,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Token expired.' } });
    }
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid token.' } });
  }
};

/**
 * requireRole - role whitelist check
 */
const requireRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' } });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: `Role ${req.user.role} is not permitted for this action.` } });
  }
  next();
};

module.exports = { authenticateJwt, requireRole };