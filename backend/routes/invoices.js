const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const SalesReturn = require('../models/SalesReturn');
const Product = require('../models/Product');
const ProductUnit = require('../models/ProductUnit');
const User = require('../models/User');
const Store = require('../models/Store');
const Customer = require('../models/Customer');
const { adjustStockFIFO } = require('../utils/inventoryUtils');
const { applyCustomerDebtAfterNewInvoice } = require('../utils/customerDebt');
const { upsertSystemCashFlow } = require('../utils/cashflowUtils');
const {
    normalizeLoyaltySettings,
    computeRedeemPlan,
    computeEarnedPoints,
    getNextNudge,
    appendLoyaltyTxn,
} = require('../utils/loyalty');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * FIFO settlement: đóng các hóa đơn ghi nợ pending từ cũ nhất đến mới nhất,
 * chỉ khi số tiền thanh toán đủ để đóng từng hóa đơn hoàn toàn.
 * Không bao giờ đóng hóa đơn khi không đủ tiền — tránh mất doanh thu.
 */
async function fifoSettleDebtInvoices(customerId, payAmount, settlementInvoiceId, storeId) {
    const storeFilter = storeId ? { store_id: storeId } : {};
    const pendingInvoices = await SalesInvoice.find({
        customer_id: customerId,
        status: 'pending',
        payment_method: 'debt',
        ...storeFilter,
    }).sort({ created_at: 1 });

    let unallocated = Math.abs(Number(payAmount) || 0);
    const now = new Date();
    for (const inv of pendingInvoices) {
        if (unallocated <= 0) break;
        if (unallocated >= inv.total_amount) {
            await SalesInvoice.updateOne(
                { _id: inv._id },
                {
                    $set: {
                        status: 'confirmed',
                        payment_status: 'paid',
                        paid_at: now,
                        updated_at: now,
                        debt_settlement_note: `Trả nợ thông qua đơn hàng ${getInvoiceRefLabel(settlementInvoiceId)}`,
                        debt_settlement_by_invoice_id: settlementInvoiceId,
                    },
                }
            );
            unallocated -= inv.total_amount;
        } else {
            break;
        }
    }
}

/**
 * Tách subtotal (chưa thuế) và tax từ grand_total.
 * - priceIncludesTax = true  → giá bán ĐÃ gồm VAT (tạp hóa thông thường)
 * - priceIncludesTax = false → giá bán CHƯA gồm VAT (B2B)
 * Kết quả làm tròn đến đồng (integer) để tránh lỗi float VN.
 */
function computeTaxBreakdown(grandTotal, taxRate, priceIncludesTax) {
    const total = Number(grandTotal) || 0;
    const rate = Number(taxRate) || 0;
    if (rate === 0) {
        return { subtotal_amount: total, tax_amount: 0 };
    }
    if (priceIncludesTax) {
        const subtotal = Math.round(total / (1 + rate / 100));
        const tax = total - subtotal;
        return { subtotal_amount: subtotal, tax_amount: tax };
    } else {
        const tax = Math.round(total * (rate / 100));
        return { subtotal_amount: total, tax_amount: tax };
    }
}

/** Lấy cấu hình thuế của cửa hàng (tax_rate, price_includes_tax). */
async function getStoreTaxConfig(storeId) {
    if (!storeId || !mongoose.isValidObjectId(storeId)) {
        return { tax_rate: 0, price_includes_tax: true };
    }
    const store = await Store.findById(storeId).select('tax_rate price_includes_tax').lean();
    return {
        tax_rate: Number(store?.tax_rate) || 0,
        price_includes_tax: store?.price_includes_tax !== false,
    };
}

