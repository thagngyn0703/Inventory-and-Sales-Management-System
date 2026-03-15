const express = require('express');
const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function computeLineTotal({ quantity, unit_price, discount }) {
    const qty = Number(quantity) || 0;
    const price = Number(unit_price) || 0;
    const disc = Number(discount) || 0;
    const subtotal = qty * price;
    const total = Math.max(0, subtotal - disc);
    return total;
}

function calculateInvoiceTotals(items = []) {
    let totalAmount = 0;
    const normalizedItems = (items || []).map((item) => {
        const product_id = normalizeId(item.product_id);
        const quantity = Number(item.quantity) || 0;
        const unit_price = Number(item.unit_price) || 0;
        const discount = Number(item.discount) || 0;
        const line_total = computeLineTotal({ quantity, unit_price, discount });
        totalAmount += line_total;
        return { product_id, quantity, unit_price, discount, line_total };
    });
    return { totalAmount, items: normalizedItems };
}

function normalizeId(val) {
    if (!val) return null;
    if (typeof val === 'object' && val !== null) {
        if (val._id) return String(val._id);
        if (val.id) return String(val.id);
        return null;
    }
    const str = String(val);
    // Avoid the common mistake where an object is coerced to "[object Object]"
    if (str === '[object Object]' || str.startsWith('[object')) return null;
    return str;
}

function buildStockAvailability(items, productsById) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        const prod = productsById.get(normalizeId(item.product_id));
        const available = prod ? (prod.stock_qty ?? 0) >= (item.quantity ?? 0) : false;
        return {
            ...item,
            stock_qty: prod ? prod.stock_qty : null,
            in_stock: available,
        };
    });
}

