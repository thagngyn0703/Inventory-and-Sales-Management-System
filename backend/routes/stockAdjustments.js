const express = require('express');
const mongoose = require('mongoose');
const StockAdjustment = require('../models/StockAdjustment');
const Stocktake = require('../models/Stocktake');
const { adjustStockFIFO } = require('../utils/inventoryUtils');
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

    const reasonText = req.body?.reason != null ? String(req.body.reason).trim() : '';
    const mongoSession = await mongoose.startSession();
    let adjustmentId = null;
    let txErr = null;
    try {
      await mongoSession.withTransaction(async () => {
        const adjustment = await StockAdjustment.findOne({ _id: id, ...storeFilter }).session(mongoSession);
        if (!adjustment) {
          const e = new Error('ADJUSTMENT_NOT_FOUND');
          e.code = 'ADJUSTMENT_NOT_FOUND';
          throw e;
        }
        if (adjustment.is_reverted) {
          const e = new Error('ADJUSTMENT_ALREADY_REVERTED');
          e.code = 'ADJUSTMENT_ALREADY_REVERTED';
          throw e;
        }

        const stocktakeId = adjustment.stocktake_id ? String(adjustment.stocktake_id) : null;
        if (!stocktakeId || !mongoose.isValidObjectId(stocktakeId)) {
          const e = new Error('INVALID_STOCKTAKE_LINK');
          e.code = 'INVALID_STOCKTAKE_LINK';
          throw e;
        }

        const stocktake = await Stocktake.findOne({ _id: stocktakeId, ...storeFilter }).session(mongoSession);
        if (!stocktake) {
          const e = new Error('STOCKTAKE_NOT_FOUND');
          e.code = 'STOCKTAKE_NOT_FOUND';
          throw e;
        }

        const resolvedStoreId = stocktake.storeId
          ? String(stocktake.storeId)
          : req.user?.storeId
            ? String(req.user.storeId)
            : '';
        if (!resolvedStoreId) {
          const e = new Error('STORE_ID_REQUIRED');
          e.code = 'STORE_ID_REQUIRED';
          throw e;
        }

        if (adjustment.status === 'approved') {
          for (const it of adjustment.items || []) {
            const qty = Number(it.adjusted_qty) || 0;
            if (!qty) continue;
            await adjustStockFIFO(
              it.product_id,
              resolvedStoreId,
              -qty,
              {
                note: `Hoàn tác điều chỉnh kiểm kê #${String(adjustment._id).slice(-6).toUpperCase()}`,
                movementType: 'REV_STOCKTAKE',
                referenceType: 'stock_adjustment',
                referenceId: adjustment._id,
                actorId: req.user.id,
                session: mongoSession,
              }
            );
          }
        }

        stocktake.status = 'submitted';
        stocktake.completed_at = undefined;
        stocktake.reject_reason = '';
        stocktake.updated_at = new Date();
        await stocktake.save({ session: mongoSession });

        adjustment.is_reverted = true;
        adjustment.reverted_at = new Date();
        adjustment.reverted_by = req.user.id;
        adjustment.revert_reason = reasonText || (adjustment.status === 'approved'
          ? 'Hoàn tác phiếu duyệt kiểm kê'
          : 'Hoàn tác phiếu từ chối kiểm kê');
        await adjustment.save({ session: mongoSession });
        adjustmentId = adjustment._id;
      });
    } catch (err) {
      txErr = err;
    } finally {
      mongoSession.endSession();
    }

    if (txErr) {
      if (txErr.code === 'ADJUSTMENT_NOT_FOUND') {
        return res.status(404).json({ message: 'Adjustment not found' });
      }
      if (txErr.code === 'ADJUSTMENT_ALREADY_REVERTED') {
        return res.status(400).json({ message: 'Phiếu này đã được hoàn tác trước đó.' });
      }
      if (txErr.code === 'INVALID_STOCKTAKE_LINK') {
        return res.status(400).json({ message: 'Phiếu điều chỉnh không liên kết phiếu kiểm kê hợp lệ.' });
      }
      if (txErr.code === 'STOCKTAKE_NOT_FOUND') {
        return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kê liên quan để hoàn tác.' });
      }
      if (txErr.code === 'STORE_ID_REQUIRED') {
        return res.status(400).json({
          message: 'Phiếu thiếu thông tin cửa hàng để hoàn tác an toàn.',
          code: 'STORE_ID_REQUIRED',
        });
      }
      if (txErr?.code === 'INSUFFICIENT_STOCK' || String(txErr?.message || '') === 'INSUFFICIENT_STOCK') {
        return res.status(409).json({
          message: 'Không thể hoàn tác vì tồn kho hiện tại không đủ để đảo ngược điều chỉnh.',
          code: 'INSUFFICIENT_STOCK',
        });
      }
      return res.status(500).json({ message: txErr.message || 'Server error' });
    }

    const populated = await StockAdjustment.findById(adjustmentId)
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
    if (err?.code === 'INSUFFICIENT_STOCK' || String(err?.message || '') === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        message: 'Không thể hoàn tác vì tồn kho hiện tại không đủ để đảo ngược điều chỉnh.',
        code: 'INSUFFICIENT_STOCK',
      });
    }
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
