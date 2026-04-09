const express = require('express');
const mongoose = require('mongoose');
const SupplierPayable = require('../models/SupplierPayable');
const SupplierPayment = require('../models/SupplierPayment');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recalculatePayable, refreshSupplierPayableCache } = require('../utils/supplierPayableUtils');

const router = express.Router();

function toOid(id) {
    return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

// ─── GET /api/supplier-payables ─────────────────────────────────────────────
// List công nợ NCC (tổng hợp hoặc theo supplier_id)
// Query: supplier_id, status, page, limit
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { supplier_id, status, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const filter = { storeId: toOid(req.user.storeId) };
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = toOid(supplier_id);
        }
        const validStatuses = ['open', 'partial', 'paid', 'cancelled'];
        if (status && validStatuses.includes(status)) filter.status = status;

        const total = await SupplierPayable.countDocuments(filter);
        const payables = await SupplierPayable.find(filter)
            .sort({ due_date: 1, created_at: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .populate('supplier_id', 'name phone email')
            .populate('source_id', 'total_amount received_at reason')
            .populate('created_by', 'fullName email')
            .lean();

        // Tính derived status overdue cho từng payable
        const now = new Date();
        const result = payables.map((p) => ({
            ...p,
            is_overdue: p.remaining_amount > 0 && p.due_date && new Date(p.due_date) < now,
        }));

        return res.json({
            payables: result,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum) || 1,
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
        const storeOid = toOid(req.user.storeId);
        const now = new Date();

        const [aggBySupplier, totalStats] = await Promise.all([
            SupplierPayable.aggregate([
                { $match: { storeId: storeOid, status: { $in: ['open', 'partial'] } } },
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
                { $match: { storeId: storeOid, status: { $in: ['open', 'partial'] } } },
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
            .populate('source_id', 'total_amount received_at reason items')
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

        const now = new Date();
        return res.json({
            payable: {
                ...payable,
                is_overdue: payable.remaining_amount > 0 && payable.due_date && new Date(payable.due_date) < now,
            },
            allocations,
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
        } = req.body || {};

        if (!supplier_id || !mongoose.isValidObjectId(supplier_id)) {
            return res.status(400).json({ message: 'supplier_id là bắt buộc' });
        }
        const amount = Number(total_amount);
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'total_amount phải lớn hơn 0' });
        }

        const storeOid = toOid(req.user.storeId);
        const supplierOid = toOid(supplier_id);

        // Lấy các khoản nợ còn dư — FIFO: due_date ASC, created_at ASC
        const openPayables = await SupplierPayable.find({
            supplier_id: supplierOid,
            storeId: storeOid,
            status: { $in: ['open', 'partial'] },
            remaining_amount: { $gt: 0 },
        }).sort({ due_date: 1, created_at: 1 });

        if (openPayables.length === 0) {
            return res.status(400).json({ message: 'Nhà cung cấp này hiện không có khoản nợ nào' });
        }

        const totalRemaining = openPayables.reduce((s, p) => s + p.remaining_amount, 0);
        if (amount > totalRemaining + 0.01) {
            return res.status(400).json({
                message: `Số tiền thanh toán (${amount.toLocaleString('vi-VN')}đ) vượt quá tổng còn nợ (${totalRemaining.toLocaleString('vi-VN')}đ)`,
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

        const filter = { storeId: toOid(req.user.storeId) };
        if (supplier_id && mongoose.isValidObjectId(supplier_id)) {
            filter.supplier_id = toOid(supplier_id);
        }

        const total = await SupplierPayment.countDocuments(filter);
        const payments = await SupplierPayment.find(filter)
            .sort({ payment_date: -1, created_at: -1 })
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

module.exports = router;
