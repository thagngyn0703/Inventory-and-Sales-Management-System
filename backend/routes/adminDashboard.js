const express = require('express');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const ProductRequest = require('../models/ProductRequest');
const Stocktake = require('../models/Stocktake');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/dashboard — tổng quan cho trang dashboard admin
router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const [
      totalUsers,
      managers,
      staff,
      admins,
      activeUsers,
      inactiveUsers,
      staffWithoutStore,
      managersWithoutStore,
      totalStores,
      activeStores,
      inactiveStores,
      totalProducts,
      pendingProductRequests,
      submittedStocktakes,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'manager' }),
      User.countDocuments({ role: 'staff' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ status: { $ne: 'inactive' } }),
      User.countDocuments({ status: 'inactive' }),
      User.countDocuments({ role: 'staff', $or: [{ storeId: null }, { storeId: { $exists: false } }] }),
      User.countDocuments({ role: 'manager', $or: [{ storeId: null }, { storeId: { $exists: false } }] }),
      Store.countDocuments({}),
      Store.countDocuments({ status: 'active' }),
      Store.countDocuments({ status: 'inactive' }),
      Product.countDocuments({}),
      ProductRequest.countDocuments({ status: 'pending' }),
      Stocktake.countDocuments({ status: 'submitted' }),
    ]);

    const recentStores = await Store.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name status createdAt')
      .lean();

    const alertItems = [
      { key: 'inactiveStores', label: 'Cửa hàng ngừng hoạt động', count: inactiveStores },
      { key: 'inactiveUsers', label: 'Tài khoản vô hiệu hóa', count: inactiveUsers },
      { key: 'staffWithoutStore', label: 'Nhân viên chưa gán cửa hàng', count: staffWithoutStore },
      { key: 'managersWithoutStore', label: 'Quản lý chưa đăng ký cửa hàng', count: managersWithoutStore },
      { key: 'pendingProductRequests', label: 'Yêu cầu sản phẩm chờ duyệt', count: pendingProductRequests },
      { key: 'submittedStocktakes', label: 'Phiếu kiểm kê chờ duyệt', count: submittedStocktakes },
    ];
    const alertsTotal = alertItems.reduce((s, x) => s + x.count, 0);

    return res.json({
      users: {
        total: totalUsers,
        managers,
        staff,
        admins,
        active: activeUsers,
        inactive: inactiveUsers,
        staffWithoutStore,
        managersWithoutStore,
      },
      stores: {
        total: totalStores,
        active: activeStores,
        inactive: inactiveStores,
      },
      products: { total: totalProducts },
      operations: {
        pendingProductRequests,
        submittedStocktakes,
      },
      alerts: {
        total: alertsTotal,
        items: alertItems,
      },
      recentStores,
    });
  } catch (err) {
    console.error('admin dashboard error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
