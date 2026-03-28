const express = require('express');
const mongoose = require('mongoose');
const ProductRequest = require('../models/ProductRequest');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

console.log('ProductRequests route loaded');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// POST /api/product-requests (warehouse, admin, manager)
router.post('/', requireAuth, requireRole(['warehouse', 'manager']), async (req, res) => {
  console.log('POST /api/product-requests called by', req.user?.id, req.user?.role);
  console.log('body:', JSON.stringify(req.body).slice(0, 1000));
  try {
    const {
      category_id,
      name,
      sku,
      barcode,
      cost_price,
      sale_price,
      stock_qty,
      reorder_level,
      base_unit,
      selling_units: bodyUnits,
      note
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ message: 'sku is required' });
    }

    // Check if sku already exists in Product or ProductRequest (pending/approved)
    const existingProduct = await Product.findOne({ sku: String(sku).trim() });
    if (existingProduct) {
      return res.status(409).json({ message: 'sku already exists in Products' });
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

    const doc = await ProductRequest.create({
      category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
      name: String(name).trim(),
      sku: String(sku).trim(),
      barcode: barcode ? String(barcode).trim() : undefined,
      cost_price: Number(cost_price || 0),
      sale_price: baseUnitPrice,
      stock_qty: Number(stock_qty || 0),
      reorder_level: Number(reorder_level || 0),
      base_unit: base,
      selling_units,
      requested_by: req.user.id,
      status: 'pending',
      note: note ? String(note).trim() : undefined
    });

    return res.status(201).json({ productRequest: normalizeProduct(doc.toObject()) });
  } catch (err) {
    console.error('ProductRequest create error:', err);
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists in requests format` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/product-requests (manager, admin)
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { q = '', page = '1', limit = '20', status } = req.query;
    const query = String(q || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }

    const total = await ProductRequest.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const requests = await ProductRequest.find(filter)
      .populate('requested_by', 'name email role')
      .populate('approved_by', 'name email role')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const normalized = requests.map(normalizeProduct);

    return res.json({
      productRequests: normalized,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/product-requests/:id (manager, admin)
router.get('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }
    const request = await ProductRequest.findById(id)
      .populate('requested_by', 'name email role')
      .populate('approved_by', 'name email role')
      .lean();
    if (!request) return res.status(404).json({ message: 'Product request not found' });
    return res.json({ productRequest: normalizeProduct(request) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/product-requests/:id/approve (manager, admin)
router.post('/:id/approve', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await ProductRequest.findById(id);
    if (!request) return res.status(404).json({ message: 'Product request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    // Check if SKU exists
    const existingProduct = await Product.findOne({ sku: request.sku });
    if (existingProduct) {
      return res.status(409).json({ message: 'sku already exists in Products' });
    }

    // Create product
    const newProduct = await Product.create({
      category_id: request.category_id,
      name: request.name,
      sku: request.sku,
      barcode: request.barcode,
      cost_price: request.cost_price,
      sale_price: request.sale_price,
      stock_qty: request.stock_qty,
      reorder_level: request.reorder_level,
      base_unit: request.base_unit,
      selling_units: request.selling_units,
      status: 'active'
    });

    // Update request status
    request.status = 'approved';
    request.approved_by = req.user.id;
    request.updated_at = new Date();
    await request.save();

    return res.json({ message: 'Product approved and created successfully', product: normalizeProduct(newProduct.toObject()) });
  } catch (err) {
    console.error('Approve error:', err);
    return res.status(500).json({ message: 'Server error during approval' });
  }
});

// POST /api/product-requests/:id/reject (manager, admin)
router.post('/:id/reject', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await ProductRequest.findById(id);
    if (!request) return res.status(404).json({ message: 'Product request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    // Update request status
    request.status = 'rejected';
    request.approved_by = req.user.id;
    request.updated_at = new Date();
    await request.save();

    return res.json({ message: 'Product request rejected successfully', productRequest: normalizeProduct(request.toObject()) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
