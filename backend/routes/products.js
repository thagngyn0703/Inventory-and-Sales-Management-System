const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseOptionalDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}


function normalizeProduct(p) {
  if (!p) return p;
  const base = p.base_unit || 'Cái';
  const units = p.selling_units && p.selling_units.length > 0
    ? p.selling_units
    : [{ name: base, ratio: 1, sale_price: p.sale_price != null ? p.sale_price : 0 }];
  const baseUnit = units.find((u) => u.ratio === 1) || units[0];
  return { ...p, selling_units: units, sale_price: baseUnit ? baseUnit.sale_price : (p.sale_price || 0) };
}

async function findSkuDuplicate({ sku, storeId, excludeId }) {
  const filter = { sku: String(sku || '').trim() };
  if (storeId) filter.storeId = storeId;
  else filter.storeId = null;
  if (excludeId && mongoose.isValidObjectId(excludeId)) filter._id = { $ne: excludeId };
  return Product.findOne(filter).select('_id sku storeId').lean();
}

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  const isStoreScopedRole = ['manager', 'warehouse_staff', 'sales_staff'].includes(role);
  if (!isStoreScopedRole) return {};
  if (!storeId) return null;
  return { storeId };
}

// POST /api/products  (manager, admin)
router.post('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const {
      category_id,
      supplier_id,
      name,
      sku,
      barcode,
      cost_price,
      sale_price,
      stock_qty,
      reorder_level,
      expiry_date,
      base_unit,
      selling_units: bodyUnits,
      status,
    } = req.body || {};
    const role = String(req.user?.role || '').toLowerCase();
    const requesterStoreId = req.user?.storeId ? String(req.user.storeId) : null;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ message: 'sku is required' });
    }

    const base = base_unit ? String(base_unit).trim() : 'Cái';
    let selling_units = Array.isArray(bodyUnits) && bodyUnits.length > 0
      ? bodyUnits.map((u) => ({
          name: String(u.name || '').trim() || base,
          ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
          sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
        }))
      : [{ name: base, ratio: 1, sale_price: Number(sale_price) >= 0 ? Number(sale_price) : 0 }];

    const hasBase = selling_units.some((u) => u.ratio === 1);
    if (!hasBase) {
      selling_units = [{ name: base, ratio: 1, sale_price: selling_units[0] ? selling_units[0].sale_price : 0 }, ...selling_units];
    }

    const baseUnit = selling_units.find((u) => u.ratio === 1);
    const baseUnitPrice = baseUnit ? baseUnit.sale_price : (Number(sale_price) || 0);
    const resolvedStoreId = role === 'admin'
      ? (req.body?.storeId && mongoose.isValidObjectId(req.body.storeId) ? req.body.storeId : undefined)
      : requesterStoreId;
    if (role !== 'admin' && !resolvedStoreId) {
      return res.status(403).json({
        message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi tạo sản phẩm.',
        code: 'STORE_REQUIRED',
      });
    }

    const duplicate = await findSkuDuplicate({ sku, storeId: resolvedStoreId });
    if (duplicate) {
      return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
    }

    const doc = await Product.create({
      category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
      supplier_id: supplier_id && mongoose.isValidObjectId(supplier_id) ? supplier_id : undefined,
      storeId: resolvedStoreId,
      name: String(name).trim(),
      sku: String(sku).trim(),
      barcode: barcode ? String(barcode).trim() : undefined,
      cost_price: Number(cost_price || 0),
      sale_price: baseUnitPrice,
      stock_qty: Number(stock_qty || 0),
      reorder_level: Number(reorder_level || 0),
      expiry_date: parseOptionalDate(expiry_date),
      base_unit: base,
      selling_units,
      status: status === 'inactive' ? 'inactive' : 'active',
    });

    return res.status(201).json({ product: normalizeProduct(doc.toObject()) });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products?q=...&page=1&limit=20  (manager, warehouse, sales, admin)
router.get('/', requireAuth, requireRole(['manager', 'warehouse', 'sales', 'admin']), async (req, res) => {
  try {
    const { q = '', page = '1', limit = '20' } = req.query;
    const query = String(q || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = getRoleStoreFilter(req);
    if (filter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }

    const total = await Product.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const products = await Product.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const normalized = products.map(normalizeProduct);

    return res.json({
      products: normalized,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/:id  (manager, warehouse, sales, admin)
router.get('/:id', requireAuth, requireRole(['manager', 'warehouse', 'sales', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const product = await Product.findOne({ _id: id, ...storeFilter })
      .populate('supplier_id', 'name phone email')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product: normalizeProduct(product) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/products/:id  (manager, admin)
router.put('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const {
      category_id,
      supplier_id,
      name,
      sku,
      barcode,
      cost_price,
      sale_price,
      stock_qty,
      reorder_level,
      expiry_date,
      base_unit,
      selling_units: bodyUnits,
      status,
    } = req.body || {};

    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const product = await Product.findOne({ _id: id, ...storeFilter });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (name !== undefined) product.name = String(name).trim();
    if (sku !== undefined) product.sku = String(sku).trim();
    if (barcode !== undefined) product.barcode = barcode ? String(barcode).trim() : undefined;
    if (cost_price !== undefined) product.cost_price = Number(cost_price) || 0;
    if (stock_qty !== undefined) product.stock_qty = Number(stock_qty) || 0;
    if (reorder_level !== undefined) product.reorder_level = Number(reorder_level) || 0;
    if (expiry_date !== undefined) product.expiry_date = expiry_date ? parseOptionalDate(expiry_date) : null;
    if (base_unit !== undefined) product.base_unit = base_unit ? String(base_unit).trim() : 'Cái';
    if (status !== undefined) product.status = status === 'inactive' ? 'inactive' : 'active';
    if (category_id !== undefined) {
      product.category_id = category_id && mongoose.isValidObjectId(category_id) ? category_id : null;
    }
    if (supplier_id !== undefined) {
      product.supplier_id = supplier_id && mongoose.isValidObjectId(supplier_id) ? supplier_id : null;
    }
    if (sku !== undefined) {
      const duplicate = await findSkuDuplicate({ sku, storeId: product.storeId, excludeId: id });
      if (duplicate) {
        return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
      }
    }

    if (Array.isArray(bodyUnits) && bodyUnits.length > 0) {
      const base = product.base_unit || 'Cái';
      const units = bodyUnits.map((u) => ({
        name: String(u.name || '').trim() || base,
        ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
        sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
      }));
      const hasBase = units.some((u) => u.ratio === 1);
      product.selling_units = hasBase ? units : [{ name: base, ratio: 1, sale_price: units[0]?.sale_price ?? 0 }, ...units];
      const baseUnitPrice = product.selling_units.find((u) => u.ratio === 1)?.sale_price ?? 0;
      product.sale_price = baseUnitPrice;
    } else if (sale_price !== undefined) {
      product.sale_price = Number(sale_price) || 0;
      product.selling_units = [{ name: product.base_unit || 'Cái', ratio: 1, sale_price: product.sale_price }];
    }
    product.updated_at = new Date();
    await product.save();

    return res.json({ product: normalizeProduct(product.toObject()) });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/products/:id/status  (manager, admin) - body: { status: 'active' | 'inactive' }
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const { status } = req.body || {};
    const newStatus = status === 'inactive' ? 'inactive' : 'active';

    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const product = await Product.findOneAndUpdate(
      { _id: id, ...storeFilter },
      { status: newStatus, updated_at: new Date() },
      { new: true }
    ).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product: normalizeProduct(product) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

