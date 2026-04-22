const express = require('express');
const Category = require('../models/Category');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply JWT verification to all routes
router.use(requireAuth);

// GET /api/categories - list categories (optionally include inactive via query)
router.get('/', requireRole(['manager', 'staff', 'admin']), async (req, res) => {
    try {
        // allow ?all=true to return inactive too
        const filter = {};
        if (!req.query.all) {
            filter.is_active = true;
        }
        const categories = await Category.find(filter).sort({ created_at: -1 });
        res.json(categories);
    } catch (err) {
        console.error('Failed to fetch categories', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/categories - create new category
router.post('/', requireRole(['manager', 'staff', 'admin']), async (req, res) => {
    try {
        const { name, vat_rate } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Tên danh mục không được để trống' });
        }
        const vat = vat_rate === null || vat_rate === undefined || vat_rate === ''
            ? 0
            : Number(vat_rate);
        if (vat !== null && (!Number.isFinite(vat) || vat < 0 || vat > 100)) {
            return res.status(400).json({ message: 'VAT không hợp lệ (0-100)' });
        }
        const normalized = name.trim();
        // check duplicate
        const exists = await Category.findOne({ name: new RegExp(`^${normalized}$`, 'i') });
        if (exists) {
            return res.status(400).json({ message: 'Danh mục đã tồn tại' });
        }
        const cat = await Category.create({ name: normalized, vat_rate: vat });
        res.status(201).json(cat);
    } catch (err) {
        console.error('Failed to create category', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/categories/:id - update name
router.put('/:id', requireRole(['manager', 'staff', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, vat_rate } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Tên danh mục không được để trống' });
        }
        const vat = vat_rate === null || vat_rate === undefined || vat_rate === ''
            ? 0
            : Number(vat_rate);
        if (vat !== null && (!Number.isFinite(vat) || vat < 0 || vat > 100)) {
            return res.status(400).json({ message: 'VAT không hợp lệ (0-100)' });
        }
        const normalized = name.trim();
        const cat = await Category.findById(id);
        if (!cat) {
            return res.status(404).json({ message: 'Không tìm thấy danh mục' });
        }
        // check unique against others
        const conflict = await Category.findOne({
            _id: { $ne: id },
            name: new RegExp(`^${normalized}$`, 'i'),
        });
        if (conflict) {
            return res.status(400).json({ message: 'Tên danh mục đã được sử dụng' });
        }
        cat.name = normalized;
        if (vat_rate !== undefined) cat.vat_rate = vat;
        await cat.save();
        res.json(cat);
    } catch (err) {
        console.error('Failed to update category', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /api/categories/:id/activate - set active or inactive
router.patch('/:id/activate', requireRole(['manager', 'staff', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        let { is_active } = req.body;
        if (typeof is_active !== 'boolean') {
            // if value not provided, toggle
            const cat = await Category.findById(id);
            if (!cat) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
            is_active = !cat.is_active;
        }
        const updated = await Category.findByIdAndUpdate(
            id,
            { is_active },
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ message: 'Không tìm thấy danh mục' });
        }
        res.json(updated);
    } catch (err) {
        console.error('Failed to change active state', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;