const express = require('express');
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/goods-receipts?page=&limit=&status=&supplier_id=
router.get('/', requireAuth, requireRole(['manager', 'admin', 'warehouse']), async (req, res) => {
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
router.get('/:id', requireAuth, requireRole(['manager', 'admin', 'warehouse']), async (req, res) => {
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

module.exports = router;
