const express = require('express');
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustStockFIFO } = require('../utils/inventoryUtils');
const SupplierPayable = require('../models/SupplierPayable');
const SupplierPayment = require('../models/SupplierPayment');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const { recalculatePayable, refreshSupplierPayableCache } = require('../utils/supplierPayableUtils');

const router = express.Router();

const Product = require('../models/Product');
const ProductPriceHistory = require('../models/ProductPriceHistory');
const Supplier = require('../models/Supplier');
const User = require('../models/User');

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStoreScopeFilter(req) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return null;
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) return '__FORBIDDEN__';
    return new mongoose.Types.ObjectId(req.user.storeId);
}

/** Giá nhập theo đơn vị dòng = giá gốc (theo đơn vị cơ sở) × hệ số quy đổi. */
function resolveUnitCostFromProductCost(productDoc, ratio) {
    if (!productDoc) return 0;
    const baseCost = Number(productDoc.cost_price) || 0;
    const safeRatio = Number(ratio) > 0 ? Number(ratio) : 1;
    return Math.round(baseCost * safeRatio);
}

function shortReceiptCode(id) {
    const s = String(id || '');
    return s.slice(-6).toUpperCase();
}

async function logPriceHistory({
    productId,
    storeId,
    changedBy,
    source = 'goods_receipt',
    sourceNote,
    oldCost,
    newCost,
    oldSale,
    newSale,
    session,
}) {
    const safeOldCost = Math.round(Number(oldCost) || 0);
    const safeNewCost = Math.round(Number(newCost) || 0);
    const safeOldSale = Math.round(Number(oldSale) || 0);
    const safeNewSale = Math.round(Number(newSale) || 0);
    if (safeOldCost === safeNewCost && safeOldSale === safeNewSale) return;
    const payload = {
        product_id: productId,
        storeId: storeId || null,
        changed_by: changedBy,
        source,
        source_note: sourceNote ? String(sourceNote).trim() : undefined,
        old_cost_price: safeOldCost,
        new_cost_price: safeNewCost,
        old_sale_price: safeOldSale,
        new_sale_price: safeNewSale,
        changed_at: new Date(),
    };
    if (session) {
        await ProductPriceHistory.create([payload], { session });
        return;
    }
    await ProductPriceHistory.create(payload);
}

/** Gắn công nợ NCC (SupplierPayable) — nguồn đúng sau các lần thanh toán sau duyệt. */
async function attachSupplierPayablesToReceipts(list) {
    if (!list?.length) return list;
    const approved = list.filter((g) => g.status === 'approved');
    if (!approved.length) {
        return list.map((g) => ({ ...g, supplier_payable: null }));
    }
    const ids = approved.map((g) => g._id);
    const payables = await SupplierPayable.find({
        source_type: 'goods_receipt',
        source_id: { $in: ids },
    })
        .select('source_id storeId paid_amount remaining_amount status due_date')
        .lean();
    const map = new Map();
    for (const p of payables) {
        map.set(String(p.source_id), p);
    }
    return list.map((g) => {
        if (g.status !== 'approved') return { ...g, supplier_payable: null };
        const p = map.get(String(g._id));
        if (!p || String(p.storeId) !== String(g.storeId)) return { ...g, supplier_payable: null };
        return { ...g, supplier_payable: p };
    });
}

