const express = require('express');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/store-settings/tax
 * Manager lấy cấu hình thuế của cửa hàng mình.
 */
router.get('/tax', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const store = await Store.findById(storeId).select('name tax_rate price_includes_tax').lean();
        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });

        return res.json({
            store_id: storeId,
            store_name: store.name,
            tax_rate: Number(store.tax_rate) || 0,
            price_includes_tax: store.price_includes_tax !== false,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * PATCH /api/store-settings/tax
 * Manager cập nhật cấu hình thuế cho cửa hàng mình.
 * Body: { tax_rate: number (0–100), price_includes_tax: boolean }
 */
router.patch('/tax', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }

        const { tax_rate, price_includes_tax } = req.body || {};

        if (tax_rate === undefined && price_includes_tax === undefined) {
            return res.status(400).json({ message: 'Vui lòng cung cấp tax_rate hoặc price_includes_tax.' });
        }

        const updates = {};
        if (tax_rate !== undefined) {
            const rate = Number(tax_rate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
                return res.status(400).json({ message: 'tax_rate phải là số từ 0 đến 100.' });
            }
            updates.tax_rate = rate;
        }
        if (price_includes_tax !== undefined) {
            updates.price_includes_tax = Boolean(price_includes_tax);
        }

        const store = await Store.findByIdAndUpdate(
            storeId,
            { $set: updates },
            { new: true }
        ).select('name tax_rate price_includes_tax').lean();

        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });

        return res.json({
            message: 'Đã cập nhật cấu hình thuế.',
            store_id: storeId,
            store_name: store.name,
            tax_rate: Number(store.tax_rate) || 0,
            price_includes_tax: store.price_includes_tax !== false,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
