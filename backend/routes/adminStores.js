const express = require('express');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { q = '', status = 'all', page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = {};
    if (status === 'active' || status === 'inactive') filter.status = status;
    if (String(q).trim()) {
      const re = new RegExp(escapeRegex(String(q).trim()), 'i');
      filter.$or = [{ name: re }, { phone: re }, { address: re }];
    }
    const total = await Store.countDocuments(filter);
    const stores = await Store.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('managerId', 'fullName email')
      .lean();
    return res.json({
      stores,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
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

router.post('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, address, phone, managerId, status } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Tên cửa hàng là bắt buộc' });
    if (!managerId || !mongoose.isValidObjectId(managerId)) return res.status(400).json({ message: 'managerId không hợp lệ' });
    const manager = await User.findById(managerId);
    if (!manager) return res.status(404).json({ message: 'Không tìm thấy manager' });
    if (String(manager.role) !== 'manager') return res.status(400).json({ message: 'Tài khoản được chọn không phải manager' });
    if (manager.storeId) return res.status(409).json({ message: 'Manager này đã có cửa hàng' });

    const store = await Store.create({
      name: String(name).trim(),
      address: address ? String(address).trim() : '',
      phone: phone ? String(phone).trim() : '',
      managerId,
      status: status === 'inactive' ? 'inactive' : 'active',
    });
    manager.storeId = store._id;
    await manager.save();

    const result = await Store.findById(store._id).populate('managerId', 'fullName email').lean();
    return res.status(201).json({ store: result });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Manager đã được gán cho cửa hàng khác' });
    return res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid store id' });
    const { name, address, phone, managerId, status } = req.body || {};
    const store = await Store.findById(id);
    if (!store) return res.status(404).json({ message: 'Store not found' });

    if (name !== undefined) store.name = String(name || '').trim();
    if (address !== undefined) store.address = String(address || '').trim();
    if (phone !== undefined) store.phone = String(phone || '').trim();
    if (status !== undefined) store.status = status === 'inactive' ? 'inactive' : 'active';

    if (managerId !== undefined) {
      if (!mongoose.isValidObjectId(managerId)) return res.status(400).json({ message: 'managerId không hợp lệ' });
      if (String(store.managerId) !== String(managerId)) {
        const nextManager = await User.findById(managerId);
        if (!nextManager) return res.status(404).json({ message: 'Không tìm thấy manager mới' });
        if (String(nextManager.role) !== 'manager') return res.status(400).json({ message: 'Tài khoản được chọn không phải manager' });
        if (nextManager.storeId && String(nextManager.storeId) !== String(store._id)) {
          return res.status(409).json({ message: 'Manager mới đã thuộc cửa hàng khác' });
        }
        const prevManager = await User.findById(store.managerId);
        if (prevManager && String(prevManager.storeId) === String(store._id)) {
          prevManager.storeId = null;
          await prevManager.save();
        }
        nextManager.storeId = store._id;
        await nextManager.save();
        store.managerId = managerId;
      }
    }

    await store.save();
    const result = await Store.findById(store._id).populate('managerId', 'fullName email').lean();
    return res.json({ store: result });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Manager đã được gán cho cửa hàng khác' });
    return res.status(500).json({ message: 'Server error' });
  }
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