// POST /api/invoices — create a draft outbound invoice
router.post('/', requireAuth, requireRole(['sales', 'warehouse', 'manager', 'admin']), async (req, res) => {
    try {
        const { customer_id, items, payment_method } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'items (array) is required' });
        }

        const { totalAmount, items: normalizedItems } = calculateInvoiceTotals(items);
        const invalidLine = normalizedItems.find((it) => !it.product_id);
        if (invalidLine) {
            return res.status(400).json({ message: 'Mỗi dòng phải có sản phẩm hợp lệ' });
        }

        const invoice = await SalesInvoice.create({
            customer_id,
            created_by: req.user.id,
            status: 'draft',
            payment_method: payment_method || 'cash',
            items: normalizedItems,
            total_amount: totalAmount,
        });

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();

        return res.status(201).json({ invoice: populated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/invoices?page=&limit=&status=
router.get('/', requireAuth, requireRole(['sales', 'warehouse', 'manager', 'admin']), async (req, res) => {
    try {
        const { page = '1', limit = '20', status } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const filter = {};
        if (status && ['draft', 'submitted', 'confirmed', 'paid', 'cancelled'].includes(status)) {
            filter.status = status;
        }

        const total = await SalesInvoice.countDocuments(filter);
        const skip = (pageNum - 1) * limitNum;
        const list = await SalesInvoice.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .lean();

        // Add availability info for each invoice's items
        const productIds = new Set();
        list.forEach((inv) => {
            (inv.items || []).forEach((item) => {
                const pid = normalizeId(item.product_id);
                if (pid) productIds.add(pid);
            });
        });
        const products = await Product.find({ _id: { $in: Array.from(productIds) } }).lean();
        const productsById = new Map(products.map((p) => [String(p._id), p]));

        const invoicesWithStock = list.map((inv) => ({
            ...inv,
            items: buildStockAvailability(inv.items, productsById),
        }));

        return res.json({
            invoices: invoicesWithStock,
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

// GET /api/invoices/:id
router.get('/:id', requireAuth, requireRole(['sales', 'warehouse', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const productIds = (invoice.items || [])
            .map((item) => normalizeId(item.product_id))
            .filter(Boolean);
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        const productsById = new Map(products.map((p) => [String(p._id), p]));
        invoice.items = buildStockAvailability(invoice.items, productsById);

        return res.json({ invoice });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// PATCH /api/invoices/:id — update draft (only when status is draft)
router.patch('/:id', requireAuth, requireRole(['sales', 'warehouse', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.status !== 'draft') {
            return res.status(400).json({ message: 'Chỉ có thể chỉnh sửa hóa đơn ở trạng thái draft' });
        }

        const { customer_id, items, status: requestedStatus } = req.body || {};
        if (customer_id) invoice.customer_id = customer_id;

        if (Array.isArray(items) && items.length > 0) {
            const { totalAmount, items: normalizedItems } = calculateInvoiceTotals(items);
            const invalidLine = normalizedItems.find((it) => !it.product_id);
            if (invalidLine) {
                return res.status(400).json({ message: 'Mỗi dòng phải có sản phẩm hợp lệ' });
            }
            invoice.items = normalizedItems;
            invoice.total_amount = totalAmount;
        }

        if (requestedStatus === 'submitted') {
            invoice.status = 'submitted';
        }

        invoice.updated_at = new Date();
        await invoice.save();

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();

        const productIds = (populated.items || []).map((item) => String(item.product_id));
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        const productsById = new Map(products.map((p) => [String(p._id), p]));
        populated.items = buildStockAvailability(populated.items, productsById);

        return res.json({ invoice: populated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/invoices/:id/approve — manager/admin approves (deducts stock)
router.post('/:id/approve', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.status !== 'submitted') {
            return res.status(400).json({ message: 'Chỉ có thể phê duyệt hóa đơn đang ở trạng thái submitted' });
        }

        // Check stock availability
        const productIds = invoice.items
            .map((item) => normalizeId(item.product_id))
            .filter(Boolean);
        const products = await Product.find({ _id: { $in: productIds } });
        const productMap = new Map(products.map((p) => [String(p._id), p]));
        const problems = [];
        invoice.items.forEach((item) => {
            const pid = normalizeId(item.product_id);
            const product = pid ? productMap.get(pid) : null;
            const needed = item.quantity || 0;
            const available = product ? product.stock_qty || 0 : 0;
            if (!product) {
                problems.push({ product_id: item.product_id, message: 'Sản phẩm không tồn tại' });
            } else if (available < needed) {
                problems.push({
                    product_id: item.product_id,
                    message: `Không đủ tồn kho: cần ${needed}, còn ${available}`,
                });
            }
        });
        if (problems.length > 0) {
            return res.status(400).json({ message: 'Không đủ tồn kho để phê duyệt', problems });
        }

        // Deduct stock
        const bulkOps = products.map((product) => {
            const line = invoice.items.find((it) => normalizeId(it.product_id) === String(product._id));
            if (!line) return null;
            const decrement = -Math.abs(line.quantity || 0);
            return {
                updateOne: {
                    filter: { _id: product._id },
                    update: { $inc: { stock_qty: decrement } },
                },
            };
        }).filter(Boolean);

        if (bulkOps.length > 0) {
            await Product.bulkWrite(bulkOps);
        }

        invoice.status = 'confirmed';
        invoice.updated_at = new Date();
        await invoice.save();

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();

        const productIds2 = (populated.items || [])
            .map((item) => normalizeId(item.product_id))
            .filter(Boolean);
        const products2 = await Product.find({ _id: { $in: productIds2 } }).lean();
        const productsById2 = new Map(products2.map((p) => [String(p._id), p]));
        populated.items = buildStockAvailability(populated.items, productsById2);

        return res.json({ invoice: populated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/invoices/:id/reject — manager/admin rejects (cancels)
router.post('/:id/reject', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.status !== 'submitted') {
            return res.status(400).json({ message: 'Chỉ có thể từ chối hóa đơn đang ở trạng thái submitted' });
        }
        invoice.status = 'cancelled';
        invoice.updated_at = new Date();
        await invoice.save();
        return res.json({ invoice });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/invoices/:id/cancel — allow creator to cancel before approval
router.post('/:id/cancel', requireAuth, requireRole(['sales', 'warehouse', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (!['draft', 'submitted'].includes(invoice.status)) {
            return res.status(400).json({ message: 'Chỉ có thể hủy hóa đơn khi ở trạng thái draft hoặc submitted' });
        }
        // Only creator or manager/admin can cancel
        const allowCancel = invoice.created_by.toString() === req.user.id || ['manager', 'admin'].includes(req.user.role);
        if (!allowCancel) {
            return res.status(403).json({ message: 'Không có quyền hủy hóa đơn' });
        }
        invoice.status = 'cancelled';
        invoice.updated_at = new Date();
        await invoice.save();
        return res.json({ invoice });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
