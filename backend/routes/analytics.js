const express = require('express');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/analytics/incoming-frequency?year=2025&month=3
 * Trả về tần suất nhập hàng (đơn mua + phiếu nhập) theo từng nhà cung cấp trong 1 tháng.
 */
router.get(
    '/incoming-frequency',
    requireAuth,
    requireRole(['manager', 'admin']),
    async (req, res) => {
        try {
            const year = parseInt(req.query.year, 10);
            const month = parseInt(req.query.month, 10);
            const now = new Date();
            const y = Number.isFinite(year) ? year : now.getFullYear();
            const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
            const startOfMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);
            const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);

            const [poAgg, grAgg] = await Promise.all([
                PurchaseOrder.aggregate([
                    {
                        $match: {
                            created_at: { $gte: startOfMonth, $lte: endOfMonth },
                        },
                    },
                    { $group: { _id: '$supplier_id', count: { $sum: 1 } } },
                ]),
                GoodsReceipt.aggregate([
                    {
                        $match: {
                            received_at: { $gte: startOfMonth, $lte: endOfMonth },
                        },
                    },
                    { $group: { _id: '$supplier_id', count: { $sum: 1 } } },
                ]),
            ]);

            const supplierIds = new Set();
            poAgg.forEach((r) => r._id && supplierIds.add(r._id.toString()));
            grAgg.forEach((r) => r._id && supplierIds.add(r._id.toString()));

            const poBySupplier = new Map(poAgg.map((r) => [r._id.toString(), r.count]));
            const grBySupplier = new Map(grAgg.map((r) => [r._id.toString(), r.count]));

            const suppliers = await Supplier.find({ _id: { $in: Array.from(supplierIds) } })
                .select('name')
                .lean();

            const result = suppliers.map((s) => {
                const id = s._id.toString();
                const poCount = poBySupplier.get(id) || 0;
                const grCount = grBySupplier.get(id) || 0;
                return {
                    supplier_id: s._id,
                    supplier_name: s.name,
                    purchase_order_count: poCount,
                    goods_receipt_count: grCount,
                    total_count: poCount + grCount,
                };
            });

            result.sort((a, b) => b.total_count - a.total_count);

            return res.json({
                year: y,
                month: m,
                startOfMonth: startOfMonth.toISOString(),
                endOfMonth: endOfMonth.toISOString(),
                data: result,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: err.message || 'Server error' });
        }
    }
);

module.exports = router;
