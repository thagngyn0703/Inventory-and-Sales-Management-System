const express = require('express');
const Category = require('../models/Category');
const { verifyToken, requireManagerOrAdminOrWarehouse } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply JWT verification to all routes
router.use(verifyToken);

// GET /api/categories - list categories (optionally include inactive via query)
router.get('/', requireManagerOrAdminOrWarehouse, async (req, res) => {
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
router.post('/', requireManagerOrAdminOrWarehouse, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Tên danh mục không được để trống' });
        }
        const normalized = name.trim();
        // check duplicate
        const exists = await Category.findOne({ name: new RegExp(`^${normalized}$`, 'i') });
        if (exists) {
            return res.status(400).json({ message: 'Danh mục đã tồn tại' });
        }
        const cat = await Category.create({ name: normalized });
        res.status(201).json(cat);
    } catch (err) {
        console.error('Failed to create category', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/categories/:id - update name
router.put('/:id', requireManagerOrAdminOrWarehouse, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Tên danh mục không được để trống' });
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
        await cat.save();
        res.json(cat);
    } catch (err) {
        console.error('Failed to update category', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /api/categories/:id/activate - set active or inactive
router.patch('/:id/activate', requireManagerOrAdminOrWarehouse, async (req, res) => {
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