const express = require('express');
const mongoose = require('mongoose');
const StockAdjustment = require('../models/StockAdjustment');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  const isStoreScopedRole = ['manager', 'warehouse_staff', 'sales_staff'].includes(role);
  if (!isStoreScopedRole) return {};
  if (!storeId) return null;
  return { storeId };
}

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'stock-adjustments' });
});

// GET /api/stock-adjustments?page=1&limit=20&status= — List adjustments. Manager, Admin.
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = getRoleStoreFilter(req);
    if (filter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const total = await StockAdjustment.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const list = await StockAdjustment.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('stocktake_id', 'snapshot_at status created_at')
      .populate('approved_by', 'email')
      .populate('created_by', 'email')
      .lean();

    return res.json({
      adjustments: list,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stock-adjustments/:id — Get one adjustment with items.
router.get('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid adjustment id' });
    }
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const adjustment = await StockAdjustment.findOne({ _id: id, ...storeFilter })
      .populate('stocktake_id')
      .populate('approved_by', 'email')
      .populate('created_by', 'email')
      .populate('items.product_id', 'name sku base_unit')
      .populate('warehouse_id', 'name')
      .lean();
    if (!adjustment) return res.status(404).json({ message: 'Adjustment not found' });
    return res.json({ adjustment });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
