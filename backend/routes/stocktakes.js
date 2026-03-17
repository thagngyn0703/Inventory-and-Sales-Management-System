const express = require('express');
const mongoose = require('mongoose');
const Stocktake = require('../models/Stocktake');
const Product = require('../models/Product');
const StockAdjustment = require('../models/StockAdjustment');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/stocktakes — Create stocktaking record (draft). Warehouse, Manager, Admin.
// Body: { warehouse_id?: ObjectId, product_ids: [ObjectId] }
// Snapshot current system_qty for each product; actual_qty/variance filled later.
router.post('/', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { warehouse_id, product_ids } = req.body || {};
    const ids = Array.isArray(product_ids) ? product_ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ message: 'product_ids (array) is required and must not be empty' });
    }
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ message: 'No valid product ids provided' });
    }

    const products = await Product.find({ _id: { $in: validIds } }).lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const items = validIds.map((id) => {
      const p = productMap.get(String(id));
      const system_qty = p != null && typeof p.stock_qty === 'number' ? p.stock_qty : 0;
      return {
        product_id: id,
        system_qty,
        actual_qty: null,
        variance: null,
        reason: '',
      };
    });

    const doc = await Stocktake.create({
      warehouse_id: warehouse_id && mongoose.isValidObjectId(warehouse_id) ? warehouse_id : undefined,
      created_by: req.user.id,
      status: 'draft',
      snapshot_at: new Date(),
      items,
    });

    const populated = await Stocktake.findById(doc._id)
      .populate('items.product_id', 'name sku base_unit')
      .populate('created_by', 'email')
      .lean();

    return res.status(201).json({ stocktake: populated });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stocktakes?page=1&limit=20&status= — List stocktakes. Warehouse, Manager, Admin.
