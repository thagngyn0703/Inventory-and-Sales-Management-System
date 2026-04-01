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
        
        const tel = phone ? phone.trim().replace(/\s/g, '') : '';
        if (tel && (tel.length < 10 || tel.length > 11)) {
            return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
        }

        const customer = new Customer({
            full_name: full_name.trim(),
            phone: tel,
            email: email ? email.trim() : '',
            address: address ? address.trim() : '',
            is_regular: Boolean(is_regular),
            credit_limit: Number(credit_limit) || 0,
        });
        
        await customer.save();
        res.status(201).json({ customer });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Số điện thoại này đã tồn tại trong hệ thống' });
        }
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi tạo khách hàng' });
    }
});

// PATCH /api/customers/:id - Update customer info
router.patch('/:id', requireAuth, requireRole(['sales', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, phone, email, address, is_regular, debt_account } = req.body;

        const customer = await Customer.findById(id);
        if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });

        if (full_name) customer.full_name = full_name.trim();
        if (phone !== undefined) {
            const tel = phone.trim().replace(/\s/g, '');
            if (tel && (tel.length < 10 || tel.length > 11)) {
                return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
            }
            customer.phone = tel;
        }
        if (email !== undefined) customer.email = email.trim();
        if (address !== undefined) customer.address = address.trim();
        if (is_regular !== undefined) customer.is_regular = Boolean(is_regular);
        if (debt_account !== undefined) customer.debt_account = Number(debt_account);

        customer.updated_at = new Date();
        await customer.save();
        res.json({ message: 'Cập nhật thành công', customer });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Số điện thoại này đã tồn tại trong hệ thống' });
        }
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// POST /api/customers/:id/pay-debt - Pay customer debt
router.post('/:id/pay-debt', requireAuth, requireRole(['sales', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, payment_method = 'cash' } = req.body;
        
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }
        
        const payAmount = Number(amount) || 0;
        if (payAmount <= 0) {
            return res.status(400).json({ message: 'Số tiền thanh toán phải lớn hơn 0' });
        }
        
        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
        }
        
        const previousDebt = customer.debt_account || 0;
        customer.debt_account = Math.max(0, previousDebt - payAmount);
        customer.updated_at = new Date();
        await customer.save();

        // When debt is fully (or partially) paid, update pending invoices to confirmed
        try {
            const SalesInvoice = require('../models/SalesInvoice');
            const updatedInvoices = await SalesInvoice.updateMany(
                { customer_id: id, status: 'pending', payment_method: 'debt' },
                { $set: { status: 'confirmed', updated_at: new Date() } }
            );
            console.log(`[pay-debt] Updated ${updatedInvoices.modifiedCount} pending invoices to confirmed for customer ${id}`);
        } catch (invoiceErr) {
            console.error('Invoice status update error:', invoiceErr);
        }

        // Create transaction audit log
        try {
            const AuditLog = require('../models/AuditLog');
            await AuditLog.create({
                user_id: req.user.id,
                action: `Thu nợ khách hàng ${customer.full_name}: ${payAmount.toLocaleString('vi-VN')}₫ (${payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'})`,
                entity: 'Customer',
                entity_id: customer._id,
                ip_address: req.ip
            });
        } catch (auditErr) {
            console.error('Audit Log Error:', auditErr);
        }
        
        res.json({ message: `Thanh toán nợ thành công bằng ${payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}`, customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi thanh toán nợ' });
    }
});

module.exports = router;
