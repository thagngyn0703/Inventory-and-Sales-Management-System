const express = require('express');
const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustCustomerDebtAccount } = require('../utils/customerDebt');

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

/**
 * Tính tách thuế cho trả hàng từ tổng hoàn (gross) dựa trên snapshot của hóa đơn gốc.
 * Phase 1: dùng tỷ lệ subtotal/total của hóa đơn để đảm bảo hoàn cả tiền hàng và VAT.
 */
function computeReturnTaxBreakdown(grossTotal, invoice) {
    const gross = Number(grossTotal) || 0;
    const invoiceTotal = Number(invoice?.total_amount) || 0;
    const invoiceSubtotal = Number(invoice?.subtotal_amount);
    const hasNetSnapshot = Number.isFinite(invoiceSubtotal) && invoiceSubtotal >= 0 && invoiceTotal > 0;
    const ratio = hasNetSnapshot ? invoiceSubtotal / invoiceTotal : 1;
    const subtotal = Math.round(gross * ratio);
    const tax = gross - subtotal;
    return {
        total_amount: gross,
        subtotal_amount: subtotal,
        tax_amount: tax,
        tax_rate_snapshot: Number(invoice?.tax_rate_snapshot) || 0,
    };
}

// GET /api/returns — list returns for the user's store
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
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

// POST /api/returns — trả hàng; luôn cộng số lượng trả lại vào tồn kho
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    if (!assertStoreScope(req, res)) return;
    const { invoice_id, items: reqItems, reason } = req.body || {};

    if (!invoice_id) {
        return res.status(400).json({ message: '[TC_INV_018] invoice_id is required' });
    }
    if (!reqItems || reqItems.length === 0) {
        return res.status(400).json({ message: 'items are required' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const invoice = await SalesInvoice.findById(invoice_id).populate('customer_id').session(session);
        if (!invoice) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: '[TC_INV_019] Invoice not found (Không tìm thấy hóa đơn)' });
        }

        if (invoice.status === 'cancelled') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Hóa đơn này đã được hủy hoặc đã trả hàng trước đó.' });
        }

        const soldItemsMap = new Map();
        (invoice.items || []).forEach((item) => {
            const pid = item.product_id?._id?.toString() || item.product_id?.toString();
            soldItemsMap.set(pid, (soldItemsMap.get(pid) || 0) + (item.quantity || 0));
        });

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
                const err = new Error(
                    `[TC_INV_020] Return more than sold (Số lượng trả ${reqQty} vượt quá số lượng đã mua ${soldQty})`
                );
                err.status = 400;
                throw err;
            }

            const product = await Product.findById(it.product_id).session(session);
            if (!product) {
                const err = new Error(`Không tìm thấy sản phẩm trong kho: ${it.product_id}`);
                err.status = 400;
                throw err;
            }

            if (!firstSupplierId && product.supplier_id) {
                firstSupplierId = product.supplier_id;
            }

            returnTotalAmount += (Number(it.unit_price) || 0) * reqQty;

            product.stock_qty = (Number(product.stock_qty) || 0) + reqQty;
            await product.save({ session });

            returnItems.push({
                product_id: it.product_id,
                quantity: reqQty,
                unit_price: it.unit_price || 0,
                disposition: 'restock',
            });
        }

        const taxBreakdown = computeReturnTaxBreakdown(returnTotalAmount, invoice);

        const salesReturn = new SalesReturn({
            store_id: req.user.storeId || invoice.store_id || null,
            invoice_id,
            customer_id: invoice.customer_id?._id || invoice.customer_id || req.body.customer_id,
            created_by: req.user.id,
            supplier_id: firstSupplierId,
            items: returnItems,
            total_amount: taxBreakdown.total_amount,
            subtotal_amount: taxBreakdown.subtotal_amount,
            tax_amount: taxBreakdown.tax_amount,
            tax_rate_snapshot: taxBreakdown.tax_rate_snapshot,
            reason: reason || 'Khách trả hàng',
            status: 'approved',
        });

        await salesReturn.save({ session });

        invoice.status = 'cancelled';
        await invoice.save({ session });

        if (invoice.payment_method === 'debt') {
            const customerId = invoice.customer_id?._id || invoice.customer_id;
            if (customerId) {
                await adjustCustomerDebtAccount(customerId, -returnTotalAmount, { session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        const populated = await SalesReturn.findById(salesReturn._id)
            .populate('invoice_id', '_id recipient_name total_amount invoice_at')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.status(201).json({
            message: 'Trả hàng thành công',
            salesReturn: populated,
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Sales Return Error:', err);
        return res.status(err.status || 400).json({
            message: err.message || 'Lỗi hệ thống khi thực hiện trả hàng',
            error: err.toString(),
        });
    }
});

module.exports = router;
module.exports.computeReturnTaxBreakdown = computeReturnTaxBreakdown;
