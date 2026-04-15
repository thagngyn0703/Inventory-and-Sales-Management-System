const express = require('express');
const mongoose = require('mongoose');
const StockHistory = require('../models/StockHistory');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return null;
  return { storeId };
}

function shortCode(id) {
  const raw = String(id || '');
  return raw.slice(-6).toUpperCase();
}

function referencePrefix(referenceType) {
  switch (String(referenceType || '').toLowerCase()) {
    case 'goods_receipt':
      return 'PN';
    case 'sales_invoice':
      return 'HD';
    case 'stocktake':
      return 'KK';
    case 'stock_adjustment':
      return 'DC';
    default:
      return 'CT';
  }
}

router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      product_id,
      type,
      from_date,
      to_date,
      reference_id,
      reference_type,
      q,
    } = req.query || {};

    const roleFilter = getRoleStoreFilter(req);
    if (roleFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = { ...roleFilter };

    if (product_id) {
      if (!mongoose.isValidObjectId(product_id)) {
        return res.status(400).json({ message: 'product_id không hợp lệ' });
      }
      filter.product_id = product_id;
    }

    const qText = String(q || '').trim();
    if (qText) {
      const escaped = qText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const productFilter = {
        ...('storeId' in roleFilter ? { storeId: roleFilter.storeId } : {}),
        $or: [{ name: { $regex: escaped, $options: 'i' } }, { sku: { $regex: escaped, $options: 'i' } }],
      };
      const productIds = await Product.find(productFilter).select('_id').limit(200).lean();
      const idList = productIds.map((p) => p._id);
      if (!idList.length) {
        return res.json({ histories: [], total: 0, page: pageNum, limit: limitNum, totalPages: 1 });
      }
      if (filter.product_id) {
        if (!idList.some((id) => String(id) === String(filter.product_id))) {
          return res.json({ histories: [], total: 0, page: pageNum, limit: limitNum, totalPages: 1 });
        }
      } else {
        filter.product_id = { $in: idList };
      }
    }

    if (type && String(type).trim()) {
      filter.type = String(type).trim();
    }

    if (reference_type && String(reference_type).trim()) {
      filter.reference_type = String(reference_type).trim();
    }

    if (reference_id) {
      if (!mongoose.isValidObjectId(reference_id)) {
        return res.status(400).json({ message: 'reference_id không hợp lệ' });
      }
      filter.reference_id = reference_id;
    }

    if (from_date || to_date) {
      const range = {};
      if (from_date) {
        const from = new Date(from_date);
        if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
        range.$gte = from;
      }
      if (to_date) {
        const to = new Date(to_date);
        if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
        range.$lte = to;
      }
      filter.created_at = range;
    }

    const total = await StockHistory.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const rows = await StockHistory.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('product_id', 'name sku base_unit')
      .populate('actor_id', 'fullName email')
      .lean();

    const histories = rows.map((row) => {
      const changeQty = Number(row.change_qty) || 0;
      const refCode = row.reference_id
        ? `${referencePrefix(row.reference_type)}${shortCode(row.reference_id)}`
        : null;
      return {
        ...row,
        timestamp: row.created_at,
        reference_code: refCode,
        change: `${changeQty > 0 ? '+' : ''}${changeQty}`,
        balance: String(Number(row.after_qty) || 0),
        actor_name: row.actor_id?.fullName || row.actor_id?.email || 'Hệ thống',
      };
    });

    return res.json({
      histories,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
