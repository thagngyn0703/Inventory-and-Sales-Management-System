const express = require('express');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { q = '', status = 'all', page = '1', limit = '20', all = 'false' } = req.query;
    const shouldGetAll = String(all).toLowerCase() === 'true';
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = {};
    if (status === 'active' || status === 'inactive') filter.status = status;
    if (String(q).trim()) {
      const re = new RegExp(escapeRegex(String(q).trim()), 'i');
      filter.$or = [{ name: re }, { phone: re }, { address: re }];
    }
    const total = await Store.countDocuments(filter);
    let storesQuery = Store.find(filter).sort({ createdAt: -1 });
    if (!shouldGetAll) {
      storesQuery = storesQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }
    const stores = await storesQuery.populate('managerId', 'fullName email').lean();
    return res.json({
      stores,
      total,
      page: shouldGetAll ? 1 : pageNum,
      limit: shouldGetAll ? total || 0 : limitNum,
      totalPages: shouldGetAll ? 1 : Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid store id' });
    const store = await Store.findById(id).populate('managerId', 'fullName email').lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    return res.json({ store });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin chỉ xem danh sách và đổi trạng thái; tạo/sửa cửa hàng do manager đăng ký (auth/register-store).
router.post('/', requireAuth, requireRole(['admin']), (req, res) => {
  return res.status(403).json({ message: 'Admin không được tạo cửa hàng qua hệ thống này' });
});

router.put('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  return res.status(403).json({ message: 'Admin không được chỉnh sửa thông tin cửa hàng qua hệ thống này' });
});

router.patch('/:id/status', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid store id' });
    const { status } = req.body || {};
    const nextStatus = status === 'inactive' ? 'inactive' : 'active';
    const store = await Store.findByIdAndUpdate(id, { status: nextStatus }, { new: true })
      .populate('managerId', 'fullName email')
      .lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    return res.json({ store });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

