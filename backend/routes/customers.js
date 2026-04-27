const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const SalesInvoice = require('../models/SalesInvoice');
const CustomerDebtPayment = require('../models/CustomerDebtPayment');
const PaymentTransaction = require('../models/PaymentTransaction');
const { upsertSystemCashFlow } = require('../utils/cashflowUtils');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const TRANSFER_PENDING_TTL_MS = 30 * 60 * 1000; // 30 phút

function generatePaymentRef() {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `IMS-${hex}`;
}

function normalizePaymentRef(ref = '') {
    return String(ref).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

async function fetchSepayTransactionsByAmount(amount) {
    const token = String(process.env.SEPAY_API_TOKEN || '').trim();
    if (!token) return [];
    const baseUrl = String(process.env.SEPAY_API_BASE_URL || 'https://my.sepay.vn').replace(/\/+$/, '');
    const url = new URL(`${baseUrl}/userapi/transactions/list`);
    url.searchParams.set('limit', '50');
    url.searchParams.set('amount_in', String(Math.round(parseAmount(amount))));

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'X-API-KEY': token,
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`SePay API error ${res.status}: ${text || 'request failed'}`);
    }
    const data = await res.json();
    return Array.isArray(data?.transactions) ? data.transactions : [];
}

async function settlePendingDebtInvoicesFIFO(customerId, payAmount, storeId, note, options = {}) {
    const storeFilter = storeId ? { store_id: storeId } : {};
    let query = SalesInvoice.find({
        customer_id: customerId,
        status: 'pending',
        payment_method: 'debt',
        ...storeFilter,
    }).sort({ created_at: 1 });
    if (options.session) query = query.session(options.session);
    const pendingInvoices = await query;

    let unallocated = payAmount;
    const now = new Date();
    for (const invoice of pendingInvoices) {
        if (unallocated <= 0) break;
        if (unallocated >= invoice.total_amount) {
            const updateQuery = SalesInvoice.updateOne(
                { _id: invoice._id },
                {
                    $set: {
                        status: 'confirmed',
                        payment_status: 'paid',
                        paid_at: now,
                        updated_at: now,
                        debt_settlement_note: note || `Thu nợ trực tiếp ngày ${now.toLocaleDateString('vi-VN')}`,
                    },
                }
            );
            if (options.session) updateQuery.session(options.session);
            await updateQuery;
            unallocated -= invoice.total_amount;
        } else {
            break;
        }
    }
}

async function expireStalePendingTransfers(customerId, storeId, options = {}) {
    const cutoff = new Date(Date.now() - TRANSFER_PENDING_TTL_MS);
    const q = CustomerDebtPayment.updateMany(
        {
            customer_id: customerId,
            store_id: storeId,
            payment_method: 'bank_transfer',
            status: 'pending',
            received_at: { $lt: cutoff },
        },
        {
            $set: {
                status: 'cancelled',
                note: 'Hết hạn yêu cầu chuyển khoản (timeout 30 phút)',
            },
        }
    );
    if (options.session) q.session(options.session);
    await q;
}

function assertStoreScope(req, res) {
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) {
        res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        return false;
    }
    return true;
}

function getStrictStoreId(req, res) {
    const storeId = req.user?.storeId;
    if (!storeId || !mongoose.isValidObjectId(storeId)) {
        res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        return null;
    }
    return storeId;
}

