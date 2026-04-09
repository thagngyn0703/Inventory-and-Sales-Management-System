const express = require('express');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/purchase-orders?page=&limit=&status=&supplier_id=
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { page = '1', limit = '20', status, supplier_id } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const filter = {};
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin') {
            if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) {
                return res.status(403).json({ message: 'Forbidden: user chưa được gán cửa hàng' });
            }
            const creatorIds = await User.find({ storeId: req.user.storeId }).distinct('_id');
            if (!creatorIds.length) {
                return res.json({ purchaseOrders: [], total: 0, page: pageNum, limit: limitNum, totalPages: 1 });
            }
            filter.created_by = { $in: creatorIds };
        }
        if (status && ['draft', 'pending', 'approved', 'received', 'cancelled'].includes(status)) {
            filter.status = status;
        }
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = new mongoose.Types.ObjectId(supplier_id);
        }

        const total = await PurchaseOrder.countDocuments(filter);
        const skip = (pageNum - 1) * limitNum;
        const list = await PurchaseOrder.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('supplier_id', 'name phone email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({
            purchaseOrders: list,
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

// GET /api/purchase-orders/:id
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid purchase order id' });
        }
        const po = await PurchaseOrder.findById(id)
            .populate('supplier_id', 'name phone email address')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();
        if (!po) return res.status(404).json({ message: 'Purchase order not found' });
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin') {
            if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) {
                return res.status(403).json({ message: 'Forbidden: user chưa được gán cửa hàng' });
            }
            const creator = await User.findById(po.created_by?._id || po.created_by).select('storeId').lean();
            if (!creator || String(creator.storeId) !== String(req.user.storeId)) {
                return res.status(403).json({ message: 'Forbidden: đơn không thuộc cửa hàng của bạn' });
            }
        }
        return res.json({ purchaseOrder: po });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
