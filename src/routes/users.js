const express = require('express');
const router = express.Router();
const { authenticateJwt } = require('../middleware/auth');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', authenticateJwt, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/me
 * Update basic profile fields
 */
router.put('/me', authenticateJwt, async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      preferredLanguage,
      address,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pincode,
      postalCode,
      addresses
    } = req.body;

    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (email !== undefined) updates.email = email;
    if (preferredLanguage !== undefined) updates.preferredLanguage = preferredLanguage;

    if (address || addressLine1 || city || pincode) {
      updates.addresses = [{
        addressId: 'addr-' + Date.now(),
        label: 'HOME',
        addressLine1: address || addressLine1 || 'Default Address',
        addressLine2: addressLine2 || '',
        landmark: landmark || '',
        city: city || 'New Delhi',
        state: state || 'Delhi',
        pincode: pincode || postalCode || '110001',
        postalCode: pincode || postalCode || '110001',
        isDefault: true
      }];
    } else if (Array.isArray(addresses)) {
      updates.addresses = addresses;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/me/addresses
 * Add a new address to user profile
 */
router.post('/me/addresses', authenticateJwt, async (req, res, next) => {
  try {
    const { label, addressLine1, addressLine2, landmark, city, state, postalCode, location, isDefault } = req.body;

    const newAddress = {
      addressId: uuidv4(),
      label: label || 'HOME',
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      postalCode,
      location: location || { type: 'Point', coordinates: [0, 0] },
      isDefault: Boolean(isDefault)
    };

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

    if (newAddress.isDefault) {
      user.addresses.forEach(addr => { addr.isDefault = false; });
    } else if (user.addresses.length === 0) {
      newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({ success: true, data: user.addresses });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/me/addresses/:addressId
 */
router.delete('/me/addresses/:addressId', authenticateJwt, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

    user.addresses = user.addresses.filter(a => a.addressId !== req.params.addressId);
    await user.save();

    res.json({ success: true, data: user.addresses });
  } catch (err) {
    next(err);
  }
});

module.exports = router;