const express = require('express');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/suppliers — Danh sách nhà cung cấp (dropdown, manager/admin). Chỉ lấy active.
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const list = await Supplier.find({ status: 'active' })
      .sort({ name: 1 })
      .select('name phone email')
      .lean();
    return res.json({ suppliers: list });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
