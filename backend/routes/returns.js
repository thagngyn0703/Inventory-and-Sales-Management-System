const express = require('express');
const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const SalesInvoice = require('../models/SalesInvoice');
const ShiftSession = require('../models/ShiftSession');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustCustomerDebtAccount } = require('../utils/customerDebt');
const { upsertSystemCashFlow } = require('../utils/cashflowUtils');
const { appendLoyaltyTxn, computeEarnedPoints, normalizeLoyaltySettings } = require('../utils/loyalty');

const router = express.Router();
const RETURN_REASON_OPTIONS = [
    { code: 'customer_changed_mind', label: 'Khách đổi ý' },
    { code: 'defective', label: 'Lỗi nhà sản xuất' },
    { code: 'expired', label: 'Hết hạn sử dụng' },
    { code: 'other', label: 'Lý do khác' },
];

function shouldLogServerError(err) {
    const status = Number(err?.status || 0);
    return !status || status >= 500;
}

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
function computeReturnTaxBreakdown(grossTotal, invoice, previousTotals = {}) {
    const gross = Number(grossTotal) || 0;
    const invoiceTotal = Number(invoice?.total_amount) || 0;
    const invoiceSubtotal = Number(invoice?.subtotal_amount);
    const invoiceTax = Number(invoice?.tax_amount) || 0;
    const previousGross = Number(previousTotals?.gross) || 0;
    const previousSubtotal = Number(previousTotals?.subtotal) || 0;
    const previousTax = Number(previousTotals?.tax) || 0;
    const hasNetSnapshot = Number.isFinite(invoiceSubtotal) && invoiceSubtotal >= 0 && invoiceTotal > 0;

    if (!hasNetSnapshot) {
        return {
            total_amount: gross,
            subtotal_amount: gross,
            tax_amount: 0,
            tax_rate_snapshot: Number(invoice?.tax_rate_snapshot) || 0,
        };
    }

    const ratio = invoiceSubtotal / invoiceTotal;
    const remainingGross = Math.max(0, invoiceTotal - previousGross);
    const remainingSubtotal = Math.max(0, invoiceSubtotal - previousSubtotal);
    const remainingTax = Math.max(0, invoiceTax - previousTax);

    // Nếu đây là phần hoàn cuối cùng, khóa số liệu về đúng snapshot còn lại
    if (gross >= remainingGross) {
        return {
            total_amount: gross,
            subtotal_amount: remainingSubtotal,
            tax_amount: gross - remainingSubtotal,
            tax_rate_snapshot: Number(invoice?.tax_rate_snapshot) || 0,
        };
    }

    let subtotal = Math.round(gross * ratio);
    subtotal = Math.min(Math.max(0, subtotal), remainingSubtotal);
    let tax = gross - subtotal;
    if (tax > remainingTax) {
        tax = remainingTax;
        subtotal = gross - tax;
    }
    return {
        total_amount: gross,
        subtotal_amount: subtotal,
        tax_amount: tax,
        tax_rate_snapshot: Number(invoice?.tax_rate_snapshot) || 0,
    };
}

