const express = require('express');
const mongoose = require('mongoose');
const PosRegister = require('../models/PosRegister');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ensureRegistersAndMigrateLegacyOpenShift } = require('../utils/posRegisterBootstrap');

const router = express.Router();

function assertStoreScope(req, res) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return true;
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) {
        res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        return false;
    }
    return true;
}

// GET /api/pos-registers — danh sách quầy (đồng thời seed mặc định + migrate ca cũ)
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = req.user.storeId;
        const { registers } = await ensureRegistersAndMigrateLegacyOpenShift(storeId);
        return res.json({ registers });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/pos-registers — thêm quầy (quản lý)
router.post('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ message: 'Tên quầy là bắt buộc.' });
        }
        const sort_order = Number(req.body?.sort_order);
        const reg = await PosRegister.create({
            store_id: req.user.storeId,
            name,
            sort_order: Number.isFinite(sort_order) ? sort_order : 99,
            is_active: true,
        });
        return res.status(201).json({ register: reg });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
