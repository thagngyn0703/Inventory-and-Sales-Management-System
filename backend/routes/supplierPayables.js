const express = require('express');
const mongoose = require('mongoose');
const SupplierPayable = require('../models/SupplierPayable');
const SupplierPayment = require('../models/SupplierPayment');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const Supplier = require('../models/Supplier');
const SupplierDebtHistory = require('../models/SupplierDebtHistory');
const SupplierDebtStatement = require('../models/SupplierDebtStatement');
const SupplierReturn = require('../models/SupplierReturn');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recalculatePayable, refreshSupplierPayableCache } = require('../utils/supplierPayableUtils');
const { upsertSystemCashFlow } = require('../utils/cashflowUtils');
const { logAudit } = require('../utils/audit');

const router = express.Router();

function toOid(id) {
    return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

function getStoreOidFromUser(req) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return null;
    const oid = toOid(req.user?.storeId);
    return oid || '__FORBIDDEN__';
}

function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

// ─── GET /api/supplier-payables ─────────────────────────────────────────────
// List công nợ NCC (tổng hợp hoặc theo supplier_id)
// Query: supplier_id, status, page, limit
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { supplier_id, status, page = '1', limit = '20', created_from, created_to } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const storeOid = getStoreOidFromUser(req);
        if (storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const filter = storeOid ? { storeId: storeOid } : {};
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = toOid(supplier_id);
        }
        const validStatuses = ['open', 'partial', 'paid', 'cancelled'];
        if (status && validStatuses.includes(status)) filter.status = status;
        if (created_from || created_to) {
            const createdAtFilter = {};
            if (created_from) {
                const from = new Date(created_from);
                from.setHours(0, 0, 0, 0);
                if (!Number.isNaN(from.getTime())) createdAtFilter.$gte = from;
            }
            if (created_to) {
                const to = new Date(created_to);
                to.setHours(23, 59, 59, 999);
                if (!Number.isNaN(to.getTime())) createdAtFilter.$lte = to;
            }
            if (Object.keys(createdAtFilter).length > 0) filter.created_at = createdAtFilter;
        }

        const [total, summaryAgg, payables] = await Promise.all([
            SupplierPayable.countDocuments(filter),
            SupplierPayable.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        total_amount: { $sum: '$total_amount' },
                        total_paid: { $sum: '$paid_amount' },
                        total_remaining: { $sum: '$remaining_amount' },
                        order_count: { $sum: 1 },
                    },
                },
            ]),
            SupplierPayable.find(filter)
                .sort({ created_at: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate('supplier_id', 'name phone email')
                .populate('source_id', 'total_amount received_at reason')
                .populate('created_by', 'fullName email')
                .lean(),
        ]);

        const payableIds = payables.map((p) => p._id);
        const paymentMeta = payableIds.length
            ? await SupplierPaymentAllocation.aggregate([
                { $match: { payable_id: { $in: payableIds } } },
                {
                    $lookup: {
                        from: 'supplierpayments',
                        localField: 'payment_id',
                        foreignField: '_id',
                        as: 'payment',
                    },
                },
                { $unwind: '$payment' },
                {
                    $group: {
                        _id: '$payable_id',
                        payment_count: { $sum: 1 },
                        last_payment_at: {
                            $max: {
                                $ifNull: ['$payment.payment_date', '$payment.created_at'],
                            },
                        },
                    },
                },
            ])
            : [];
        const paymentMetaMap = new Map(paymentMeta.map((m) => [String(m._id), m]));

        // Tính derived status overdue cho từng payable
        const now = new Date();
        const result = payables.map((p) => ({
            ...p,
            is_overdue: p.remaining_amount > 0 && p.due_date && new Date(p.due_date) < now,
            payment_count: paymentMetaMap.get(String(p._id))?.payment_count || 0,
            last_payment_at: paymentMetaMap.get(String(p._id))?.last_payment_at || null,
        }));
        const summary = summaryAgg[0] || {
            total_amount: 0,
            total_paid: 0,
            total_remaining: 0,
            order_count: 0,
        };

        return res.json({
            payables: result,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum) || 1,
            summary,
        });
    } catch (err) {
        console.error('GET /supplier-payables error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// ─── GET /api/supplier-payables/summary ─────────────────────────────────────
// Tổng hợp theo NCC: total_remaining, total_overdue, số phiếu mở
router.get('/summary', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeOid = getStoreOidFromUser(req);
        if (storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const now = new Date();

        const [aggBySupplier, totalStats] = await Promise.all([
            SupplierPayable.aggregate([
                { $match: { ...(storeOid ? { storeId: storeOid } : {}), status: { $in: ['open', 'partial'] } } },
                {
                    $group: {
                        _id: '$supplier_id',
                        total_remaining: { $sum: '$remaining_amount' },
                        overdue_remaining: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $gt: ['$remaining_amount', 0] }, { $lt: ['$due_date', now] }] },
                                    '$remaining_amount',
                                    0,
                                ],
                            },
                        },
                        open_count: { $sum: 1 },
                    },
                },
                { $sort: { total_remaining: -1 } },
                {
                    $lookup: {
                        from: 'suppliers',
                        localField: '_id',
                        foreignField: '_id',
                        as: '_supplierLookup',
                    },
                },
                // Dùng $arrayElemAt thay $unwind — tránh lỗi option $unwind trên một số bản MongoDB/driver
                {
                    $addFields: {
                        supplier: { $arrayElemAt: ['$_supplierLookup', 0] },
                    },
                },
                { $project: { _supplierLookup: 0 } },
            ]),
            SupplierPayable.aggregate([
                { $match: { ...(storeOid ? { storeId: storeOid } : {}), status: { $in: ['open', 'partial'] } } },
                {
                    $group: {
                        _id: null,
                        total_remaining: { $sum: '$remaining_amount' },
                        overdue_remaining: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $gt: ['$remaining_amount', 0] }, { $lt: ['$due_date', now] }] },
                                    '$remaining_amount',
                                    0,
                                ],
                            },
                        },
                        total_open: { $sum: 1 },
                        supplier_count: { $addToSet: '$supplier_id' },
                    },
                },
            ]),
        ]);

        const stats = totalStats[0] || {
            total_remaining: 0,
            overdue_remaining: 0,
            total_open: 0,
            supplier_count: [],
        };

        return res.json({
            total_remaining: stats.total_remaining,
            overdue_remaining: stats.overdue_remaining,
            open_count: stats.total_open,
            supplier_count: Array.isArray(stats.supplier_count) ? stats.supplier_count.length : 0,
            by_supplier: aggBySupplier.map((s) => ({
                supplier_id: s._id,
                supplier_name: s.supplier?.name ?? '—',
                supplier_phone: s.supplier?.phone ?? '',
                total_remaining: s.total_remaining,
                overdue_remaining: s.overdue_remaining,
                open_count: s.open_count,
            })),
        });
    } catch (err) {
        console.error('GET /supplier-payables/summary error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// ─── GET /api/supplier-payables/:id ─────────────────────────────────────────
router.get('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

        const payable = await SupplierPayable.findById(id)
            .populate('supplier_id', 'name phone email address')
            .populate({
                path: 'source_id',
                select: 'total_amount received_at reason items',
                populate: {
                    path: 'items.product_id',
                    select: 'name sku base_unit',
                },
            })
            .populate('created_by', 'fullName email')
            .lean();

        if (!payable) return res.status(404).json({ message: 'Không tìm thấy khoản nợ' });
        if (req.user.role !== 'admin' && String(payable.storeId) !== req.user.storeId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Lịch sử thanh toán
        const allocations = await SupplierPaymentAllocation.find({ payable_id: payable._id })
            .populate({
                path: 'payment_id',
                select: 'payment_date payment_method reference_code note created_by total_amount',
                populate: { path: 'created_by', select: 'fullName email' },
            })
            .sort({ created_at: -1 })
            .lean();
        const paymentIds = allocations
            .map((a) => a.payment_id?._id)
            .filter((pid) => mongoose.isValidObjectId(pid));
        const linkedReturns = paymentIds.length
            ? await SupplierReturn.find({
                payment_id: { $in: paymentIds },
                ...(req.user.role === 'admin' ? {} : { storeId: payable.storeId }),
            })
                .select('_id payment_id return_date reference_code')
                .lean()
            : [];
        const returnByPayment = new Map(linkedReturns.map((row) => [String(row.payment_id), row]));
        const allocationsWithRefs = allocations.map((a) => ({
            ...a,
            supplier_return: a.payment_id?._id
                ? (returnByPayment.get(String(a.payment_id._id)) || null)
                : null,
        }));

        const now = new Date();
        return res.json({
            payable: {
                ...payable,
                is_overdue: payable.remaining_amount > 0 && payable.due_date && new Date(payable.due_date) < now,
            },
            allocations: allocationsWithRefs,
        });
    } catch (err) {
        console.error('GET /supplier-payables/:id error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// ─── POST /api/supplier-payments — Ghi nhận thanh toán NCC (manager) ─────────
// FIFO: tự động phân bổ vào các khoản nợ cũ nhất (due_date ASC, created_at ASC)
router.post('/payments', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const {
            supplier_id,
            total_amount,
            payment_date,
            payment_method = 'cash',
            reference_code,
            note,
            payable_ids,
        } = req.body || {};

        if (!supplier_id || !mongoose.isValidObjectId(supplier_id)) {
            return res.status(400).json({ message: 'supplier_id là bắt buộc' });
        }
        const amount = Number(total_amount);
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'total_amount phải lớn hơn 0' });
        }

        const storeOid = getStoreOidFromUser(req);
        if (!storeOid || storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const supplierOid = toOid(supplier_id);
        const supplierBefore = await Supplier.findById(supplierOid).select('current_debt').lean();

        const requestedPayableIds = Array.isArray(payable_ids)
            ? payable_ids
                .map((id) => (mongoose.isValidObjectId(id) ? toOid(id) : null))
                .filter(Boolean)
            : [];
        const requestedPayableIdSet = requestedPayableIds.length
            ? new Set(requestedPayableIds.map((id) => String(id)))
            : null;
        if (Array.isArray(payable_ids) && payable_ids.length > 0 && requestedPayableIds.length === 0) {
            return res.status(400).json({ message: 'payable_ids không hợp lệ' });
        }

        // Lấy các khoản nợ còn dư — FIFO: due_date ASC, created_at ASC
        const openPayables = await SupplierPayable.find({
            supplier_id: supplierOid,
            storeId: storeOid,
            status: { $in: ['open', 'partial'] },
            remaining_amount: { $gt: 0 },
            ...(requestedPayableIds.length ? { _id: { $in: requestedPayableIds } } : {}),
        }).sort({ due_date: 1, created_at: 1 });

        if (openPayables.length === 0) {
            return res.status(400).json({ message: 'Nhà cung cấp này hiện không có khoản nợ nào' });
        }

        if (requestedPayableIdSet && openPayables.length !== requestedPayableIdSet.size) {
            return res.status(400).json({
                message: 'Một hoặc nhiều khoản nợ đã chọn không thuộc nhà cung cấp này, hoặc đã được thanh toán.',
            });
        }

        const totalRemaining = openPayables.reduce((s, p) => s + p.remaining_amount, 0);
        if (amount - totalRemaining > 0.01) {
            return res.status(400).json({
                message: `Số tiền thanh toán không được vượt tổng còn nợ của các đơn đã chọn (${totalRemaining.toLocaleString('vi-VN')}đ)`,
            });
        }

        session.startTransaction();

        // Tạo payment
        const [payment] = await SupplierPayment.create(
            [
                {
                    supplier_id: supplierOid,
                    storeId: storeOid,
                    total_amount: amount,
                    payment_date: payment_date ? new Date(payment_date) : new Date(),
                    payment_method,
                    reference_code: reference_code || undefined,
                    note: note || undefined,
                    created_by: req.user.id,
                },
            ],
            { session }
        );

        // FIFO allocation
        let remaining = amount;
        const allocations = [];
        const updatedPayableIds = [];

        for (const payable of openPayables) {
            if (remaining <= 0) break;
            const apply = Math.min(payable.remaining_amount, remaining);
            remaining = Math.round((remaining - apply) * 100) / 100;

            allocations.push({
                payment_id: payment._id,
                payable_id: payable._id,
                amount: Math.round(apply * 100) / 100,
            });
            updatedPayableIds.push(payable._id);
        }

        await SupplierPaymentAllocation.insertMany(allocations, { session });

        // Commit trước khi recalculate (recalculate dùng aggregate — không cần session)
        await session.commitTransaction();

        // Tính lại ngoài transaction (aggregate không cần session)
        for (const pid of updatedPayableIds) {
            await recalculatePayable(pid);
        }
        await refreshSupplierPayableCache(supplierOid, storeOid);
        const supplierAfter = await Supplier.findById(supplierOid).select('current_debt').lean();
        const beforeDebt = round2(supplierBefore?.current_debt);
        const afterDebt = round2(supplierAfter?.current_debt);
        await SupplierDebtHistory.create({
            supplier_id: supplierOid,
            storeId: storeOid,
            type: 'DEBT_DECREASE_PAYMENT',
            reference_type: 'supplier_payment',
            reference_id: payment._id,
            before_debt: beforeDebt,
            change_amount: -round2(amount),
            after_debt: afterDebt,
            note: note || `Thanh toán công nợ NCC`,
            actor_id: req.user.id,
            created_at: new Date(),
        });
        await upsertSystemCashFlow({
            storeId: storeOid,
            type: 'EXPENSE',
            category: 'PURCHASE_PAYMENT',
            amount,
            paymentMethod: payment.payment_method,
            referenceModel: 'supplier_payment',
            referenceId: payment._id,
            note: `Thanh toan NCC #${String(payment._id).slice(-6).toUpperCase()}`,
            actorId: req.user.id,
            transactedAt: payment.payment_date || new Date(),
        });

        const populated = await SupplierPayment.findById(payment._id)
            .populate('supplier_id', 'name')
            .populate('created_by', 'fullName email')
            .lean();

        return res.status(201).json({ payment: populated, allocations_count: allocations.length });
    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('POST /supplier-payments error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    } finally {
        session.endSession();
    }
});

// ─── GET /api/supplier-payables/payments/history ────────────────────────────
// Lịch sử thanh toán theo NCC
router.get('/payments/history', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { supplier_id, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const storeOid = getStoreOidFromUser(req);
        if (storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const filter = storeOid ? { storeId: storeOid } : {};
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = toOid(supplier_id);
        }

        const total = await SupplierPayment.countDocuments(filter);
        const payments = await SupplierPayment.find(filter)
            .sort({ created_at: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .populate('supplier_id', 'name')
            .populate('created_by', 'fullName email')
            .lean();

        return res.json({
            payments,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum) || 1,
        });
    } catch (err) {
        console.error('GET /payments/history error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// ─── GET /api/supplier-payables/statements ───────────────────────────────────
router.get('/statements', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { supplier_id, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const storeOid = getStoreOidFromUser(req);
        if (!storeOid || storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const filter = { storeId: storeOid };
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = toOid(supplier_id);
        }
        const total = await SupplierDebtStatement.countDocuments(filter);
        const statements = await SupplierDebtStatement.find(filter)
            .sort({ created_at: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .populate('supplier_id', 'name phone email')
            .populate('created_by', 'fullName email')
            .populate('store_signed_by', 'fullName email')
            .lean();
        return res.json({ statements, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// ─── POST /api/supplier-payables/statements ──────────────────────────────────
router.post('/statements', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const storeOid = getStoreOidFromUser(req);
        if (!storeOid || storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const {
            supplier_id,
            period_from,
            period_to,
            installment_schedule = [],
            signature_note = '',
        } = req.body || {};
        if (!supplier_id || !mongoose.isValidObjectId(supplier_id)) {
            return res.status(400).json({ message: 'supplier_id không hợp lệ.' });
        }
        const supplierOid = toOid(supplier_id);
        const now = new Date();
        const from = period_from ? new Date(period_from) : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = period_to ? new Date(period_to) : now;
        const payables = await SupplierPayable.find({
            supplier_id: supplierOid,
            storeId: storeOid,
            status: { $in: ['open', 'partial'] },
            remaining_amount: { $gt: 0 },
        }).lean();
        const totalRemainingAmount = payables.reduce((sum, p) => sum + (Number(p.remaining_amount) || 0), 0);
        if (totalRemainingAmount <= 0) {
            return res.status(400).json({ message: 'Nhà cung cấp này không còn khoản nợ mở để lập biên bản.' });
        }
        const normalizedSchedule = Array.isArray(installment_schedule)
            ? installment_schedule
                .map((s) => ({
                    due_date: s?.due_date ? new Date(s.due_date) : null,
                    amount: Math.max(0, Number(s?.amount) || 0),
                    note: String(s?.note || '').trim(),
                }))
                .filter((s) => s.due_date && !Number.isNaN(s.due_date.getTime()) && s.amount > 0)
            : [];
        const statement = await SupplierDebtStatement.create({
            supplier_id: supplierOid,
            storeId: storeOid,
            period_from: from,
            period_to: to,
            total_remaining_amount: round2(totalRemainingAmount),
            installment_count: normalizedSchedule.length || 1,
            installment_schedule: normalizedSchedule,
            status: 'draft',
            signature_note: String(signature_note || '').trim(),
            created_by: req.user.id,
            created_at: new Date(),
            updated_at: new Date(),
        });
        await logAudit({
            storeId: storeOid,
            actorId: req.user.id,
            action: 'supplier_debt_statement_created',
            entityType: 'SupplierDebtStatement',
            entityId: statement._id,
            note: `Tạo biên bản công nợ NCC cho tổng dư nợ ${round2(totalRemainingAmount).toLocaleString('vi-VN')}đ`,
            metadata: { supplier_id: supplierOid, installment_count: normalizedSchedule.length || 1 },
        });
        return res.status(201).json({ statement });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// ─── PATCH /api/supplier-payables/statements/:id/sign ───────────────────────
router.patch('/statements/:id/sign', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid statement id' });
        const storeOid = getStoreOidFromUser(req);
        if (!storeOid || storeOid === '__FORBIDDEN__') {
            return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        }
        const { signer = 'store', supplier_signed_name = '' } = req.body || {};
        const statement = await SupplierDebtStatement.findOne({ _id: id, storeId: storeOid });
        if (!statement) return res.status(404).json({ message: 'Không tìm thấy biên bản công nợ.' });
        if (String(signer) === 'supplier') {
            const supplierSigner = String(supplier_signed_name || '').trim();
            if (!supplierSigner) return res.status(400).json({ message: 'Vui lòng nhập tên người đại diện nhà cung cấp.' });
            statement.supplier_signed_name = supplierSigner;
            statement.supplier_signed_at = new Date();
            statement.status = statement.store_signed_at ? 'fully_signed' : 'supplier_signed';
        } else {
            statement.store_signed_by = req.user.id;
            statement.store_signed_at = new Date();
            statement.status = statement.supplier_signed_at ? 'fully_signed' : 'store_signed';
        }
        statement.updated_at = new Date();
        await statement.save();
        await logAudit({
            storeId: storeOid,
            actorId: req.user.id,
            action: 'supplier_debt_statement_signed',
            entityType: 'SupplierDebtStatement',
            entityId: statement._id,
            note: String(signer) === 'supplier' ? 'Nhà cung cấp ký xác nhận công nợ.' : 'Cửa hàng ký xác nhận công nợ.',
            metadata: { signer: String(signer), status: statement.status },
        });
        return res.json({ statement });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
