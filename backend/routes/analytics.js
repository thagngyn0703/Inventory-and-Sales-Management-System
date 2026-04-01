const express = require('express');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const SalesInvoice = require('../models/SalesInvoice');
const SalesReturn = require('../models/SalesReturn');
const Product = require('../models/Product');
const ProductPriceHistory = require('../models/ProductPriceHistory');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/** Lấy storeId filter cho manager/staff, admin không filter */
function getStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const storeId = req.user?.storeId;
  if (!storeId) return null; // chưa có store
  return { $or: [{ store_id: new mongoose.Types.ObjectId(storeId) }, { storeId: new mongoose.Types.ObjectId(storeId) }] };
}

/** Parse date range từ query: from, to (ISO string hoặc YYYY-MM-DD) */
function parseDateRange(query) {
  const now = new Date();
  let from, to;

  if (query.from) {
    from = new Date(query.from);
    from.setHours(0, 0, 0, 0);
  } else {
    // Mặc định: đầu tháng hiện tại
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  if (query.to) {
    to = new Date(query.to);
    to.setHours(23, 59, 59, 999);
  } else {
    // Mặc định: hôm nay cuối ngày
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  }

  return { from, to };
}

function getManagerStoreId(req) {
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId || !mongoose.isValidObjectId(storeId)) return null;
  return new mongoose.Types.ObjectId(storeId);
}

/**
 * GET /api/analytics/incoming-frequency?year=2025&month=3
 * Trả về tần suất nhập hàng (đơn mua + phiếu nhập) theo từng nhà cung cấp trong 1 tháng.
 */
router.get(
    '/incoming-frequency',
    requireAuth,
    requireRole(['manager', 'admin']),
    async (req, res) => {
        try {
            const year = parseInt(req.query.year, 10);
            const month = parseInt(req.query.month, 10);
            const now = new Date();
            const y = Number.isFinite(year) ? year : now.getFullYear();
            const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
            const startOfMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);
            const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);

            const [poAgg, grAgg] = await Promise.all([
                PurchaseOrder.aggregate([
                    {
                        $match: {
                            created_at: { $gte: startOfMonth, $lte: endOfMonth },
                        },
                    },
                    { $group: { _id: '$supplier_id', count: { $sum: 1 } } },
                ]),
                GoodsReceipt.aggregate([
                    {
                        $match: {
                            received_at: { $gte: startOfMonth, $lte: endOfMonth },
                        },
                    },
                    { $group: { _id: '$supplier_id', count: { $sum: 1 } } },
                ]),
            ]);

            const supplierIds = new Set();
            poAgg.forEach((r) => r._id && supplierIds.add(r._id.toString()));
            grAgg.forEach((r) => r._id && supplierIds.add(r._id.toString()));

            const poBySupplier = new Map(poAgg.map((r) => [r._id.toString(), r.count]));
            const grBySupplier = new Map(grAgg.map((r) => [r._id.toString(), r.count]));

            const suppliers = await Supplier.find({ _id: { $in: Array.from(supplierIds) } })
                .select('name')
                .lean();

            const result = suppliers.map((s) => {
                const id = s._id.toString();
                const poCount = poBySupplier.get(id) || 0;
                const grCount = grBySupplier.get(id) || 0;
                return {
                    supplier_id: s._id,
                    supplier_name: s.name,
                    purchase_order_count: poCount,
                    goods_receipt_count: grCount,
                    total_count: poCount + grCount,
                };
            });

            result.sort((a, b) => b.total_count - a.total_count);

            return res.json({
                year: y,
                month: m,
                startOfMonth: startOfMonth.toISOString(),
                endOfMonth: endOfMonth.toISOString(),
                data: result,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: err.message || 'Server error' });
        }
    }
);

/**
 * GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Tổng quan kinh doanh: doanh thu, số đơn, trả hàng, lợi nhuận ước, chi phí nhập
 */