// GET /api/customers - List/Search customers (Scoped by Store, with pagination)
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { searchKey, status, is_regular, limit = 50, page = 1, has_debt } = req.query;
        const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
        const pageNum = Math.max(1, Number(page) || 1);
        const skip = (pageNum - 1) * limitNum;
        const filter = {};

        filter.store_id = storeId;

        if (status) filter.status = status;
        if (is_regular !== undefined && is_regular !== '') filter.is_regular = is_regular === 'true';
        // BUG-17: lọc theo có nợ hay không
        if (has_debt === 'true') filter.debt_account = { $gt: 0 };
        if (has_debt === 'false') filter.debt_account = { $lte: 0 };

        if (searchKey) {
            filter.$or = [
                { phone: { $regex: searchKey, $options: 'i' } },
                { full_name: { $regex: searchKey, $options: 'i' } },
                { email: { $regex: searchKey, $options: 'i' } }
            ];
        }

        const [customers, total] = await Promise.all([
            Customer.find(filter)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Customer.countDocuments(filter),
        ]);

        res.json({
            customers,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// POST /api/customers - Create a new customer (Attach Store ID)
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { full_name, phone, email, address, is_regular, credit_limit } = req.body;
        
        if (!full_name || !full_name.trim()) {
            return res.status(400).json({ message: 'Tên khách hàng là bắt buộc' });
        }
        
        const tel = phone ? phone.trim().replace(/\s/g, '') : '';
        if (tel && (tel.length < 10 || tel.length > 11)) {
            return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
        }

        // Check uniqueness within the same store
        const userStoreId = storeId;
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

// GET /api/customers/:id - Get single customer by ID
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }
        const findQuery = { _id: id, store_id: storeId };
        const customer = await Customer.findOne(findQuery).lean();
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
        }
        res.json({ customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// PATCH /api/customers/:id - Update customer info
router.patch('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        const { full_name, phone, email, address, is_regular, debt_account } = req.body;

        const findQuery = { _id: id, store_id: storeId };

        const updateData = {};
        if (full_name) updateData.full_name = full_name.trim();
        if (phone !== undefined) {
            const tel = phone.trim().replace(/\s/g, '');
            if (tel && (tel.length < 10 || tel.length > 11)) {
                return res.status(400).json({ message: 'Số điện thoại phải có 10 hoặc 11 chữ số' });
            }
            // Ensure unique in same store when updating phone
            const duplicate = await Customer.findOne({ phone: tel, store_id: storeId, _id: { $ne: id } });
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

// POST /api/customers/:id/pay-debt/prepare-transfer
// Tạo mã tham chiếu để hiển thị QR thu nợ CK. Chưa trừ nợ ở bước này.
router.post('/:id/pay-debt/prepare-transfer', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        const { amount } = req.body || {};

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }

        const findQuery = { _id: id, store_id: storeId };

        const customer = await Customer.findOne(findQuery);
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });
        }

        const payAmount = Number(amount) || 0;
        if (payAmount <= 0) {
            return res.status(400).json({ message: 'Số tiền thu nợ phải lớn hơn 0' });
        }
        if (payAmount > Number(customer.debt_account || 0)) {
            return res.status(400).json({ message: 'Số tiền thu nợ không được vượt dư nợ hiện tại' });
        }

        await expireStalePendingTransfers(customer._id, storeId);
        await CustomerDebtPayment.updateMany(
            {
                customer_id: customer._id,
                store_id: storeId,
                payment_method: 'bank_transfer',
                status: 'pending',
            },
            {
                $set: {
                    status: 'cancelled',
                    note: 'Tạo yêu cầu chuyển khoản mới, hủy yêu cầu cũ',
                },
            }
        );

        let payment_ref = '';
        for (let i = 0; i < 5; i += 1) {
            const candidate = generatePaymentRef();
            const exists = await CustomerDebtPayment.findOne({
                store_id: storeId,
                payment_ref: candidate,
            }).lean();
            if (!exists) {
                payment_ref = candidate;
                break;
            }
        }
        if (!payment_ref) {
            return res.status(500).json({ message: 'Không tạo được mã tham chiếu duy nhất, vui lòng thử lại.' });
        }

        await CustomerDebtPayment.create({
            customer_id: customer._id,
            store_id: storeId,
            amount: payAmount,
            payment_method: 'bank_transfer',
            status: 'pending',
            payment_ref,
            note: 'Khởi tạo yêu cầu thu nợ chuyển khoản',
            received_at: new Date(),
            created_by: req.user.id,
        });

        return res.json({
            customer_id: customer._id,
            customer_name: customer.full_name,
            amount: payAmount,
            payment_ref,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Lỗi server khi tạo mã QR thu nợ' });
    }
});