router.get('/', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = {};
    if (status && ['draft', 'submitted', 'completed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const total = await Stocktake.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const list = await Stocktake.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('created_by', 'email')
      .populate('warehouse_id', 'name')
      .lean();

    return res.json({
      stocktakes: list,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/stocktakes/:id/approve — Manager/Admin duyệt phiếu kiểm kê (submitted) → tạo điều chỉnh tồn, cập nhật Product.stock_qty
router.post('/:id/approve', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const stocktake = await Stocktake.findById(id).lean();
    if (!stocktake) return res.status(404).json({ message: 'Stocktake not found' });
    if (stocktake.status !== 'submitted') {
      return res.status(400).json({ message: 'Chỉ được duyệt phiếu ở trạng thái Đã gửi' });
    }

    const reasonText = req.body?.reason != null ? String(req.body.reason).trim() : '';
    const adjustmentReason = reasonText || 'Duyệt từ phiếu kiểm kê';

    const items = stocktake.items || [];
    const adjustmentItems = [];
    for (const it of items) {
      const variance = it.variance != null ? Number(it.variance) : (it.actual_qty != null && it.system_qty != null ? Number(it.actual_qty) - Number(it.system_qty) : null);
      if (variance == null || variance === 0) continue;
      adjustmentItems.push({
        product_id: it.product_id,
        adjusted_qty: variance,
      });
    }

    const adjustment = await StockAdjustment.create({
      warehouse_id: stocktake.warehouse_id || undefined,
      stocktake_id: id,
      created_by: req.user.id,
      approved_by: req.user.id,
      status: 'approved',
      reason: adjustmentReason,
      items: adjustmentItems,
      approved_at: new Date(),
    });

    for (const it of adjustmentItems) {
      await Product.findByIdAndUpdate(it.product_id, { $inc: { stock_qty: it.adjusted_qty }, updated_at: new Date() });
    }

    await Stocktake.findByIdAndUpdate(id, { status: 'completed', completed_at: new Date(), updated_at: new Date() });

    const populated = await StockAdjustment.findById(adjustment._id)
      .populate('stocktake_id', 'snapshot_at created_at')
      .populate('approved_by', 'email')
      .populate('items.product_id', 'name sku base_unit')
      .lean();

    return res.json({ adjustment: populated, message: 'Đã duyệt và cập nhật tồn kho' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/stocktakes/:id/reject — Manager/Admin từ chối phiếu kiểm kê (submitted) → chuyển sang cancelled, tạo bản ghi điều chỉnh (rejected)
router.post('/:id/reject', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const stocktake = await Stocktake.findById(id).lean();
    if (!stocktake) return res.status(404).json({ message: 'Stocktake not found' });
    if (stocktake.status !== 'submitted') {
      return res.status(400).json({ message: 'Chỉ được từ chối phiếu ở trạng thái Đã gửi' });
    }
    const { reason } = req.body || {};
    const rejectReason = reason != null ? String(reason).trim() : '';

    const items = stocktake.items || [];
    const adjustmentItems = [];
    for (const it of items) {
      const variance = it.variance != null ? Number(it.variance) : (it.actual_qty != null && it.system_qty != null ? Number(it.actual_qty) - Number(it.system_qty) : null);
      if (variance == null || variance === 0) continue;
      adjustmentItems.push({
        product_id: it.product_id,
        adjusted_qty: variance,
      });
    }

    await StockAdjustment.create({
      warehouse_id: stocktake.warehouse_id || undefined,
      stocktake_id: id,
      created_by: req.user.id,
      approved_by: req.user.id,
      status: 'rejected',
      reason: rejectReason || 'Từ chối phiếu kiểm kê',
      items: adjustmentItems,
      approved_at: new Date(),
    });

    await Stocktake.findByIdAndUpdate(id, {
      status: 'cancelled',
      reject_reason: rejectReason,
      updated_at: new Date(),
    });

    return res.json({ message: 'Đã từ chối phiếu kiểm kê' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stocktakes/:id — Get one stocktake with items and product details.
router.get('/:id', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const stocktake = await Stocktake.findById(id)
      .populate('items.product_id', 'name sku base_unit stock_qty')
      .populate('created_by', 'email')
      .populate('warehouse_id', 'name')
      .lean();
    if (!stocktake) return res.status(404).json({ message: 'Stocktake not found' });
    return res.json({ stocktake });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// PATCH /api/stocktakes/:id — Update items (actual_qty, reason) and/or submit. Only when status is draft.
// Body: { items?: [{ product_id, actual_qty?, reason? }], status?: 'submitted' }
router.patch('/:id', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const doc = await Stocktake.findById(id);
    if (!doc) return res.status(404).json({ message: 'Stocktake not found' });
    if (doc.status !== 'draft') {
      return res.status(400).json({ message: 'Chỉ được sửa phiếu ở trạng thái Nháp' });
    }

    const { items: bodyItems, status: newStatus } = req.body || {};
    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      const productIdToUpdate = new Map(
        bodyItems.map((row) => {
          const pid = row.product_id;
          const actual = row.actual_qty;
          const numActual = actual !== undefined && actual !== null && actual !== '' ? Number(actual) : null;
          return [
            String(pid),
            {
              actual_qty: numActual,
              reason: row.reason !== undefined ? String(row.reason || '').trim() : undefined,
            }
          ];
        })
      );
      doc.items = doc.items.map((item) => {
        const key = String(item.product_id);
        const upd = productIdToUpdate.get(key);
        if (!upd) return item;
        const systemQty = item.system_qty ?? 0;
        const actualQty = upd.actual_qty;
        const variance = actualQty !== null ? actualQty - systemQty : null;
        return {
          ...item.toObject ? item.toObject() : item,
          actual_qty: actualQty,
          variance,
          reason: upd.reason !== undefined ? upd.reason : (item.reason || ''),
        };
      });
      doc.markModified('items');
    }

    if (newStatus === 'submitted') {
      doc.status = 'submitted';
    }
    doc.updated_at = new Date();
    await doc.save();

    const populated = await Stocktake.findById(doc._id)
      .populate('items.product_id', 'name sku base_unit stock_qty')
      .populate('created_by', 'email')
      .populate('warehouse_id', 'name')
      .lean();

    return res.json({ stocktake: populated });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
