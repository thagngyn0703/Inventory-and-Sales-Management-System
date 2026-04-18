const express = require('express');
const mongoose = require('mongoose');
const Stocktake = require('../models/Stocktake');
const Product = require('../models/Product');
const StockAdjustment = require('../models/StockAdjustment');
const { adjustStockFIFO } = require('../utils/inventoryUtils');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitManagerBadgeRefresh } = require('../socket');
const { notifyManagersInStore } = require('../services/managerNotificationService');

const router = express.Router();
const LIVE_MISMATCH_REQUIRE_NOTE_THRESHOLD = 5;

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return null;
  return { storeId };
}

// POST /api/stocktakes — Create stocktaking record (draft). Staff, Manager, Admin.
// Body: { product_ids: [ObjectId] }
// Snapshot current system_qty for each product; actual_qty/variance filled later.
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { product_ids } = req.body || {};
    const ids = Array.isArray(product_ids) ? product_ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ message: 'product_ids (array) is required and must not be empty' });
    }
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ message: 'No valid product ids provided' });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const requesterStoreId = req.user?.storeId ? String(req.user.storeId) : null;
    if (['manager', 'staff'].includes(role) && !requesterStoreId) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }

    const productFilter = { _id: { $in: validIds } };
    if (requesterStoreId) productFilter.storeId = requesterStoreId;
    const products = await Product.find(productFilter).lean();
    if (products.length !== validIds.length) {
      return res.status(400).json({ message: 'Có sản phẩm không tồn tại hoặc không thuộc phạm vi cửa hàng' });
    }
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
      storeId: requesterStoreId || undefined,
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
    if (err?.code === 'INSUFFICIENT_STOCK' || String(err?.message || '') === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        message: 'Không thể duyệt kiểm kê vì tồn kho không đủ để trừ theo chênh lệch.',
        code: 'INSUFFICIENT_STOCK',
      });
    }
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stocktakes?page=1&limit=20&status= — List stocktakes. Staff, Manager, Admin.
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
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
  const { id } = req.params;
  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }

    const reasonText = req.body?.reason != null ? String(req.body.reason).trim() : '';
    const managerNoteText = req.body?.manager_note != null ? String(req.body.manager_note).trim() : '';
    const effectiveNote = managerNoteText || reasonText;
    const adjustmentReason = effectiveNote || 'Duyệt từ phiếu kiểm kê';

    const mongoSession = await mongoose.startSession();
    let populated = null;
    let txErr = null;
    try {
      await mongoSession.withTransaction(async () => {
        const stocktake = await Stocktake.findOneAndUpdate(
          { _id: id, ...storeFilter, status: 'submitted' },
          {
            $set: {
              status: 'completed',
              completed_at: new Date(),
              updated_at: new Date(),
            },
          },
          { new: true, session: mongoSession }
        ).lean();

        if (!stocktake) {
          const existing = await Stocktake.findOne({ _id: id, ...storeFilter })
            .session(mongoSession)
            .lean();
          if (!existing) {
            const e = new Error('STOCKTAKE_NOT_FOUND');
            e.code = 'STOCKTAKE_NOT_FOUND';
            throw e;
          }
          const e = new Error('STOCKTAKE_BAD_STATE');
          e.code = 'STOCKTAKE_BAD_STATE';
          e.existingStatus = existing.status;
          throw e;
        }

        const storeIdResolved = stocktake.storeId
          ? String(stocktake.storeId)
          : req.user.storeId
            ? String(req.user.storeId)
            : '';
        if (!storeIdResolved) {
          const e = new Error('STORE_ID_REQUIRED');
          e.code = 'STORE_ID_REQUIRED';
          throw e;
        }

        const items = stocktake.items || [];
        const productIds = items
          .map((it) => (it?.product_id ? String(it.product_id) : null))
          .filter(Boolean);
        const liveProducts = await Product.find({
          _id: { $in: productIds },
          storeId: storeIdResolved,
        })
          .select('_id stock_qty')
          .session(mongoSession)
          .lean();
        const liveQtyMap = new Map(liveProducts.map((p) => [String(p._id), Number(p.stock_qty) || 0]));
        const significantMismatchItems = [];
        for (const it of items) {
          const pid = String(it.product_id);
          const snapshotQty = Number(it.system_qty) || 0;
          const liveQty = liveQtyMap.has(pid) ? Number(liveQtyMap.get(pid)) : snapshotQty;
          const delta = liveQty - snapshotQty;
          if (Math.abs(delta) > LIVE_MISMATCH_REQUIRE_NOTE_THRESHOLD) {
            significantMismatchItems.push({
              product_id: pid,
              snapshot_qty: snapshotQty,
              live_qty: liveQty,
              delta,
            });
          }
        }
        if (significantMismatchItems.length > 0 && !managerNoteText) {
          const e = new Error('MANAGER_NOTE_REQUIRED_ON_LIVE_MISMATCH');
          e.code = 'MANAGER_NOTE_REQUIRED_ON_LIVE_MISMATCH';
          e.threshold = LIVE_MISMATCH_REQUIRE_NOTE_THRESHOLD;
          e.mismatchCount = significantMismatchItems.length;
          throw e;
        }

        const adjustmentItems = [];
        for (const it of items) {
          const variance =
            it.variance != null
              ? Number(it.variance)
              : it.actual_qty != null && it.system_qty != null
                ? Number(it.actual_qty) - Number(it.system_qty)
                : null;
          if (variance == null || variance === 0) continue;
          adjustmentItems.push({
            product_id: it.product_id,
            adjusted_qty: variance,
          });
        }

        for (const adjIt of adjustmentItems) {
          await adjustStockFIFO(adjIt.product_id, storeIdResolved, adjIt.adjusted_qty, {
            note: `Kiểm kê (Phiếu #${id.substring(id.length - 6).toUpperCase()})`,
            movementType: 'ADJ_STOCKTAKE',
            referenceType: 'stocktake',
            referenceId: stocktake._id,
            actorId: req.user.id,
            session: mongoSession,
          });
        }

        const [adjustment] = await StockAdjustment.create(
          [
            {
              storeId: stocktake.storeId || undefined,
              stocktake_id: id,
              created_by: req.user.id,
              approved_by: req.user.id,
              status: 'approved',
              reason: adjustmentReason,
              items: adjustmentItems,
              approved_at: new Date(),
            },
          ],
          { session: mongoSession }
        );

        populated = await StockAdjustment.findById(adjustment._id)
          .populate('stocktake_id', 'snapshot_at created_at')
          .populate('approved_by', 'email')
          .populate('items.product_id', 'name sku base_unit')
          .session(mongoSession)
          .lean();
      });
    } catch (err) {
      txErr = err;
    } finally {
      mongoSession.endSession();
    }

    if (txErr) {
      if (txErr.code === 'STOCKTAKE_NOT_FOUND') {
        return res.status(404).json({ message: 'Stocktake not found' });
      }
      if (txErr.code === 'STOCKTAKE_BAD_STATE') {
        return res.status(400).json({
          message: `Phiếu đang ở trạng thái "${txErr.existingStatus}", không thể xử lý lặp`,
        });
      }
      if (txErr.code === 'STORE_ID_REQUIRED') {
        return res.status(400).json({
          message:
            'Phiếu kiểm kê thiếu mã cửa hàng; không thể điều chỉnh tồn. Vui lòng liên hệ quản trị để gán storeId hoặc tạo lại phiếu.',
          code: 'STORE_ID_REQUIRED',
        });
      }
      if (txErr.code === 'MANAGER_NOTE_REQUIRED_ON_LIVE_MISMATCH') {
        return res.status(400).json({
          message: `Tồn hiện tại lệch snapshot vượt ngưỡng ${txErr.threshold}. Vui lòng nhập lý do xác nhận trước khi duyệt.`,
          code: 'MANAGER_NOTE_REQUIRED_ON_LIVE_MISMATCH',
          threshold: txErr.threshold,
          mismatch_count: txErr.mismatchCount,
        });
      }
      if (txErr.code === 'INSUFFICIENT_STOCK' || String(txErr?.message || '') === 'INSUFFICIENT_STOCK') {
        return res.status(409).json({
          message: 'Không thể duyệt kiểm kê vì tồn kho hiện tại không đủ để trừ theo chênh lệch.',
          code: 'INSUFFICIENT_STOCK',
        });
      }
      if (txErr.code === 'PRODUCT_NOT_FOUND_IN_STORE') {
        return res.status(400).json({
          message: 'Một sản phẩm trong phiếu không còn trong cửa hàng hoặc đã bị xóa.',
          code: 'PRODUCT_NOT_FOUND_IN_STORE',
        });
      }
      if (txErr.code === 'STORE_ID_AND_PRODUCT_ID_REQUIRED') {
        return res.status(400).json({
          message: 'Thiếu thông tin cửa hàng hoặc sản phẩm khi điều chỉnh tồn.',
          code: 'STORE_ID_AND_PRODUCT_ID_REQUIRED',
        });
      }
      return res.status(500).json({ message: txErr.message || 'Server error' });
    }

    await emitManagerBadgeRefresh({
      storeId: populated?.storeId ? String(populated.storeId) : null,
    });

    return res.json({ adjustment: populated, message: 'Đã duyệt và cập nhật tồn kho' });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_STOCK' || String(err?.message || '') === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        message: 'Không thể duyệt kiểm kê vì tồn kho hiện tại không đủ để trừ theo chênh lệch.',
        code: 'INSUFFICIENT_STOCK',
      });
    }
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
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }

    const { reason } = req.body || {};
    const rejectReason = reason != null ? String(reason).trim() : '';

    const mongoSession = await mongoose.startSession();
    let badgeStoreId = null;
    let txErr = null;
    try {
      await mongoSession.withTransaction(async () => {
        const stocktake = await Stocktake.findOne({ _id: id, ...storeFilter }).session(mongoSession);
        if (!stocktake) {
          const e = new Error('STOCKTAKE_NOT_FOUND');
          e.code = 'STOCKTAKE_NOT_FOUND';
          throw e;
        }
        if (stocktake.status !== 'submitted') {
          const e = new Error('STOCKTAKE_BAD_STATE');
          e.code = 'STOCKTAKE_BAD_STATE';
          throw e;
        }

        const items = stocktake.items || [];
        const adjustmentItems = [];
        for (const it of items) {
          const variance =
            it.variance != null
              ? Number(it.variance)
              : it.actual_qty != null && it.system_qty != null
                ? Number(it.actual_qty) - Number(it.system_qty)
                : null;
          if (variance == null || variance === 0) continue;
          adjustmentItems.push({
            product_id: it.product_id,
            adjusted_qty: variance,
          });
        }

        await StockAdjustment.create(
          [
            {
              storeId: stocktake.storeId || undefined,
              stocktake_id: id,
              created_by: req.user.id,
              approved_by: req.user.id,
              status: 'rejected',
              reason: rejectReason || 'Từ chối phiếu kiểm kê',
              items: adjustmentItems,
              approved_at: new Date(),
            },
          ],
          { session: mongoSession }
        );

        stocktake.status = 'cancelled';
        stocktake.reject_reason = rejectReason;
        stocktake.updated_at = new Date();
        await stocktake.save({ session: mongoSession });
        badgeStoreId = stocktake.storeId ? String(stocktake.storeId) : null;
      });
    } catch (err) {
      txErr = err;
    } finally {
      mongoSession.endSession();
    }

    if (txErr) {
      if (txErr.code === 'STOCKTAKE_NOT_FOUND') {
        return res.status(404).json({ message: 'Stocktake not found' });
      }
      if (txErr.code === 'STOCKTAKE_BAD_STATE') {
        return res.status(400).json({ message: 'Chỉ được từ chối phiếu ở trạng thái Đã gửi' });
      }
      return res.status(500).json({ message: txErr.message || 'Server error' });
    }

    await emitManagerBadgeRefresh({ storeId: badgeStoreId });
    return res.json({ message: 'Đã từ chối phiếu kiểm kê' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stocktakes/:id — Get one stocktake with items and product details.
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const stocktake = await Stocktake.findOne({ _id: id, ...storeFilter })
      .populate('items.product_id', 'name sku base_unit stock_qty')
      .populate('created_by', 'email')
      .lean();
    if (!stocktake) return res.status(404).json({ message: 'Stocktake not found' });
    return res.json({ stocktake });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// PATCH /api/stocktakes/:id — Update items (actual_qty, reason) and/or submit. Only when status is draft.
// Body: { items?: [{ product_id, actual_qty?, reason? }], status?: 'submitted' }
router.patch('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const doc = await Stocktake.findOne({ _id: id, ...storeFilter });
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
          if (numActual !== null && (!Number.isFinite(numActual) || numActual < 0)) {
            throw new Error(`INVALID_ACTUAL_QTY:${String(pid)}`);
          }
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
      const hasUncountedItem = (doc.items || []).some((it) => it.actual_qty === null || it.actual_qty === undefined);
      if (hasUncountedItem) {
        return res.status(400).json({ message: 'Không thể gửi duyệt: cần nhập số lượng thực tế cho tất cả sản phẩm' });
      }
      doc.status = 'submitted';
    }
    doc.updated_at = new Date();
    await doc.save();
    if (newStatus === 'submitted') {
      await notifyManagersInStore({
        storeId: doc.storeId ? String(doc.storeId) : null,
        type: 'stocktake_submitted',
        title: 'Có phiếu kiểm kê chờ duyệt',
        message: 'Một phiếu kiểm kê vừa được gửi và đang chờ duyệt.',
        relatedEntity: 'stocktake',
        relatedId: doc._id,
      }).catch(() => {});
      await emitManagerBadgeRefresh({ storeId: doc.storeId ? String(doc.storeId) : null });
    }

    const populated = await Stocktake.findById(doc._id)
      .populate('items.product_id', 'name sku base_unit stock_qty')
      .populate('created_by', 'email')
      .lean();

    return res.json({ stocktake: populated });
  } catch (err) {
    if (String(err.message || '').startsWith('INVALID_ACTUAL_QTY:')) {
      return res.status(400).json({ message: 'actual_qty phải là số và không được âm' });
    }
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
