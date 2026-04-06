const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const User = require('../models/User');
const { adjustStockFIFO } = require('../utils/inventoryUtils');
const { applyCustomerDebtAfterNewInvoice } = require('../utils/customerDebt');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function newLineId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
}

function computeLineProfit(line_total, quantity, cost_price) {
    const lt = Number(line_total) || 0;
    const cogs = (Number(quantity) || 0) * (Number(cost_price) || 0);
    return Math.round((lt - cogs) * 100) / 100;
}

function computeLineTotal({ quantity, unit_price, discount }) {
    const qty = Number(quantity) || 0;
    const price = Number(unit_price) || 0;
    const disc = Number(discount) || 0;
    const subtotal = qty * price;
    const total = Math.max(0, subtotal - disc);
    return total;
}

function calculateInvoiceTotals(items = [], costMap = new Map()) {
    const now = new Date();
    let totalAmount = 0;
    const normalizedItems = (items || []).map((item) => {
        const product_id = normalizeId(item.product_id);
        const quantity = Number(item.quantity) || 0;
        const unit_price = Number(item.unit_price) || 0;
        const discount = Number(item.discount) || 0;
        const line_total = computeLineTotal({ quantity, unit_price, discount });
        // Giá vốn chỉ lấy từ DB (Product.cost_price) tại thời điểm bán — không tin cost_price từ client
        const cost_price =
            product_id && costMap.has(product_id) ? costMap.get(product_id) : 0;
        const line_id = newLineId();
        const line_profit = computeLineProfit(line_total, quantity, cost_price);
        totalAmount += line_total;
        return {
            line_id,
            product_id,
            quantity,
            unit_price,
            cost_price,
            discount,
            line_total,
            line_profit,
            line_updated_at: now,
        };
    });
    return { totalAmount, items: normalizedItems };
}

/** Mọi dòng có product_id phải có trong costMap (sản phẩm tồn tại trong DB) */
function getProductIdsMissingFromCostMap(normalizedItems, costMap) {
    const missing = [];
    for (const it of normalizedItems || []) {
        if (!it.product_id) continue;
        if (!costMap.has(it.product_id)) missing.push(it.product_id);
    }
    return missing;
}

/**
 * PATCH items — lõi nghiệp vụ: không rewrite lịch sử giá vốn khi Product.cost_price thay đổi sau này.
 * 1) Khớp line_id + product_id với dòng cũ → giữ cost_price snapshot.
 * 2) Không khớp line_id → FIFO theo thứ tự dòng cũ cùng product_id (hóa đơn cũ chưa có line_id).
 * 3) Không còn dòng cũ tương ứng → giá vốn lấy từ Product.cost_price hiện tại (dòng mới).
 * Mỗi dòng output có line_profit = line_total − quantity × cost_price (lưu DB phục vụ báo cáo).
 */
function calculatePatchInvoiceTotals(reqItems = [], costMap = new Map(), oldItems = []) {
    const old = Array.isArray(oldItems) ? oldItems : [];
    const consumed = old.map(() => false);
    const now = new Date();
    let totalAmount = 0;

    const normalizedItems = (reqItems || []).map((item) => {
        const product_id = normalizeId(item.product_id);
        const quantity = Number(item.quantity) || 0;
        const unit_price = Number(item.unit_price) || 0;
        const discount = Number(item.discount) || 0;
        const line_total = computeLineTotal({ quantity, unit_price, discount });
        const lid = item.line_id != null ? String(item.line_id).trim() : '';

        let cost_price = 0;
        let line_id_out;

        if (product_id) {
            if (lid) {
                const idx = old.findIndex(
                    (o, i) =>
                        !consumed[i] &&
                        String(o.line_id || '').trim() === lid &&
                        normalizeId(o.product_id) === product_id
                );
                if (idx >= 0) {
                    consumed[idx] = true;
                    const n = Number(old[idx].cost_price);
                    cost_price = Number.isFinite(n)
                        ? n
                        : costMap.has(product_id)
                          ? costMap.get(product_id)
                          : 0;
                    line_id_out = lid;
                }
            }
            if (line_id_out == null) {
                const idx2 = old.findIndex(
                    (o, i) => !consumed[i] && normalizeId(o.product_id) === product_id
                );
                if (idx2 >= 0) {
                    consumed[idx2] = true;
                    const n = Number(old[idx2].cost_price);
                    cost_price = Number.isFinite(n)
                        ? n
                        : costMap.has(product_id)
                          ? costMap.get(product_id)
                          : 0;
                    line_id_out = String(old[idx2].line_id || '').trim() || newLineId();
                }
            }
        }

        if (line_id_out == null) {
            line_id_out = lid || newLineId();
            if (product_id) {
                cost_price = costMap.has(product_id) ? costMap.get(product_id) : 0;
            }
        }

        const line_profit = computeLineProfit(line_total, quantity, cost_price);
        totalAmount += line_total;
        return {
            line_id: line_id_out,
            product_id,
            quantity,
            unit_price,
            cost_price,
            discount,
            line_total,
            line_profit,
            line_updated_at: now,
        };
    });

    return { totalAmount, items: normalizedItems };
}

