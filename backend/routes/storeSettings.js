const express = require('express');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const LoyaltyConfigHistory = require('../models/LoyaltyConfigHistory');
const { normalizeLoyaltySettings } = require('../utils/loyalty');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_BUSINESS_TYPES = ['ho_kinh_doanh', 'doanh_nghiep'];

/**
 * GET /api/store-settings/tax
 * Nhân viên / Manager / Admin lấy cấu hình thuế + loại hình kinh doanh của cửa hàng mình.
 */
router.get('/tax', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const store = await Store.findById(storeId)
            .select('name tax_rate price_includes_tax business_type')
            .lean();
        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });

        const businessType = store.business_type || 'ho_kinh_doanh';
        return res.json({
            store_id: storeId,
            store_name: store.name,
            business_type: businessType,
            // HKĐ không thu VAT trên hóa đơn → luôn trả về 0
            tax_rate: businessType === 'ho_kinh_doanh' ? 0 : (Number(store.tax_rate) || 0),
            price_includes_tax: store.price_includes_tax !== false,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * PATCH /api/store-settings/tax
 * Manager cập nhật cấu hình thuế + loại hình kinh doanh cho cửa hàng mình.
 * Body: { business_type?, tax_rate?, price_includes_tax? }
 *
 * Quy tắc:
 *   - Nếu business_type = 'ho_kinh_doanh' → tax_rate bị ép về 0 (thuế khoán, không thu VAT)
 *   - Nếu business_type = 'doanh_nghiep'  → tax_rate từ 0-100, kê khai VAT bình thường
 */
router.patch('/tax', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }

        const { business_type, tax_rate, price_includes_tax } = req.body || {};

        if (business_type === undefined && tax_rate === undefined && price_includes_tax === undefined) {
            return res.status(400).json({ message: 'Vui lòng cung cấp ít nhất một trường cần cập nhật.' });
        }

        const updates = {};

        // Xác định loại hình — lấy từ body hoặc từ DB hiện tại
        let effectiveType = business_type;
        if (business_type !== undefined) {
            if (!ALLOWED_BUSINESS_TYPES.includes(business_type)) {
                return res.status(400).json({
                    message: `business_type không hợp lệ. Chấp nhận: ${ALLOWED_BUSINESS_TYPES.join(', ')}.`,
                });
            }
            updates.business_type = business_type;
        } else {
            const current = await Store.findById(storeId).select('business_type').lean();
            effectiveType = current?.business_type || 'ho_kinh_doanh';
        }

        // Xử lý tax_rate theo loại hình
        if (effectiveType === 'ho_kinh_doanh') {
            // Hộ kinh doanh: thuế khoán cố định → KHÔNG áp VAT trên hóa đơn
            if (tax_rate !== undefined && Number(tax_rate) !== 0) {
                return res.status(400).json({
                    message: 'Hộ kinh doanh không áp dụng VAT trên hóa đơn. Vui lòng để tax_rate = 0.',
                });
            }
            if (price_includes_tax !== undefined) {
                return res.status(400).json({
                    message: 'Hộ kinh doanh không cần cấu hình "giá đã gồm VAT". Hãy chuyển sang Doanh nghiệp để dùng tùy chọn này.',
                });
            }
            updates.tax_rate = 0;
        } else if (tax_rate !== undefined) {
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
        ).select('name tax_rate price_includes_tax business_type').lean();

        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });

        const savedType = store.business_type || 'ho_kinh_doanh';
        return res.json({
            message: 'Đã cập nhật cấu hình thành công.',
            store_id: storeId,
            store_name: store.name,
            business_type: savedType,
            tax_rate: savedType === 'ho_kinh_doanh' ? 0 : (Number(store.tax_rate) || 0),
            price_includes_tax: store.price_includes_tax !== false,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * GET /api/store-settings/bank
 * Lấy thông tin ngân hàng của cửa hàng (dùng để sinh QR thu nợ/thanh toán).
 */
router.get('/bank', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const store = await Store.findById(storeId)
            .select('name bank_id bank_account bank_account_name')
            .lean();
        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });

        return res.json({
            store_name: store.name,
            bank_id: store.bank_id || '',
            bank_account: store.bank_account || '',
            bank_account_name: store.bank_account_name || '',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * PATCH /api/store-settings/bank
 * Manager cập nhật thông tin ngân hàng cho cửa hàng.
 * Body: { bank_id?, bank_account?, bank_account_name? }
 */
router.patch('/bank', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }

        const { bank_id, bank_account, bank_account_name } = req.body || {};
        if (bank_id === undefined && bank_account === undefined && bank_account_name === undefined) {
            return res.status(400).json({ message: 'Vui lòng cung cấp ít nhất một trường cần cập nhật.' });
        }

        const updates = {};
        if (bank_id !== undefined) updates.bank_id = String(bank_id || '').trim();
        if (bank_account !== undefined) updates.bank_account = String(bank_account || '').trim();
        if (bank_account_name !== undefined) updates.bank_account_name = String(bank_account_name || '').trim();

        const store = await Store.findByIdAndUpdate(
            storeId,
            { $set: updates },
            { new: true }
        ).select('name bank_id bank_account bank_account_name').lean();

        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });

        return res.json({
            message: 'Đã cập nhật thông tin ngân hàng.',
            store_name: store.name,
            bank_id: store.bank_id || '',
            bank_account: store.bank_account || '',
            bank_account_name: store.bank_account_name || '',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * GET /api/store-settings/loyalty
 * Lấy cấu hình loyalty của cửa hàng.
 */
router.get('/loyalty', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const store = await Store.findById(storeId).select('name loyalty_settings loyalty_policy_version').lean();
        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });
        return res.json({
            store_name: store.name,
            loyalty_policy_version: Number(store.loyalty_policy_version) || 1,
            loyalty_settings: normalizeLoyaltySettings(store.loyalty_settings || {}),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * PATCH /api/store-settings/loyalty
 * Manager/Admin cập nhật cấu hình loyalty có guardrails + ghi lịch sử thay đổi.
 */
router.patch('/loyalty', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const current = await Store.findById(storeId).select('loyalty_settings loyalty_policy_version').lean();
        if (!current) return res.status(404).json({ message: 'Không tìm thấy cửa hàng.' });
        const beforeCfg = normalizeLoyaltySettings(current.loyalty_settings || {});
        const merged = normalizeLoyaltySettings({ ...beforeCfg, ...(req.body?.loyalty_settings || {}) });
        const nextVersion = (Number(current.loyalty_policy_version) || 1) + 1;

        await Store.updateOne(
            { _id: storeId },
            {
                $set: { loyalty_settings: merged, loyalty_policy_version: nextVersion },
            }
        );

        await LoyaltyConfigHistory.create({
            store_id: storeId,
            changed_by: req.user.id,
            before_config: beforeCfg,
            after_config: merged,
            before_version: Number(current.loyalty_policy_version) || 1,
            after_version: nextVersion,
            change_reason: String(req.body?.change_reason || '').trim(),
            source: 'manager_ui',
        });

        return res.json({
            message: 'Đã cập nhật cấu hình tích điểm.',
            loyalty_policy_version: nextVersion,
            loyalty_settings: merged,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

/**
 * GET /api/store-settings/loyalty/history?limit=20
 * Lấy lịch sử thay đổi cấu hình loyalty.
 */
router.get('/loyalty/history', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeId = req.user?.storeId;
        if (!storeId || !mongoose.isValidObjectId(storeId)) {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const history = await LoyaltyConfigHistory.find({ store_id: storeId })
            .sort({ changed_at: -1 })
            .limit(limit)
            .populate('changed_by', 'fullName email')
            .lean();
        return res.json({ history });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
