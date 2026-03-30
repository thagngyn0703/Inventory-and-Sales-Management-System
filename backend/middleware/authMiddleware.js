const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Token required' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).lean();
        if (!user) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        req.user = {
            id: String(user._id),
            email: user.email,
            role: user.role,
            storeId: user.storeId ? String(user.storeId) : null,
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    next();
};

const requireManagerOrWarehouse = (req, res, next) => {
    if (!req.user || !['admin', 'manager', 'staff', 'warehouse_staff'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied. Admin, Manager, or Staff only.' });
    }
    if (req.user.role === 'manager' && !req.user.storeId) {
        return res.status(403).json({
            message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi tiếp tục.',
            code: 'STORE_REQUIRED',
        });
    }
    next();
};

const requireManagerOrAdminOrWarehouse = (req, res, next) => {
    if (!req.user || !['admin', 'manager', 'staff', 'warehouse_staff'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied. Admin, Manager, or Staff only.' });
    }
    if (req.user.role === 'manager' && !req.user.storeId) {
        return res.status(403).json({
            message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi tiếp tục.',
            code: 'STORE_REQUIRED',
        });
    }
    next();
};

module.exports = { verifyToken, requireAdmin, requireManagerOrWarehouse, requireManagerOrAdminOrWarehouse };