async function applyApprovedReturn({
    salesReturn,
    invoice,
    actorId,
}) {
    const soldQtyMap = new Map();
    (invoice.items || []).forEach((item) => {
        const pid = item.product_id?._id?.toString() || item.product_id?.toString();
        const qty = Number(item.quantity) || 0;
        soldQtyMap.set(pid, (soldQtyMap.get(pid) || 0) + qty);
    });

    const approvedReturns = await SalesReturn.find({
        invoice_id: invoice._id,
        status: 'approved',
        _id: { $ne: salesReturn._id },
    }).select('items total_amount subtotal_amount tax_amount').lean();

    const returnedQtyMap = new Map();
    let previousReturnGross = 0;
    let previousReturnSubtotal = 0;
    let previousReturnTax = 0;
    for (const rt of approvedReturns) {
        previousReturnGross += Number(rt.total_amount) || 0;
        previousReturnSubtotal += Number(rt.subtotal_amount) || 0;
        previousReturnTax += Number(rt.tax_amount) || 0;
        (rt.items || []).forEach((item) => {
            const pid = item.product_id?.toString();
            if (!pid) return;
            const qty = Number(item.quantity) || 0;
            returnedQtyMap.set(pid, (returnedQtyMap.get(pid) || 0) + qty);
        });
    }

    let returnTotalAmount = 0;
    for (const item of salesReturn.items || []) {
        const pid = item.product_id?.toString();
        const reqQty = Number(item.quantity) || 0;
        const soldQty = soldQtyMap.get(pid) || 0;
        const alreadyReturnedQty = returnedQtyMap.get(pid) || 0;
        const remainingQty = soldQty - alreadyReturnedQty;
        if (soldQty === 0) {
            const err = new Error('[TC_INV_021] Product not in invoice (Sản phẩm không tồn tại trong hóa đơn bán hàng gốc)');
            err.status = 400;
            throw err;
        }
        if (reqQty > remainingQty) {
            const err = new Error(
                `[TC_INV_020] Return more than sold (Số lượng trả ${reqQty} vượt quá số lượng còn có thể trả ${remainingQty})`
            );
            err.status = 400;
            throw err;
        }

        const product = await Product.findById(pid);
        if (!product) {
            const err = new Error(`Không tìm thấy sản phẩm trong kho: ${pid}`);
            err.status = 400;
            throw err;
        }
        product.stock_qty = (Number(product.stock_qty) || 0) + reqQty;
        await product.save();

        returnTotalAmount += reqQty * (Number(item.unit_price) || 0);
    }

    const taxBreakdown = computeReturnTaxBreakdown(returnTotalAmount, invoice, {
        gross: previousReturnGross,
        subtotal: previousReturnSubtotal,
        tax: previousReturnTax,
    });

    salesReturn.total_amount = taxBreakdown.total_amount;
    salesReturn.subtotal_amount = taxBreakdown.subtotal_amount;
    salesReturn.tax_amount = taxBreakdown.tax_amount;
    salesReturn.tax_rate_snapshot = taxBreakdown.tax_rate_snapshot;
    salesReturn.status = 'approved';
    salesReturn.approved_by = actorId;
    salesReturn.approved_at = new Date();
    salesReturn.return_at = new Date();
    await salesReturn.save();

    const cumulativeReturnGross = previousReturnGross + returnTotalAmount;
    const cumulativeReturnSubtotal = previousReturnSubtotal + taxBreakdown.subtotal_amount;
    const cumulativeReturnTax = previousReturnTax + taxBreakdown.tax_amount;
    invoice.status = cumulativeReturnGross >= (Number(invoice.total_amount) || 0) ? 'cancelled' : 'confirmed';
    invoice.returned_total_amount = cumulativeReturnGross;
    invoice.returned_subtotal_amount = cumulativeReturnSubtotal;
    invoice.returned_tax_amount = cumulativeReturnTax;

    const loyaltyPointValue = Number(invoice?.loyalty_settings_snapshot?.redeem?.point_value_vnd || 500);
    const loyaltySettingsSnapshot = normalizeLoyaltySettings(invoice?.loyalty_settings_snapshot || {});
    const loyaltyEligibleOriginal = Math.max(0, Number(invoice.loyalty_eligible_amount || 0));
    const loyaltyEligibleRemaining = Math.max(0, loyaltyEligibleOriginal - cumulativeReturnGross);

    if (invoice.customer_id && invoice.loyalty_earned_settled && Number(invoice.loyalty_earned_points || 0) > 0) {
        const recomputedEarnedPoints = computeEarnedPoints({
            eligibleAmount: loyaltyEligibleRemaining,
            config: loyaltySettingsSnapshot,
        });
        const targetReversed = Math.max(0, Number(invoice.loyalty_earned_points || 0) - recomputedEarnedPoints);
        const alreadyReversed = Math.max(0, Number(invoice.loyalty_reversed_points || 0));
        const deltaReversed = targetReversed - alreadyReversed;
        if (deltaReversed > 0) {
            await appendLoyaltyTxn({
                customerId: invoice.customer_id,
                storeId: salesReturn.store_id,
                actorId,
                type: 'REVERSAL',
                points: -Math.abs(deltaReversed),
                valueVnd: deltaReversed * loyaltyPointValue,
                referenceModel: 'SalesReturn',
                referenceId: salesReturn._id,
                note: `Hoàn trả hàng một phần: thu hồi ${deltaReversed} điểm.`,
                idempotencyKey: `return-reversal-earn:${salesReturn._id}`,
            });
            invoice.loyalty_reversed_points = alreadyReversed + deltaReversed;
        }
    }

    if (invoice.customer_id && Number(invoice.loyalty_redeem_points || 0) > 0 && Number(invoice.loyalty_redeem_value || 0) > 0) {
        const totalAmount = Math.max(1, Number(invoice.total_amount || 0));
        const cumulativeRatio = Math.min(1, cumulativeReturnGross / totalAmount);
        const targetRefundValue = Math.round(Number(invoice.loyalty_redeem_value || 0) * cumulativeRatio);
        const targetRefundPoints = Math.min(
            Number(invoice.loyalty_redeem_points || 0),
            Math.floor(targetRefundValue / loyaltyPointValue)
        );
        const alreadyRefunded = Math.max(0, Number(invoice.loyalty_refunded_redeem_points || 0));
        const deltaRefund = targetRefundPoints - alreadyRefunded;
        if (deltaRefund > 0) {
            await appendLoyaltyTxn({
                customerId: invoice.customer_id,
                storeId: salesReturn.store_id,
                actorId,
                type: 'REFUND',
                points: deltaRefund,
                valueVnd: deltaRefund * loyaltyPointValue,
                referenceModel: 'SalesReturn',
                referenceId: salesReturn._id,
                note: `Hoàn điểm theo tỷ lệ trả hàng: +${deltaRefund} điểm.`,
                idempotencyKey: `return-refund-redeem:${salesReturn._id}`,
            });
            invoice.loyalty_refunded_redeem_points = alreadyRefunded + deltaRefund;
        }
    }

    await invoice.save();

    if (invoice.payment_method === 'debt') {
        const customerId = invoice.customer_id?._id || invoice.customer_id;
        if (customerId) {
            await adjustCustomerDebtAccount(customerId, -returnTotalAmount, {});
        }
    }
    const eligibleRefundMethods = ['cash', 'bank_transfer', 'card', 'credit'];
    if (
        invoice.payment_status === 'paid'
        && eligibleRefundMethods.includes(String(invoice.payment_method || '').toLowerCase())
        && Number(returnTotalAmount) > 0
    ) {
        await upsertSystemCashFlow({
            storeId: salesReturn.store_id,
            type: 'EXPENSE',
            category: 'SALES_RETURN',
            amount: returnTotalAmount,
            paymentMethod: invoice.payment_method,
            referenceModel: 'sales_return',
            referenceId: salesReturn._id,
            note: `Hoan tien tra hang #${String(salesReturn._id).slice(-6).toUpperCase()}`,
            actorId,
            transactedAt: salesReturn.approved_at || new Date(),
        });
    }
}

