const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');
const { buildManagerCounts, emitNotificationCountRefresh } = require('../socket');

const router = express.Router();

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysUntil(expiryDate) {
  const today = startOfDay(new Date());
  const exp = startOfDay(expiryDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((exp.getTime() - today.getTime()) / msPerDay);
}

async function createExpiryNotification({ userId, storeId, product, days }) {
  const uniqueKey = `product-expiry:${storeId}:${userId}:${product._id}:${days}`;
  const title = days === 30 ? 'Cảnh báo hạn sử dụng còn 1 tháng' : 'Cảnh báo hạn sử dụng còn 1 ngày';
  const message =
    days === 30
      ? `Sản phẩm "${product.name}" (SKU: ${product.sku}) còn khoảng 1 tháng là hết hạn.`
      : `Sản phẩm "${product.name}" (SKU: ${product.sku}) còn 1 ngày là hết hạn.`;
  try {
    await Notification.create({
      user_id: userId,
      storeId,
      type: days === 30 ? 'product_expiry_30_days' : 'product_expiry_1_day',
      title,
      message,
      related_entity: 'product',
      related_id: product._id,
      unique_key: uniqueKey,
      is_read: false,
      created_at: new Date(),
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

async function syncExpiryNotifications(req) {
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return;
  const products = await Product.find({
    storeId,
    expiry_date: { $exists: true, $ne: null },
    status: { $ne: 'inactive' },
  })
    .select('_id name sku expiry_date')
    .lean();

  for (const p of products) {
    const d = daysUntil(p.expiry_date);
    if (d < 0) continue;
    if (d <= 30) {
      await createExpiryNotification({ userId: req.user.id, storeId, product: p, days: 30 });
    }
    if (d <= 1) {
      await createExpiryNotification({ userId: req.user.id, storeId, product: p, days: 1 });
    }
  }
}

router.get('/unread-count', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    await syncExpiryNotifications(req);
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
    await syncExpiryNotifications(req);
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

