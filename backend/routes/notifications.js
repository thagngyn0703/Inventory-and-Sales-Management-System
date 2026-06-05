const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { requireAuth, requireRole } = require('../middleware/auth');
const { buildManagerCounts, emitNotificationCountRefresh } = require('../socket');
const { syncSupplierPayableDueNotificationsFromRequest } = require('../services/supplierPayableDueNotificationService');
const { syncExpiryNotificationsFromRequest } = require('../services/productExpiryNotificationService');

const router = express.Router();

router.get('/unread-count', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    await syncExpiryNotificationsFromRequest(req);
    await syncSupplierPayableDueNotificationsFromRequest(req);
    const storeId = req.user?.storeId ? String(req.user.storeId) : null;
    const count = await Notification.countDocuments({
      user_id: req.user.id,
      storeId,
      is_read: false,
    });
    return res.json({ unreadCount: count });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/manager-badge-counts', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const storeId = req.user?.storeId ? String(req.user.storeId) : null;
    if (!storeId) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const counts = await buildManagerCounts(storeId);
    return res.json(counts);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    await syncExpiryNotificationsFromRequest(req);
    await syncSupplierPayableDueNotificationsFromRequest(req);
    const storeId = req.user?.storeId ? String(req.user.storeId) : null;
    const list = await Notification.find({
      user_id: req.user.id,
      storeId,
    })
      .sort({ is_read: 1, created_at: -1 })
      .limit(200)
      .lean();
    const unreadCount = list.filter((n) => !n.is_read).length;
    return res.json({ notifications: list, unreadCount });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/read', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid notification id' });
    const storeId = req.user?.storeId ? String(req.user.storeId) : null;
    const doc = await Notification.findOneAndUpdate(
      { _id: id, user_id: req.user.id, storeId },
      { is_read: true },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ message: 'Notification not found' });
    await emitNotificationCountRefresh({ storeId, userId: req.user.id });
    return res.json({ notification: doc });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/read-all', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const storeId = req.user?.storeId ? String(req.user.storeId) : null;
    const result = await Notification.updateMany(
      { user_id: req.user.id, storeId, is_read: false },
      { $set: { is_read: true } }
    );
    await emitNotificationCountRefresh({ storeId, userId: req.user.id });
    return res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

