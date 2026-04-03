const express = require('express');
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustStockFIFO } = require('../utils/inventoryUtils');

const router = express.Router();

const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

// GET /api/goods-receipts?page=&limit=&status=&supplier_id=
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { page = '1', limit = '20', status, supplier_id } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const filter = {};
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            filter.status = status;
        }
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = new mongoose.Types.ObjectId(supplier_id);
        }

        const total = await GoodsReceipt.countDocuments(filter);
        const skip = (pageNum - 1) * limitNum;
        const list = await GoodsReceipt.find(filter)
            .sort({ received_at: -1 })
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

        const doc = await GoodsReceipt.create({
            po_id: po_id && mongoose.isValidObjectId(po_id) ? po_id : undefined,
            supplier_id,
            storeId: req.user.storeId,
            received_by: req.user.id,
            status: ['draft', 'pending', 'approved', 'rejected'].includes(status) ? status : 'draft',
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

// PATCH /api/goods-receipts/:id/status  (manager, admin)
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });
        if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });

        const gr = await GoodsReceipt.findById(id);
        if (!gr) return res.status(404).json({ message: 'Goods receipt not found' });

        // only allow transition from specific states
        if (gr.status === status) return res.json({ goodsReceipt: gr.toObject() });

        if (status === 'approved') {
            // Cập nhật tồn kho và giá vốn bình quân gia quyền (Weighted Average Cost)
            // Công thức: giá_vốn_mới = (tồn_hiện_tại * giá_vốn_cũ + số_lượng_nhập * đơn_giá_nhập) / (tồn_hiện_tại + số_lượng_nhập)
            for (const it of gr.items) {
                const product = await Product.findById(it.product_id);
                if (!product) {
                    return res.status(404).json({ message: `Product not found: ${String(it.product_id)}` });
                }
                const addQty = Number(it.quantity) * (Number(it.ratio) || 1);
                const unitCost = Number(it.unit_cost) || 0;
                const currentQty = Number(product.stock_qty) || 0;
                const currentCost = Number(product.cost_price) || 0;

                const newQty = currentQty + addQty;
                // Weighted Average: tính giá vốn bình quân gia quyền vẫn giữ để hiển thị trên Product
                const newCostPrice = newQty > 0
                    ? (currentQty * currentCost + addQty * unitCost) / newQty
                    : unitCost;

                // Cập nhật lô hàng tập trung (FIFO)
                await adjustStockFIFO(it.product_id, gr.storeId || req.user.storeId, addQty, {
                  unitCost,
                  receivedAt: gr.received_at,
                  receiptId: gr._id,
                  note: `Nhập hàng (Phiếu #${id.substring(id.length - 6).toUpperCase()})`
                });

                // Cập nhật giá vốn bình quân cho Product model
                product.cost_price = Math.round(newCostPrice * 100) / 100;
                product.updated_at = new Date();
                await product.save();
            }
            gr.approved_by = req.user.id;
            gr.status = 'approved';
            gr.updated_at = new Date();
            await gr.save();
        } else {
            // pending or rejected
            gr.status = status;
            if (status === 'pending') {
                gr.updated_at = new Date();
            } else if (status === 'rejected') {
                gr.approved_by = req.user.id;
                gr.updated_at = new Date();
            }
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
        console.error('Update GR status error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
