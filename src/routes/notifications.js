const express = require('express');
const router = express.Router();
const { authenticateJwt } = require('../middleware/auth');
const { getNotificationsForUser, markAsRead } = require('../services/notificationService');

router.use(authenticateJwt);

/**
 * GET /api/notifications
 * Retrieve recipient-specific notifications for the authenticated user
 */
router.get('/', (req, res) => {
  const notifs = getNotificationsForUser(req.user._id);
  res.json({ success: true, data: notifs });
});

/**
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', (req, res) => {
  const notif = markAsRead(req.params.id, req.user._id);
  if (!notif) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
  }
  res.json({ success: true, data: notif });
});

module.exports = router;