// POST /api/customers/:id/pay-debt/confirm-transfer
// Xác minh đã có giao dịch SePay đúng số tiền + đúng payment_ref, rồi mới trừ nợ.
router.post('/:id/pay-debt/confirm-transfer', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    let lockedPendingPayment = null;
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        const { amount, payment_ref } = req.body || {};

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }
        const payAmount = Number(amount) || 0;
        if (payAmount <= 0) {
            return res.status(400).json({ message: 'Số tiền thanh toán phải lớn hơn 0' });
        }
        const ref = String(payment_ref || '').trim().toUpperCase();
        if (!ref) {
            return res.status(400).json({ message: 'Thiếu mã tham chiếu thanh toán' });
        }

        const findQuery = { _id: id, store_id: storeId };
        const customer = await Customer.findOne(findQuery);
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });
        }
        if (payAmount > Number(customer.debt_account || 0)) {
            return res.status(400).json({ message: 'Số tiền thu nợ không được vượt dư nợ hiện tại' });
        }

        await expireStalePendingTransfers(customer._id, storeId);

        const pendingPayment = await CustomerDebtPayment.findOne({
            customer_id: customer._id,
            store_id: storeId,
            payment_method: 'bank_transfer',
            payment_ref: ref,
            status: 'pending',
            amount: payAmount,
        });
        if (!pendingPayment) {
            const alreadyConfirmed = await CustomerDebtPayment.findOne({
                store_id: storeId,
                payment_method: 'bank_transfer',
                payment_ref: ref,
                status: 'confirmed',
            }).lean();
            if (alreadyConfirmed) {
                return res.json({ message: 'Giao dịch này đã được xác nhận trước đó', customer });
            }
            return res.status(400).json({
                message: 'Yêu cầu chuyển khoản không hợp lệ hoặc đã hết hạn. Vui lòng tạo mã mới.',
                error_code: 'TRANSFER_REQUEST_NOT_FOUND',
            });
        }
        if (Date.now() - new Date(pendingPayment.received_at || Date.now()).getTime() > TRANSFER_PENDING_TTL_MS) {
            pendingPayment.status = 'cancelled';
            pendingPayment.note = 'Yêu cầu chuyển khoản đã hết hạn trước khi xác nhận';
            await pendingPayment.save();
            return res.status(400).json({
                message: 'Mã chuyển khoản đã hết hạn. Vui lòng tạo mã mới.',
                error_code: 'TRANSFER_REQUEST_EXPIRED',
            });
        }

        const duplicatePaymentRef = await CustomerDebtPayment.findOne({
            store_id: storeId,
            payment_method: 'bank_transfer',
            payment_ref: ref,
            status: 'confirmed',
        }).lean();
        if (duplicatePaymentRef) {
            return res.json({ message: 'Giao dịch này đã được xác nhận trước đó', customer });
        }

        // Khóa chống race-condition: chỉ 1 request được chuyển pending -> processing.
        lockedPendingPayment = await CustomerDebtPayment.findOneAndUpdate(
            {
                _id: pendingPayment._id,
                status: 'pending',
            },
            {
                $set: {
                    status: 'processing',
                    note: 'Đang xác minh giao dịch SePay',
                },
            },
            { new: true }
        );
        if (!lockedPendingPayment) {
            return res.status(409).json({
                message: 'Yêu cầu đang được xử lý bởi phiên khác. Vui lòng chờ vài giây rồi thử lại.',
                error_code: 'TRANSFER_CONFIRM_IN_PROGRESS',
            });
        }

        const accountFilter = String(process.env.SEPAY_ACCOUNT_NUMBER || '').trim();
        if (!accountFilter) {
            lockedPendingPayment.status = 'pending';
            lockedPendingPayment.note = 'Thiếu cấu hình SEPAY_ACCOUNT_NUMBER';
            await lockedPendingPayment.save();
            return res.status(500).json({
                message: 'Thiếu cấu hình SEPAY_ACCOUNT_NUMBER. Không thể xác minh chuyển khoản an toàn.',
                error_code: 'SEPAY_ACCOUNT_CONFIG_REQUIRED',
            });
        }
        const transactions = await fetchSepayTransactionsByAmount(payAmount);
        const normalizedRef = normalizePaymentRef(ref);
        const matchedTx = transactions.find((tx) => {
            const contentRaw = String(tx?.transaction_content || tx?.content || tx?.description || '').toUpperCase();
            const normalizedContent = normalizePaymentRef(contentRaw);
            const amountIn = parseAmount(tx?.amount_in ?? tx?.amount ?? tx?.transferAmount);
            const accountNumber = String(tx?.account_number || tx?.accountNumber || '');
            const accountOk = !accountFilter || accountNumber === accountFilter;
            return accountOk && amountIn === payAmount && normalizedContent.includes(normalizedRef);
        });

        if (!matchedTx) {
            lockedPendingPayment.status = 'pending';
            lockedPendingPayment.note = 'Chưa tìm thấy giao dịch chuyển khoản khớp';
            await lockedPendingPayment.save();
            return res.status(400).json({
                message: 'Chưa tìm thấy giao dịch chuyển khoản khớp. Vui lòng kiểm tra tiền đã về và nội dung CK đúng mã.',
                error_code: 'TRANSFER_NOT_CONFIRMED',
            });
        }

        const providerTxnId = String(matchedTx.id || matchedTx.reference_number || matchedTx.referenceCode || '').trim();
        if (providerTxnId) {
            const usedInDebtPayment = await CustomerDebtPayment.findOne({
                provider_txn_id: providerTxnId,
                status: 'confirmed',
            }).lean();
            if (usedInDebtPayment) {
                lockedPendingPayment.status = 'pending';
                lockedPendingPayment.note = 'provider_txn_id đã được dùng trước đó';
                await lockedPendingPayment.save();
                return res.status(400).json({
                    message: 'Giao dịch SePay này đã được dùng để xác nhận trước đó.',
                    error_code: 'SEPAY_TXN_ALREADY_USED',
                });
            }
            const usedInInvoicePayment = await PaymentTransaction.findOne({
                provider_txn_id: providerTxnId,
                status: 'matched',
            }).lean();
            if (usedInInvoicePayment) {
                lockedPendingPayment.status = 'pending';
                lockedPendingPayment.note = 'provider_txn_id đã dùng cho hóa đơn bán hàng';
                await lockedPendingPayment.save();
                return res.status(400).json({
                    message: 'Giao dịch SePay này đã dùng để thanh toán hóa đơn khác.',
                    error_code: 'SEPAY_TXN_ALREADY_MATCHED_INVOICE',
                });
            }
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const customerInTx = await Customer.findOne({ _id: id, store_id: storeId }).session(session);
                if (!customerInTx) {
                    throw new Error('CUSTOMER_NOT_FOUND_IN_TX');
                }
                const previousDebt = Number(customerInTx.debt_account || 0);
                if (payAmount > previousDebt) {
                    throw new Error('OVERPAY_IN_TX');
                }
                customerInTx.debt_account = Math.max(0, previousDebt - payAmount);
                customerInTx.updated_at = new Date();
                await customerInTx.save({ session });

                await settlePendingDebtInvoicesFIFO(
                    id,
                    payAmount,
                    storeId,
                    `Thu nợ chuyển khoản (${ref})`,
                    { session }
                );

                const receivedAt = matchedTx?.transaction_date ? new Date(matchedTx.transaction_date) : new Date();
                const lockUpdate = await CustomerDebtPayment.updateOne(
                    { _id: lockedPendingPayment._id, status: 'processing' },
                    {
                        $set: {
                            status: 'confirmed',
                            provider_txn_id: providerTxnId || '',
                            note: `Thu nợ qua chuyển khoản (${ref})`,
                            received_at: receivedAt,
                        },
                    }
                ).session(session);
                if (!lockUpdate.modifiedCount) {
                    throw new Error('PAYMENT_LOCK_LOST');
                }

                await upsertSystemCashFlow({
                    storeId,
                    type: 'INCOME',
                    category: 'OTHER',
                    amount: payAmount,
                    paymentMethod: 'bank_transfer',
                    referenceModel: 'customer_debt_payment',
                    referenceId: lockedPendingPayment._id,
                    note: `Thu no khach hang ${customer.full_name} (${ref})`,
                    actorId: req.user.id,
                    transactedAt: receivedAt,
                    session,
                });

                const AuditLog = require('../models/AuditLog');
                await AuditLog.create([{
                    user_id: req.user.id,
                    action: `Xác nhận thu nợ CK khách hàng ${customer.full_name}: ${payAmount.toLocaleString('vi-VN')}₫ (${ref})`,
                    entity: 'Customer',
                    entity_id: customer._id,
                    ip_address: req.ip
                }], { session });

                if (providerTxnId) {
                    await PaymentTransaction.updateOne(
                        { provider_txn_id: providerTxnId },
                        {
                            $set: {
                                storeId,
                                status: 'matched',
                                payment_ref_matched: ref,
                            },
                        },
                        { upsert: false }
                    ).session(session);
                }
            });
        } finally {
            await session.endSession();
        }

        const refreshedCustomer = await Customer.findOne({ _id: id, store_id: storeId }).lean();
        res.json({ message: 'Xác nhận thanh toán nợ chuyển khoản thành công', customer: refreshedCustomer || customer });
    } catch (err) {
        if (lockedPendingPayment && lockedPendingPayment.status === 'processing') {
            await CustomerDebtPayment.updateOne(
                { _id: lockedPendingPayment._id, status: 'processing' },
                { $set: { status: 'pending', note: 'Lỗi hệ thống khi xác nhận, vui lòng thử lại' } }
            ).catch(() => {});
        }
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi xác nhận chuyển khoản' });
    }
});

