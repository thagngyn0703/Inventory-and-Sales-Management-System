const express = require('express');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const ProductRequest = require('../models/ProductRequest');
const Stocktake = require('../models/Stocktake');
const SalesInvoice = require('../models/SalesInvoice');
const SalesReturn = require('../models/SalesReturn');
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

const VALID_RETURN_REASON_CODES = new Set([
  'customer_changed_mind',
  'defective',
  'expired',
  'wrong_item',
  'other',
]);

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeItemsGross(items = []) {
  return (items || []).reduce(
    (sum, it) => sum + toNum(it?.quantity) * toNum(it?.unit_price),
    0
  );
}

function computeExpectedTaxByInvoice(gross, invoice) {
  const invoiceTotal = toNum(invoice?.total_amount);
  const invoiceSubtotal = toNum(invoice?.subtotal_amount);
  if (invoiceTotal <= 0) return { subtotal: gross, tax: 0 };
  const ratio = invoiceSubtotal / invoiceTotal;
  const subtotal = Math.max(0, Math.min(gross, Math.round(gross * ratio)));
  return { subtotal, tax: gross - subtotal };
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

/**
 * GET /api/admin/dashboard/returns-backfill-preview?limit=20
 * Preview (read-only) dữ liệu returns/invoices sẽ bị ảnh hưởng khi chạy backfill script.
 */
router.get('/returns-backfill-preview', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const sampleLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const returns = await SalesReturn.find({})
      .select('invoice_id items total_amount subtotal_amount tax_amount tax_rate_snapshot reason_code status return_at')
      .sort({ return_at: -1, created_at: -1 })
      .lean();

    const invoiceIds = [
      ...new Set(returns.map((r) => (r.invoice_id ? String(r.invoice_id) : '')).filter(Boolean)),
    ];
    const invoices = await SalesInvoice.find({ _id: { $in: invoiceIds } })
      .select('_id total_amount subtotal_amount tax_amount tax_rate_snapshot returned_total_amount returned_subtotal_amount returned_tax_amount status')
      .lean();
    const invoiceMap = new Map(invoices.map((inv) => [String(inv._id), inv]));

    const sampleReturns = [];
    const impactedReturnIds = new Set();
    const impactedInvoiceIds = new Set();
    let missingTotalAmountCount = 0;
    let invalidReasonCodeCount = 0;
    let missingItemUnitPriceCount = 0;
    let taxMismatchCount = 0;

    for (const ret of returns) {
      const invoice = invoiceMap.get(String(ret.invoice_id || ''));
      const itemsGross = computeItemsGross(ret.items || []);
      const currentGross = toNum(ret.total_amount);
      const expectedGross = currentGross > 0 ? currentGross : itemsGross;
      const expectedTax = computeExpectedTaxByInvoice(expectedGross, invoice);
      const nextReasonCode = VALID_RETURN_REASON_CODES.has(ret.reason_code) ? ret.reason_code : 'other';

      const hasMissingTotal = currentGross <= 0 && itemsGross > 0;
      const hasInvalidReason = nextReasonCode !== ret.reason_code;
      const hasMissingUnitPrice = (ret.items || []).some((it) => toNum(it?.quantity) > 0 && toNum(it?.unit_price) <= 0);
      const hasTaxMismatch =
        toNum(ret.subtotal_amount) !== expectedTax.subtotal ||
        toNum(ret.tax_amount) !== expectedTax.tax;

      if (hasMissingTotal) missingTotalAmountCount += 1;
      if (hasInvalidReason) invalidReasonCodeCount += 1;
      if (hasMissingUnitPrice) missingItemUnitPriceCount += 1;
      if (hasTaxMismatch) taxMismatchCount += 1;

      const impacted = hasMissingTotal || hasInvalidReason || hasMissingUnitPrice || hasTaxMismatch;
      if (!impacted) continue;
      impactedReturnIds.add(String(ret._id));
      impactedInvoiceIds.add(String(ret.invoice_id || ''));

      if (sampleReturns.length < sampleLimit) {
        sampleReturns.push({
          return_id: String(ret._id),
          invoice_id: ret.invoice_id ? String(ret.invoice_id) : null,
          status: ret.status,
          issues: {
            missing_total_amount: hasMissingTotal,
            invalid_reason_code: hasInvalidReason,
            missing_item_unit_price: hasMissingUnitPrice,
            tax_mismatch: hasTaxMismatch,
          },
          current: {
            total_amount: toNum(ret.total_amount),
            subtotal_amount: toNum(ret.subtotal_amount),
            tax_amount: toNum(ret.tax_amount),
            tax_rate_snapshot: toNum(ret.tax_rate_snapshot),
            reason_code: ret.reason_code || null,
          },
          expected: {
            total_amount: expectedGross,
            subtotal_amount: expectedTax.subtotal,
            tax_amount: expectedTax.tax,
            tax_rate_snapshot: toNum(invoice?.tax_rate_snapshot) || toNum(ret.tax_rate_snapshot),
            reason_code: nextReasonCode,
          },
        });
      }
    }

    return res.json({
      summary: {
        total_returns: returns.length,
        impacted_returns: impactedReturnIds.size,
        impacted_invoices: impactedInvoiceIds.size,
        issues: {
          missing_total_amount: missingTotalAmountCount,
          invalid_reason_code: invalidReasonCodeCount,
          missing_item_unit_price: missingItemUnitPriceCount,
          tax_mismatch: taxMismatchCount,
        },
      },
      sample_limit: sampleLimit,
      sample_returns: sampleReturns,
      note: 'Preview only. Dùng script migrate:returns-backfill để ghi dữ liệu.',
    });
  } catch (err) {
    console.error('returns-backfill-preview error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
