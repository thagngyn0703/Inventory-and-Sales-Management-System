const express = require('express');
const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/returns — list returns for the user's store
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
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
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { invoice_id, items: reqItems, reason } = req.body || {};

        if (!invoice_id) {
            return res.status(400).json({ message: '[TC_INV_018] invoice_id is required' });
        }
        if (!reqItems || reqItems.length === 0) {
            return res.status(400).json({ message: 'items are required' });
        }

        // 1. Check original invoice
        const invoice = await SalesInvoice.findById(invoice_id).populate('customer_id');
        if (!invoice) return res.status(404).json({ message: '[TC_INV_019] Invoice not found (Không tìm thấy hóa đơn)' });

        if (invoice.status === 'cancelled') {
            return res.status(400).json({ message: 'Hóa đơn này đã được hủy hoặc đã trả hàng trước đó.' });
        }

        // Build map of sold items: product_id -> quantity
        const soldItemsMap = new Map();
        (invoice.items || []).forEach(item => {
            const pid = item.product_id?._id?.toString() || item.product_id?.toString();
            soldItemsMap.set(pid, (soldItemsMap.get(pid) || 0) + (item.quantity || 0));
        });

        // Store ownership check
        const userRole = String(req.user?.role || '').toLowerCase();
        if (userRole !== 'admin' && req.user.storeId && invoice.store_id && String(invoice.store_id) !== String(req.user.storeId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Access denied: different store' });
        }

        let returnItems = [];
        let firstSupplierId = null;

        let returnTotalAmount = 0;

        for (const it of reqItems) {
            const reqPid = it.product_id?.toString();
            const reqQty = Number(it.quantity) || 0;

            if (!reqPid || reqQty <= 0) {
                const err = new Error('Dữ liệu sản phẩm trả lại không hợp lệ.');
                err.status = 400;
                throw err;
            }

            const soldQty = soldItemsMap.get(reqPid) || 0;
            if (soldQty === 0) {
                const err = new Error('[TC_INV_021] Product not in invoice (Sản phẩm không tồn tại trong hóa đơn bán hàng gốc)');
                err.status = 400;
                throw err;
            }
            if (reqQty > soldQty) {
                const err = new Error(`[TC_INV_020] Return more than sold (Số lượng trả ${reqQty} vượt quá số lượng đã mua ${soldQty})`);
                err.status = 400;
                throw err;
            }

            const product = await Product.findById(it.product_id);
            if (!product) {
                const err = new Error(`Không tìm thấy sản phẩm trong kho: ${it.product_id}`);
                err.status = 400;
                throw err;
            }

            // 2. Identify supplier (from product)
            if (!firstSupplierId && product.supplier_id) {
                firstSupplierId = product.supplier_id;
            }
            
            returnItems.push({
                product_id: it.product_id,
                quantity: reqQty,
                unit_price: it.unit_price || 0,
                disposition: 'restock'
            });

            returnTotalAmount += (it.unit_price || 0) * reqQty;

            // 4. Increase stock quantity
            product.stock_qty += reqQty;
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

        // Decrease customer debt if payment method was debt
        if (invoice.payment_method === 'debt') {
            const customerId = invoice.customer_id?._id || invoice.customer_id;
            if (customerId) {
                const Customer = mongoose.model('Customer');
                await Customer.findByIdAndUpdate(customerId, {
                    $inc: { debt_account: -returnTotalAmount }
                }, { session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({ message: 'Trả hàng thành công', salesReturn });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Sales Return Error:', err);
        return res.status(err.status || 400).json({ 
            message: err.message || 'Lỗi hệ thống khi thực hiện trả hàng',
            error: err.toString() 
        });
    }
});

module.exports = router;
