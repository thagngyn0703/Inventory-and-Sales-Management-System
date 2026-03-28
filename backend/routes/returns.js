const express = require('express');
const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/returns — list returns for the user's store
router.get('/', requireAuth, requireRole(['sales', 'manager', 'admin']), async (req, res) => {
    try {
        const { page = '1', limit = '50', status } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const filter = {};

        const userRole = String(req.user?.role || '').toLowerCase();
        if (req.user.storeId && userRole !== 'admin') {
            filter.store_id = req.user.storeId;
        }
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            filter.status = status;
        }

        const total = await SalesReturn.countDocuments(filter);
        const skip = (pageNum - 1) * limitNum;
        const returns = await SalesReturn.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('invoice_id', '_id recipient_name total_amount invoice_at')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({
            returns,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/returns — create a return receipt
router.post('/', requireAuth, requireRole(['sales', 'manager', 'admin']), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { invoice_id, items: reqItems, reason } = req.body || {};

        if (!invoice_id || !reqItems || reqItems.length === 0) {
            return res.status(400).json({ message: 'invoice_id and items are required' });
        }

        // 1. Check original invoice
        const invoice = await SalesInvoice.findById(invoice_id).populate('customer_id');
        if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn gốc' });

        // Store ownership check
        const userRole = String(req.user?.role || '').toLowerCase();
        if (userRole !== 'admin' && req.user.storeId && invoice.store_id && String(invoice.store_id) !== String(req.user.storeId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Không có quyền trả hàng cho hóa đơn này' });
        }

        let returnItems = [];
        let firstSupplierId = null;

        for (const it of reqItems) {
            const product = await Product.findById(it.product_id);
            if (!product) throw new Error(`Sản phẩm ${it.product_id} không tồn tại`);

            // 2. Identify supplier (from product)
            if (!firstSupplierId && product.supplier_id) {
                firstSupplierId = product.supplier_id;
            }
            
            returnItems.push({
                product_id: it.product_id,
                quantity: it.quantity,
                unit_price: it.unit_price || 0,
                disposition: 'restock'
            });

            // 4. Increase stock quantity
            product.stock_qty += it.quantity;
            await product.save({ session });
        }

        // 5. Create return receipt & Record return transaction
        const salesReturn = new SalesReturn({
            store_id: req.user.storeId || invoice.store_id || null,
            invoice_id,
            customer_id: invoice.customer_id?._id || invoice.customer_id || req.body.customer_id,
            created_by: req.user.id,
            warehouse_id: req.body.warehouse_id || invoice.warehouse_id || null,
            supplier_id: firstSupplierId,
            items: returnItems,
            reason: reason || 'Khách trả hàng',
            status: 'approved'
        });

        await salesReturn.save({ session });
        
        // 3. Mark the original invoice as cancelled (returned)
        invoice.status = 'cancelled';
        await invoice.save({ session });

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({ message: 'Trả hàng thành công', salesReturn });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Sales Return Error:', err);
        return res.status(500).json({ 
            message: err.message || 'Lỗi hệ thống khi thực hiện trả hàng',
            error: err.toString() 
        });
    }
});

module.exports = router;