// GET /api/returns — list returns for the user's store
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { page = '1', limit = '50', status, sales_scope } = req.query;
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
        const salesScopeNorm = String(sales_scope || '').toLowerCase().trim();
        if (userRole === 'staff' && salesScopeNorm !== 'store' && req.user.storeId) {
            const myInvoiceIds = await SalesInvoice.distinct('_id', {
                store_id: req.user.storeId,
                created_by: req.user.id,
            });
            filter.invoice_id = { $in: myInvoiceIds };
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

// GET /api/returns/reasons — danh mục lý do trả hàng chuẩn hóa
router.get('/reasons', requireAuth, requireRole(['staff', 'manager', 'admin']), async (_req, res) => {
    return res.json({ reasons: RETURN_REASON_OPTIONS });
});

// GET /api/returns/:id — chi tiết một phiếu trả hàng
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'return id không hợp lệ' });
        }
        const salesReturn = await SalesReturn.findById(id)
            .populate('invoice_id')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();
        if (!salesReturn) {
            return res.status(404).json({ message: 'Không tìm thấy phiếu trả hàng.' });
        }
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin' && req.user.storeId && String(salesReturn.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền xem phiếu trả hàng này.' });
        }
        return res.json({ salesReturn });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/returns — trả hàng; luôn cộng số lượng trả lại vào tồn kho
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    if (!assertStoreScope(req, res)) return;
    const { invoice_id, items: reqItems, reason, reason_code } = req.body || {};

    if (!invoice_id) {
        return res.status(400).json({ message: '[TC_INV_018] invoice_id is required' });
    }
    if (!reqItems || reqItems.length === 0) {
        return res.status(400).json({ message: 'items are required' });
    }

    try {
        const invoice = await SalesInvoice.findById(invoice_id).populate('customer_id');
        if (!invoice) {
            return res.status(404).json({ message: '[TC_INV_019] Invoice not found (Không tìm thấy hóa đơn)' });
        }

        if (invoice.status === 'cancelled') {
            return res.status(400).json({ message: 'Hóa đơn này đã được hủy hoặc đã trả hàng trước đó.' });
        }

        const soldQtyMap = new Map();
        const soldGrossMap = new Map();
        (invoice.items || []).forEach((item) => {
            const pid = item.product_id?._id?.toString() || item.product_id?.toString();
            const qty = Number(item.quantity) || 0;
            const gross = Number(item.line_total) || 0;
            soldQtyMap.set(pid, (soldQtyMap.get(pid) || 0) + qty);
            soldGrossMap.set(pid, (soldGrossMap.get(pid) || 0) + gross);
        });

        const userRole = String(req.user?.role || '').toLowerCase();
        if (userRole !== 'admin' && req.user.storeId && invoice.store_id && String(invoice.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Access denied: different store' });
        }

        const reasonCode = reason_code || 'other';
        const isReasonCodeValid = RETURN_REASON_OPTIONS.some((item) => item.code === reasonCode);
        if (!isReasonCodeValid) {
            return res.status(400).json({ message: 'reason_code không hợp lệ.' });
        }

        const reqQtyMap = new Map();
        for (const it of reqItems) {
            const reqPid = it.product_id?.toString();
            const reqQty = Number(it.quantity) || 0;
            if (!reqPid || reqQty <= 0) {
                const err = new Error('Dữ liệu sản phẩm trả lại không hợp lệ.');
                err.status = 400;
                throw err;
            }
            reqQtyMap.set(reqPid, (reqQtyMap.get(reqPid) || 0) + reqQty);
        }

        let returnItems = [];
        let firstSupplierId = null;
        let returnTotalAmount = 0;
        const reqEntries = Array.from(reqQtyMap.entries());
        for (let idx = 0; idx < reqEntries.length; idx += 1) {
            const [reqPid, reqQty] = reqEntries[idx];
            const soldQty = soldQtyMap.get(reqPid) || 0;
            if (soldQty === 0) {
                const err = new Error('[TC_INV_021] Product not in invoice (Sản phẩm không tồn tại trong hóa đơn bán hàng gốc)');
                err.status = 400;
                throw err;
            }

            const product = await Product.findById(reqPid);
            if (!product) {
                const err = new Error(`Không tìm thấy sản phẩm trong kho: ${reqPid}`);
                err.status = 400;
                throw err;
            }

            if (!firstSupplierId && product.supplier_id) {
                firstSupplierId = product.supplier_id;
            }

            const soldGross = soldGrossMap.get(reqPid) || 0;
            const proportionalGross = Math.round((soldGross * reqQty) / soldQty);
            const lineGross = idx === reqEntries.length - 1 ? proportionalGross : proportionalGross;
            returnTotalAmount += lineGross;

            returnItems.push({
                product_id: reqPid,
                quantity: reqQty,
                // Snapshot đơn giá hoàn theo giá trị thực tế còn lại từ hóa đơn gốc
                unit_price: reqQty > 0 ? Number((lineGross / reqQty).toFixed(2)) : 0,
                disposition: 'restock',
            });
        }

        const initialStatus = 'approved';
        const taxBreakdown = {
            total_amount: returnTotalAmount,
            subtotal_amount: returnTotalAmount,
            tax_amount: 0,
            tax_rate_snapshot: Number(invoice?.tax_rate_snapshot) || 0,
        };

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
            reason_code: reasonCode,
            status: initialStatus,
        });

        await salesReturn.save();
        await applyApprovedReturn({
            salesReturn,
            invoice,
            actorId: req.user.id,
        });

        const populated = await SalesReturn.findById(salesReturn._id)
            .populate('invoice_id', '_id recipient_name total_amount invoice_at')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.status(201).json({
            message: 'Trả hàng thành công',
            salesReturn: populated,
            invoice_returned_totals: {
                returned_total_amount: invoice.returned_total_amount || 0,
                returned_subtotal_amount: invoice.returned_subtotal_amount || 0,
                returned_tax_amount: invoice.returned_tax_amount || 0,
            },
        });
    } catch (err) {
        if (shouldLogServerError(err)) {
            console.error('Sales Return Error:', err);
        }
        return res.status(err.status || 400).json({
            message: err.message || 'Lỗi hệ thống khi thực hiện trả hàng',
            error: err.toString(),
        });
    }
});

