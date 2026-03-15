const express = require('express');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole(['manager', 'warehouse', 'admin']), async (req, res) => {
    try {
        const suppliers = await Supplier.find({ status: 'active' }).sort({ name: 1 }).lean();
        res.json({ suppliers });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
