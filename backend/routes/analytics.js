const express = require('express');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const SalesInvoice = require('../models/SalesInvoice');
const SalesReturn = require('../models/SalesReturn');
const Product = require('../models/Product');
const ProductPriceHistory = require('../models/ProductPriceHistory');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');
const Customer = require('../models/Customer');
const CustomerLoyaltyTransaction = require('../models/CustomerLoyaltyTransaction');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * IANA timezone. Cả VN một múi; Hà Nội = TP.HCM về giờ. Tên chuẩn là Asia/Ho_Chi_Minh — không có Asia/Ha_Noi trong IANA,
 * MongoDB $dateToString sẽ lỗi "Invalid time zone" nếu dùng sai.
 */
const REPORT_TZ = 'Asia/Ho_Chi_Minh';

function getVNCalendarDate(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const m = parseInt(parts.find((p) => p.type === 'month').value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day').value, 10);
  return { y, m, day };
}

function vnYmdKey(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function startOfVNCalendarDay(y, mo, d) {
  return new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+07:00`);
}

function endOfVNCalendarDay(y, mo, d) {
  return new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T23:59:59.999+07:00`);
}

/** Cộng/trừ N ngày trên lịch VN */
function addDaysVNCalendar(y, mo, d, deltaDays) {
  const noon = new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+07:00`);
  return getVNCalendarDate(new Date(noon.getTime() + deltaDays * 86400000));
}

function getVNYearMonth(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  return {
    y: parseInt(parts.find((p) => p.type === 'year').value, 10),
    m: parseInt(parts.find((p) => p.type === 'month').value, 10),
  };
}

function startOfVNMonth(y, mo) {
  return new Date(`${y}-${String(mo).padStart(2, '0')}-01T00:00:00+07:00`);
}

/** Lùi `monthsBack` tháng trên lịch (monthsBack >= 0) */
function subtractVNMonths(y, mo, monthsBack) {
  let yy = y;
  let mm = mo - monthsBack;
  while (mm < 1) {
    mm += 12;
    yy -= 1;
  }
  return { y: yy, m: mm };
}

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
  const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (query.from) {
    const fromRaw = String(query.from).trim();
    if (ymdRegex.test(fromRaw)) {
      // Parse date-only input as VN calendar day to avoid timezone shifting.
      from = new Date(`${fromRaw}T00:00:00+07:00`);
    } else {
      from = new Date(fromRaw);
      from.setHours(0, 0, 0, 0);
    }
  } else {
    // Mặc định: đầu tháng hiện tại
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  if (query.to) {
    const toRaw = String(query.to).trim();
    if (ymdRegex.test(toRaw)) {
      // Parse date-only input as VN calendar day to avoid timezone shifting.
      to = new Date(`${toRaw}T23:59:59.999+07:00`);
    } else {
      to = new Date(toRaw);
      to.setHours(23, 59, 59, 999);
    }
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

function escapeCsv(value) {
  const raw = value == null ? '' : String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

async function buildLoyaltyAnalyticsPayload({ req, from, to }) {
  const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin' && !storeIdObj) {
    return { error: { status: 403, body: { message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' } } };
  }

  const customerMatch = storeIdObj ? { store_id: storeIdObj } : {};
  const txnMatch = {
    ...(storeIdObj ? { store_id: storeIdObj } : {}),
    created_at: { $gte: from, $lte: to },
  };
  const invoiceMatch = {
    ...(storeIdObj ? { store_id: storeIdObj } : {}),
    status: 'confirmed',
    invoice_at: { $gte: from, $lte: to },
    ...PAID_TRANSFER_FILTER,
  };

  const [liabilityAgg, txnAgg, monthlyAgg, invoiceAgg, aovAgg] = await Promise.all([
    Customer.aggregate([
      { $match: customerMatch },
      {
        $group: {
          _id: null,
          total_points_balance: { $sum: { $ifNull: ['$loyalty_points', 0] } },
        },
      },
    ]),
    CustomerLoyaltyTransaction.aggregate([
      { $match: txnMatch },
      {
        $group: {
          _id: '$type',
          points: { $sum: '$points' },
          value_vnd: { $sum: '$value_vnd' },
        },
      },
    ]),
    CustomerLoyaltyTransaction.aggregate([
      { $match: txnMatch },
      {
        $group: {
          _id: {
            ym: { $dateToString: { format: '%Y-%m', date: '$created_at', timezone: REPORT_TZ } },
            type: '$type',
          },
          points: { $sum: '$points' },
          value_vnd: { $sum: '$value_vnd' },
        },
      },
      { $sort: { '_id.ym': 1 } },
    ]),
    SalesInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ['$total_amount', 0] } },
          loyalty_redeem_value: { $sum: { $ifNull: ['$loyalty_redeem_value', 0] } },
          order_count: { $sum: 1 },
        },
      },
    ]),
    SalesInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: {
            used_loyalty: {
              $cond: [
                {
                  $or: [
                    { $gt: [{ $ifNull: ['$loyalty_redeem_points', 0] }, 0] },
                    { $gt: [{ $ifNull: ['$loyalty_earned_points', 0] }, 0] },
                  ],
                },
                true,
                false,
              ],
            },
          },
          total_amount: { $sum: { $ifNull: ['$total_amount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const txnMap = new Map((txnAgg || []).map((r) => [String(r._id), r]));
  const earnedPoints = Number(txnMap.get('EARN')?.points || 0);
  const redeemedPoints = Math.abs(Number(txnMap.get('REDEEM')?.points || 0));
  const expiredPoints = Math.abs(Number(txnMap.get('EXPIRE')?.points || 0));
  const redeemedValue = Number(txnMap.get('REDEEM')?.value_vnd || 0);
  const liabilityPoints = Number(liabilityAgg[0]?.total_points_balance || 0);
  const pointValue = 500;
  const liabilityValue = liabilityPoints * pointValue;
  const revenue = Number(invoiceAgg[0]?.revenue || 0);
  const effectiveDiscountPct = revenue > 0 ? Math.round((redeemedValue / revenue) * 10000) / 100 : 0;
  const redemptionRate = earnedPoints > 0 ? Math.round((redeemedPoints / earnedPoints) * 10000) / 100 : 0;

  const aovMap = new Map((aovAgg || []).map((r) => [String(r._id.used_loyalty), r]));
  const loyaltyAov = Number(aovMap.get('true')?.total_amount || 0) / Math.max(1, Number(aovMap.get('true')?.count || 0));
  const nonLoyaltyAov = Number(aovMap.get('false')?.total_amount || 0) / Math.max(1, Number(aovMap.get('false')?.count || 0));
  const retentionLiftPct = nonLoyaltyAov > 0 ? Math.round(((loyaltyAov - nonLoyaltyAov) / nonLoyaltyAov) * 10000) / 100 : null;

  const monthBucketMap = new Map();
  (monthlyAgg || []).forEach((r) => {
    const ym = r?._id?.ym;
    const type = r?._id?.type;
    if (!ym || !type) return;
    if (!monthBucketMap.has(ym)) {
      monthBucketMap.set(ym, {
        month: ym,
        earn_points: 0,
        redeem_points: 0,
        expire_points: 0,
      });
    }
    const row = monthBucketMap.get(ym);
    if (type === 'EARN') row.earn_points += Number(r.points || 0);
    if (type === 'REDEEM') row.redeem_points += Math.abs(Number(r.points || 0));
    if (type === 'EXPIRE') row.expire_points += Math.abs(Number(r.points || 0));
  });
  const monthly = Array.from(monthBucketMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    liability_points: liabilityPoints,
    liability_value: liabilityValue,
    earned_points: earnedPoints,
    redeemed_points: redeemedPoints,
    expired_points: expiredPoints,
    redeemed_value: redeemedValue,
    redemption_rate: redemptionRate,
    effective_discount_pct: effectiveDiscountPct,
    retention_lift: {
      loyalty_aov: Number.isFinite(loyaltyAov) ? Math.round(loyaltyAov) : 0,
      non_loyalty_aov: Number.isFinite(nonLoyaltyAov) ? Math.round(nonLoyaltyAov) : 0,
      lift_pct: retentionLiftPct,
    },
    monthly,
  };
}

/**
 * Điều kiện loại trừ hóa đơn chuyển khoản chưa được xác nhận thanh toán.
 * Hóa đơn bank_transfer chỉ được tính vào doanh thu/lợi nhuận khi payment_status = 'paid'.
 * Các phương thức khác (cash, debt, card, credit) luôn được tính.
 */
const PAID_TRANSFER_FILTER = {
  $or: [
    { payment_method: { $ne: 'bank_transfer' } },
    { payment_status: 'paid' },
  ],
};

/**
 * Lãi gộp dòng = line_net_total − qty×unitCost, làm tròn 2 chữ số.
 * line_net_total là doanh thu thuần dòng (đã loại VAT) nếu hóa đơn có tách thuế.
 */
function aggLineGrossRounded(lineTotalRef, qtyRef, unitCostRef) {
  return {
    $divide: [
      {
        $round: [
          {
            $multiply: [
              {
                $subtract: [
                  { $ifNull: [lineTotalRef, 0] },
                  { $multiply: [{ $ifNull: [unitCostRef, 0] }, { $ifNull: [qtyRef, 0] }] },
                ],
              },
              100,
            ],
          },
          0,
        ],
      },
      100,
    ],
  };
}

/**
 * Tổng tiền hoàn hiệu dụng cho phiếu trả hàng.
 * Ưu tiên total_amount snapshot; fallback dữ liệu cũ: sum(items.qty * items.unit_price).
 */
function aggReturnEffectiveGross() {
  return {
    $let: {
      vars: {
        snapshotGross: { $ifNull: ['$total_amount', 0] },
        itemsGross: {
          $sum: {
            $map: {
              input: { $ifNull: ['$items', []] },
              as: 'it',
              in: {
                $multiply: [
                  { $ifNull: ['$$it.quantity', 0] },
                  { $ifNull: ['$$it.unit_price', 0] },
                ],
              },
            },
          },
        },
      },
      in: {
        $cond: [{ $gt: ['$$snapshotGross', 0] }, '$$snapshotGross', '$$itemsGross'],
      },
    },
  };
}

/**
 * Doanh thu thuần hoàn hiệu dụng.
 * Ưu tiên subtotal snapshot; fallback về gross hiệu dụng khi dữ liệu cũ không tách VAT.
 */
function aggReturnEffectiveNet() {
  return {
    $let: {
      vars: {
        snapshotSubtotal: { $ifNull: ['$subtotal_amount', 0] },
        effectiveGross: aggReturnEffectiveGross(),
      },
      in: {
        $cond: [{ $gt: ['$$snapshotSubtotal', 0] }, '$$snapshotSubtotal', '$$effectiveGross'],
      },
    },
  };
}

/**
 * Thuế hoàn hiệu dụng.
 * Ưu tiên tax snapshot; fallback 0 cho dữ liệu cũ không tách VAT.
 */
function aggReturnEffectiveTax() {
  return {
    $let: {
      vars: {
        snapshotTax: { $ifNull: ['$tax_amount', 0] },
      },
      in: {
        $cond: [{ $gt: ['$$snapshotTax', 0] }, '$$snapshotTax', 0],
      },
    },
  };
}

/**
 * Chuẩn hóa thời điểm phiếu trả hàng cho báo cáo:
 * ưu tiên return_at, fallback created_at để không bỏ sót dữ liệu cũ/backfill.
 */
const RETURN_DATE_FALLBACK_STAGE = {
  $addFields: {
    __returnAt: { $ifNull: ['$return_at', '$created_at'] },
  },
};

/**
 * Unwind dòng hàng → lookup Product → __unitCost: ưu tiên cost_price snapshot trên dòng;
 * nếu snapshot = 0 (đơn cũ / chưa nhập vốn) thì dùng cost_price SP hiện tại để báo cáo biên lãi có ý nghĩa.
 * (Đơn đã chốt vẫn giữ snapshot khi snapshot > 0.)
 * Đồng thời chuẩn hóa __lineNetTotal để lợi nhuận luôn tính trên doanh thu thuần (không VAT):
 * - Nếu có subtotal_amount/total_amount hợp lệ: phân bổ theo tỷ lệ subtotal/total cho từng dòng.
 * - Nếu không có dữ liệu thuế: dùng thẳng items.line_total (tương thích dữ liệu cũ).
 */
const AGG_STAGES_ITEMS_WITH_EFFECTIVE_UNIT_COST = [
  { $unwind: '$items' },
  {
    $lookup: {
      from: 'products',
      localField: 'items.product_id',
      foreignField: '_id',
      as: '__p',
    },
  },
  { $unwind: { path: '$__p', preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      __unitCost: {
        $cond: [
          { $gt: [{ $ifNull: ['$items.cost_price', 0] }, 0] },
          '$items.cost_price',
          { $ifNull: ['$__p.cost_price', 0] },
        ],
      },
      __lineNetTotal: {
        $let: {
          vars: {
            line: { $ifNull: ['$items.line_total', 0] },
            total: { $ifNull: ['$total_amount', 0] },
            subtotal: { $ifNull: ['$subtotal_amount', '$total_amount'] },
          },
          in: {
            $cond: [
              { $gt: ['$$total', 0] },
              { $multiply: ['$$line', { $divide: ['$$subtotal', '$$total'] }] },
              '$$line',
            ],
          },
        },
      },
    },
  },
];

/**
 * Bổ sung field hiệu dụng cho dòng trả hàng:
 * - __returnLineGross: qty * unit_price của dòng trả
 * - __returnLineNet: doanh thu thuần bị hoàn của dòng (dựa tỷ lệ subtotal/total của phiếu trả)
 * - __returnUnitCost: ưu tiên cost snapshot từ hóa đơn gốc; fallback cost hiện tại của sản phẩm
 */
const AGG_STAGES_RETURN_ITEMS_WITH_EFFECTIVE_VALUES = [
  { $unwind: '$items' },
  {
    $lookup: {
      from: 'salesinvoices',
      localField: 'invoice_id',
      foreignField: '_id',
      as: '__inv',
    },
  },
  { $unwind: { path: '$__inv', preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      __invItem: {
        $first: {
          $filter: {
            input: { $ifNull: ['$__inv.items', []] },
            as: 'it',
            cond: { $eq: ['$$it.product_id', '$items.product_id'] },
          },
        },
      },
    },
  },
  {
    $lookup: {
      from: 'products',
      localField: 'items.product_id',
      foreignField: '_id',
      as: '__p',
    },
  },
  { $unwind: { path: '$__p', preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      __returnUnitCost: {
        $cond: [
          { $gt: [{ $ifNull: ['$__invItem.cost_price', 0] }, 0] },
          '$__invItem.cost_price',
          { $ifNull: ['$__p.cost_price', 0] },
        ],
      },
      __returnLineGross: {
        $multiply: [{ $ifNull: ['$items.quantity', 0] }, { $ifNull: ['$items.unit_price', 0] }],
      },
    },
  },
  {
    $addFields: {
      __returnLineNet: {
        $let: {
          vars: {
            lineGross: '$__returnLineGross',
            total: { $ifNull: ['$total_amount', 0] },
            subtotal: { $ifNull: ['$subtotal_amount', '$total_amount'] },
          },
          in: {
            $cond: [
              { $gt: ['$$total', 0] },
              { $multiply: ['$$lineGross', { $divide: ['$$subtotal', '$$total'] }] },
              '$$lineGross',
            ],
          },
        },
      },
    },
  },
];

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
            const role = String(req.user?.role || '').toLowerCase();
            const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
            if (role !== 'admin' && !storeIdObj) {
                return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
            }

            const year = parseInt(req.query.year, 10);
            const month = parseInt(req.query.month, 10);
            const now = new Date();
            const y = Number.isFinite(year) ? year : now.getFullYear();
            const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
            // Dùng mốc tháng theo giờ VN để tránh lệch giao dịch giữa tháng 3/4.
            const startOfMonth = startOfVNMonth(y, m);
            const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
            const endOfMonth = new Date(startOfVNMonth(nextMonth.y, nextMonth.m).getTime() - 1);

            const poMatch = {
                created_at: { $gte: startOfMonth, $lte: endOfMonth },
            };
            const grMatch = {
                __receivedAt: { $gte: startOfMonth, $lte: endOfMonth },
                ...(storeIdObj
                    ? { $or: [{ storeId: storeIdObj }, { store_id: storeIdObj }] }
                    : {}),
            };

            const [poAgg, grAgg] = await Promise.all([
                PurchaseOrder.aggregate([
                    {
                        $match: poMatch,
                    },
                    ...(storeIdObj
                        ? [
                              {
                                  $lookup: {
                                      from: 'users',
                                      localField: 'created_by',
                                      foreignField: '_id',
                                      as: '__creator',
                                  },
                              },
                              { $unwind: { path: '$__creator', preserveNullAndEmptyArrays: true } },
                              {
                                  $lookup: {
                                      from: 'suppliers',
                                      localField: 'supplier_id',
                                      foreignField: '_id',
                                      as: '__supplier',
                                  },
                              },
                              { $unwind: { path: '$__supplier', preserveNullAndEmptyArrays: true } },
                              {
                                  $match: {
                                      $or: [
                                          { '__creator.storeId': storeIdObj },
                                          { '__creator.store_id': storeIdObj },
                                          { '__supplier.storeId': storeIdObj },
                                          { '__supplier.store_id': storeIdObj },
                                      ],
                                  },
                              },
                          ]
                        : []),
                    { $group: { _id: { $ifNull: ['$supplier_id', '__unknown__'] }, count: { $sum: 1 } } },
                ]),
                GoodsReceipt.aggregate([
                    {
                        $addFields: {
                            __receivedAt: { $ifNull: ['$received_at', '$created_at'] },
                        },
                    },
                    {
                        $match: grMatch,
                    },
                    { $group: { _id: { $ifNull: ['$supplier_id', '__unknown__'] }, count: { $sum: 1 } } },
                ]),
            ]);

            const supplierIds = new Set();
            poAgg.forEach((r) => { if (r?._id) supplierIds.add(String(r._id)); });
            grAgg.forEach((r) => { if (r?._id) supplierIds.add(String(r._id)); });

            const poBySupplier = new Map(
                poAgg.filter((r) => r?._id).map((r) => [String(r._id), r.count])
            );
            const grBySupplier = new Map(
                grAgg.filter((r) => r?._id).map((r) => [String(r._id), r.count])
            );

            const validSupplierIds = Array.from(supplierIds).filter((id) => id !== '__unknown__');
            const supplierQuery = { _id: { $in: validSupplierIds } };
            if (storeIdObj) supplierQuery.storeId = storeIdObj;
            const suppliers = validSupplierIds.length > 0
                ? await Supplier.find(supplierQuery).select('name').lean()
                : [];
            const supplierNameById = new Map(
                (suppliers || []).map((s) => [String(s._id), s.name || 'Nhà cung cấp'])
            );

            const result = Array.from(supplierIds).map((id) => {
                const poCount = poBySupplier.get(id) || 0;
                const grCount = grBySupplier.get(id) || 0;
                return {
                    supplier_id: id,
                    supplier_name:
                        id === '__unknown__'
                            ? 'NCC không xác định'
                            : supplierNameById.get(id) || 'NCC đã xóa/không còn',
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

      const invoiceMatchPeriod = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: from, $lte: to }, ...PAID_TRANSFER_FILTER }
        : { status: 'confirmed', invoice_at: { $gte: from, $lte: to }, ...PAID_TRANSFER_FILTER };

      const vnToday = getVNCalendarDate();
      const todayStart = startOfVNCalendarDay(vnToday.y, vnToday.m, vnToday.day);
      const todayEnd = endOfVNCalendarDay(vnToday.y, vnToday.m, vnToday.day);
      const yest = addDaysVNCalendar(vnToday.y, vnToday.m, vnToday.day, -1);
      const yStart = startOfVNCalendarDay(yest.y, yest.m, yest.day);
      const yEnd = endOfVNCalendarDay(yest.y, yest.m, yest.day);

      // Lợi nhuận gộp: tính từ line_total & giá vốn hiệu dụng (snapshot hoặc SP hiện tại nếu snapshot = 0)
      const profitPipeline = (matchCond) => [
        { $match: matchCond },
        ...AGG_STAGES_ITEMS_WITH_EFFECTIVE_UNIT_COST,
        {
          $group: {
            _id: null,
            gross_profit: {
              $sum: aggLineGrossRounded('$__lineNetTotal', '$items.quantity', '$__unitCost'),
            },
          },
        },
      ];

      const todayMatchCond = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: todayStart, $lte: todayEnd }, ...PAID_TRANSFER_FILTER }
        : { status: 'confirmed', invoice_at: { $gte: todayStart, $lte: todayEnd }, ...PAID_TRANSFER_FILTER };
      const yMatchCond = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: yStart, $lte: yEnd }, ...PAID_TRANSFER_FILTER }
        : { status: 'confirmed', invoice_at: { $gte: yStart, $lte: yEnd }, ...PAID_TRANSFER_FILTER };

      // Doanh thu + số đơn + lợi nhuận gộp thực (từ cost_price snapshot trên từng dòng hóa đơn)
      const [invoiceAgg, invoiceProfitAgg, returnAgg, returnAmountAgg, returnProfitAgg, grAgg, supplierPaymentAgg, todayAgg, yesterdayAgg, todayProfitAgg, yesterdayProfitAgg] = await Promise.all([
        // Aggregate 1: đếm số hóa đơn, tổng doanh thu, tổng thuế thu hộ
        SalesInvoice.aggregate([
          { $match: invoiceMatchPeriod },
          {
            $group: {
              _id: null,
              total_revenue: { $sum: '$total_amount' },
              order_count: { $sum: 1 },
              total_paid: { $sum: '$paid_amount' },
              total_subtotal: { $sum: '$subtotal_amount' },
              total_tax: { $sum: '$tax_amount' },
              total_loyalty_redeem: { $sum: { $ifNull: ['$loyalty_redeem_value', 0] } },
            },
          },
        ]),

        // Aggregate 2: tính lợi nhuận gộp thực từ cost_price snapshot trên từng dòng hóa đơn
        SalesInvoice.aggregate(profitPipeline(invoiceMatchPeriod)),

        // Số đơn trả hàng trong kỳ
        SalesReturn.aggregate([
          RETURN_DATE_FALLBACK_STAGE,
          {
            $match: storeIdObj
              ? { store_id: storeIdObj, status: 'approved', __returnAt: { $gte: from, $lte: to } }
              : { status: 'approved', __returnAt: { $gte: from, $lte: to } },
          },
          { $group: { _id: null, return_count: { $sum: 1 } } },
        ]),

        // Tổng tiền hoàn (gross/net/tax) trong kỳ
        SalesReturn.aggregate([
          RETURN_DATE_FALLBACK_STAGE,
          {
            $match: storeIdObj
              ? { store_id: storeIdObj, status: 'approved', __returnAt: { $gte: from, $lte: to } }
              : { status: 'approved', __returnAt: { $gte: from, $lte: to } },
          },
          {
            $group: {
              _id: null,
              total_return_gross: { $sum: aggReturnEffectiveGross() },
              total_return_net: { $sum: aggReturnEffectiveNet() },
              total_return_tax: { $sum: aggReturnEffectiveTax() },
            },
          },
        ]),

        // Lợi nhuận bị hoàn trong kỳ (để trừ khỏi gross profit)
        SalesReturn.aggregate([
          RETURN_DATE_FALLBACK_STAGE,
          {
            $match: storeIdObj
              ? { store_id: storeIdObj, status: 'approved', __returnAt: { $gte: from, $lte: to } }
              : { status: 'approved', __returnAt: { $gte: from, $lte: to } },
          },
          ...AGG_STAGES_RETURN_ITEMS_WITH_EFFECTIVE_VALUES,
          {
            $group: {
              _id: null,
              return_profit_impact: {
                $sum: aggLineGrossRounded('$__returnLineNet', '$items.quantity', '$__returnUnitCost'),
              },
            },
          },
        ]),

        // Chi phí nhập hàng trong kỳ (phiếu đã duyệt) — giữ để tham khảo
        GoodsReceipt.aggregate([
          {
            $match: storeIdObj
              ? { status: 'approved', received_at: { $gte: from, $lte: to } }
              : { status: 'approved', received_at: { $gte: from, $lte: to } },
          },
          { $group: { _id: null, incoming_cost: { $sum: '$total_amount' } } },
        ]),

        // Chi trả nợ NCC trong kỳ (dòng tiền thực chi), tách theo phương thức
        SupplierPayment.aggregate([
          {
            $match: storeIdObj
              ? { storeId: storeIdObj, payment_date: { $gte: from, $lte: to } }
              : { payment_date: { $gte: from, $lte: to } },
          },
          {
            $group: {
              _id: null,
              supplier_payment_total: { $sum: '$total_amount' },
              supplier_payment_cash: {
                $sum: {
                  $cond: [{ $eq: ['$payment_method', 'cash'] }, '$total_amount', 0],
                },
              },
              supplier_payment_bank_transfer: {
                $sum: {
                  $cond: [{ $eq: ['$payment_method', 'bank_transfer'] }, '$total_amount', 0],
                },
              },
            },
          },
        ]),

        // Doanh thu hôm nay
        SalesInvoice.aggregate([
          { $match: todayMatchCond },
          { $group: { _id: null, revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        ]),

        // Doanh thu hôm qua (để tính % thay đổi)
        SalesInvoice.aggregate([
          { $match: yMatchCond },
          { $group: { _id: null, revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        ]),

        // Lợi nhuận gộp thực hôm nay
        SalesInvoice.aggregate(profitPipeline(todayMatchCond)),

        // Lợi nhuận gộp thực hôm qua
        SalesInvoice.aggregate(profitPipeline(yMatchCond)),
      ]);

      const salesRevenue = invoiceAgg[0]?.total_revenue ?? 0;
      const loyaltyRedeemValue = invoiceAgg[0]?.total_loyalty_redeem ?? 0;
      const salesRevenueNet = invoiceAgg[0]?.total_subtotal ?? salesRevenue;
      const salesVatCollected = invoiceAgg[0]?.total_tax ?? 0;
      const returnGross = returnAmountAgg[0]?.total_return_gross ?? 0;
      const returnNet = returnAmountAgg[0]?.total_return_net ?? 0;
      const returnTax = returnAmountAgg[0]?.total_return_tax ?? 0;

      const revenue = salesRevenue - returnGross;
      const revenueNet = salesRevenueNet - returnNet;
      const totalVatCollected = salesVatCollected - returnTax;
      const orderCount = invoiceAgg[0]?.order_count ?? 0;
      const returnCount = returnAgg[0]?.return_count ?? 0;
      const incomingCost = grAgg[0]?.incoming_cost ?? 0;
      const supplierPaymentTotal = supplierPaymentAgg[0]?.supplier_payment_total ?? 0;
      const supplierPaymentCash = supplierPaymentAgg[0]?.supplier_payment_cash ?? 0;
      const supplierPaymentBankTransfer = supplierPaymentAgg[0]?.supplier_payment_bank_transfer ?? 0;
      // Lợi nhuận gộp thực: tính từ cost_price snapshot trên từng dòng hóa đơn
      const grossProfitFromSales = invoiceProfitAgg[0]?.gross_profit ?? 0;
      const grossProfitFromReturns = returnProfitAgg[0]?.return_profit_impact ?? 0;
      const grossProfit = grossProfitFromSales - grossProfitFromReturns;
      const grossProfitAfterLoyalty = grossProfit - loyaltyRedeemValue;
      // Giữ lại gross_profit_estimate (dựa GoodsReceipt) để tham khảo
      const grossProfitEstimate = revenue - incomingCost;
      const returnRate = orderCount > 0 ? Math.round((returnCount / orderCount) * 10000) / 100 : 0;
      const returnRateByRevenue = salesRevenue > 0 ? Math.round((returnGross / salesRevenue) * 10000) / 100 : 0;
      const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

      const todayRevenue = todayAgg[0]?.revenue ?? 0;
      const todayCount = todayAgg[0]?.count ?? 0;
      const yesterdayRevenue = yesterdayAgg[0]?.revenue ?? 0;
      const yesterdayCount = yesterdayAgg[0]?.count ?? 0;
      const todayProfit = todayProfitAgg[0]?.gross_profit ?? 0;
      const yesterdayProfit = yesterdayProfitAgg[0]?.gross_profit ?? 0;

      const revenueChangePct = yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 10000) / 100
        : null;
      const profitChangePct = yesterdayProfit > 0
        ? Math.round(((todayProfit - yesterdayProfit) / yesterdayProfit) * 10000) / 100
        : null;
      const orderChangeDelta = todayCount - yesterdayCount;

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        revenue,
        order_count: orderCount,
        avg_order_value: avgOrderValue,
        return_count: returnCount,
        return_amount: returnGross,
        return_rate: returnRate,
        return_rate_by_revenue: returnRateByRevenue,
        incoming_cost: incomingCost,
        supplier_payment_total: supplierPaymentTotal,
        supplier_payment_cash: supplierPaymentCash,
        supplier_payment_bank_transfer: supplierPaymentBankTransfer,
        // Lợi nhuận gộp thực: tính từ cost_price snapshot trên từng dòng hóa đơn (chính xác)
        gross_profit: grossProfit,
        loyalty_redeem_value: loyaltyRedeemValue,
        gross_profit_after_loyalty: grossProfitAfterLoyalty,
        // Lợi nhuận ước tính cũ (doanh thu - tiền nhập kỳ): giữ để tham khảo, không dùng cho báo cáo chính
        gross_profit_estimate: grossProfitEstimate,
        // Thuế VAT
        revenue_net: revenueNet,
        total_vat_collected: totalVatCollected,
        today: {
          revenue: todayRevenue,
          order_count: todayCount,
          revenue_change_pct: revenueChangePct,
          order_change_delta: orderChangeDelta,
          yesterday_revenue: yesterdayRevenue,
          profit: todayProfit,
          profit_change_pct: profitChangePct,
          yesterday_profit: yesterdayProfit,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/analytics/return-reasons?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Phân tích lý do trả hàng theo reason_code trong kỳ.
 */
router.get(
  '/return-reasons',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
      const role = String(req.user?.role || '').toLowerCase();
      if (role !== 'admin' && !storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const returnMatch = storeIdObj
        ? { store_id: storeIdObj, status: 'approved', __returnAt: { $gte: from, $lte: to } }
        : { status: 'approved', __returnAt: { $gte: from, $lte: to } };
      const invoiceMatch = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: from, $lte: to }, ...PAID_TRANSFER_FILTER }
        : { status: 'confirmed', invoice_at: { $gte: from, $lte: to }, ...PAID_TRANSFER_FILTER };

      const [reasonAgg, returnSumAgg, salesAgg] = await Promise.all([
        SalesReturn.aggregate([
          RETURN_DATE_FALLBACK_STAGE,
          { $match: returnMatch },
          {
            $group: {
              _id: { $ifNull: ['$reason_code', 'other'] },
              count: { $sum: 1 },
              amount: { $sum: aggReturnEffectiveGross() },
            },
          },
          { $sort: { amount: -1 } },
        ]),
        SalesReturn.aggregate([
          RETURN_DATE_FALLBACK_STAGE,
          { $match: returnMatch },
          { $group: { _id: null, total_return_amount: { $sum: aggReturnEffectiveGross() }, total_return_count: { $sum: 1 } } },
        ]),
        SalesInvoice.aggregate([
          { $match: invoiceMatch },
          { $group: { _id: null, total_revenue: { $sum: { $ifNull: ['$total_amount', 0] } } } },
        ]),
      ]);

      const labelMap = {
        customer_changed_mind: 'Khách đổi ý',
        defective: 'Lỗi nhà sản xuất',
        expired: 'Hết hạn sử dụng',
        wrong_item: 'Giao sai hàng',
        other: 'Lý do khác',
      };
      const totalReturnAmount = returnSumAgg[0]?.total_return_amount ?? 0;
      const totalReturnCount = returnSumAgg[0]?.total_return_count ?? 0;
      const totalRevenue = salesAgg[0]?.total_revenue ?? 0;
      const returnRateByRevenue = totalRevenue > 0 ? Math.round((totalReturnAmount / totalRevenue) * 10000) / 100 : 0;

      const data = (reasonAgg || []).map((r) => ({
        reason_code: r._id || 'other',
        reason_label: labelMap[r._id] || labelMap.other,
        count: r.count || 0,
        amount: r.amount || 0,
        ratio_by_amount: totalReturnAmount > 0 ? Math.round(((r.amount || 0) / totalReturnAmount) * 10000) / 100 : 0,
      }));

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        total_return_amount: totalReturnAmount,
        total_return_count: totalReturnCount,
        total_revenue: totalRevenue,
        return_rate_by_revenue: returnRateByRevenue,
        data,
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
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const [inventoryAgg, lowStockProducts, expiringProducts, deadCapitalAgg] = await Promise.all([
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
          .select('name sku stock_qty reorder_level cost_price')
          .sort({ stock_qty: 1 })
          .limit(5)
          .lean(),

        // Sản phẩm sắp hết hạn trong 30 ngày
        Product.find({
          ...baseMatch,
          expiry_date: { $gte: new Date(), $lte: thirtyDaysLater },
        })
          .select('name sku expiry_date stock_qty cost_price')
          .sort({ expiry_date: 1 })
          .limit(10)
          .lean(),

        // Vốn đọng: sản phẩm có tồn > 0 nhưng không có đơn bán trong 30 ngày qua
        (async () => {
          const invoiceMatchDead = storeIdObj
            ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: thirtyDaysAgo }, ...PAID_TRANSFER_FILTER }
            : { status: 'confirmed', invoice_at: { $gte: thirtyDaysAgo }, ...PAID_TRANSFER_FILTER };

          // Lấy danh sách product_id đã bán trong 30 ngày
          const soldProductIds = await SalesInvoice.aggregate([
            { $match: invoiceMatchDead },
            { $unwind: '$items' },
            { $group: { _id: '$items.product_id' } },
          ]);
          const soldIds = soldProductIds.map((r) => r._id).filter(Boolean);

          // Sản phẩm có tồn > 0 và KHÔNG trong danh sách đã bán
          const deadProducts = await Product.find({
            ...baseMatch,
            stock_qty: { $gt: 0 },
            _id: { $nin: soldIds },
          })
            .select('name sku stock_qty cost_price expiry_date')
            .sort({ stock_qty: -1 })
            .limit(20)
            .lean();

          const total_dead_capital = deadProducts.reduce(
            (sum, p) => sum + (p.stock_qty || 0) * (p.cost_price || 0),
            0
          );

          return {
            total_dead_capital,
            dead_products: deadProducts.map((p) => ({
              _id: p._id,
              name: p.name,
              sku: p.sku,
              stock_qty: p.stock_qty,
              cost_price: p.cost_price,
              dead_capital: (p.stock_qty || 0) * (p.cost_price || 0),
              expiry_date: p.expiry_date || null,
            })),
          };
        })(),
      ]);

      return res.json({
        total_sku: inventoryAgg[0]?.total_sku ?? 0,
        total_value: inventoryAgg[0]?.total_value ?? 0,
        out_of_stock_count: inventoryAgg[0]?.out_of_stock ?? 0,
        low_stock_count: inventoryAgg[0]?.low_stock ?? 0,
        low_stock_products: lowStockProducts,
        expiring_soon: expiringProducts,
        dead_capital: deadCapitalAgg.total_dead_capital ?? 0,
        dead_products: deadCapitalAgg.dead_products ?? [],
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
      let groupBy;
      let points;
      /** @type {{ y: number, m: number, day?: number }} */
      let rangeStartVN;
      let matchFrom;
      /** Gom bucket theo ngày YYYY-MM-DD hoặc tháng YYYY-MM (timezone VN trong Mongo) */
      let bucketExpr;

      const vnNow = getVNCalendarDate(now);

      if (period === '7d' || period === '30d') {
        const days = period === '7d' ? 7 : 30;
        groupBy = 'day';
        points = days;
        rangeStartVN = addDaysVNCalendar(vnNow.y, vnNow.m, vnNow.day, -(days - 1));
        matchFrom = startOfVNCalendarDay(rangeStartVN.y, rangeStartVN.m, rangeStartVN.day);
        bucketExpr = {
          $dateToString: { format: '%Y-%m-%d', date: '$invoice_at', timezone: REPORT_TZ },
        };
      } else if (period === '3m') {
        groupBy = 'month';
        points = 3;
        const first = subtractVNMonths(vnNow.y, vnNow.m, 2);
        rangeStartVN = { y: first.y, m: first.m };
        matchFrom = startOfVNMonth(first.y, first.m);
        bucketExpr = {
          $dateToString: { format: '%Y-%m', date: '$invoice_at', timezone: REPORT_TZ },
        };
      } else {
        groupBy = 'month';
        points = 6;
        const first = subtractVNMonths(vnNow.y, vnNow.m, 5);
        rangeStartVN = { y: first.y, m: first.m };
        matchFrom = startOfVNMonth(first.y, first.m);
        bucketExpr = {
          $dateToString: { format: '%Y-%m', date: '$invoice_at', timezone: REPORT_TZ },
        };
      }

      const matchStage = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: matchFrom, $lte: now }, ...PAID_TRANSFER_FILTER }
        : { status: 'confirmed', invoice_at: { $gte: matchFrom, $lte: now }, ...PAID_TRANSFER_FILTER };

      // Aggregate doanh thu bán theo bucket (khóa = chuỗi ngày/tháng theo REPORT_TZ)
      const revenueAgg = await SalesInvoice.aggregate([
        { $match: matchStage },
        { $group: { _id: bucketExpr, revenue: { $sum: '$total_amount' }, order_count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      // Aggregate hoàn trả theo bucket
      const returnRevenueMatch = storeIdObj
        ? { store_id: storeIdObj, status: 'approved', __returnAt: { $gte: matchFrom, $lte: now } }
        : { status: 'approved', __returnAt: { $gte: matchFrom, $lte: now } };
      const returnRevenueAgg = await SalesReturn.aggregate([
        RETURN_DATE_FALLBACK_STAGE,
        { $match: returnRevenueMatch },
        {
          $group: {
            _id: { $dateToString: { format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m', date: '$__returnAt', timezone: REPORT_TZ } },
            revenue: { $sum: aggReturnEffectiveGross() },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Lợi nhuận theo bucket: cùng công thức giá vốn hiệu dụng như summary (tránh lãi = DT khi snapshot vốn = 0)
      const profitAgg = await SalesInvoice.aggregate([
        { $match: matchStage },
        ...AGG_STAGES_ITEMS_WITH_EFFECTIVE_UNIT_COST,
        {
          $group: {
            _id: bucketExpr,
            profit: {
              $sum: aggLineGrossRounded('$__lineNetTotal', '$items.quantity', '$__unitCost'),
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Lợi nhuận bị hoàn theo bucket (để trừ khỏi profit bán)
      const returnProfitAgg = await SalesReturn.aggregate([
        RETURN_DATE_FALLBACK_STAGE,
        { $match: returnRevenueMatch },
        ...AGG_STAGES_RETURN_ITEMS_WITH_EFFECTIVE_VALUES,
        {
          $group: {
            _id: { $dateToString: { format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m', date: '$__returnAt', timezone: REPORT_TZ } },
            profit: {
              $sum: aggLineGrossRounded('$__returnLineNet', '$items.quantity', '$__returnUnitCost'),
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const revenueMap = new Map();
      revenueAgg.forEach((r) => {
        if (r._id) revenueMap.set(r._id, { revenue: r.revenue, order_count: r.order_count });
      });
      const returnRevenueMap = new Map();
      returnRevenueAgg.forEach((r) => {
        if (r._id) returnRevenueMap.set(r._id, r.revenue || 0);
      });
      const profitMap = new Map();
      profitAgg.forEach((r) => {
        if (r._id != null) profitMap.set(r._id, r.profit);
      });
      const returnProfitMap = new Map();
      returnProfitAgg.forEach((r) => {
        if (r._id != null) returnProfitMap.set(r._id, r.profit || 0);
      });

      const result = [];
      if (groupBy === 'day') {
        for (let i = 0; i < points; i++) {
          const d = addDaysVNCalendar(rangeStartVN.y, rangeStartVN.m, rangeStartVN.day, i);
          const key = vnYmdKey(d.y, d.m, d.day);
          const entry = revenueMap.get(key) || { revenue: 0, order_count: 0 };
          result.push({
            label: `${d.day}/${d.m}`,
            key,
            revenue: entry.revenue || 0,
            sales_revenue: entry.revenue || 0,
            return_amount: returnRevenueMap.get(key) || 0,
            net_revenue: (entry.revenue || 0) - (returnRevenueMap.get(key) || 0),
            order_count: entry.order_count,
            profit: (profitMap.get(key) ?? 0) - (returnProfitMap.get(key) || 0),
          });
        }
      } else {
        let cy = rangeStartVN.y;
        let cm = rangeStartVN.m;
        for (let i = 0; i < points; i++) {
          const key = `${cy}-${String(cm).padStart(2, '0')}`;
          const entry = revenueMap.get(key) || { revenue: 0, order_count: 0 };
          result.push({
            label: `T${cm}/${cy}`,
            key,
            revenue: entry.revenue || 0,
            sales_revenue: entry.revenue || 0,
            return_amount: returnRevenueMap.get(key) || 0,
            net_revenue: (entry.revenue || 0) - (returnRevenueMap.get(key) || 0),
            order_count: entry.order_count,
            profit: (profitMap.get(key) ?? 0) - (returnProfitMap.get(key) || 0),
          });
          cm += 1;
          if (cm > 12) {
            cm = 1;
            cy += 1;
          }
        }
      }

      return res.json({ period, data: result, timezone: REPORT_TZ });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/analytics/top-products?from=&to=&limit=10&sort=qty|profit
 * Sản phẩm bán chạy nhất (sort=qty) hoặc lãi nhiều nhất (sort=profit)
 */
router.get(
  '/top-products',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
      const sortBy = req.query.sort === 'profit' ? 'total_profit' : 'total_qty';
      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
      const role = String(req.user?.role || '').toLowerCase();

      if (role !== 'admin' && !storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const matchStage = storeIdObj
        ? { store_id: storeIdObj, status: 'confirmed', invoice_at: { $gte: from, $lte: to }, ...PAID_TRANSFER_FILTER }
        : { status: 'confirmed', invoice_at: { $gte: from, $lte: to }, ...PAID_TRANSFER_FILTER };

      const agg = await SalesInvoice.aggregate([
        { $match: matchStage },
        ...AGG_STAGES_ITEMS_WITH_EFFECTIVE_UNIT_COST,
        {
          $group: {
            _id: '$items.product_id',
            total_qty: { $sum: '$items.quantity' },
            total_revenue: { $sum: '$items.line_total' },
            order_count: { $sum: 1 },
            total_profit: {
              $sum: aggLineGrossRounded('$__lineNetTotal', '$items.quantity', '$__unitCost'),
            },
          },
        },
        { $sort: { [sortBy]: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            product_id: '$_id',
            product_name: { $ifNull: ['$product.name', 'Không rõ'] },
            sku: { $ifNull: ['$product.sku', '—'] },
            total_qty: 1,
            total_revenue: 1,
            total_profit: 1,
            order_count: 1,
            current_stock: { $ifNull: ['$product.stock_qty', 0] },
          },
        },
      ]);

      // Hoàn trả theo sản phẩm trong kỳ (để trừ số liệu top products)
      const returnMatchStage = storeIdObj
        ? { store_id: storeIdObj, status: 'approved', __returnAt: { $gte: from, $lte: to } }
        : { status: 'approved', __returnAt: { $gte: from, $lte: to } };
      const returnAgg = await SalesReturn.aggregate([
        RETURN_DATE_FALLBACK_STAGE,
        { $match: returnMatchStage },
        ...AGG_STAGES_RETURN_ITEMS_WITH_EFFECTIVE_VALUES,
        {
          $group: {
            _id: '$items.product_id',
            return_qty: { $sum: '$items.quantity' },
            return_revenue: { $sum: '$__returnLineGross' },
            return_profit: {
              $sum: aggLineGrossRounded('$__returnLineNet', '$items.quantity', '$__returnUnitCost'),
            },
          },
        },
      ]);

      const returnMap = new Map(
        (returnAgg || []).map((r) => [String(r._id), r])
      );
      const merged = (agg || []).map((row) => {
        const key = String(row.product_id || row._id || '');
        const ret = returnMap.get(key);
        if (!ret) return row;
        return {
          ...row,
          total_qty: (Number(row.total_qty) || 0) - (Number(ret.return_qty) || 0),
          total_revenue: (Number(row.total_revenue) || 0) - (Number(ret.return_revenue) || 0),
          total_profit: (Number(row.total_profit) || 0) - (Number(ret.return_profit) || 0),
        };
      });

      const normalized = merged
        .filter((r) => (Number(r.total_qty) || 0) > 0 || (Number(r.total_revenue) || 0) > 0 || (Number(r.total_profit) || 0) > 0)
        .sort((a, b) => (Number(b[sortBy]) || 0) - (Number(a[sortBy]) || 0))
        .slice(0, limit);

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        sort: sortBy === 'total_profit' ? 'profit' : 'qty',
        data: normalized,
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
  '/top-customers',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const sort = ['spent', 'debt', 'overdue'].includes(String(req.query.sort || 'spent'))
        ? String(req.query.sort || 'spent')
        : 'spent';
      const storeIdObj = req.user?.storeId ? new mongoose.Types.ObjectId(req.user.storeId) : null;
      const role = String(req.user?.role || '').toLowerCase();

      if (role !== 'admin' && !storeIdObj) {
        return res.status(403).json({ message: 'Chưa có cửa hàng', code: 'STORE_REQUIRED' });
      }

      const customerMatch = storeIdObj ? { store_id: storeIdObj } : {};
      const invoiceStoreExpr = storeIdObj
        ? [{ $eq: ['$store_id', storeIdObj] }]
        : [];

      const sortStage = sort === 'debt'
        ? { current_debt: -1, oldest_debt_days: -1, total_spent: -1, full_name: 1 }
        : sort === 'overdue'
          ? { oldest_debt_days: -1, current_debt: -1, total_spent: -1, full_name: 1 }
          : { total_spent: -1, current_debt: -1, oldest_debt_days: -1, full_name: 1 };

      const data = await Customer.aggregate([
        { $match: customerMatch },
        {
          $lookup: {
            from: 'salesinvoices',
            let: { customerId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$customer_id', '$$customerId'] },
                      { $eq: ['$status', 'confirmed'] },
                      {
                        $or: [
                          { $ne: ['$payment_method', 'bank_transfer'] },
                          { $eq: ['$payment_status', 'paid'] },
                        ],
                      },
                      ...invoiceStoreExpr,
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  total_spent: { $sum: { $ifNull: ['$total_amount', 0] } },
                  total_invoices: { $sum: 1 },
                },
              },
            ],
            as: 'sales_stats',
          },
        },
        {
          $lookup: {
            from: 'salesinvoices',
            let: { customerId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$customer_id', '$$customerId'] },
                      { $eq: ['$status', 'pending'] },
                      { $eq: ['$payment_method', 'debt'] },
                      ...invoiceStoreExpr,
                    ],
                  },
                },
              },
              { $sort: { created_at: 1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 1,
                  created_at: 1,
                  total_amount: { $ifNull: ['$total_amount', 0] },
                },
              },
            ],
            as: 'oldest_debt_invoice',
          },
        },
        {
          $addFields: {
            total_spent: { $ifNull: [{ $first: '$sales_stats.total_spent' }, 0] },
            total_invoices: { $ifNull: [{ $first: '$sales_stats.total_invoices' }, 0] },
            current_debt: { $ifNull: ['$debt_account', 0] },
            oldest_debt_at: { $first: '$oldest_debt_invoice.created_at' },
            oldest_debt_invoice_id: { $first: '$oldest_debt_invoice._id' },
            oldest_debt_invoice_amount: { $ifNull: [{ $first: '$oldest_debt_invoice.total_amount' }, 0] },
          },
        },
        {
          $addFields: {
            oldest_debt_days: {
              $cond: [
                { $ifNull: ['$oldest_debt_at', false] },
                { $dateDiff: { startDate: '$oldest_debt_at', endDate: '$$NOW', unit: 'day' } },
                0,
              ],
            },
          },
        },
        {
          $project: {
            _id: 1,
            full_name: 1,
            phone: 1,
            email: 1,
            current_debt: 1,
            total_spent: 1,
            total_invoices: 1,
            oldest_debt_at: 1,
            oldest_debt_days: 1,
            oldest_debt_invoice_id: 1,
            oldest_debt_invoice_amount: 1,
            overdue_30: {
              $and: [{ $gt: ['$current_debt', 0] }, { $gt: ['$oldest_debt_days', 30] }],
            },
          },
        },
        { $sort: sortStage },
        { $limit: limit },
      ]);

      return res.json({ sort, limit, data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

router.get(
  '/loyalty',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const payload = await buildLoyaltyAnalyticsPayload({ req, from, to });
      if (payload?.error) return res.status(payload.error.status).json(payload.error.body);
      return res.json(payload);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

router.get(
  '/loyalty/export',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const payload = await buildLoyaltyAnalyticsPayload({ req, from, to });
      if (payload?.error) return res.status(payload.error.status).json(payload.error.body);

      const rows = [
        ['Metric', 'Value'],
        ['from', payload.period.from],
        ['to', payload.period.to],
        ['liability_points', payload.liability_points],
        ['liability_value', payload.liability_value],
        ['earned_points', payload.earned_points],
        ['redeemed_points', payload.redeemed_points],
        ['expired_points', payload.expired_points],
        ['redeemed_value', payload.redeemed_value],
        ['redemption_rate_pct', payload.redemption_rate],
        ['effective_discount_pct', payload.effective_discount_pct],
        ['loyalty_aov', payload.retention_lift?.loyalty_aov ?? 0],
        ['non_loyalty_aov', payload.retention_lift?.non_loyalty_aov ?? 0],
        ['retention_lift_pct', payload.retention_lift?.lift_pct ?? ''],
        [],
        ['Month', 'Earn Points', 'Redeem Points', 'Expire Points'],
        ...(payload.monthly || []).map((r) => [r.month, r.earn_points, r.redeem_points, r.expire_points]),
      ];
      const csv = rows
        .map((row) => (Array.isArray(row) ? row.map(escapeCsv).join(',') : ''))
        .join('\n');
      const fileFrom = String(payload.period.from).slice(0, 10);
      const fileTo = String(payload.period.to).slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="loyalty-report-${fileFrom}-to-${fileTo}.csv"`);
      return res.send(`\uFEFF${csv}`);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

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
      const supplierId = req.query.supplierId;
      const costDirection = String(req.query.costDirection || '').trim().toLowerCase();
      const productFilter = { storeId: storeIdObj };
      if (productId) {
        if (!mongoose.isValidObjectId(productId)) {
          return res.status(400).json({ message: 'productId không hợp lệ' });
        }
        productFilter._id = new mongoose.Types.ObjectId(productId);
      }
      if (supplierId) {
        if (!mongoose.isValidObjectId(supplierId)) {
          return res.status(400).json({ message: 'supplierId không hợp lệ' });
        }
        productFilter.supplier_id = new mongoose.Types.ObjectId(supplierId);
      }

      const [products, suppliers] = await Promise.all([
        Product.find(productFilter)
          .select('_id name sku supplier_id')
          .lean(),
        Supplier.find({ storeId: storeIdObj }).select('_id name').sort({ created_at: -1 }).lean(),
      ]);
      const productIdList = products.map((p) => p._id);
      if (productIdList.length === 0) {
        return res.json({
          period: { from: from.toISOString(), to: to.toISOString() },
          products: [],
          suppliers,
          events: [],
          summary: { total_events: 0 },
        });
      }

      const histories = await ProductPriceHistory.find({
        storeId: storeIdObj,
        product_id: { $in: productIdList },
        changed_at: { $gte: from, $lte: to },
      })
        .sort({ changed_at: -1 })
        .populate('changed_by', 'fullName email')
        .lean();

      const events = [];
      for (const h of histories) {
        const product = products.find((p) => String(p._id) === String(h.product_id));
        if (!product) continue;

        const oldCost = Number(h.old_cost_price || 0);
        const newCost = Number(h.new_cost_price || 0);
        const oldSale = Number(h.old_sale_price || 0);
        const newSale = Number(h.new_sale_price || 0);

        const addCostRow = oldCost !== newCost;
        const addSaleRow = oldSale !== newSale;

        if (addCostRow) {
          const passCostDirection = costDirection !== 'up' || newCost > oldCost;
          if (passCostDirection) {
            events.push({
              _id: `${h._id}:cost`,
              changed_at: h.changed_at,
              product_id: product._id,
              product_name: product.name || 'Không rõ',
              sku: product.sku || '—',
              price_type: 'cost',
              old_value: oldCost,
              new_value: newCost,
              changed_by: h.changed_by?.fullName || h.changed_by?.email || '—',
              source: h.source,
              source_note: h.source_note || '',
            });
          }
        }
        if (addSaleRow && costDirection !== 'up') {
          events.push({
            _id: `${h._id}:sale`,
            changed_at: h.changed_at,
            product_id: product._id,
            product_name: product.name || 'Không rõ',
            sku: product.sku || '—',
            price_type: 'sale',
            old_value: oldSale,
            new_value: newSale,
            changed_by: h.changed_by?.fullName || h.changed_by?.email || '—',
            source: h.source,
            source_note: h.source_note || '',
          });
        }
      }

      return res.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        products: products.map((p) => ({ _id: p._id, name: p.name, sku: p.sku, supplier_id: p.supplier_id || null })),
        suppliers,
        events,
        summary: { total_events: events.length },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

module.exports = router;
