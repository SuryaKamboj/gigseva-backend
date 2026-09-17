const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { authenticateJwt } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/rbac');

/**
 * GET /api/services
 * Public service listing (filters: category, search, active)
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, search, active = 'true' } = req.query;
    const filter = {};

    if (active === 'true') filter.isActive = true;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const services = await Service.find(filter).sort({ category: 1, name: 1 });
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/services/:id
 * Single service details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const query = require('mongoose').Types.ObjectId.isValid(req.params.id)
      ? { _id: req.params.id }
      : {
          $or: [
            { serviceCode: req.params.id },
            { category: String(req.params.id).toUpperCase() }
          ]
        };
    const service = await Service.findOne(query);
    if (!service) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/services
 * Create a service (Platform Admin)
 */
router.post('/', authenticateJwt, requirePlatformAdmin, async (req, res, next) => {
  try {
    const service = new Service(req.body);
    await service.save();
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/services/:id
 * Update a service (Platform Admin)
 */
router.put('/:id', authenticateJwt, requirePlatformAdmin, async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!service) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

module.exports = router;