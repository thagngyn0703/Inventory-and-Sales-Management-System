const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Store = require('../models/Store');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/users?q=&page=1&limit=20&status=&all=true
router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { q = '', page = '1', limit = '20', status = '', all = 'false' } = req.query;
        const shouldGetAll = String(all).toLowerCase() === 'true';
        const query = String(q || '').trim();
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const filter = {};
        if (query) {
            const re = new RegExp(escapeRegex(query), 'i');
            filter.$or = [{ fullName: re }, { email: re }];
        }
        if (status === 'active') {
            filter.status = { $ne: 'inactive' };
        } else if (status === 'inactive') {
            filter.status = 'inactive';
        }

        const total = await User.countDocuments(filter);
        let userQuery = User.find(filter).select('-password').sort({ createdAt: -1 }).populate('storeId', 'name status');
        if (!shouldGetAll) {
            const skip = (pageNum - 1) * limitNum;
            userQuery = userQuery.skip(skip).limit(limitNum);
        }
        const users = await userQuery.lean();

        // Counts for summary cards
        const totalAll = await User.countDocuments({});
        const totalActive = await User.countDocuments({ status: { $ne: 'inactive' } });
        const totalInactive = await User.countDocuments({ status: 'inactive' });
        const totalAdmin = await User.countDocuments({ role: 'admin' });

        return res.json({
            users,
            total,
            page: shouldGetAll ? 1 : pageNum,
            limit: shouldGetAll ? total || 0 : limitNum,
            totalPages: shouldGetAll ? 1 : Math.ceil(total / limitNum) || 1,
            summary: {
                totalAll,
                totalActive,
                totalInactive,
                totalAdmin,
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid user id' });
        }

        // Admin cannot deactivate themselves
        if (String(id) === String(req.user.id)) {
            return res.status(400).json({ message: 'Không thể thay đổi trạng thái tài khoản của chính mình' });
        }

        const { status } = req.body || {};
        const newStatus = status === 'inactive' ? 'inactive' : 'active';

        const user = await User.findByIdAndUpdate(
            id,
            { status: newStatus },
            { new: true }
        ).select('-password').lean();

        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.json({ user });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /api/users/:id/store — gán nhân viên (staff) chưa có cửa hàng vào một cửa hàng
router.patch('/:id/store', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { storeId } = req.body || {};
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
        }
        if (!mongoose.isValidObjectId(storeId)) {
            return res.status(400).json({ message: 'ID cửa hàng không hợp lệ' });
        }

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

        if (user.storeId) {
            return res.status(400).json({ message: 'Tài khoản đã thuộc một cửa hàng' });
        }
        if (user.role === 'admin') {
            return res.status(400).json({ message: 'Không gán cửa hàng cho tài khoản quản trị' });
        }
        if (user.role === 'manager') {
            return res.status(400).json({
                message: 'Quản lý cần đăng ký cửa hàng qua luồng đăng ký của Manager, không gán thủ công',
            });
        }
        if (user.role !== 'staff') {
            return res.status(400).json({ message: 'Chỉ có thể gán cửa hàng cho tài khoản nhân viên (staff)' });
        }

        const store = await Store.findById(storeId);
        if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });

        user.storeId = store._id;
        await user.save();

        const updated = await User.findById(id).select('-password').populate('storeId', 'name status').lean();
        return res.json({ user: updated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
