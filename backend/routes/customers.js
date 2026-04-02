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
router.patch('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, phone, email, address, is_regular, debt_account } = req.body;

        const updateData = {};
        if (full_name) updateData.full_name = full_name.trim();
        if (phone !== undefined) {
            const tel = phone.trim().replace(/\s/g, '');
            if (tel && (tel.length < 10 || tel.length > 11)) {
                return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
            }
            updateData.phone = tel;
        }
        if (email !== undefined) updateData.email = email.trim();
        if (address !== undefined) updateData.address = address.trim();
        if (is_regular !== undefined) updateData.is_regular = Boolean(is_regular);
        if (debt_account !== undefined && !isNaN(Number(debt_account))) {
            updateData.debt_account = Number(debt_account);
        }

        updateData.updated_at = new Date();
        
        const customer = await Customer.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });

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
router.post('/:id/pay-debt', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
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

        // FIFO settlement: Match payment with pending debt invoices
        try {
            const SalesInvoice = require('../models/SalesInvoice');
            const pendingInvoices = await SalesInvoice.find({ 
              customer_id: id, 
              status: 'pending', 
              payment_method: 'debt' 
            }).sort({ created_at: 1 }); // Oldest first

            let unallocated = payAmount;
            for (const invoice of pendingInvoices) {
              if (unallocated <= 0) break;
              
              if (unallocated >= invoice.total_amount) {
                // Fully pay this invoice
                invoice.status = 'confirmed';
                invoice.payment_status = 'paid';
                invoice.paid_at = new Date();
                await invoice.save();
                unallocated -= invoice.total_amount;
              } else {
                // Partial payment for the remaining unallocated amount? 
                // We don't have a partial payment state per invoice, so we stop here.
                // Or maybe we just mark it confirmed but unpaid if it's partial? 
                // Currently, we only mark as paid if fully covered.
                break;
              }
            }
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