// POST /api/returns/:id/approve — Manager/Admin duyệt phiếu trả hàng pending
router.post('/:id/approve', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'return id không hợp lệ' });
        }
        const salesReturn = await SalesReturn.findById(id);
        if (!salesReturn) return res.status(404).json({ message: 'Không tìm thấy phiếu trả hàng.' });

        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin' && req.user.storeId && String(salesReturn.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền duyệt phiếu trả hàng này.' });
        }
        if (String(salesReturn.status) !== 'pending') {
            return res.status(409).json({ message: 'Phiếu trả hàng không ở trạng thái chờ duyệt.' });
        }

        const invoice = await SalesInvoice.findById(salesReturn.invoice_id).populate('customer_id');
        if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn gốc.' });
        if (invoice.status === 'cancelled') {
            return res.status(400).json({ message: 'Hóa đơn gốc đã hủy, không thể duyệt phiếu trả.' });
        }

        await applyApprovedReturn({
            salesReturn,
            invoice,
            actorId: req.user.id,
        });

        const populated = await SalesReturn.findById(salesReturn._id)
            .populate('invoice_id', '_id recipient_name total_amount invoice_at')
            .populate('created_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({
            message: 'Duyệt phiếu trả hàng thành công',
            salesReturn: populated,
        });
    } catch (err) {
        if (shouldLogServerError(err)) {
            console.error('Approve Return Error:', err);
        }
        return res.status(err.status || 400).json({
            message: err.message || 'Lỗi hệ thống khi duyệt trả hàng',
        });
    }
});

module.exports = router;
module.exports.computeReturnTaxBreakdown = computeReturnTaxBreakdown;
module.exports.RETURN_REASON_OPTIONS = RETURN_REASON_OPTIONS;