router.get(
  '/summary',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const storeFilter = getStoreFilter(req);
      if (storeFilter === null) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const invoiceMatch = {
        ...storeFilter,
        status: 'confirmed',
        invoice_at: { $gte: from, $lte: to },
      };
      // Xoá $or nếu admin (không có store filter)
      if (Object.keys(storeFilter).length === 0) {
        delete invoiceMatch.$or;
        invoiceMatch.status = 'confirmed';
        invoiceMatch.invoice_at = { $gte: from, $lte: to };
      }

      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;

      // Doanh thu + số đơn
      const [invoiceAgg, returnAgg, grAgg, todayAgg, yesterdayAgg] = await Promise.all([
        SalesInvoice.aggregate([
          {
            $match: storeIdObj
              ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: from, $lte: to } }
              : { status: 'confirmed', invoice_at: { $gte: from, $lte: to } },
          },
          {
            $group: {
              _id: null,
              total_revenue: { $sum: '$total_amount' },
              order_count: { $sum: 1 },
              total_paid: { $sum: '$paid_amount' },
            },
          },
        ]),

        // Số đơn trả hàng trong kỳ
        SalesReturn.aggregate([
          {
            $match: storeIdObj
              ? { store_id: storeIdObj, return_at: { $gte: from, $lte: to } }
              : { return_at: { $gte: from, $lte: to } },
          },
          { $group: { _id: null, return_count: { $sum: 1 } } },
        ]),

        // Chi phí nhập hàng trong kỳ (phiếu đã duyệt)
        GoodsReceipt.aggregate([
          {
            $match: storeIdObj
              ? { status: 'approved', received_at: { $gte: from, $lte: to } }
              : { status: 'approved', received_at: { $gte: from, $lte: to } },
          },
          { $group: { _id: null, incoming_cost: { $sum: '$total_amount' } } },
        ]),

        // Doanh thu hôm nay
        SalesInvoice.aggregate([
          {
            $match: (() => {
              const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
              const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
              return storeIdObj
                ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: todayStart, $lte: todayEnd } }
                : { status: 'confirmed', invoice_at: { $gte: todayStart, $lte: todayEnd } };
            })(),
          },
          { $group: { _id: null, revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        ]),

        // Doanh thu hôm qua (để tính % thay đổi)
        SalesInvoice.aggregate([
          {
            $match: (() => {
              const yStart = new Date(); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0);
              const yEnd = new Date(); yEnd.setDate(yEnd.getDate() - 1); yEnd.setHours(23, 59, 59, 999);
              return storeIdObj
                ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: yStart, $lte: yEnd } }
                : { status: 'confirmed', invoice_at: { $gte: yStart, $lte: yEnd } };
            })(),
          },
          { $group: { _id: null, revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        ]),
      ]);

      const revenue = invoiceAgg[0]?.total_revenue ?? 0;
      const orderCount = invoiceAgg[0]?.order_count ?? 0;
      const returnCount = returnAgg[0]?.return_count ?? 0;
      const incomingCost = grAgg[0]?.incoming_cost ?? 0;
      const grossProfitEstimate = revenue - incomingCost;
      const returnRate = orderCount > 0 ? Math.round((returnCount / orderCount) * 10000) / 100 : 0;
      const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

      const todayRevenue = todayAgg[0]?.revenue ?? 0;
      const todayCount = todayAgg[0]?.count ?? 0;
      const yesterdayRevenue = yesterdayAgg[0]?.revenue ?? 0;
      const yesterdayCount = yesterdayAgg[0]?.count ?? 0;

      const revenueChangePct = yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 10000) / 100
        : null;
      const orderChangeDelta = todayCount - yesterdayCount;

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        revenue,
        order_count: orderCount,
        avg_order_value: avgOrderValue,
        return_count: returnCount,
        return_rate: returnRate,
        incoming_cost: incomingCost,
        gross_profit_estimate: grossProfitEstimate,
        today: {
          revenue: todayRevenue,
          order_count: todayCount,
          revenue_change_pct: revenueChangePct,
          order_change_delta: orderChangeDelta,
          yesterday_revenue: yesterdayRevenue,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/analytics/inventory-snapshot
 * Snapshot tồn kho: giá trị, số SKU, sắp hết, hết hàng, sắp hết hạn
 */
router.get(
  '/inventory-snapshot',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
      const role = String(req.user?.role || '').toLowerCase();

      if (role !== 'admin' && !storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const baseMatch = storeIdObj ? { storeId: storeIdObj, status: 'active' } : { status: 'active' };

      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      const [inventoryAgg, lowStockProducts, expiringProducts] = await Promise.all([
        Product.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: null,
              total_sku: { $sum: 1 },
              total_value: { $sum: { $multiply: ['$stock_qty', '$cost_price'] } },
              out_of_stock: { $sum: { $cond: [{ $lte: ['$stock_qty', 0] }, 1, 0] } },
              low_stock: {
                $sum: {
                  $cond: [
                    { $and: [{ $gt: ['$stock_qty', 0] }, { $lte: ['$stock_qty', '$reorder_level'] }] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),

        // Top 5 sản phẩm sắp hết hàng (stock_qty > 0 nhưng <= reorder_level)
        Product.find({
          ...baseMatch,
          stock_qty: { $gt: 0 },
          $expr: { $lte: ['$stock_qty', '$reorder_level'] },
        })
          .select('name sku stock_qty reorder_level')
          .sort({ stock_qty: 1 })
          .limit(5)
          .lean(),

        // Sản phẩm sắp hết hạn trong 30 ngày
        Product.find({
          ...baseMatch,
          expiry_date: { $gte: new Date(), $lte: thirtyDaysLater },
        })
          .select('name sku expiry_date stock_qty')
          .sort({ expiry_date: 1 })
          .limit(10)
          .lean(),
      ]);

      return res.json({
        total_sku: inventoryAgg[0]?.total_sku ?? 0,
        total_value: inventoryAgg[0]?.total_value ?? 0,
        out_of_stock_count: inventoryAgg[0]?.out_of_stock ?? 0,
        low_stock_count: inventoryAgg[0]?.low_stock ?? 0,
        low_stock_products: lowStockProducts,
        expiring_soon: expiringProducts,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/analytics/revenue-chart?period=7d|30d|3m|6m
 * Doanh thu theo ngày (7d/30d) hoặc theo tháng (3m/6m)
 */
router.get(
  '/revenue-chart',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const period = req.query.period || '7d';
      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
      const role = String(req.user?.role || '').toLowerCase();

      if (role !== 'admin' && !storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const now = new Date();
      let groupBy, from, points;

      if (period === '7d' || period === '30d') {
        const days = period === '7d' ? 7 : 30;
        from = new Date(now);
        from.setDate(from.getDate() - (days - 1));
        from.setHours(0, 0, 0, 0);
        groupBy = 'day';
        points = days;
      } else if (period === '3m') {
        from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        groupBy = 'month';
        points = 3;
      } else {
        from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        groupBy = 'month';
        points = 6;
      }

      const matchStage = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: from, $lte: now } }
        : { status: 'confirmed', invoice_at: { $gte: from, $lte: now } };

      const groupStage = groupBy === 'day'
        ? {
            _id: {
              year: { $year: '$invoice_at' },
              month: { $month: '$invoice_at' },
              day: { $dayOfMonth: '$invoice_at' },
            },
            revenue: { $sum: '$total_amount' },
            order_count: { $sum: 1 },
          }
        : {
            _id: {
              year: { $year: '$invoice_at' },
              month: { $month: '$invoice_at' },
            },
            revenue: { $sum: '$total_amount' },
            order_count: { $sum: 1 },
          };

      const agg = await SalesInvoice.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]);

      // Build lookup map
      const dataMap = new Map();
      agg.forEach((r) => {
        const key = groupBy === 'day'
          ? `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`
          : `${r._id.year}-${String(r._id.month).padStart(2, '0')}`;
        dataMap.set(key, { revenue: r.revenue, order_count: r.order_count });
      });

      // Fill tất cả điểm (kể cả ngày/tháng không có đơn = 0)
      const result = [];
      for (let i = 0; i < points; i++) {
        let label, key;
        if (groupBy === 'day') {
          const d = new Date(from);
          d.setDate(d.getDate() + i);
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          label = `${d.getDate()}/${d.getMonth() + 1}`;
        } else {
          const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          label = `T${d.getMonth() + 1}/${d.getFullYear()}`;
        }
        const entry = dataMap.get(key) || { revenue: 0, order_count: 0 };
        result.push({ label, key, revenue: entry.revenue, order_count: entry.order_count });
      }

      return res.json({ period, data: result });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/analytics/top-products?from=&to=&limit=10
 * Sản phẩm bán chạy nhất theo số lượng và doanh thu
 */
router.get(
  '/top-products',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
      const role = String(req.user?.role || '').toLowerCase();

      if (role !== 'admin' && !storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const matchStage = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: from, $lte: to } }
        : { status: 'confirmed', invoice_at: { $gte: from, $lte: to } };

      const agg = await SalesInvoice.aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product_id',
            total_qty: { $sum: '$items.quantity' },
            total_revenue: { $sum: '$items.line_total' },
            order_count: { $sum: 1 },
          },
        },
        { $sort: { total_qty: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmpty: true } },
        {
          $project: {
            product_id: '$_id',
            product_name: { $ifNull: ['$product.name', 'Không rõ'] },
            sku: { $ifNull: ['$product.sku', '—'] },
            total_qty: 1,
            total_revenue: 1,
            order_count: 1,
            current_stock: { $ifNull: ['$product.stock_qty', 0] },
          },
        },
      ]);

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        data: agg,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/analytics/price-change-impact?from=&to=&productId=
 * Báo cáo theo từng đợt thay đổi giá (theo store của manager).
 */
router.get(
  '/price-change-impact',
  requireAuth,
  requireRole(['manager']),
  async (req, res) => {
    try {
      const storeIdObj = getManagerStoreId(req);
      if (!storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const { from, to } = parseDateRange(req.query);
      const productId = req.query.productId;
      const productFilter = {};
      if (productId) {
        if (!mongoose.isValidObjectId(productId)) {
          return res.status(400).json({ message: 'productId không hợp lệ' });
        }
        productFilter._id = new mongoose.Types.ObjectId(productId);
      }

      const products = await Product.find({ storeId: storeIdObj, ...productFilter })
        .select('_id name sku cost_price sale_price')
        .lean();
      const productIdList = products.map((p) => p._id);
      if (productIdList.length === 0) {
        return res.json({
          period: { from: from.toISOString(), to: to.toISOString() },
          products: [],
          events: [],
          summary: { total_events: 0, total_revenue: 0, estimated_profit: 0, total_qty: 0 },
        });
      }

      const histories = await ProductPriceHistory.find({
        storeId: storeIdObj,
        product_id: { $in: productIdList },
        changed_at: { $lte: to },
      })
        .sort({ changed_at: 1 })
        .populate('changed_by', 'fullName email')
        .lean();

      const events = [];
      for (let i = 0; i < histories.length; i++) {
        const h = histories[i];
        const nextForSameProduct = histories.find(
          (x, idx) => idx > i && String(x.product_id) === String(h.product_id)
        );
        const windowStart = h.changed_at > from ? h.changed_at : from;
        const windowEnd = nextForSameProduct?.changed_at && nextForSameProduct.changed_at < to ? nextForSameProduct.changed_at : to;
        if (windowStart >= windowEnd) continue;

        const salesAgg = await SalesInvoice.aggregate([
          {
            $match: {
              store_id: storeIdObj,
              status: 'confirmed',
              invoice_at: { $gte: windowStart, $lt: windowEnd },
            },
          },
          { $unwind: '$items' },
          {
            $match: {
              'items.product_id': new mongoose.Types.ObjectId(h.product_id),
            },
          },
          {
            $group: {
              _id: null,
              qty: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.line_total' },
              orders: { $sum: 1 },
            },
          },
        ]);

        const qty = salesAgg[0]?.qty ?? 0;
        const revenue = salesAgg[0]?.revenue ?? 0;
        const estimatedCost = qty * (Number(h.new_cost_price) || 0);
        const estimatedProfit = revenue - estimatedCost;

        const product = products.find((p) => String(p._id) === String(h.product_id));
        events.push({
          _id: h._id,
          product_id: h.product_id,
          product_name: product?.name || 'Không rõ',
          sku: product?.sku || '—',
          changed_at: h.changed_at,
          source: h.source,
          changed_by: h.changed_by?.fullName || h.changed_by?.email || '—',
          old_cost_price: h.old_cost_price,
          new_cost_price: h.new_cost_price,
          old_sale_price: h.old_sale_price,
          new_sale_price: h.new_sale_price,
          window: {
            from: windowStart,
            to: windowEnd,
          },
          impact: {
            qty_sold: qty,
            revenue,
            estimated_cost: estimatedCost,
            estimated_profit: estimatedProfit,
            order_lines: salesAgg[0]?.orders ?? 0,
          },
        });
      }

      const summary = events.reduce(
        (acc, e) => {
          acc.total_events += 1;
          acc.total_revenue += e.impact.revenue;
          acc.estimated_profit += e.impact.estimated_profit;
          acc.total_qty += e.impact.qty_sold;
          return acc;
        },
        { total_events: 0, total_revenue: 0, estimated_profit: 0, total_qty: 0 }
      );

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        products: products.map((p) => ({ _id: p._id, name: p.name, sku: p.sku })),
        events,
        summary,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

module.exports = router;
