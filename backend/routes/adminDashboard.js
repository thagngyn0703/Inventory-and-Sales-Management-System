const express = require('express');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const ProductRequest = require('../models/ProductRequest');
const Stocktake = require('../models/Stocktake');
const SalesInvoice = require('../models/SalesInvoice');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const MAX_MONTHLY_RANGE = 24;
const DEFAULT_MONTHLY_RANGE = 12;
const VN_TZ = 'Asia/Ho_Chi_Minh';

/** N tháng gần nhất theo lịch Việt Nam (YYYY-MM), cũ → mới. */
function lastNMonthKeysVn(n) {
  const keys = [];
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  let y = +parts.find((x) => x.type === 'year').value;
  let m = +parts.find((x) => x.type === 'month').value;
  for (let i = 0; i < n; i += 1) {
    let cm = m - i;
    let cy = y;
    while (cm < 1) {
      cm += 12;
      cy -= 1;
    }
    keys.push(`${cy}-${String(cm).padStart(2, '0')}`);
  }
  return keys.reverse();
}

function monthLabelVi(key) {
  const [ys, ms] = key.split('-');
  return `Tháng ${parseInt(ms, 10)}/${ys}`;
}

async function getMonthlyStoreStats(monthCount) {
  const keys = lastNMonthKeysVn(monthCount);
  const firstKey = keys[0];
  const startBound = new Date(Date.parse(`${firstKey}-01T00:00:00+07:00`) - 24 * 60 * 60 * 1000);

  const [productAgg, orderAgg] = await Promise.all([
    Product.aggregate([
      {
        $match: {
          storeId: { $exists: true, $ne: null },
          created_at: { $gte: startBound },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$created_at', timezone: VN_TZ } },
          count: { $sum: 1 },
        },
      },
    ]),
    SalesInvoice.aggregate([
      {
        $match: {
          store_id: { $exists: true, $ne: null },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $addFields: {
          orderDate: { $ifNull: ['$invoice_at', '$created_at'] },
        },
      },
      {
        $match: {
          orderDate: { $gte: startBound },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$orderDate', timezone: VN_TZ } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const productMap = Object.fromEntries((productAgg || []).map((x) => [x._id, x.count]));
  const orderMap = Object.fromEntries((orderAgg || []).map((x) => [x._id, x.count]));

  const rows = keys.map((key) => ({
    key,
    label: monthLabelVi(key),
    productsCreated: productMap[key] || 0,
    orders: orderMap[key] || 0,
  }));

  return { months: monthCount, rows };
}

// GET /api/admin/dashboard — tổng quan cho trang dashboard admin
router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    let monthCount = parseInt(req.query.months, 10);
    if (Number.isNaN(monthCount) || monthCount < 1) monthCount = DEFAULT_MONTHLY_RANGE;
    monthCount = Math.min(MAX_MONTHLY_RANGE, monthCount);

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

    const [recentStores, monthlyStoreStats] = await Promise.all([
      Store.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name status createdAt')
        .lean(),
      getMonthlyStoreStats(monthCount),
    ]);

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
      monthlyStoreStats,
    });
  } catch (err) {
    console.error('admin dashboard error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
