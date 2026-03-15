const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Token required' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

const requireAdmin = (req, res, next) => {
    // Check if user is authenticated and is an admin
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    next();
};

// new middleware for categories only: manager or warehouse_staff
const requireManagerOrWarehouse = (req, res, next) => {
    if (!req.user || !['manager', 'warehouse_staff'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied. Manager or Warehouse Staff only.' });
    }
    next();
};

const requireManagerOrAdminOrWarehouse = (req, res, next) => {
    if (!req.user || !['admin', 'manager', 'warehouse_staff'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied. Manager, Admin, or Warehouse Staff only.' });
    }
    next();
};

module.exports = { verifyToken, requireAdmin, requireManagerOrWarehouse, requireManagerOrAdminOrWarehouse };
