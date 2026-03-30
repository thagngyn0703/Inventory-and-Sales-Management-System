const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/customers - List/Search customers
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { searchKey, status, is_regular, limit = 50 } = req.query;
        const filter = {};

        if (status) filter.status = status;
        if (is_regular !== undefined) filter.is_regular = is_regular === 'true';
        
        if (searchKey) {
            filter.$or = [
                { phone: { $regex: searchKey, $options: 'i' } },
                { full_name: { $regex: searchKey, $options: 'i' } },
                { email: { $regex: searchKey, $options: 'i' } }
            ];
        }

        const customers = await Customer.find(filter)
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .lean();

        res.json({ customers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// POST /api/customers - Create a new customer
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { full_name, phone, email, address, is_regular, credit_limit } = req.body;
        
        if (!full_name || !full_name.trim()) {
            return res.status(400).json({ message: 'Tên khách hàng là bắt buộc' });
        }
        
        const customer = new Customer({
            full_name: full_name.trim(),
            phone: phone ? phone.trim() : '',
            email: email ? email.trim() : '',
            address: address ? address.trim() : '',
            is_regular: Boolean(is_regular),
            credit_limit: Number(credit_limit) || 0,
        });
        
        await customer.save();
        res.status(201).json({ customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi tạo khách hàng' });
    }
});

module.exports = router;