async function buildCostMap(items) {
    const productIds = (items || [])
        .map((item) => normalizeId(item.product_id))
        .filter(Boolean);
    if (productIds.length === 0) return new Map();
    const products = await Product.find({ _id: { $in: productIds } }).select('_id cost_price').lean();
    return new Map(products.map((p) => [String(p._id), Number(p.cost_price) || 0]));
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

async function adjustInventory(items, direction = -1, storeId = null) {
    if (!Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
        const pid = normalizeId(item.product_id);
        if (!pid) continue;

        const quantity = Math.abs(item.quantity || 0);
        await adjustStockFIFO(pid, storeId, quantity * direction, {
            note: direction === -1 ? 'Bán hàng (Hóa đơn)' : 'Khách trả hàng/Hủy hóa đơn'
        });
    }
}

async function syncInventory(invoice, nextStatus, nextItems = null) {
    const isNew = invoice.isNew || !invoice._id;
    const oldStatus = isNew ? 'new' : invoice.status;
    const saleStatuses = ['confirmed', 'pending'];

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
        await adjustInventory(itemsToDeduct, -1, invoice.store_id);
    } 
    else if (isOldSale && !isNextSale) {
        // Transitional Restore
        console.log(`[syncInventory] Restoring old items`);
        await adjustInventory(invoice.items, 1, invoice.store_id);
    } 
    else if (isOldSale && isNextSale && itemsChanged) {
        // Item Update within Sale State
        console.log(`[syncInventory] Updating items in sale state.`);
        const problems = await checkStockAvailability(nextItems);
        if (problems.length > 0) throw { status: 400, message: 'Không đủ tồn kho để cập nhật sản phẩm', problems };
        
        await adjustInventory(invoice.items, 1, invoice.store_id);
        await adjustInventory(nextItems, -1, invoice.store_id);
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

/** FE/demo: đã thanh toán đủ hoặc đơn hủy → không được PATCH items (server cũng chặn 409). */
function attachInvoiceEditFlags(invoice) {
    if (!invoice || typeof invoice !== 'object') return invoice;
    const paid = String(invoice.payment_status) === 'paid';
    const cancelled = String(invoice.status) === 'cancelled';
    return {
        ...invoice,
        can_edit_items: !paid && !cancelled,
    };
}


/**
 * Sinh mã tham chiếu thanh toán dạng IMS-XXXXXX (6 ký tự hex in hoa).
 * Nhúng vào nội dung chuyển khoản để SePay webhook tự động đối soát.
 */
function generatePaymentRef() {
    const hex = require('crypto').randomBytes(3).toString('hex').toUpperCase();
    return `IMS-${hex}`;
}

function getInvoiceRefLabel(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return '#N/A';
    return `#${id}`;
}

// POST /api/invoices — create a confirmed outbound invoice
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { customer_id, items: reqItems, payment_method, recipient_name, previous_debt_paid } = req.body || {};
        if (!Array.isArray(reqItems) || reqItems.length === 0) {
            return res.status(400).json({ message: 'items (array) is required' });
        }

        if (payment_method === 'debt' && !customer_id) {
            return res.status(400).json({ message: 'Khách hàng không được để trống khi ghi nợ' });
        }

        // Validate nợ cũ >= 100.000đ: khách phải trả nợ trước, không được tạo hóa đơn mới
        if (customer_id) {
            const Customer = require('../models/Customer');
            const customer = await Customer.findById(customer_id).select('debt_account full_name').lean();
            if (customer && Number(customer.debt_account) >= 100000) {
                // Chỉ cho phép nếu đây là đơn có payOldDebt (previous_debt_paid >= debt_account)
                const debtPaid = Number(previous_debt_paid) || 0;
                if (debtPaid < Number(customer.debt_account)) {
                    return res.status(400).json({
                        message: `Khách hàng đang nợ ${Number(customer.debt_account).toLocaleString('vi-VN')}₫ (≥ 100.000₫). Vui lòng thanh toán toàn bộ nợ cũ trước khi mua hàng mới.`,
                        debt_account: customer.debt_account,
                        error_code: 'DEBT_LIMIT_EXCEEDED',
                    });
                }
            }
        }

        const costMap = await buildCostMap(reqItems);
        const { totalAmount, items: normalizedItems } = calculateInvoiceTotals(reqItems, costMap);
        const invalidLine = normalizedItems.find((it) => !it.product_id);
        if (invalidLine) {
            return res.status(400).json({ message: 'Mỗi dòng phải có sản phẩm hợp lệ' });
        }
        const missingCost = getProductIdsMissingFromCostMap(normalizedItems, costMap);
        if (missingCost.length > 0) {
            return res.status(400).json({
                message:
                    'Không xác định được giá vốn: một hoặc nhiều sản phẩm không tồn tại hoặc mã không hợp lệ. Giá vốn do hệ thống lấy từ sản phẩm, không nhập từ client.',
                product_ids: missingCost,
            });
        }

        let status = (req.body.status === 'cancelled') ? 'cancelled' : 'confirmed';
        const method = payment_method || 'cash';

        if (method === 'debt' && status === 'confirmed') {
            status = 'pending';
        }

        // Với chuyển khoản: sinh payment_ref để nhúng vào nội dung QR, trạng thái chờ xác nhận
        // Với tiền mặt: coi là đã thanh toán ngay
        const paymentRef = method === 'bank_transfer' ? generatePaymentRef() : null;
        let paymentStatus = method === 'cash' ? 'paid' : 'unpaid';

        const invoice = new SalesInvoice({
            store_id: req.user.storeId || null,
            customer_id,
            recipient_name,
            created_by: req.user.id,
            status,
            payment_method: method,
            payment_ref: paymentRef,
            payment_status: paymentStatus,
            paid_at: method === 'cash' ? new Date() : null,
            items: normalizedItems,
            total_amount: totalAmount,
            previous_debt_paid: Number(previous_debt_paid) || 0,
        });

        // Use syncInventory to handle deduction if created as confirmed
        try {
            await syncInventory(invoice, status, normalizedItems);
            await invoice.save();

            const addDebt = method === 'debt' ? totalAmount : 0;
            const payOldDebt =
                Number(previous_debt_paid) > 0 ? Math.abs(Number(previous_debt_paid)) : 0;
            // Chuyển khoản: chỉ khi SePay xác nhận paid mới trừ nợ + chốt HĐ nợ (xem settlePreviousDebtIfNeeded)
            const deferPayOldDebtSettlement = method === 'bank_transfer' && payOldDebt > 0;
            const payOldDebtNow = deferPayOldDebtSettlement ? 0 : payOldDebt;

            if (customer_id && (status === 'confirmed' || status === 'pending') && (addDebt > 0 || payOldDebtNow > 0)) {
                await applyCustomerDebtAfterNewInvoice(customer_id, { addDebt, payOldDebt: payOldDebtNow });
            }

            if (payOldDebt > 0 && customer_id && (status === 'confirmed' || status === 'pending') && !deferPayOldDebtSettlement) {
                await SalesInvoice.updateMany(
                    { customer_id, status: 'pending', payment_method: 'debt' },
                    { 
                      $set: { 
                        status: 'confirmed', 
                        payment_status: 'paid',
                        paid_at: new Date(),
                        updated_at: new Date(),
                        debt_settlement_note: `Trả nợ thông qua đơn hàng ${getInvoiceRefLabel(invoice._id)}`,
                        debt_settlement_by_invoice_id: invoice._id,
                      } 
                    }
                );
            }

            if (payOldDebt > 0 && !deferPayOldDebtSettlement) {
                invoice.previous_debt_settled = true;
                await invoice.save();
            }
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

        return res.status(201).json({
            invoice: attachInvoiceEditFlags(populated),
            payment_ref: paymentRef,
            payment_status: paymentStatus,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/invoices?page=&limit=&status=
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        const { page = '1', limit = '20', status, dateFrom, dateTo, searchKey, customer_id, payment_method } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const filter = {};
        // Scope by store (quản trị nền tảng xem tất cả)
        const userRole = String(req.user?.role || '').toLowerCase();
        if (req.user.storeId && userRole !== 'admin') {
            filter.store_id = req.user.storeId;
        }
        if (status) {
            filter.status = status;
        }
        
        if (customer_id) {
            filter.customer_id = customer_id;
        }
        
        if (payment_method) {
            filter.payment_method = payment_method;
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

        const invoicesWithStock = list.map((inv) =>
            attachInvoiceEditFlags({
                ...inv,
                items: buildStockAvailability(inv.items, productsById),
            })
        );

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

// GET /api/invoices/stats/daily-sales — phải khai báo trước /:id để không bị nuốt bởi param "stats"
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
                        invoice_at: { $gte: start, $lte: end },
                        // Chỉ tính chuyển khoản khi đã xác nhận thanh toán
                        $or: [
                            { payment_method: { $ne: 'bank_transfer' } },
                            { payment_status: 'paid' },
                        ],
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$total_amount' },
                    },
                },
            ]);

            result.push({
                date: start.toISOString().split('T')[0],
                total: dailyTotal.length > 0 ? dailyTotal[0].total : 0,
            });
        }

        return res.json({ stats: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
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

        return res.json({ invoice: attachInvoiceEditFlags(invoice) });
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
        let patchItemsTotalAmount = null;
        if (Array.isArray(reqItems) && reqItems.length > 0) {
            if (String(invoice.payment_status) === 'paid') {
                return res.status(409).json({
                    code: 'INVOICE_PAID_ITEMS_LOCKED',
                    message:
                        'Hóa đơn đã thanh toán đủ: không được sửa danh sách mặt hàng. Vui lòng dùng nghiệp vụ trả hàng hoặc hủy/điều chỉnh theo quy định cửa hàng.',
                });
            }
            if (String(invoice.status) === 'cancelled') {
                return res.status(409).json({
                    code: 'INVOICE_CANCELLED_ITEMS_LOCKED',
                    message: 'Hóa đơn đã hủy: không được sửa danh sách mặt hàng.',
                });
            }
            const costMap = await buildCostMap(reqItems);
            const oldItems = Array.isArray(invoice.items)
                ? invoice.items.map((it) => (typeof it.toObject === 'function' ? it.toObject() : it))
                : [];
            const { totalAmount: patchTotal, items: normalizedItems } = calculatePatchInvoiceTotals(
                reqItems,
                costMap,
                oldItems
            );
            const invalidLine = normalizedItems.find((it) => !it.product_id);
            if (invalidLine) {
                return res.status(400).json({ message: 'Mỗi dòng phải có sản phẩm hợp lệ' });
            }
            const missingCostPatch = getProductIdsMissingFromCostMap(normalizedItems, costMap);
            if (missingCostPatch.length > 0) {
                return res.status(400).json({
                    message:
                        'Không xác định được giá vốn: một hoặc nhiều sản phẩm không tồn tại hoặc mã không hợp lệ. Giá vốn do hệ thống lấy từ sản phẩm, không nhập từ client.',
                    product_ids: missingCostPatch,
                });
            }
            nextItems = normalizedItems;
            patchItemsTotalAmount = patchTotal;
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
                invoice.total_amount =
                    patchItemsTotalAmount != null
                        ? patchItemsTotalAmount
                        : nextItems.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
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

        return res.json({ invoice: attachInvoiceEditFlags(populated) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
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
            return res.json({
                invoice: attachInvoiceEditFlags(invoice.toObject ? invoice.toObject() : invoice),
            });
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
