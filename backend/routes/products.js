const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// POST /api/products  (user, admin)
router.post('/', requireAuth, requireRole(['user', 'admin']), async (req, res) => {
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
      status,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ message: 'sku is required' });
    }

    const doc = await Product.create({
      category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
      name: String(name).trim(),
      sku: String(sku).trim(),
      barcode: barcode ? String(barcode).trim() : undefined,
      cost_price: Number(cost_price || 0),
      sale_price: Number(sale_price || 0),
      stock_qty: Number(stock_qty || 0),
      reorder_level: Number(reorder_level || 0),
      status: status === 'inactive' ? 'inactive' : 'active',
    });

    return res.status(201).json({ product: doc });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products?q=...  (user, admin)
router.get('/', requireAuth, requireRole(['user', 'admin']), async (req, res) => {
  try {
    const { q = '' } = req.query;
    const query = String(q || '').trim();

    const filter = {};
    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }

    const products = await Product.find(filter).sort({ created_at: -1 }).lean();
    return res.json({ products });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

