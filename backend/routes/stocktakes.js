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
const STOCKTAKE_EXPIRED_REASON = 'Tồn hệ thống đã thay đổi';

async function loadLiveQtyMapForStocktake(stocktake, storeIdResolved, session) {
    const items = stocktake.items || [];
    const productIds = items
        .map((it) => (it?.product_id ? String(it.product_id) : null))
        .filter(Boolean);
    if (productIds.length === 0) return new Map();

    const query = Product.find({
        _id: { $in: productIds },
        storeId: storeIdResolved,
    }).select('_id stock_qty');
    if (session) query.session(session);
    const liveProducts = await query.lean();
    return new Map(liveProducts.map((p) => [String(p._id), Number(p.stock_qty) || 0]));
}

function getSignificantLiveMismatchItems(items, liveQtyMap) {
    const significantMismatchItems = [];
    for (const it of items || []) {
        const pid = String(it.product_id?._id ?? it.product_id);
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
    return significantMismatchItems;
}

function resolveStocktakeStoreId(stocktake, req) {
    return stocktake.storeId
        ? String(stocktake.storeId)
        : req.user?.storeId
            ? String(req.user.storeId)
            : '';
}

async function expireStocktakeOnLiveMismatch(stocktakeDoc, req, { session } = {}) {
    if (!stocktakeDoc || stocktakeDoc.status !== 'submitted') return false;
    const storeIdResolved = resolveStocktakeStoreId(
        stocktakeDoc.toObject ? stocktakeDoc.toObject() : stocktakeDoc,
        req
    );
    if (!storeIdResolved) return false;

    const liveQtyMap = await loadLiveQtyMapForStocktake(stocktakeDoc, storeIdResolved, session);
    const mismatches = getSignificantLiveMismatchItems(stocktakeDoc.items || [], liveQtyMap);
    if (mismatches.length === 0) return false;

    stocktakeDoc.status = 'expired';
    stocktakeDoc.reject_reason = STOCKTAKE_EXPIRED_REASON;
    stocktakeDoc.updated_at = new Date();
    await stocktakeDoc.save(session ? { session } : undefined);
    return true;
}

function getRoleStoreFilter(req) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return {};
    const isStoreScopedRole = ['manager', 'staff'].includes(role);
    if (!isStoreScopedRole) return {};
    const storeId = req.user?.storeId ? String(req.user.storeId) : null;
    if (!storeId) return null;
    return { storeId };
}

function normalizeRoleToThreeTier(role) {
    const r = String(role || '').toLowerCase().trim();
    if (r === 'warehouse_staff' || r === 'warehouse staff' || r === 'warehouse') return 'staff';
    if (r === 'sales_staff' || r === 'sales staff' || r === 'sales') return 'staff';
    return r;
}

function normalizeUserId(value) {
    if (value == null) return '';
    if (typeof value === 'object' && value._id != null) return String(value._id);
    return String(value);
}

function sameUserId(left, right) {
    const a = normalizeUserId(left);
    const b = normalizeUserId(right);
    if (!a || !b) return false;
    if (a === b) return true;
    try {
        if (mongoose.Types.ObjectId.isValid(a) && mongoose.Types.ObjectId.isValid(b)) {
            return new mongoose.Types.ObjectId(a).equals(new mongoose.Types.ObjectId(b));
        }
    } catch {
        /* ignore */
    }
    return false;
}

function getStocktakeCreatorId(stocktake) {
    return normalizeUserId(stocktake?.created_by);
}

function applyStocktakeListVisibility(filter, req) {
    const role = normalizeRoleToThreeTier(req.user?.role);
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId) return filter;

    if (role === 'staff') {
        filter.created_by = userId;
        return filter;
    }
    if (role === 'manager') {
        // Manager chỉ thấy nháp của chính mình; phiếu nháp của nhân viên chỉ hiện sau khi gửi duyệt.
        filter.$or = [{ created_by: userId }, { status: { $ne: 'draft' } }];
        return filter;
    }
    return filter;
}

function canViewStocktake(stocktake, req) {
    const role = String(req.user?.role || '').toLowerCase();
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId || !stocktake) return false;
    if (role === 'admin') return true;
    if (role === 'staff') return sameUserId(stocktake?.created_by, userId);
    if (role === 'manager') {
        if (stocktake.status === 'draft') return sameUserId(stocktake?.created_by, userId);
        return true;
    }
    return false;
}

function isSelfManagerStocktake(stocktake, req) {
    const role = normalizeRoleToThreeTier(req.user?.role);
    if (!['manager', 'admin'].includes(role)) return false;
    return sameUserId(stocktake?.created_by, req.user?.id);
}

