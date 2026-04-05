const express = require('express');
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustStockFIFO } = require('../utils/inventoryUtils');

const router = express.Router();

const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const User = require('../models/User');

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/goods-receipts?page=&limit=&status=&supplier_id=&q=&sortBy=&order=
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const {
            page = '1',
            limit = '20',
            status,
            supplier_id,
            q,
            sortBy = 'received_at',
            order = 'desc',
        } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const clauses = [];
        const validStatuses = ['draft', 'pending', 'approved', 'rejected'];
        if (status && validStatuses.includes(String(status))) {
            clauses.push({ status: String(status) });
        }
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            clauses.push({ supplier_id: new mongoose.Types.ObjectId(supplier_id) });
        }

        const qStr = q != null ? String(q).trim() : '';
        if (qStr) {
            const re = new RegExp(escapeRegex(qStr), 'i');
            const [supplierIds, userIds] = await Promise.all([
                Supplier.find({ name: re }).distinct('_id'),
                User.find({ fullName: re }).distinct('_id'),
            ]);
            const idOr = [];
            if (supplierIds.length) idOr.push({ supplier_id: { $in: supplierIds } });
            if (userIds.length) idOr.push({ received_by: { $in: userIds } });
            if (mongoose.isValidObjectId(qStr)) {
                idOr.push({ _id: new mongoose.Types.ObjectId(qStr) });
            }
            idOr.push({
                $expr: {
                    $regexMatch: {
                        input: { $toString: '$_id' },
                        regex: escapeRegex(qStr),
                        options: 'i',
                    },
                },
            });
            clauses.push({ $or: idOr });
        }

        const filter = clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { $and: clauses };

        const allowedSortFields = { received_at: 1, created_at: 1, total_amount: 1 };
        const sortField = allowedSortFields[sortBy] ? sortBy : 'received_at';
        const sortDir = order === 'asc' ? 1 : -1;
        const sortObj = { [sortField]: sortDir };

        const total = await GoodsReceipt.countDocuments(filter);
        const skip = (pageNum - 1) * limitNum;
        const list = await GoodsReceipt.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .populate('supplier_id', 'name phone email')
            .populate('po_id', 'status expected_date')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({
            goodsReceipts: list,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/goods-receipts/:id
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid goods receipt id' });
        }
        const gr = await GoodsReceipt.findById(id)
            .populate('supplier_id', 'name phone email address')
            .populate('po_id')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();
        if (!gr) return res.status(404).json({ message: 'Goods receipt not found' });
        return res.json({ goodsReceipt: gr });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/goods-receipts  (staff, manager)
router.post('/', requireAuth, requireRole(['staff', 'manager']), async (req, res) => {
    try {
        const {
            po_id,
            supplier_id,
            items = [],
            status = 'draft',
            received_at,
            total_amount,
            reason,
        } = req.body || {};

        if (!supplier_id || !mongoose.isValidObjectId(supplier_id)) {
            return res.status(400).json({ message: 'supplier_id is required' });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'items is required' });
        }

        // validate items
        for (const it of items) {
            if (!it.product_id || !mongoose.isValidObjectId(it.product_id)) {
                return res.status(400).json({ message: 'Invalid product_id in items' });
            }
            if (!it.quantity || Number(it.quantity) <= 0) {
                return res.status(400).json({ message: 'Invalid quantity in items' });
            }
            if (it.unit_cost == null || Number(it.unit_cost) < 0) {
                return res.status(400).json({ message: 'Invalid unit_cost in items' });
            }
        }

        // compute total if not provided
        const computedTotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);

        // Only allow creating in draft or pending — never approved/rejected directly
        const allowedCreateStatuses = ['draft', 'pending'];
        const safeStatus = allowedCreateStatuses.includes(status) ? status : 'draft';

        const doc = await GoodsReceipt.create({
            po_id: po_id && mongoose.isValidObjectId(po_id) ? po_id : undefined,
            supplier_id,
            storeId: req.user.storeId,
            received_by: req.user.id,
            status: safeStatus,
            received_at: received_at ? new Date(received_at) : new Date(),
            items,
            total_amount: total_amount != null ? Number(total_amount) : computedTotal,
            created_at: new Date(),
            reason: reason || undefined,
        });

        const saved = await GoodsReceipt.findById(doc._id)
            .populate('supplier_id', 'name phone email')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.status(201).json({ goodsReceipt: saved });
    } catch (err) {
        console.error('Create GR error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// PUT /api/goods-receipts/:id  (staff, manager) — ví dụ: gửi phiếu nháp sang chờ duyệt
router.put('/:id', requireAuth, requireRole(['staff', 'manager']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid goods receipt id' });
        }
        const gr = await GoodsReceipt.findById(id);
        if (!gr) return res.status(404).json({ message: 'Goods receipt not found' });
        if (req.user.role !== 'admin' && String(gr.storeId) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (gr.status !== 'draft') {
            return res.status(400).json({ message: 'Chỉ có thể cập nhật phiếu ở trạng thái nháp' });
        }
        if (status !== 'pending') {
            return res.status(400).json({ message: 'Cập nhật không hợp lệ' });
        }
        gr.status = 'pending';
        gr.updated_at = new Date();
        await gr.save();

        const updated = await GoodsReceipt.findById(id)
            .populate('supplier_id', 'name phone email')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({ goodsReceipt: updated });
    } catch (err) {
        console.error('Update GR error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// PATCH /api/goods-receipts/:id/status  (manager, admin)
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body || {};
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Chỉ được chuyển sang approved hoặc rejected' });
        }
        if (status === 'rejected' && (!rejection_reason || !String(rejection_reason).trim())) {
            return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối' });
        }

        const gr = await GoodsReceipt.findById(id).session(session);
        if (!gr) return res.status(404).json({ message: 'Goods receipt not found' });

        // Kiểm tra phạm vi cửa hàng
        if (req.user.role !== 'admin' && String(gr.storeId) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Forbidden: phiếu không thuộc cửa hàng của bạn' });
        }

        // Chỉ cho phép duyệt/từ chối khi phiếu đang ở trạng thái pending
        if (gr.status !== 'pending') {
            return res.status(400).json({ message: `Phiếu đang ở trạng thái "${gr.status}", không thể thay đổi` });
        }

        if (status === 'approved') {
            // Validate: mọi product_id phải tồn tại trước khi bắt đầu transaction
            for (const it of gr.items) {
                const exists = await Product.exists({ _id: it.product_id });
                if (!exists) {
                    return res.status(400).json({
                        message: `Sản phẩm không tồn tại trên hệ thống (id: ${String(it.product_id)}). Vui lòng duyệt yêu cầu tạo sản phẩm trước.`,
                    });
                }
            }

            session.startTransaction();

            // Cập nhật tồn kho + giá vốn bình quân trong cùng transaction (adjustStockFIFO dùng session)
            for (const it of gr.items) {
                const product = await Product.findById(it.product_id).session(session);
                if (!product) {
                    await session.abortTransaction();
                    return res.status(404).json({ message: `Product not found: ${String(it.product_id)}` });
                }
                const addQty = Number(it.quantity) * (Number(it.ratio) || 1);
                const unitCost = Number(it.unit_cost) || 0;
                const currentQty = Number(product.stock_qty) || 0;
                const currentCost = Number(product.cost_price) || 0;

                const newQty = currentQty + addQty;
                const newCostPrice = newQty > 0
                    ? (currentQty * currentCost + addQty * unitCost) / newQty
                    : unitCost;

                await adjustStockFIFO(it.product_id, gr.storeId || req.user.storeId, addQty, {
                    session,
                    unitCost,
                    receivedAt: gr.received_at,
                    receiptId: gr._id,
                    note: `Nhập hàng (Phiếu #${id.substring(id.length - 6).toUpperCase()})`,
                    newCostPrice: Math.round(newCostPrice * 100) / 100,
                });
            }

            gr.approved_by = req.user.id;
            gr.status = 'approved';
            gr.updated_at = new Date();
            await gr.save({ session });

            await session.commitTransaction();
        } else {
            // rejected
            gr.status = 'rejected';
            gr.rejection_reason = String(rejection_reason).trim();
            gr.approved_by = req.user.id;
            gr.updated_at = new Date();
            await gr.save();
        }

        const updated = await GoodsReceipt.findById(id)
            .populate('supplier_id', 'name phone email')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({ goodsReceipt: updated });
    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('Update GR status error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    } finally {
        session.endSession();
    }
});

module.exports = router;
