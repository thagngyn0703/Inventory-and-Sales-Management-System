const express = require('express');
const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const User = require('../models/User');
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
    const isNew = invoice.isNew || !invoice._id;
    const oldStatus = isNew ? 'new' : invoice.status;
    const saleStatuses = ['confirmed'];

    const isOldSale = saleStatuses.includes(oldStatus);
    const isNextSale = saleStatuses.includes(nextStatus);

    console.log(`[syncInventory ${invoice._id}] Transition: ${oldStatus} -> ${nextStatus}`);

    const itemsChanged = nextItems && JSON.stringify(nextItems) !== JSON.stringify(invoice.items);

    if (!isOldSale && isNextSale) {
        // Transitional Deduct
        console.log(`[syncInventory] Deducting next items`);
        const itemsToDeduct = nextItems || invoice.items;
        const problems = await checkStockAvailability(itemsToDeduct);
        if (problems.length > 0) throw { status: 400, message: 'Không đủ tồn kho', problems };
        await adjustInventory(itemsToDeduct, -1);
    } 
    else if (isOldSale && !isNextSale) {
        // Transitional Restore
        console.log(`[syncInventory] Restoring old items`);
        await adjustInventory(invoice.items, 1);
    } 
    else if (isOldSale && isNextSale && itemsChanged) {
        // Item Update within Sale State
        console.log(`[syncInventory] Updating items in sale state.`);
        const problems = await checkStockAvailability(nextItems);
        if (problems.length > 0) throw { status: 400, message: 'Không đủ tồn kho để cập nhật sản phẩm', problems };
        
        await adjustInventory(invoice.items, 1);
        await adjustInventory(nextItems, -1);
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


// POST /api/invoices — create a confirmed outbound invoice
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
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

        const status = (req.body.status === 'cancelled') ? 'cancelled' : 'confirmed';

        const invoice = new SalesInvoice({
            store_id: req.user.storeId || null,
            customer_id,
            recipient_name,
            created_by: req.user.id,
            status,
            payment_method: payment_method || 'cash',
            items: normalizedItems,
            total_amount: totalAmount,
        });

        // Use syncInventory to handle deduction if created as confirmed
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
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { page = '1', limit = '20', status, dateFrom, dateTo, searchKey } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const filter = {};
        // Scope by store (quản trị nền tảng xem tất cả)
        const userRole = String(req.user?.role || '').toLowerCase();
        if (req.user.storeId && userRole !== 'admin') {
            filter.store_id = req.user.storeId;
        }
        if (status && ['confirmed', 'cancelled'].includes(status)) {
            filter.status = status;
        }

        // Apply Date Filters
        if (dateFrom || dateTo) {
            filter.invoice_at = {};
            if (dateFrom) {
                const df = new Date(dateFrom);
                df.setHours(0, 0, 0, 0);
                if (!isNaN(df)) filter.invoice_at.$gte = df;
            }
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                if (!isNaN(dt)) filter.invoice_at.$lte = dt;
            }
            if (Object.keys(filter.invoice_at).length === 0) delete filter.invoice_at;
        }

        // Apply Search Filter (customer name OR staff name)
        if (searchKey && searchKey.trim() !== '') {
            const regex = { $regex: searchKey.trim(), $options: 'i' };
            const matchingUsers = await User.find({ fullName: regex }, '_id').lean();
            const matchingUserIds = matchingUsers.map(u => u._id);

            if (matchingUserIds.length > 0) {
                filter.$or = [
                    { recipient_name: regex },
                    { created_by: { $in: matchingUserIds } }
                ];
            } else {
                filter.recipient_name = regex;
            }
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
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
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
        // Store ownership check
        const userRole2 = String(req.user?.role || '').toLowerCase();
        if (userRole2 !== 'admin' && req.user.storeId && String(invoice.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền xem hóa đơn này' });
        }

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

// PATCH /api/invoices/:id — update invoice (staff, manager)
router.patch('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        // Store ownership check
        const patchRole = String(req.user?.role || '').toLowerCase();
        if (patchRole !== 'admin' && req.user.storeId && String(invoice.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền chỉnh sửa hóa đơn này' });
        }
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
            const validStatuses = ['confirmed', 'cancelled'];
            if (validStatuses.includes(requestedStatus)) {
                nextStatus = requestedStatus;
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

// GET /api/invoices/stats/daily-sales — 7-day sales stats for dashboard
router.get('/stats/daily-sales', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const days = 7;
        const result = [];
        const now = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const start = new Date(date.setHours(0, 0, 0, 0));
            const end = new Date(date.setHours(23, 59, 59, 999));

            const dailyTotal = await SalesInvoice.aggregate([
                {
                    $match: {
                        status: 'confirmed',
                        invoice_at: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$total_amount' }
                    }
                }
            ]);

            result.push({
                date: start.toISOString().split('T')[0],
                total: dailyTotal.length > 0 ? dailyTotal[0].total : 0
            });
        }

        return res.json({ stats: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/invoices/:id/cancel — Simplify cancel
router.post('/:id/cancel', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        // Store ownership check
        const cancelRole = String(req.user?.role || '').toLowerCase();
        if (cancelRole !== 'admin' && req.user.storeId && String(invoice.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền hủy hóa đơn này' });
        }
        
        try {
            await syncInventory(invoice, 'cancelled');
            invoice.status = 'cancelled';
            invoice.updated_at = new Date();
            await invoice.save();
            return res.json({ invoice });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message });
            throw err;
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
