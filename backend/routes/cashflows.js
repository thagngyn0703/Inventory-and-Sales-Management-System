const express = require('express');
const mongoose = require('mongoose');
const CashFlow = require('../models/CashFlow');
const { normalizeCategory } = require('../utils/cashflowUtils');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

function getStoreScopeFilter(req) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return {};
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) return null;
    return { storeId: req.user.storeId };
}

function buildCommonFilter(scopeFilter, query = {}) {
    const {
        type,
        category,
        payment_method,
        is_system,
    } = query || {};
    const filter = { ...scopeFilter };
    if (type && ['INCOME', 'EXPENSE'].includes(String(type).toUpperCase())) {
        filter.type = String(type).toUpperCase();
    }
    if (category && String(category).trim()) {
        filter.category = String(category).trim().toUpperCase();
    }
    if (payment_method && String(payment_method).trim()) {
        const pm = String(payment_method).trim().toUpperCase();
        if (['CASH', 'BANK_TRANSFER', 'E_WALLET', 'OTHER'].includes(pm)) {
            filter.payment_method = pm;
        }
    }
    if (is_system !== undefined && is_system !== '') {
        filter.is_system = String(is_system).toLowerCase() === 'true';
    }
    return filter;
}

// GET /api/cashflows/summary?from_date=&to_date=&type=&category=&payment_method=&is_system=
router.get('/summary', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const scopeFilter = getStoreScopeFilter(req);
        if (scopeFilter == null) {
            return res.status(403).json({
                message: 'Tài khoản chưa được gán cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }
        const { from_date, to_date } = req.query || {};
        if (!from_date) {
            return res.status(400).json({ message: 'from_date là bắt buộc' });
        }
        const from = new Date(from_date);
        if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
        const to = to_date ? new Date(to_date) : new Date();
        if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
        if (to < from) return res.status(400).json({ message: 'to_date phải lớn hơn hoặc bằng from_date' });

        const commonFilter = buildCommonFilter(scopeFilter, req.query);

        const [openingAgg, periodAgg] = await Promise.all([
            CashFlow.aggregate([
                {
                    $match: {
                        ...commonFilter,
                        transacted_at: { $lt: from },
                    },
                },
                {
                    $group: {
                        _id: '$type',
                        total_amount: { $sum: '$amount' },
                    },
                },
            ]),
            CashFlow.aggregate([
                {
                    $match: {
                        ...commonFilter,
                        transacted_at: { $gte: from, $lte: to },
                    },
                },
                {
                    $facet: {
                        income: [
                            { $match: { type: 'INCOME' } },
                            { $group: { _id: null, total: { $sum: '$amount' } } },
                        ],
                        expense: [
                            { $match: { type: 'EXPENSE' } },
                            { $group: { _id: null, total: { $sum: '$amount' } } },
                        ],
                    },
                },
            ]),
        ]);

        const openingIncome = round2(openingAgg.find((x) => x._id === 'INCOME')?.total_amount || 0);
        const openingExpense = round2(openingAgg.find((x) => x._id === 'EXPENSE')?.total_amount || 0);
        const openingBalance = round2(openingIncome - openingExpense);

        const periodIncome = round2(periodAgg?.[0]?.income?.[0]?.total || 0);
        const periodExpense = round2(periodAgg?.[0]?.expense?.[0]?.total || 0);
        const closingBalance = round2(openingBalance + periodIncome - periodExpense);

        return res.json({
            from_date: from,
            to_date: to,
            summary: {
                opening_balance: openingBalance,
                period_income: periodIncome,
                period_expense: periodExpense,
                closing_balance: closingBalance,
            },
        });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/cashflows?type=&category=&payment_method=&is_system=&from_date=&to_date=&page=&limit=
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const scopeFilter = getStoreScopeFilter(req);
        if (scopeFilter == null) {
            return res.status(403).json({
                message: 'Tài khoản chưa được gán cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }

        const {
            type,
            category,
            payment_method,
            is_system,
            from_date,
            to_date,
            page = '1',
            limit = '20',
        } = req.query || {};
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const filter = buildCommonFilter(scopeFilter, { type, category, payment_method, is_system });
        if (from_date || to_date) {
            const range = {};
            if (from_date) {
                const from = new Date(from_date);
                if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
                range.$gte = from;
            }
            if (to_date) {
                const to = new Date(to_date);
                if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
                range.$lte = to;
            }
            filter.transacted_at = range;
        }

        const [total, rows, summaryAgg] = await Promise.all([
            CashFlow.countDocuments(filter),
            CashFlow.find(filter)
                .sort({ transacted_at: -1, _id: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate('actor_id', 'fullName email')
                .lean(),
            CashFlow.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: '$type',
                        total_amount: { $sum: '$amount' },
                    },
                },
            ]),
        ]);

        const totalIncome = round2(summaryAgg.find((s) => s._id === 'INCOME')?.total_amount || 0);
        const totalExpense = round2(summaryAgg.find((s) => s._id === 'EXPENSE')?.total_amount || 0);

        return res.json({
            cashflows: rows.map((row) => ({
                ...row,
                actor_name: row.actor_id?.fullName || row.actor_id?.email || 'Hệ thống',
            })),
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
            summary: {
                total_income: totalIncome,
                total_expense: totalExpense,
                net_cashflow: round2(totalIncome - totalExpense),
            },
        });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/cashflows - ghi tay thu/chi ngoài hệ thống
router.post('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const scopeFilter = getStoreScopeFilter(req);
        if (scopeFilter == null || !scopeFilter.storeId) {
            return res.status(403).json({
                message: 'Tài khoản chưa được gán cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }
        const {
            type,
            category,
            amount,
            payment_method = 'CASH',
            note,
            transacted_at,
            reference_model,
            reference_id,
        } = req.body || {};

        const finalType = String(type || '').toUpperCase();
        if (!['INCOME', 'EXPENSE'].includes(finalType)) {
            return res.status(400).json({ message: 'type phải là INCOME hoặc EXPENSE' });
        }
        const finalCategory = normalizeCategory(category, finalType, false);
        const finalAmount = Number(amount);
        if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
            return res.status(400).json({ message: 'amount phải lớn hơn 0' });
        }
        const pm = String(payment_method || 'CASH').toUpperCase();
        if (!['CASH', 'BANK_TRANSFER', 'E_WALLET', 'OTHER'].includes(pm)) {
            return res.status(400).json({ message: 'payment_method không hợp lệ' });
        }
        if (reference_id && !mongoose.isValidObjectId(reference_id)) {
            return res.status(400).json({ message: 'reference_id không hợp lệ' });
        }
        const txAt = transacted_at ? new Date(transacted_at) : new Date();
        if (Number.isNaN(txAt.getTime())) {
            return res.status(400).json({ message: 'transacted_at không hợp lệ' });
        }

        const doc = await CashFlow.create({
            storeId: scopeFilter.storeId,
            type: finalType,
            category: finalCategory,
            amount: round2(finalAmount),
            payment_method: pm,
            is_system: false,
            note: note ? String(note).trim() : undefined,
            transacted_at: txAt,
            reference_model: reference_model ? String(reference_model).trim() : undefined,
            reference_id: reference_id || undefined,
            actor_id: req.user.id,
            created_at: new Date(),
        });

        return res.status(201).json({ cashflow: doc });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