/** Manager/admin hoàn tất trực tiếp phiếu nháp do chính họ tạo (không gửi duyệt). */
function canSelfCompleteDraft(stocktake, req) {
    if (!stocktake || stocktake.status !== 'draft') return false;
    const role = normalizeRoleToThreeTier(req.user?.role);
    if (!['manager', 'admin'].includes(role)) return false;
    return canViewStocktake(stocktake, req) && sameUserId(stocktake?.created_by, req.user?.id);
}

async function runStocktakeApprovalTransaction({ id, storeFilter, req, adjustmentReason, managerNoteText }) {
    const precheck = await Stocktake.findOne({ _id: id, ...storeFilter });
    if (!precheck) {
        const e = new Error('STOCKTAKE_NOT_FOUND');
        e.code = 'STOCKTAKE_NOT_FOUND';
        return { populated: null, txErr: e };
    }
    const selfManagerApprovePrecheck = canSelfCompleteDraft(precheck, req);
    if (precheck.status === 'draft' && !selfManagerApprovePrecheck) {
        const e = new Error('STOCKTAKE_BAD_STATE');
        e.code = 'STOCKTAKE_BAD_STATE';
        e.existingStatus = precheck.status;
        return { populated: null, txErr: e };
    }
    if (precheck.status !== 'submitted' && precheck.status !== 'draft') {
        const e = new Error('STOCKTAKE_BAD_STATE');
        e.code = 'STOCKTAKE_BAD_STATE';
        e.existingStatus = precheck.status;
        return { populated: null, txErr: e };
    }
    if (selfManagerApprovePrecheck) {
        const hasUncountedItem = (precheck.items || []).some(
            (it) => it.actual_qty === null || it.actual_qty === undefined
        );
        if (hasUncountedItem) {
            const e = new Error('STOCKTAKE_UNCOUNTED_ITEMS');
            e.code = 'STOCKTAKE_UNCOUNTED_ITEMS';
            return { populated: null, txErr: e };
        }
    }
    const storeIdPrecheck = resolveStocktakeStoreId(precheck, req);
    if (!storeIdPrecheck) {
        const e = new Error('STORE_ID_REQUIRED');
        e.code = 'STORE_ID_REQUIRED';
        return { populated: null, txErr: e };
    }
    const liveQtyMapPrecheck = await loadLiveQtyMapForStocktake(precheck, storeIdPrecheck);
    const mismatchPrecheck = getSignificantLiveMismatchItems(precheck.items || [], liveQtyMapPrecheck);
    if (mismatchPrecheck.length > 0) {
        await expireStocktakeOnLiveMismatch(precheck, req);
        const e = new Error('STOCKTAKE_EXPIRED_LIVE_MISMATCH');
        e.code = 'STOCKTAKE_EXPIRED_LIVE_MISMATCH';
        e.mismatchCount = mismatchPrecheck.length;
        return { populated: null, txErr: e };
    }

    const mongoSession = await mongoose.startSession();
    let populated = null;
    let txErr = null;
    try {
        await mongoSession.withTransaction(async () => {
            const existing = await Stocktake.findOne({ _id: id, ...storeFilter }).session(mongoSession);
            if (!existing) {
                const e = new Error('STOCKTAKE_NOT_FOUND');
                e.code = 'STOCKTAKE_NOT_FOUND';
                throw e;
            }
            const selfManagerApprove = canSelfCompleteDraft(existing, req);
            if (existing.status === 'draft' && !selfManagerApprove) {
                const e = new Error('STOCKTAKE_BAD_STATE');
                e.code = 'STOCKTAKE_BAD_STATE';
                e.existingStatus = existing.status;
                throw e;
            }
            if (existing.status !== 'submitted' && existing.status !== 'draft') {
                const e = new Error('STOCKTAKE_BAD_STATE');
                e.code = 'STOCKTAKE_BAD_STATE';
                e.existingStatus = existing.status;
                throw e;
            }
            if (selfManagerApprove) {
                const hasUncountedItem = (existing.items || []).some(
                    (it) => it.actual_qty === null || it.actual_qty === undefined
                );
                if (hasUncountedItem) {
                    const e = new Error('STOCKTAKE_UNCOUNTED_ITEMS');
                    e.code = 'STOCKTAKE_UNCOUNTED_ITEMS';
                    throw e;
                }
            }

            const storeIdResolved = resolveStocktakeStoreId(existing, req);
            if (!storeIdResolved) {
                const e = new Error('STORE_ID_REQUIRED');
                e.code = 'STORE_ID_REQUIRED';
                throw e;
            }

            existing.status = 'completed';
            existing.completed_at = new Date();
            existing.updated_at = new Date();
            await existing.save({ session: mongoSession });
            const stocktake = existing.toObject ? existing.toObject() : existing;

            const adjustmentItems = [];
            for (const it of stocktake.items || []) {
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
    return { populated, txErr };
}

function respondStocktakeApprovalError(res, txErr) {
    if (txErr.code === 'STOCKTAKE_NOT_FOUND') {
        res.status(404).json({ message: 'Stocktake not found' });
        return true;
    }
    if (txErr.code === 'STOCKTAKE_BAD_STATE') {
        const statusLabel =
            txErr.existingStatus === 'draft'
                ? 'Nháp'
                : txErr.existingStatus === 'submitted'
                    ? 'Đã gửi'
                    : txErr.existingStatus === 'completed'
                        ? 'Hoàn thành'
                        : txErr.existingStatus === 'cancelled'
                            ? 'Đã hủy'
                            : txErr.existingStatus === 'expired'
                                ? 'Hết hiệu lực'
                                : txErr.existingStatus;
        res.status(400).json({
            message:
                txErr.existingStatus === 'draft'
                    ? 'Phiếu đang ở trạng thái Nháp. Chỉ quản lý tạo phiếu mới dùng "Hoàn tất & điều chỉnh tồn"; nhân viên cần bấm "Gửi duyệt" trước.'
                    : `Phiếu đang ở trạng thái ${statusLabel}, không thể duyệt lại.`,
            code: 'STOCKTAKE_BAD_STATE',
        });
        return true;
    }
    if (txErr.code === 'STOCKTAKE_UNCOUNTED_ITEMS') {
        res.status(400).json({
            message: 'Không thể hoàn tất: cần nhập số lượng thực tế cho tất cả sản phẩm.',
            code: 'STOCKTAKE_UNCOUNTED_ITEMS',
        });
        return true;
    }
    if (txErr.code === 'STORE_ID_REQUIRED') {
        res.status(400).json({
            message:
                'Phiếu kiểm kê thiếu mã cửa hàng; không thể điều chỉnh tồn. Vui lòng liên hệ quản trị để gán storeId hoặc tạo lại phiếu.',
            code: 'STORE_ID_REQUIRED',
        });
        return true;
    }
    if (txErr.code === 'STOCKTAKE_EXPIRED_LIVE_MISMATCH') {
        res.status(400).json({
            message: STOCKTAKE_EXPIRED_REASON,
            code: 'STOCKTAKE_EXPIRED_LIVE_MISMATCH',
            mismatch_count: txErr.mismatchCount,
        });
        return true;
    }
    if (txErr.code === 'INSUFFICIENT_STOCK' || String(txErr?.message || '') === 'INSUFFICIENT_STOCK') {
        res.status(409).json({
            message: 'Không thể duyệt kiểm kê vì tồn kho hiện tại không đủ để trừ theo chênh lệch.',
            code: 'INSUFFICIENT_STOCK',
        });
        return true;
    }
    if (txErr.code === 'PRODUCT_NOT_FOUND_IN_STORE') {
        res.status(400).json({
            message: 'Một sản phẩm trong phiếu không còn trong cửa hàng hoặc đã bị xóa.',
            code: 'PRODUCT_NOT_FOUND_IN_STORE',
        });
        return true;
    }
    if (txErr.code === 'STORE_ID_AND_PRODUCT_ID_REQUIRED') {
        res.status(400).json({
            message: 'Thiếu thông tin cửa hàng hoặc sản phẩm khi điều chỉnh tồn.',
            code: 'STORE_ID_AND_PRODUCT_ID_REQUIRED',
        });
        return true;
    }
    return false;
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
    if (status && ['draft', 'submitted', 'completed', 'cancelled', 'expired'].includes(status)) {
      filter.status = status;
    }
    applyStocktakeListVisibility(filter, req);

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

    const { populated, txErr } = await runStocktakeApprovalTransaction({
      id,
      storeFilter,
      req,
      adjustmentReason,
      managerNoteText,
    });

    if (txErr) {
      if (txErr.code === 'STOCKTAKE_EXPIRED_LIVE_MISMATCH') {
        await emitManagerBadgeRefresh({
          storeId: req.user?.storeId ? String(req.user.storeId) : null,
        });
      }
      if (respondStocktakeApprovalError(res, txErr)) return undefined;
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
    const stocktakeDoc = await Stocktake.findOne({ _id: id, ...storeFilter })
      .populate('items.product_id', 'name sku base_unit stock_qty')
      .populate('created_by', 'email');
    if (!stocktakeDoc) return res.status(404).json({ message: 'Stocktake not found' });
    await expireStocktakeOnLiveMismatch(stocktakeDoc, req);
    const stocktake = stocktakeDoc.toObject ? stocktakeDoc.toObject() : stocktakeDoc;
    if (!canViewStocktake(stocktake, req)) {
      return res.status(403).json({
        message: 'Phiếu nháp của nhân viên chỉ hiển thị sau khi được gửi duyệt.',
        code: 'STOCKTAKE_DRAFT_HIDDEN',
      });
    }
    return res.json({
      stocktake: {
        ...stocktake,
        can_self_complete: canSelfCompleteDraft(stocktake, req),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// PATCH /api/stocktakes/:id — Update items (actual_qty, reason), submit (staff), or complete (manager own draft).
// Body: { items?, status?: 'submitted', complete?: true, reason?, manager_note? }
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
    if (!canViewStocktake(doc, req)) {
      return res.status(403).json({
        message: 'Không có quyền sửa phiếu kiểm kê này.',
        code: 'STOCKTAKE_FORBIDDEN',
      });
    }
    if (doc.status !== 'draft') {
      return res.status(400).json({ message: 'Chỉ được sửa phiếu ở trạng thái Nháp' });
    }

    const { items: bodyItems, status: newStatus, complete: wantComplete } = req.body || {};
    if (wantComplete === true && newStatus === 'submitted') {
      return res.status(400).json({
        message: 'Không thể vừa gửi duyệt vừa hoàn tất trong một thao tác.',
        code: 'STOCKTAKE_INVALID_ACTION',
      });
    }
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

    if (wantComplete === true) {
      const role = normalizeRoleToThreeTier(req.user?.role);
      if (!['manager', 'admin'].includes(role)) {
        return res.status(403).json({
          message: 'Chỉ quản lý mới được hoàn tất trực tiếp phiếu kiểm kê.',
          code: 'STOCKTAKE_COMPLETE_FORBIDDEN',
        });
      }
      if (!canSelfCompleteDraft(doc, req)) {
        return res.status(403).json({
          message: 'Chỉ được hoàn tất phiếu nháp do chính bạn tạo. Phiếu của nhân viên cần chờ họ gửi duyệt.',
          code: 'STOCKTAKE_COMPLETE_FORBIDDEN',
        });
      }
      const hasUncountedItem = (doc.items || []).some(
        (it) => it.actual_qty === null || it.actual_qty === undefined
      );
      if (hasUncountedItem) {
        return res.status(400).json({
          message: 'Không thể hoàn tất: cần nhập số lượng thực tế cho tất cả sản phẩm.',
          code: 'STOCKTAKE_UNCOUNTED_ITEMS',
        });
      }
      doc.updated_at = new Date();
      await doc.save();

      const reasonText = req.body?.reason != null ? String(req.body.reason).trim() : '';
      const managerNoteText = req.body?.manager_note != null ? String(req.body.manager_note).trim() : '';
      const effectiveNote = managerNoteText || reasonText;
      const adjustmentReason = effectiveNote || 'Quản lý tự kiểm kê và hoàn tất phiếu';

      const { populated, txErr } = await runStocktakeApprovalTransaction({
        id,
        storeFilter,
        req,
        adjustmentReason,
        managerNoteText,
      });
      if (txErr) {
        if (txErr.code === 'STOCKTAKE_EXPIRED_LIVE_MISMATCH') {
          await emitManagerBadgeRefresh({
            storeId: doc.storeId ? String(doc.storeId) : null,
          });
        }
        if (respondStocktakeApprovalError(res, txErr)) return undefined;
        return res.status(500).json({ message: txErr.message || 'Server error' });
      }

      await emitManagerBadgeRefresh({
        storeId: populated?.storeId ? String(populated.storeId) : null,
      });

      const completedStocktake = await Stocktake.findById(doc._id)
        .populate('items.product_id', 'name sku base_unit stock_qty')
        .populate('created_by', 'email')
        .lean();

      return res.json({
        adjustment: populated,
        message: 'Đã hoàn tất kiểm kê và cập nhật tồn kho',
        stocktake: {
          ...completedStocktake,
          can_self_complete: false,
        },
      });
    }

    if (newStatus === 'submitted') {
      if (isSelfManagerStocktake(doc, req)) {
        return res.status(400).json({
          message: 'Quản lý tự kiểm kê: vui lòng dùng "Hoàn tất & điều chỉnh tồn" thay vì gửi duyệt.',
          code: 'MANAGER_SELF_SUBMIT_FORBIDDEN',
        });
      }
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

    return res.json({
      stocktake: {
        ...populated,
        can_self_complete: canSelfCompleteDraft(populated, req),
      },
    });
  } catch (err) {
    if (String(err.message || '').startsWith('INVALID_ACTUAL_QTY:')) {
      return res.status(400).json({ message: 'actual_qty phải là số và không được âm' });
    }
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