async function getStoreLoyaltyConfig(storeId) {
    if (!storeId || !mongoose.isValidObjectId(storeId)) {
        return { loyalty_settings: normalizeLoyaltySettings({}), loyalty_policy_version: 1 };
    }
    const store = await Store.findById(storeId).select('loyalty_settings loyalty_policy_version').lean();
    return {
        loyalty_settings: normalizeLoyaltySettings(store?.loyalty_settings || {}),
        loyalty_policy_version: Number(store?.loyalty_policy_version) || 1,
    };
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
        const base_quantity = Number(item.base_quantity) || quantity;
        const exchange_value = Number(item.exchange_value) > 0 ? Number(item.exchange_value) : 1;
        const unit_name = String(item.unit_name || '').trim();
        const unit_id = normalizeId(item.unit_id);
        const unit_price = Number(item.unit_price) || 0;
        const discount = Number(item.discount) || 0;
        const line_total = computeLineTotal({ quantity, unit_price, discount });
        // Giá vốn chỉ lấy từ DB (Product.cost_price) tại thời điểm bán — không tin cost_price từ client
        const cost_price =
            product_id && costMap.has(product_id) ? costMap.get(product_id) : 0;
        const line_id = newLineId();
        const line_profit = computeLineProfit(line_total, base_quantity, cost_price);
        totalAmount += line_total;
        return {
            line_id,
            product_id,
            unit_id,
            unit_name,
            exchange_value,
            quantity,
            base_quantity,
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
        const base_quantity = Number(item.base_quantity) || quantity;
        const exchange_value = Number(item.exchange_value) > 0 ? Number(item.exchange_value) : 1;
        const unit_name = String(item.unit_name || '').trim();
        const unit_id = normalizeId(item.unit_id);
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

        const line_profit = computeLineProfit(line_total, base_quantity, cost_price);
        totalAmount += line_total;
        return {
            line_id: line_id_out,
            product_id,
            unit_id,
            unit_name,
            exchange_value,
            quantity,
            base_quantity,
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

async function enrichItemsWithUnitSnapshot(items = [], storeId = null) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const productIds = [...new Set(items.map((it) => normalizeId(it.product_id)).filter(Boolean))];
    const productQuery = { _id: { $in: productIds } };
    if (storeId) productQuery.storeId = storeId;
    const products = await Product.find(productQuery)
        .select('_id base_unit sale_price')
        .lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const explicitUnitIds = [...new Set(items.map((it) => normalizeId(it.unit_id)).filter(Boolean))];
    const unitQuery = { product_id: { $in: productIds } };
    if (storeId) unitQuery.storeId = storeId;
    const units = await ProductUnit.find(
        explicitUnitIds.length > 0 ? { ...unitQuery, $or: [{ _id: { $in: explicitUnitIds } }, { is_base: true }] } : unitQuery
    )
        .select('_id product_id unit_name exchange_value price is_base')
        .lean();
    const baseUnitByProduct = new Map();
    const unitById = new Map();
    for (const u of units) {
        unitById.set(String(u._id), u);
        if (u.is_base && !baseUnitByProduct.has(String(u.product_id))) {
            baseUnitByProduct.set(String(u.product_id), u);
        }
    }

    return items.map((item) => {
        const pid = normalizeId(item.product_id);
        const product = pid ? productMap.get(pid) : null;
        const inputQty = Number(item.quantity) || 0;
        const explicitUnit = normalizeId(item.unit_id) ? unitById.get(normalizeId(item.unit_id)) : null;
        const chosen = explicitUnit || (pid ? baseUnitByProduct.get(pid) : null);
        const exchangeValue = Number(chosen?.exchange_value) > 0
            ? Number(chosen.exchange_value)
            : Number(item.exchange_value) > 0
                ? Number(item.exchange_value)
                : 1;
        const unitName = String(chosen?.unit_name || item.unit_name || product?.base_unit || 'Cái').trim();
        return {
            ...item,
            unit_id: chosen?._id || null,
            unit_name: unitName,
            exchange_value: exchangeValue,
            base_quantity: inputQty * exchangeValue,
        };
    });
}

async function buildCostMap(items, storeId = null) {
    const productIds = (items || [])
        .map((item) => normalizeId(item.product_id))
        .filter(Boolean);
    if (productIds.length === 0) return new Map();
    const query = { _id: { $in: productIds } };
    if (storeId) query.storeId = storeId;
    const products = await Product.find(query).select('_id cost_price').lean();
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

async function checkStockAvailability(items, storeId = null) {
    if (!Array.isArray(items)) return [];
    const productIds = items
        .map((item) => normalizeId(item.product_id))
        .filter(Boolean);
    const query = { _id: { $in: productIds } };
    if (storeId) query.storeId = storeId;
    const products = await Product.find(query);
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const problems = [];
    items.forEach((item) => {
        const pid = normalizeId(item.product_id);
        const product = pid ? productMap.get(pid) : null;
        const needed = Number(item.base_quantity) || Number(item.quantity) || 0;
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

        const quantity = Math.abs((Number(item.base_quantity) || Number(item.quantity) || 0));
        await adjustStockFIFO(pid, storeId, quantity * direction, {
            note: direction === -1 ? 'Bán hàng (Hóa đơn)' : 'Khách trả hàng/Hủy hóa đơn',
            movementType: direction === -1 ? 'OUT_SALES' : 'IN_SALES_RETURN',
            referenceType: 'sales_invoice',
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
        const problems = await checkStockAvailability(itemsToDeduct, invoice.store_id);
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
        const problems = await checkStockAvailability(nextItems, invoice.store_id);
        if (problems.length > 0) throw { status: 400, message: 'Không đủ tồn kho để cập nhật sản phẩm', problems };
        
        await adjustInventory(invoice.items, 1, invoice.store_id);
        await adjustInventory(nextItems, -1, invoice.store_id);
    }
}

function buildStockAvailability(items, productsById) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        const prod = productsById.get(normalizeId(item.product_id));
        const neededBaseQty = Number(item.base_quantity) || Number(item.quantity) || 0;
        const available = prod ? (Number(prod.stock_qty) || 0) >= neededBaseQty : false;
        return {
            ...item,
            stock_qty: prod ? prod.stock_qty : null,
            in_stock: available,
        };
    });
}

async function buildReturnSummary(invoiceId) {
    if (!invoiceId) {
        return {
            returned_total_amount: 0,
            has_returns: false,
            items: [],
        };
    }
    const approvedReturns = await SalesReturn.find({
        invoice_id: invoiceId,
        status: 'approved',
    })
        .select('items')
        .lean();
    const returnedQtyByProduct = new Map();
    for (const rt of approvedReturns) {
        for (const item of rt.items || []) {
            const pid = normalizeId(item.product_id);
            if (!pid) continue;
            const qty = Number(item.quantity) || 0;
            returnedQtyByProduct.set(pid, (returnedQtyByProduct.get(pid) || 0) + qty);
        }
    }
    return {
        has_returns: approvedReturns.length > 0,
        items: Array.from(returnedQtyByProduct.entries()).map(([product_id, returned_quantity]) => ({
            product_id,
            returned_quantity,
        })),
    };
}

async function buildReturnDetails(invoiceId) {
    if (!invoiceId) return [];
    const returns = await SalesReturn.find({
        invoice_id: invoiceId,
        status: 'approved',
    })
        .sort({ return_at: -1 })
        .populate('created_by', 'fullName email')
        .populate('items.product_id', 'name sku')
        .lean();
    return (returns || []).map((rt) => ({
        _id: rt._id,
        return_at: rt.return_at || rt.created_at || null,
        total_amount: Number(rt.total_amount) || 0,
        reason: rt.reason || '',
        reason_code: rt.reason_code || 'other',
        created_by: rt.created_by || null,
        items: (rt.items || []).map((it) => ({
            product_id: it.product_id,
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            line_total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        })),
    }));
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
        if (!assertStoreScope(req, res)) return;
        const userRole = String(req.user?.role || '').toLowerCase();
        const {
            customer_id,
            items: reqItems,
            payment_method,
            recipient_name,
            previous_debt_paid,
            redeem_points_requested,
            promo_discount = 0,
            seller_name,
            seller_role,
            seller_code,
        } = req.body || {};
        if (!Array.isArray(reqItems) || reqItems.length === 0) {
            return res.status(400).json({ message: 'items (array) is required' });
        }

        if (payment_method === 'debt' && !customer_id) {
            return res.status(400).json({ message: 'Khách hàng không được để trống khi ghi nợ' });
        }

        // Validate nghiệp vụ nợ: chặn mua mới khi nợ ≥ 100k chưa trả đủ, enforce credit_limit
        let customerForDebtCheck = null;
        if (customer_id) {
            const customerFilter = { _id: customer_id };
            if (userRole !== 'admin') {
                customerFilter.store_id = req.user.storeId;
            }
            customerForDebtCheck = await Customer.findOne(customerFilter)
                .select('debt_account full_name credit_limit loyalty_points')
                .lean();
            if (!customerForDebtCheck) {
                return res.status(404).json({ message: 'Không tìm thấy khách hàng trong cửa hàng hiện tại.' });
            }

            const currentDebt = Number(customerForDebtCheck.debt_account) || 0;
            // BUG-09: cap previous_debt_paid tại debt_account thực tế, tránh trả thừa
            const rawPrevDebt = Number(previous_debt_paid) || 0;
            if (rawPrevDebt > currentDebt) {
                return res.status(400).json({
                    message: `Số tiền trả nợ (${rawPrevDebt.toLocaleString('vi-VN')}₫) vượt quá dư nợ hiện tại (${currentDebt.toLocaleString('vi-VN')}₫).`,
                    debt_account: currentDebt,
                    error_code: 'OVERPAYMENT_NOT_ALLOWED',
                });
            }

            // Chặn mua mới khi nợ ≥ 100.000đ mà chưa trả đủ
            if (currentDebt >= 100000) {
                const debtPaid = Number(previous_debt_paid) || 0;
                if (debtPaid < currentDebt) {
                    return res.status(400).json({
                        message: `Khách hàng đang nợ ${currentDebt.toLocaleString('vi-VN')}₫ (≥ 100.000₫). Vui lòng thanh toán toàn bộ nợ cũ trước khi mua hàng mới.`,
                        debt_account: currentDebt,
                        error_code: 'DEBT_LIMIT_EXCEEDED',
                    });
                }
            }
        }

        const itemSnapshots = await enrichItemsWithUnitSnapshot(reqItems, req.user.storeId);
        const costMap = await buildCostMap(itemSnapshots, req.user.storeId);
        const { totalAmount, items: normalizedItems } = calculateInvoiceTotals(itemSnapshots, costMap);
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

        const { loyalty_settings: loyaltySettings, loyalty_policy_version: loyaltyPolicyVersion } =
            await getStoreLoyaltyConfig(req.user.storeId);
        const requestedRedeemPoints = Math.max(0, Math.round(Number(redeem_points_requested) || 0));
        const promoDiscount = Math.max(0, Math.round(Number(promo_discount) || 0));
        if (requestedRedeemPoints > 0 && !customer_id) {
            return res.status(400).json({ message: 'Phải chọn khách hàng để dùng điểm.' });
        }
        const redeemPlan = computeRedeemPlan({
            totalAmount,
            requestedPoints: requestedRedeemPoints,
            currentPoints: Number(customerForDebtCheck?.loyalty_points || 0),
            config: loyaltySettings,
            promoDiscount,
        });
        if (requestedRedeemPoints > 0 && redeemPlan.reason === 'promo_conflict') {
            return res.status(400).json({ message: 'Không cho dùng điểm cùng lúc với khuyến mãi.' });
        }
        if (requestedRedeemPoints > 0 && redeemPlan.used_points <= 0) {
            return res.status(400).json({ message: 'Số điểm dùng không hợp lệ hoặc không đủ điều kiện.' });
        }
        const invoiceLevelDiscount = Math.max(0, redeemPlan.redeem_value + promoDiscount);
        const netInvoiceAmount = Math.max(0, totalAmount - invoiceLevelDiscount);
        const loyaltyEligibleAmount = Math.max(0, totalAmount - redeemPlan.redeem_value - promoDiscount);
        const loyaltyEarnedPoints = computeEarnedPoints({
            eligibleAmount: loyaltyEligibleAmount,
            config: loyaltySettings,
        });

        // BUG-06: Enforce credit_limit — chỉ áp dụng cho đơn ghi nợ và khi credit_limit > 0
        if (payment_method === 'debt' && customerForDebtCheck) {
            const creditLimit = Number(customerForDebtCheck.credit_limit) || 0;
            if (creditLimit > 0) {
                const currentDebt = Number(customerForDebtCheck.debt_account) || 0;
                const payOld = Number(previous_debt_paid) || 0;
                const debtAfterPayOld = Math.max(0, currentDebt - payOld);
                if (debtAfterPayOld + netInvoiceAmount > creditLimit) {
                    return res.status(400).json({
                        message: `Vượt hạn mức tín dụng (${creditLimit.toLocaleString('vi-VN')}₫). Dư nợ sau thanh toán: ${debtAfterPayOld.toLocaleString('vi-VN')}₫, đơn mới: ${netInvoiceAmount.toLocaleString('vi-VN')}₫.`,
                        credit_limit: creditLimit,
                        error_code: 'CREDIT_LIMIT_EXCEEDED',
                    });
                }
            }
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

        // Snapshot người bán tại thời điểm bán — lấy từ DB để đảm bảo chính xác
        const sellerUser = await User.findById(req.user.id).select('fullName email role employeeCode').lean();
        const sellerNameSnap = seller_name?.trim() || sellerUser?.fullName || sellerUser?.email || '';
        const sellerRoleSnap = seller_role?.trim() || (sellerUser?.role === 'manager' ? 'Quản lý' : 'Nhân viên');
        const sellerCodeSnap = seller_code?.trim() || sellerUser?.employeeCode || '';

        // Tính thuế từ cấu hình cửa hàng — server là nguồn sự thật, không tin client
        const taxConfig = await getStoreTaxConfig(req.user.storeId);
        const { subtotal_amount, tax_amount } = computeTaxBreakdown(
            netInvoiceAmount,
            taxConfig.tax_rate,
            taxConfig.price_includes_tax
        );

        const invoice = new SalesInvoice({
            store_id: req.user.storeId || null,
            customer_id,
            recipient_name,
            created_by: req.user.id,
            seller_name: sellerNameSnap,
            seller_role: sellerRoleSnap,
            seller_code: sellerCodeSnap,
            status,
            payment_method: method,
            payment_ref: paymentRef,
            payment_status: paymentStatus,
            paid_at: method === 'cash' ? new Date() : null,
            items: normalizedItems,
            total_amount: netInvoiceAmount,
            subtotal_amount,
            tax_amount,
            tax_rate_snapshot: taxConfig.tax_rate,
            previous_debt_paid: Number(previous_debt_paid) || 0,
            invoice_level_discount: invoiceLevelDiscount,
            loyalty_redeem_points: redeemPlan.used_points,
            loyalty_redeem_value: redeemPlan.redeem_value,
            loyalty_promo_discount: promoDiscount,
            loyalty_eligible_amount: loyaltyEligibleAmount,
            loyalty_earned_points: loyaltyEarnedPoints,
            loyalty_earned_settled: false,
            loyalty_policy_version: loyaltyPolicyVersion,
            loyalty_settings_snapshot: loyaltySettings,
        });

        // Use syncInventory to handle deduction if created as confirmed
        try {
            await syncInventory(invoice, status, normalizedItems);
            await invoice.save();
            if (invoice.payment_status === 'paid' && invoice.status === 'confirmed') {
                await upsertSystemCashFlow({
                    storeId: invoice.store_id,
                    type: 'INCOME',
                    category: 'SALES',
                    amount: invoice.total_amount,
                    paymentMethod: invoice.payment_method,
                    referenceModel: 'sales_invoice',
                    referenceId: invoice._id,
                    note: `Thu tien hoa don #${String(invoice._id).slice(-6).toUpperCase()}`,
                    actorId: req.user.id,
                    transactedAt: invoice.paid_at || invoice.invoice_at || new Date(),
                });
            }

            if (customer_id && redeemPlan.used_points > 0) {
                await appendLoyaltyTxn({
                    customerId: customer_id,
                    storeId: invoice.store_id,
                    actorId: req.user.id,
                    type: 'REDEEM',
                    points: -Math.abs(redeemPlan.used_points),
                    valueVnd: redeemPlan.redeem_value,
                    referenceModel: 'SalesInvoice',
                    referenceId: invoice._id,
                    note: `Dùng điểm giảm ${redeemPlan.redeem_value.toLocaleString('vi-VN')}₫`,
                    idempotencyKey: `redeem:${invoice._id}`,
                });
            }

            if (customer_id && loyaltyEarnedPoints > 0 && invoice.payment_status === 'paid') {
                await appendLoyaltyTxn({
                    customerId: customer_id,
                    storeId: invoice.store_id,
                    actorId: req.user.id,
                    type: 'EARN',
                    points: loyaltyEarnedPoints,
                    valueVnd: loyaltyEarnedPoints * Number(loyaltySettings.redeem.point_value_vnd || 500),
                    referenceModel: 'SalesInvoice',
                    referenceId: invoice._id,
                    note: `Tích điểm từ hóa đơn ${getInvoiceRefLabel(invoice._id)}`,
                    idempotencyKey: `earn:${invoice._id}`,
                });
                invoice.loyalty_earned_settled = true;
                await invoice.save();
            }

            const addDebt = method === 'debt' ? netInvoiceAmount : 0;
            const payOldDebt =
                Number(previous_debt_paid) > 0 ? Math.abs(Number(previous_debt_paid)) : 0;
            // Chuyển khoản: chỉ khi SePay xác nhận paid mới trừ nợ + chốt HĐ nợ (xem settlePreviousDebtIfNeeded)
            const deferPayOldDebtSettlement = method === 'bank_transfer' && payOldDebt > 0;
            const payOldDebtNow = deferPayOldDebtSettlement ? 0 : payOldDebt;

            if (customer_id && (status === 'confirmed' || status === 'pending') && (addDebt > 0 || payOldDebtNow > 0)) {
                await applyCustomerDebtAfterNewInvoice(customer_id, { addDebt, payOldDebt: payOldDebtNow });
            }

            // BUG-02: FIFO thay thế updateMany — chỉ đóng hóa đơn khi đủ tiền
            if (payOldDebt > 0 && customer_id && (status === 'confirmed' || status === 'pending') && !deferPayOldDebtSettlement) {
                await fifoSettleDebtInvoices(customer_id, payOldDebt, invoice._id, req.user.storeId);
                invoice.previous_debt_settled = true;
                await invoice.save();
            }
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'full_name phone email debt_account')
            .populate('created_by', 'fullName email')
            .populate('items.product_id', 'name sku stock_qty')
            .lean();

        const productIds = (populated.items || [])
            .map((item) => normalizeId(item.product_id))
            .filter(Boolean);
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        const productsById = new Map(products.map((p) => [String(p._id), p]));
        populated.items = buildStockAvailability(populated.items, productsById);

        const refreshedCustomer = customer_id
            ? await Customer.findById(customer_id).select('loyalty_points').lean()
            : null;
        const currentPoints = Number(refreshedCustomer?.loyalty_points || 0);
        const nudge = getNextNudge(currentPoints, loyaltySettings.milestones || []);
        return res.status(201).json({
            invoice: attachInvoiceEditFlags(populated),
            payment_ref: paymentRef,
            payment_status: paymentStatus,
            loyalty_summary: {
                used_points: redeemPlan.used_points,
                redeem_value: redeemPlan.redeem_value,
                earned_points: loyaltyEarnedPoints,
                current_points: currentPoints,
                next_nudge: nudge,
                policy_version: loyaltyPolicyVersion,
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/invoices?page=&limit=&status=
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
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
            .populate('customer_id', 'full_name phone email debt_account')
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
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id)
            .populate('customer_id', 'full_name phone email debt_account')
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
        const returnSummary = await buildReturnSummary(invoice._id);
        const returnedQtyByProduct = new Map(
            (returnSummary.items || []).map((it) => [String(it.product_id), Number(it.returned_quantity) || 0])
        );
        invoice.items = (invoice.items || []).map((item) => {
            const pid = normalizeId(item.product_id);
            const soldQty = Number(item.quantity) || 0;
            const returnedQty = pid ? (returnedQtyByProduct.get(pid) || 0) : 0;
            return {
                ...item,
                returned_quantity: returnedQty,
                remaining_quantity: Math.max(0, soldQty - returnedQty),
                is_fully_returned: soldQty > 0 && returnedQty >= soldQty,
                is_partially_returned: returnedQty > 0 && returnedQty < soldQty,
            };
        });
        invoice.return_summary = {
            has_returns: returnSummary.has_returns,
            returned_total_amount: Number(invoice.returned_total_amount) || 0,
            items: returnSummary.items || [],
        };
        invoice.returns = await buildReturnDetails(invoice._id);

        return res.json({ invoice: attachInvoiceEditFlags(invoice) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// PATCH /api/invoices/:id — update invoice (staff, manager)
router.patch('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid invoice id' });
        }
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        const saleStatuses = ['confirmed', 'pending'];
        if (saleStatuses.includes(String(invoice.status))) {
            return res.status(409).json({
                code: 'SOLD_INVOICE_LOCKED',
                message:
                    'Hóa đơn đã bán hàng không được phép chỉnh sửa. Nếu cần điều chỉnh, vui lòng dùng nghiệp vụ trả hàng hoặc hủy theo quy trình.',
            });
        }
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
            const itemSnapshots = await enrichItemsWithUnitSnapshot(reqItems, invoice.store_id);
            const costMap = await buildCostMap(itemSnapshots, invoice.store_id);
            const oldItems = Array.isArray(invoice.items)
                ? invoice.items.map((it) => (typeof it.toObject === 'function' ? it.toObject() : it))
                : [];
            const { totalAmount: patchTotal, items: normalizedItems } = calculatePatchInvoiceTotals(
                itemSnapshots,
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
                const newTotal = patchItemsTotalAmount != null
                    ? patchItemsTotalAmount
                    : nextItems.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
                invoice.total_amount = newTotal;

                // Tính lại thuế khi items thay đổi
                const patchTaxConfig = await getStoreTaxConfig(invoice.store_id);
                const { subtotal_amount: patchSubtotal, tax_amount: patchTax } = computeTaxBreakdown(
                    newTotal,
                    patchTaxConfig.tax_rate,
                    patchTaxConfig.price_includes_tax
                );
                invoice.subtotal_amount = patchSubtotal;
                invoice.tax_amount = patchTax;
                invoice.tax_rate_snapshot = patchTaxConfig.tax_rate;
            }
            invoice.status = nextStatus;
        } catch (err) {
            if (err.status) return res.status(err.status).json({ message: err.message, problems: err.problems });
            throw err;
        }

        invoice.updated_at = new Date();
        await invoice.save();

        const populated = await SalesInvoice.findById(invoice._id)
            .populate('customer_id', 'full_name phone email debt_account')
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
        if (!assertStoreScope(req, res)) return;
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
            if (invoice.customer_id && Number(invoice.loyalty_earned_points || 0) > 0) {
                await appendLoyaltyTxn({
                    customerId: invoice.customer_id,
                    storeId: invoice.store_id,
                    actorId: req.user.id,
                    type: 'REVERSAL',
                    points: -Math.abs(Number(invoice.loyalty_earned_points || 0)),
                    valueVnd: Math.abs(Number(invoice.loyalty_earned_points || 0)) * Number(invoice?.loyalty_settings_snapshot?.redeem?.point_value_vnd || 500),
                    referenceModel: 'SalesInvoice',
                    referenceId: invoice._id,
                    note: 'Hoàn hủy hóa đơn: trừ lại điểm đã tích.',
                    idempotencyKey: `reversal-earn:${invoice._id}`,
                });
            }
            if (invoice.customer_id && Number(invoice.loyalty_redeem_points || 0) > 0) {
                await appendLoyaltyTxn({
                    customerId: invoice.customer_id,
                    storeId: invoice.store_id,
                    actorId: req.user.id,
                    type: 'REFUND',
                    points: Math.abs(Number(invoice.loyalty_redeem_points || 0)),
                    valueVnd: Math.abs(Number(invoice.loyalty_redeem_value || 0)),
                    referenceModel: 'SalesInvoice',
                    referenceId: invoice._id,
                    note: 'Hoàn hủy hóa đơn: hoàn lại điểm đã dùng.',
                    idempotencyKey: `refund-redeem:${invoice._id}`,
                });
            }
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