// GET /api/goods-receipts?page=&limit=&status=&supplier_id=&q=
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const {
            page = '1',
            limit = '20',
            status,
            supplier_id,
            q,
        } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const clauses = [];
        const storeScope = getStoreScopeFilter(req);
        if (storeScope === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Forbidden: user chưa được gán cửa hàng' });
        }
        if (storeScope) clauses.push({ storeId: storeScope });

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

        const total = await GoodsReceipt.countDocuments(filter);
        const skip = (pageNum - 1) * limitNum;
        const list = await GoodsReceipt.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('supplier_id', 'name phone email')
            .populate('po_id', 'status expected_date')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku cost_price sale_price base_unit selling_units')
            .lean();

        const listWithPayable = await attachSupplierPayablesToReceipts(list);

        return res.json({
            goodsReceipts: listWithPayable,
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
        const query = { _id: id };
        const storeScope = getStoreScopeFilter(req);
        if (storeScope === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Forbidden: user chưa được gán cửa hàng' });
        }
        if (storeScope) query.storeId = storeScope;

        const gr = await GoodsReceipt.findOne(query)
            .populate('supplier_id', 'name phone email address')
            .populate('po_id')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku cost_price sale_price base_unit selling_units')
            .lean();
        if (!gr) return res.status(404).json({ message: 'Goods receipt not found' });

        let supplier_payable = null;
        if (gr.status === 'approved') {
            const pq = {
                source_type: 'goods_receipt',
                source_id: gr._id,
            };
            if (gr.storeId) pq.storeId = gr.storeId;
            const p = await SupplierPayable.findOne(pq)
                .select('paid_amount remaining_amount status due_date _id')
                .lean();
            if (p) supplier_payable = p;
        }

        return res.json({ goodsReceipt: { ...gr, supplier_payable } });
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

        // validate items cơ bản
        for (const it of items) {
            if (!it.product_id || !mongoose.isValidObjectId(it.product_id)) {
                return res.status(400).json({ message: 'Invalid product_id in items' });
            }
            if (!it.quantity || Number(it.quantity) <= 0) {
                return res.status(400).json({ message: 'Invalid quantity in items' });
            }
        }

        // Staff không được sửa giá nhập: luôn lấy theo giá gốc (cost_price) × HSQĐ — khớp hóa đơn NCC theo đơn vị cơ sở.
        // unit_cost được server override để tránh client tự sửa payload.
        const productIds = [...new Set(items.map((it) => String(it.product_id)))];
        const products = await Product.find({ _id: { $in: productIds } })
            .select('name cost_price base_unit selling_units')
            .lean();
        const productMap = new Map(products.map((p) => [String(p._id), p]));
        const normalizedItems = [];

        for (const it of items) {
            const product = productMap.get(String(it.product_id));
            if (!product) {
                return res.status(400).json({ message: `Sản phẩm không tồn tại: ${String(it.product_id)}` });
            }
            const itemRatio = Number(it.ratio) > 0 ? Number(it.ratio) : 1;
            const itemUnitName = String(it.unit_name || '').trim() || product.base_unit || 'Cái';
            const systemUnitCost = resolveUnitCostFromProductCost(product, itemRatio);
            const note = it.price_gap_note != null ? String(it.price_gap_note).trim() : '';

            normalizedItems.push({
                product_id: it.product_id,
                quantity: Number(it.quantity),
                unit_cost: systemUnitCost,
                system_unit_cost: systemUnitCost,
                unit_name: itemUnitName,
                ratio: itemRatio,
                expiry_date: it.expiry_date ? new Date(it.expiry_date) : undefined,
                price_gap_note: note || undefined,
            });
        }

        // compute total từ giá đã chuẩn hóa
        const computedTotal = normalizedItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);

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
            items: normalizedItems,
            total_amount: total_amount != null ? Number(total_amount) : computedTotal,
            created_at: new Date(),
            reason: reason || undefined,
        });

        const saved = await GoodsReceipt.findById(doc._id)
            .populate('supplier_id', 'name phone email')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku cost_price sale_price base_unit selling_units')
            .lean();

        return res.status(201).json({ goodsReceipt: saved });
    } catch (err) {
        console.error('Create GR error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// PATCH /api/goods-receipts/:id/items (manager, admin)
// Manager cập nhật lại giá nhập + giá bán trước khi duyệt (status phải là pending)
router.patch('/:id/items', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { items = [] } = req.body || {};
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid goods receipt id' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'items is required' });
        }

        const gr = await GoodsReceipt.findById(id);
        if (!gr) return res.status(404).json({ message: 'Goods receipt not found' });
        if (req.user.role !== 'admin' && String(gr.storeId) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (gr.status !== 'pending') {
            return res.status(400).json({ message: 'Chỉ được cập nhật khi phiếu ở trạng thái chờ duyệt' });
        }

        const existingByProduct = new Map(gr.items.map((it) => [String(it.product_id), it]));
        const seen = new Set();

        for (const it of items) {
            if (!it.product_id || !mongoose.isValidObjectId(it.product_id)) {
                return res.status(400).json({ message: 'Invalid product_id in items' });
            }
            const key = String(it.product_id);
            if (seen.has(key)) {
                return res.status(400).json({ message: 'Một sản phẩm chỉ xuất hiện một lần trong danh sách cập nhật' });
            }
            seen.add(key);
            if (!existingByProduct.has(key)) {
                return res.status(400).json({ message: `Sản phẩm ${key} không thuộc phiếu nhập` });
            }
            if (!it.quantity || Number(it.quantity) <= 0) {
                return res.status(400).json({ message: 'Invalid quantity in items' });
            }
            if (it.unit_cost == null || Number(it.unit_cost) < 0) {
                return res.status(400).json({ message: 'Invalid unit_cost in items' });
            }
            if (it.sale_price == null || Number(it.sale_price) < 0) {
                return res.status(400).json({ message: 'Invalid sale_price in items' });
            }
        }

        const updatedItems = [];
        for (const curr of gr.items) {
            const patchItem = items.find((x) => String(x.product_id) === String(curr.product_id));
            if (!patchItem) {
                updatedItems.push(curr);
                continue;
            }
            const next = curr.toObject ? curr.toObject() : { ...curr };
            next.quantity = Number(patchItem.quantity);
            next.unit_cost = Math.round(Number(patchItem.unit_cost) || 0);
            if (patchItem.price_gap_note !== undefined) {
                const n = String(patchItem.price_gap_note || '').trim();
                next.price_gap_note = n || undefined;
            }
            updatedItems.push(next);

            const product = await Product.findById(curr.product_id);
            if (product) {
                const prevCost = Number(product.cost_price) || 0;
                const prevSale = Number(product.sale_price) || 0;
                const nextSalePrice = Math.round(Number(patchItem.sale_price) || 0);
                const lineUnitCost = Math.round(Number(patchItem.unit_cost) || 0);
                const itemRatio = Number(curr.ratio) > 0 ? Number(curr.ratio) : 1;
                // Giá gốc trong DB = đơn giá nhập theo đơn vị dòng / HSQĐ (đơn vị cơ sở)
                const nextBaseCost = Math.round(lineUnitCost / itemRatio);
                product.cost_price = nextBaseCost;

                const itemUnit = String(curr.unit_name || '').trim();
                let updatedSale = false;
                if (Array.isArray(product.selling_units) && product.selling_units.length > 0) {
                    const unit = product.selling_units.find((u) => String(u?.name || '').trim() === itemUnit);
                    if (unit) {
                        unit.sale_price = nextSalePrice;
                        updatedSale = true;
                    }
                }
                if (!updatedSale || itemUnit === String(product.base_unit || '').trim() || itemRatio === 1) {
                    product.sale_price = nextSalePrice;
                }
                product.updated_at = new Date();
                await product.save();
                await logPriceHistory({
                    productId: product._id,
                    storeId: product.storeId,
                    changedBy: req.user.id,
                    source: 'goods_receipt',
                    sourceNote: `Phiếu nhập #${shortReceiptCode(gr._id)}`,
                    oldCost: prevCost,
                    newCost: product.cost_price,
                    oldSale: prevSale,
                    newSale: product.sale_price,
                });
            }
        }

        gr.items = updatedItems;
        gr.total_amount = updatedItems.reduce(
            (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0),
            0
        );
        gr.updated_at = new Date();
        await gr.save();

        const updated = await GoodsReceipt.findById(id)
            .populate('supplier_id', 'name phone email')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku cost_price sale_price base_unit selling_units')
            .lean();
        return res.json({ goodsReceipt: updated });
    } catch (err) {
        console.error('Patch GR items error:', err);
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
            .populate('items.product_id', 'name sku cost_price sale_price base_unit selling_units')
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
        const {
            status,
            rejection_reason,
            payment_type,            // 'cash' | 'credit'
            amount_paid_at_approval, // số tiền trả ngay (với cash)
            due_date_payable,        // hạn thanh toán (với credit)
        } = req.body || {};
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
                const prevSale = Number(product.sale_price) || 0;

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
                    newCostPrice: Math.round(newCostPrice),
                });

                const productAfter = await Product.findById(it.product_id).session(session);
                if (productAfter) {
                    await logPriceHistory({
                        productId: productAfter._id,
                        storeId: productAfter.storeId,
                        changedBy: req.user.id,
                        source: 'goods_receipt',
                        sourceNote: `Phiếu nhập #${shortReceiptCode(gr._id)}`,
                        oldCost: currentCost,
                        newCost: Number(productAfter.cost_price) || 0,
                        oldSale: prevSale,
                        newSale: Number(productAfter.sale_price) || 0,
                        session,
                    });
                }
            }

            gr.approved_by = req.user.id;
            gr.status = 'approved';
            gr.updated_at = new Date();

            // Ghi nhận thông tin thanh toán lên phiếu nhập
            const safePayType = ['cash', 'credit'].includes(payment_type) ? payment_type : 'credit';
            const requestedPaid = Math.max(0, Number(amount_paid_at_approval) || 0);
            const receiptTotal = Number(gr.total_amount) || 0;
            const amountPaid = safePayType === 'cash' ? Math.min(requestedPaid || receiptTotal, receiptTotal) : 0;
            gr.payment_type = safePayType;
            gr.amount_paid_at_approval = amountPaid;
            gr.due_date_payable = due_date_payable ? new Date(due_date_payable) : undefined;

            await gr.save({ session });

            // ── Tạo SupplierPayable (idempotent: unique index bảo vệ) ──
            const totalAmount = Number(gr.total_amount) || 0;

            // Tính due_date: từ body → default từ NCC
            let finalDueDate = due_date_payable ? new Date(due_date_payable) : null;
            if (!finalDueDate && safePayType !== 'cash') {
                const supplierDoc = await Supplier.findById(gr.supplier_id).session(session);
                const termDays = Number(supplierDoc?.default_payment_term_days) || 0;
                if (termDays > 0) {
                    finalDueDate = new Date(gr.received_at || new Date());
                    finalDueDate.setDate(finalDueDate.getDate() + termDays);
                }
            }

            // Tính paid / remaining
            let payablePaid = 0;
            let payableRemaining = totalAmount;
            let payableStatus = 'open';

            if (safePayType === 'cash') {
                payablePaid = totalAmount;
                payableRemaining = 0;
                payableStatus = 'paid';
            }

            const [newPayable] = await SupplierPayable.create(
                [
                    {
                        supplier_id: gr.supplier_id,
                        storeId: gr.storeId,
                        source_type: 'goods_receipt',
                        source_id: gr._id,
                        total_amount: totalAmount,
                        paid_amount: payablePaid,
                        remaining_amount: payableRemaining,
                        status: payableStatus,
                        due_date: finalDueDate || undefined,
                        created_by: req.user.id,
                    },
                ],
                { session }
            );

            // Nếu có trả tiền ngay → tạo Payment + Allocation
            if (payablePaid > 0) {
                const [paymentDoc] = await SupplierPayment.create(
                    [
                        {
                            supplier_id: gr.supplier_id,
                            storeId: gr.storeId,
                            total_amount: payablePaid,
                            payment_date: new Date(),
                            payment_method: 'cash',
                            note: `Thanh toán khi duyệt phiếu nhập #${id.substring(id.length - 6).toUpperCase()}`,
                            created_by: req.user.id,
                        },
                    ],
                    { session }
                );
                await SupplierPaymentAllocation.create(
                    [
                        {
                            payment_id: paymentDoc._id,
                            payable_id: newPayable._id,
                            amount: payablePaid,
                        },
                    ],
                    { session }
                );
            }

            await session.commitTransaction();

            // Cập nhật cache Supplier.payable_account (ngoài transaction)
            await refreshSupplierPayableCache(gr.supplier_id, gr.storeId);
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
            .populate('items.product_id', 'name sku cost_price sale_price base_unit selling_units')
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
