const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/users?q=&page=1&limit=20&status=  (admin only)
router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { q = '', page = '1', limit = '20', status = '' } = req.query;
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
        const skip = (pageNum - 1) * limitNum;
        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Counts for summary cards
        const totalAll = await User.countDocuments({});
        const totalActive = await User.countDocuments({ status: { $ne: 'inactive' } });
        const totalInactive = await User.countDocuments({ status: 'inactive' });
        const totalAdmin = await User.countDocuments({ role: 'admin' });

        return res.json({
            users,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
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

// PATCH /api/users/:id/status  (admin only)
router.patch('/:id/status', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid user id' });
        }

        // Admin cannot deactivate themselves
        if (id === req.user.id) {
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

module.exports = router;
