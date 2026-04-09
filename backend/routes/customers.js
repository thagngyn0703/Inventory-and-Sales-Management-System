const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function assertStoreScope(req, res) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return true;
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) {
        res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        return false;
    }
    return true;
}

// GET /api/customers - List/Search customers (Scoped by Store)
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { searchKey, status, is_regular, limit = 50 } = req.query;
        const filter = {};

        // Only admins see all; others filtered by store
        const userRole = String(req.user?.role || '').toLowerCase();
        if (req.user.storeId && userRole !== 'admin') {
            filter.store_id = req.user.storeId;
        }

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

// POST /api/customers - Create a new customer (Attach Store ID)
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { full_name, phone, email, address, is_regular, credit_limit } = req.body;
        
        if (!full_name || !full_name.trim()) {
            return res.status(400).json({ message: 'Tên khách hàng là bắt buộc' });
        }
        
        const tel = phone ? phone.trim().replace(/\s/g, '') : '';
        if (tel && (tel.length < 10 || tel.length > 11)) {
            return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
        }

        // Check uniqueness within the same store
        const userStoreId = req.user.storeId || null;
        if (tel) {
            const existing = await Customer.findOne({ phone: tel, store_id: userStoreId });
            if (existing) {
                return res.status(400).json({ message: 'Số điện thoại này đã tồn tại trong cửa hàng của bạn' });
            }
        }

        const customer = new Customer({
            full_name: full_name.trim(),
            phone: tel,
            email: email ? email.trim() : '',
            address: address ? address.trim() : '',
            is_regular: Boolean(is_regular),
            credit_limit: Number(credit_limit) || 0,
            store_id: userStoreId
        });
        
        await customer.save();
        res.status(201).json({ customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi tạo khách hàng' });
    }
});

// PATCH /api/customers/:id - Update customer info
router.patch('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        const { full_name, phone, email, address, is_regular, debt_account } = req.body;

        const findQuery = { _id: id };
        // Role-based scoping
        const userRole = String(req.user?.role || '').toLowerCase();
        if (req.user.storeId && userRole !== 'admin') {
            findQuery.store_id = req.user.storeId;
        }

        const updateData = {};
        if (full_name) updateData.full_name = full_name.trim();
        if (phone !== undefined) {
            const tel = phone.trim().replace(/\s/g, '');
            if (tel && (tel.length < 10 || tel.length > 11)) {
                return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
            }
            // Ensure unique in same store when updating phone
            const duplicate = await Customer.findOne({ phone: tel, store_id: req.user.storeId, _id: { $ne: id } });
            if (duplicate) {
                return res.status(400).json({ message: 'Số điện thoại này đã tồn tại trong cửa hàng của bạn' });
            }
            updateData.phone = tel;
        }
        if (email !== undefined) updateData.email = email.trim();
        if (address !== undefined) updateData.address = address.trim();
        if (is_regular !== undefined) updateData.is_regular = Boolean(is_regular);
        if (debt_account !== undefined && !isNaN(Number(debt_account))) {
            updateData.debt_account = Math.max(0, Number(debt_account));
        }

        updateData.updated_at = new Date();
        
        const customer = await Customer.findOneAndUpdate(findQuery, { $set: updateData }, { new: true });
        if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });

        res.json({ message: 'Cập nhật thành công', customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// POST /api/customers/:id/pay-debt - Pay customer debt
router.post('/:id/pay-debt', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        const { amount, payment_method = 'cash' } = req.body;
        
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }

        const findQuery = { _id: id };
        const userRole = String(req.user?.role || '').toLowerCase();
        if (req.user.storeId && userRole !== 'admin') {
            findQuery.store_id = req.user.storeId;
        }

        const customer = await Customer.findOne(findQuery);
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });
        }
        
        const payAmount = Number(amount) || 0;
        if (payAmount <= 0) {
            return res.status(400).json({ message: 'Số tiền thanh toán phải lớn hơn 0' });
        }
        
        const previousDebt = customer.debt_account || 0;
        customer.debt_account = Math.max(0, previousDebt - payAmount);
        customer.updated_at = new Date();
        await customer.save();

        // FIFO settlement: Match payment with pending debt invoices (also scoped by store)
        try {
            const SalesInvoice = require('../models/SalesInvoice');
            const pendingInvoices = await SalesInvoice.find({ 
              customer_id: id, 
              status: 'pending', 
              payment_method: 'debt',
              store_id: req.user.storeId 
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
                store_id: req.user.storeId,
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
