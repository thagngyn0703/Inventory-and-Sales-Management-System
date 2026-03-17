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
    if (typeof val === 'string') return val;
    // Handle Mongoose ObjectIds and objects
    const s = String(val?._id || val?.id || val);
    if (!s || s === '[object Object]' || s.startsWith('[object')) return null;
    return s;
}

async function checkStockAvailability(items) {
    if (!Array.isArray(items)) return [];
    const productIds = items
        .map((item) => normalizeId(item.product_id))
        .filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const problems = [];
    items.forEach((item) => {
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
    return problems;
}

async function adjustInventory(items, direction = -1) {
    if (!Array.isArray(items) || items.length === 0) return;
    const bulkOps = items.map((item) => {
        const pid = normalizeId(item.product_id);
        if (!pid) return null;
        const amount = Math.abs(item.quantity || 0) * direction;
        return {
            updateOne: {
                filter: { _id: pid },
                update: { $inc: { stock_qty: amount } },
            },
        };
    }).filter(Boolean);

    if (bulkOps.length > 0) {
        await Product.bulkWrite(bulkOps);
    }
}

async function syncInventory(invoice, nextStatus, nextItems = null) {
    const oldStatus = invoice.status;
    const saleStatuses = ['confirmed', 'paid'];
    const nonSaleStatuses = ['draft', 'submitted', 'cancelled'];

    const isOldSale = saleStatuses.includes(oldStatus);
    const isNextSale = saleStatuses.includes(nextStatus);
    const isNextNonSale = nonSaleStatuses.includes(nextStatus);

    console.log(`[syncInventory ${invoice._id}] Transition: ${oldStatus} -> ${nextStatus}`);

    // If manager is updating items in a sale-state invoice
    const itemsChanged = nextItems && JSON.stringify(nextItems) !== JSON.stringify(invoice.items);

    if (!isOldSale && isNextSale) {
        // Transitional Deduct: Non-Sale -> Sale
        console.log(`[syncInventory] Deducting next items`);
        const itemsToDeduct = nextItems || invoice.items;
        const problems = await checkStockAvailability(itemsToDeduct);
        if (problems.length > 0) throw { status: 400, message: 'Không đủ tồn kho', problems };
        await adjustInventory(itemsToDeduct, -1);
    } 
    else if (isOldSale && isNextNonSale) {
        // Transitional Restore: Sale -> Non-Sale
        console.log(`[syncInventory] Restoring old items`);
        await adjustInventory(invoice.items, 1);
    } 
    else if (isOldSale && isNextSale && itemsChanged) {
        // Item Update within Sale State: Restore Old, Deduct New
        console.log(`[syncInventory] Updating items in sale state. Restoring old and deducting new.`);
        const problems = await checkStockAvailability(nextItems);
        if (problems.length > 0) throw { status: 400, message: 'Không đủ tồn kho để cập nhật sản phẩm', problems };
        
        await adjustInventory(invoice.items, 1); // Restore old
        await adjustInventory(nextItems, -1); // Deduct new
    } else {
        console.log(`[syncInventory] No inventory adjustment needed`);
    }
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
        const { customer_id, items: reqItems, payment_method, recipient_name } = req.body || {};
        if (!Array.isArray(reqItems) || reqItems.length === 0) {
            return res.status(400).json({ message: 'items (array) is required' });
        }

        const { totalAmount, items: normalizedItems } = calculateInvoiceTotals(reqItems);
        const invalidLine = normalizedItems.find((it) => !it.product_id);
        if (invalidLine) {
            return res.status(400).json({ message: 'Mỗi dòng phải có sản phẩm hợp lệ' });
        }

        const status = (['confirmed', 'paid'].includes(req.body.status) && ['manager', 'admin'].includes(req.user.role)) 
            ? req.body.status 
            : 'draft';

        const invoice = new SalesInvoice({
            customer_id,
            recipient_name,
            created_by: req.user.id,
            status,
            payment_method: payment_method || 'cash',
            items: normalizedItems,
            total_amount: totalAmount,
        });

        // Use syncInventory to handle deduction if created as confirmed/paid
        try {
            await syncInventory(invoice, status, normalizedItems);
            await invoice.save();
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();

        const productIds = (populated.items || [])
            .map((item) => normalizeId(item.product_id))
            .filter(Boolean);
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        const productsById = new Map(products.map((p) => [String(p._id), p]));
        populated.items = buildStockAvailability(populated.items, productsById);

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

// PATCH /api/invoices/:id — update draft (warehouse, manager, admin)
router.patch('/:id', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        const oldStatus = invoice.status;
        const { customer_id, items: reqItems, status: requestedStatus, payment_method, recipient_name } = req.body || {};

        if (customer_id) invoice.customer_id = customer_id;
        if (recipient_name !== undefined) invoice.recipient_name = recipient_name;
        if (payment_method && ['cash', 'bank_transfer', 'credit', 'card'].includes(payment_method)) {
            invoice.set('payment_method', payment_method);
            invoice.markModified('payment_method');
        }

        let nextItems = null;
        if (Array.isArray(reqItems) && reqItems.length > 0) {
            const { totalAmount, items: normalizedItems } = calculateInvoiceTotals(reqItems);
            const invalidLine = normalizedItems.find((it) => !it.product_id);
            if (invalidLine) {
                return res.status(400).json({ message: 'Mỗi dòng phải có sản phẩm hợp lệ' });
            }
            nextItems = normalizedItems;
            // Note: Don't update invoice.items/total_amount yet, syncInventory needs the old items
        }

        let nextStatus = oldStatus;
        if (requestedStatus) {
            if (['manager', 'admin'].includes(req.user.role)) {
                const validStatuses = ['draft', 'submitted', 'confirmed', 'paid', 'cancelled'];
                if (validStatuses.includes(requestedStatus)) {
                    nextStatus = requestedStatus;
                }
            } else if (requestedStatus === 'submitted') {
                nextStatus = 'submitted';
            }
        }

        try {
            await syncInventory(invoice, nextStatus, nextItems);
            
            if (nextItems) {
                invoice.items = nextItems;
                const { totalAmount } = calculateInvoiceTotals(nextItems);
                invoice.total_amount = totalAmount;
            }
            invoice.status = nextStatus;
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }

        invoice.updated_at = new Date();
        await invoice.save();

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'fullName email')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();

        const productIds = (populated.items || [])
            .map((item) => normalizeId(item.product_id))
            .filter(Boolean);
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

        try {
            await syncInventory(invoice, 'confirmed');
            invoice.status = 'confirmed';
            invoice.updated_at = new Date();
            await invoice.save();
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }

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
        
        try {
            await syncInventory(invoice, 'cancelled');
            invoice.status = 'cancelled';
            invoice.updated_at = new Date();
            await invoice.save();
            return res.json({ invoice });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/invoices/:id/cancel — allow warehouse staff or manager to cancel before approval
router.post('/:id/cancel', requireAuth, requireRole(['warehouse', 'manager', 'admin']), async (req, res) => {
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

        try {
            await syncInventory(invoice, 'cancelled');
            invoice.status = 'cancelled';
            invoice.updated_at = new Date();
            await invoice.save();
            return res.json({ invoice });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
