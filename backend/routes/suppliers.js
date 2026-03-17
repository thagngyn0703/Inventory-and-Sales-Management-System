const express = require('express');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// POST /api/suppliers — Create a new supplier (manager, admin)
router.post('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { name, phone, email, address, status, payable_account } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Tên nhà cung cấp là bắt buộc' });
    }

    const doc = await Supplier.create({
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      address: address ? String(address).trim() : undefined,
      status: status === 'inactive' ? 'inactive' : 'active',
      payable_account: Number(payable_account || 0) || 0,
    });

    return res.status(201).json({ supplier: doc });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Lỗi máy chủ' });
  }
});

// GET /api/suppliers?q=...&page=1&limit=20
router.get('/', requireAuth, requireRole(['manager', 'warehouse', 'admin']), async (req, res) => {
  try {
    const { q = '', page = '1', limit = '20' } = req.query;
    const query = String(q || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = {};
    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ name: re }, { phone: re }, { email: re }, { address: re }];
    }

    const total = await Supplier.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const suppliers = await Supplier.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    return res.json({
      suppliers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// GET /api/suppliers/:id
router.get('/:id', requireAuth, requireRole(['manager', 'warehouse', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID nhà cung cấp không hợp lệ' });
    }
    const supplier = await Supplier.findById(id).lean();
    if (!supplier) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
    return res.json({ supplier });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID nhà cung cấp không hợp lệ' });
    }
    const { name, phone, email, address, status, payable_account } = req.body || {};

    const supplier = await Supplier.findById(id);
    if (!supplier) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });

    if (name !== undefined) supplier.name = String(name).trim();
    if (phone !== undefined) supplier.phone = phone ? String(phone).trim() : undefined;
    if (email !== undefined) supplier.email = email ? String(email).trim().toLowerCase() : undefined;
    if (address !== undefined) supplier.address = address ? String(address).trim() : undefined;
    if (status !== undefined) supplier.status = status === 'inactive' ? 'inactive' : 'active';
    if (payable_account !== undefined) supplier.payable_account = Number(payable_account) || 0;
    supplier.updated_at = new Date();
    await supplier.save();

    return res.json({ supplier });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// PATCH /api/suppliers/:id/status
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID nhà cung cấp không hợp lệ' });
    }
    const { status } = req.body || {};
    const newStatus = status === 'inactive' ? 'inactive' : 'active';

    const supplier = await Supplier.findByIdAndUpdate(
      id,
      { status: newStatus, updated_at: new Date() },
      { new: true }
    ).lean();
    if (!supplier) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
    return res.json({ supplier });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

module.exports = router;