// POST /api/customers/:id/pay-debt/cancel-transfer
// Hủy yêu cầu thu nợ chuyển khoản đang pending (khi user đóng modal/hủy thao tác).
router.post('/:id/pay-debt/cancel-transfer', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        const { payment_ref } = req.body || {};
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }
        const ref = String(payment_ref || '').trim().toUpperCase();
        if (!ref) {
            return res.status(400).json({ message: 'Thiếu mã tham chiếu cần hủy' });
        }

        const customer = await Customer.findOne({ _id: id, store_id: storeId }).select('_id').lean();
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });
        }

        await CustomerDebtPayment.updateMany(
            {
                customer_id: customer._id,
                store_id: storeId,
                payment_method: 'bank_transfer',
                payment_ref: ref,
                status: 'pending',
            },
            {
                $set: {
                    status: 'cancelled',
                    note: 'Người dùng hủy yêu cầu chuyển khoản',
                },
            }
        );

        return res.json({ message: 'Đã hủy yêu cầu chuyển khoản' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Lỗi server khi hủy yêu cầu chuyển khoản' });
    }
});

// POST /api/customers/:id/pay-debt - Thu nợ tiền mặt (thực thu ngay)
router.post('/:id/pay-debt', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        const { amount, payment_method = 'cash' } = req.body;

        if (payment_method !== 'cash') {
            return res.status(400).json({
                message: 'Thu nợ chuyển khoản phải dùng luồng xác nhận chuyển khoản',
                error_code: 'USE_TRANSFER_CONFIRM_FLOW',
            });
        }
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }

        const findQuery = { _id: id, store_id: storeId };
        const customer = await Customer.findOne(findQuery);
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });
        }

        const payAmount = Number(amount) || 0;
        if (payAmount <= 0) {
            return res.status(400).json({ message: 'Số tiền thanh toán phải lớn hơn 0' });
        }
        if (payAmount > Number(customer.debt_account || 0)) {
            return res.status(400).json({ message: 'Số tiền thu nợ không được vượt dư nợ hiện tại' });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const customerInTx = await Customer.findOne({ _id: id, store_id: storeId }).session(session);
                if (!customerInTx) {
                    throw new Error('CUSTOMER_NOT_FOUND_IN_TX');
                }
                const previousDebt = Number(customerInTx.debt_account || 0);
                if (payAmount > previousDebt) {
                    throw new Error('OVERPAY_IN_TX');
                }
                customerInTx.debt_account = Math.max(0, previousDebt - payAmount);
                customerInTx.updated_at = new Date();
                await customerInTx.save({ session });

                await settlePendingDebtInvoicesFIFO(
                    id,
                    payAmount,
                    storeId,
                    `Thu nợ tiền mặt ngày ${new Date().toLocaleDateString('vi-VN')}`,
                    { session }
                );

                const [cashDebtPayment] = await CustomerDebtPayment.create([{
                    customer_id: customerInTx._id,
                    store_id: storeId,
                    amount: payAmount,
                    payment_method: 'cash',
                    status: 'confirmed',
                    note: 'Thu nợ tiền mặt',
                    received_at: new Date(),
                    created_by: req.user.id,
                }], { session });

                await upsertSystemCashFlow({
                    storeId,
                    type: 'INCOME',
                    category: 'OTHER',
                    amount: payAmount,
                    paymentMethod: 'cash',
                    referenceModel: 'customer_debt_payment',
                    referenceId: cashDebtPayment._id,
                    note: `Thu no tien mat khach hang ${customerInTx.full_name}`,
                    actorId: req.user.id,
                    transactedAt: new Date(),
                    session,
                });

                const AuditLog = require('../models/AuditLog');
                await AuditLog.create([{
                    user_id: req.user.id,
                    action: `Thu nợ tiền mặt khách hàng ${customerInTx.full_name}: ${payAmount.toLocaleString('vi-VN')}₫`,
                    entity: 'Customer',
                    entity_id: customerInTx._id,
                    ip_address: req.ip
                }], { session });
            });
        } finally {
            await session.endSession();
        }

        const refreshedCustomer = await Customer.findOne({ _id: id, store_id: storeId }).lean();
        res.json({ message: 'Thanh toán nợ tiền mặt thành công', customer: refreshedCustomer || customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi thanh toán nợ' });
    }
});

// GET /api/customers/:id/debt-payments - Lịch sử thanh toán nợ của khách hàng
router.get('/:id/debt-payments', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = getStrictStoreId(req, res);
        if (!storeId) return;
        const { id } = req.params;
        const { limit = 100 } = req.query;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID khách hàng không hợp lệ' });
        }
        const customerQuery = { _id: id, store_id: storeId };
        const customer = await Customer.findOne(customerQuery).select('_id').lean();
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng trong phạm vi cửa hàng của bạn' });
        }

        const paymentFilter = { customer_id: id, store_id: storeId, status: 'confirmed' };
        const payments = await CustomerDebtPayment.find(paymentFilter)
            .sort({ received_at: -1 })
            .limit(Math.min(500, Math.max(1, Number(limit) || 100)))
            .lean();
        return res.json({ payments });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Lỗi server khi tải lịch sử thanh toán nợ' });
    }
});

module.exports = router;
