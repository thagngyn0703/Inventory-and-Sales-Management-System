const express = require('express');
const mongoose = require('mongoose');
const Stocktake = require('../models/Stocktake');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/stocktakes — Create stocktaking record (draft). Warehouse, Manager, Admin.
// Body: { warehouse_id?: ObjectId, product_ids: [ObjectId] }
// Snapshot current system_qty for each product; actual_qty/variance filled later.
router.post('/', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { warehouse_id, product_ids } = req.body || {};
    const ids = Array.isArray(product_ids) ? product_ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ message: 'product_ids (array) is required and must not be empty' });
    }
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ message: 'No valid product ids provided' });
    }

    const products = await Product.find({ _id: { $in: validIds } }).lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const items = validIds.map((id) => {
      const p = productMap.get(String(id));
      const system_qty = p != null && typeof p.stock_qty === 'number' ? p.stock_qty : 0;
      return {
        product_id: id,
        system_qty,
        actual_qty: null,
        variance: null,
        reason: '',
      };
    });

    const doc = await Stocktake.create({
      warehouse_id: warehouse_id && mongoose.isValidObjectId(warehouse_id) ? warehouse_id : undefined,
      created_by: req.user.id,
      status: 'draft',
      snapshot_at: new Date(),
      items,
    });

    const populated = await Stocktake.findById(doc._id)
      .populate('items.product_id', 'name sku base_unit')
      .populate('created_by', 'email')
      .lean();

    return res.status(201).json({ stocktake: populated });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stocktakes?page=1&limit=20&status= — List stocktakes. Warehouse, Manager, Admin.
router.get('/', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = {};
    if (status && ['draft', 'submitted', 'completed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const total = await Stocktake.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const list = await Stocktake.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('created_by', 'email')
      .populate('warehouse_id', 'name')
      .lean();

    return res.json({
      stocktakes: list,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/stocktakes/:id — Get one stocktake with items and product details.
router.get('/:id', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid stocktake id' });
    }
    const stocktake = await Stocktake.findById(id)
      .populate('items.product_id', 'name sku base_unit stock_qty')
      .populate('created_by', 'email')
      .populate('warehouse_id', 'name')
      .lean();
    if (!stocktake) return res.status(404).json({ message: 'Stocktake not found' });
    return res.json({ stocktake });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
