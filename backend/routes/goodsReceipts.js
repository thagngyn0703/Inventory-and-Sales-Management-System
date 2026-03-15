const express = require('express');
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all receipts
router.get('/', requireAuth, requireRole(['manager', 'warehouse', 'admin']), async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status) filter.status = status;
        const receipts = await GoodsReceipt.find(filter)
            .sort({ created_at: -1 })
            .populate('supplier_id', 'name phone email')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email');
        res.json({ goodsReceipts: receipts });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get a single receipt
router.get('/:id', requireAuth, requireRole(['manager', 'warehouse', 'admin']), async (req, res) => {
    try {
        const receipt = await GoodsReceipt.findById(req.params.id)
            .populate('supplier_id', 'name phone email address')
            .populate('received_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku base_unit');
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        res.json({ goodsReceipt: receipt });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Create a new receipt (draft or pending)
router.post('/', requireAuth, requireRole(['warehouse', 'admin']), async (req, res) => {
    try {
        const { supplier_id, reason, status = 'draft', items, total_amount } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'Items cannot be empty' });
        }

        const receipt = new GoodsReceipt({
            supplier_id,
            reason,
            status,
            items,
            total_amount,
            received_by: req.user.id
        });

        await receipt.save();
        res.status(201).json({ goodsReceipt: receipt, message: 'Receipt created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update a draft receipt
router.put('/:id', requireAuth, requireRole(['warehouse', 'admin']), async (req, res) => {
    try {
        const { supplier_id, reason, items, total_amount, status } = req.body;
        const receipt = await GoodsReceipt.findById(req.params.id);
        
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        if (receipt.status === 'approved') return res.status(400).json({ message: 'Cannot edit an approved receipt' });

        receipt.supplier_id = supplier_id || receipt.supplier_id;
        receipt.reason = reason !== undefined ? reason : receipt.reason;
        receipt.items = items || receipt.items;
        receipt.total_amount = total_amount !== undefined ? total_amount : receipt.total_amount;
        if (status) receipt.status = status;

        await receipt.save();
        res.json({ goodsReceipt: receipt, message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Change status (manager approves/rejects)
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status update' });
        }

        const receipt = await GoodsReceipt.findById(req.params.id);
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        if (receipt.status === 'approved') return res.status(400).json({ message: 'Receipt is already approved' });

        receipt.status = status;
        if (status === 'approved') {
            receipt.approved_by = req.user.id;
            
            // Update stock quantities
            for (const item of receipt.items) {
                const ratio = item.ratio || 1;
                await Product.findByIdAndUpdate(item.product_id, {
                    $inc: { stock_qty: item.quantity * ratio }
                });
            }
        }

        await receipt.save();
        res.json({ goodsReceipt: receipt, message: `Receipt ${status} successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
