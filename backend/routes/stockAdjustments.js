const express = require('express');
const mongoose = require('mongoose');
const StockAdjustment = require('../models/StockAdjustment');
const Stocktake = require('../models/Stocktake');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
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
      .populate('reverted_by', 'email')
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
      .populate('reverted_by', 'email')
      .populate('created_by', 'email')
      .populate('items.product_id', 'name sku base_unit')
      .lean();
    if (!adjustment) return res.status(404).json({ message: 'Adjustment not found' });
    return res.json({ adjustment });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/stock-adjustments/:id/revert — Hoàn tác phiếu điều chỉnh/từ chối kiểm kê (Manager/Admin)
router.post('/:id/revert', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
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

    const adjustment = await StockAdjustment.findOne({ _id: id, ...storeFilter });
    if (!adjustment) return res.status(404).json({ message: 'Adjustment not found' });
    if (adjustment.is_reverted) {
      return res.status(400).json({ message: 'Phiếu này đã được hoàn tác trước đó.' });
    }

    const stocktakeId = adjustment.stocktake_id ? String(adjustment.stocktake_id) : null;
    if (!stocktakeId || !mongoose.isValidObjectId(stocktakeId)) {
      return res.status(400).json({ message: 'Phiếu điều chỉnh không liên kết phiếu kiểm kê hợp lệ.' });
    }

    const stocktake = await Stocktake.findOne({ _id: stocktakeId, ...storeFilter });
    if (!stocktake) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kê liên quan để hoàn tác.' });
    }

    if (adjustment.status === 'approved') {
      for (const it of adjustment.items || []) {
        const qty = Number(it.adjusted_qty) || 0;
        if (!qty) continue;
        await Product.findByIdAndUpdate(it.product_id, {
          $inc: { stock_qty: -qty },
          updated_at: new Date(),
        });
      }
    }

    stocktake.status = 'submitted';
    stocktake.completed_at = undefined;
    stocktake.reject_reason = '';
    stocktake.updated_at = new Date();
    await stocktake.save();

    const reasonText = req.body?.reason != null ? String(req.body.reason).trim() : '';
    adjustment.is_reverted = true;
    adjustment.reverted_at = new Date();
    adjustment.reverted_by = req.user.id;
    adjustment.revert_reason = reasonText || (adjustment.status === 'approved'
      ? 'Hoàn tác phiếu duyệt kiểm kê'
      : 'Hoàn tác phiếu từ chối kiểm kê');
    await adjustment.save();

    const populated = await StockAdjustment.findById(adjustment._id)
      .populate('stocktake_id')
      .populate('approved_by', 'email')
      .populate('reverted_by', 'email')
      .populate('created_by', 'email')
      .populate('items.product_id', 'name sku base_unit')
      .lean();

    return res.json({
      message: 'Hoàn tác thành công. Phiếu kiểm kê đã trở lại trạng thái chờ duyệt.',
      adjustment: populated,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
