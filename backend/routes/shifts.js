const express = require('express');
const mongoose = require('mongoose');
const ShiftSession = require('../models/ShiftSession');
const ShiftUser = require('../models/ShiftUser');
const SalesInvoice = require('../models/SalesInvoice');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sumPayment, normalizeNonNegativeInt } = require('../utils/invoicePaymentUtils');

const router = express.Router();

function assertStoreScope(req, res) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return true;
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) {
        res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        return false;
    }
    return true;
}

function derivePaymentSplitForLegacyInvoice(inv) {
    if (inv?.payment && typeof inv.payment === 'object') return sumPayment(inv.payment);
    const method = String(inv?.payment_method || 'cash').toLowerCase();
    const expected = normalizeNonNegativeInt(Number(inv?.total_amount || 0) + Number(inv?.previous_debt_paid || 0));
    if (method === 'bank_transfer' || method === 'card' || method === 'credit') {
        return { cash: 0, bank_transfer: expected, total: expected };
    }
    if (method === 'debt') return { cash: 0, bank_transfer: 0, total: 0 };
    return { cash: expected, bank_transfer: 0, total: expected };
}

async function computeShiftExpected(storeId, shiftId) {
    const filter = {
        store_id: storeId,
        shift_id: shiftId,
        status: 'confirmed',
    };
    const invoices = await SalesInvoice.find(filter)
        .select('payment payment_method payment_status total_amount previous_debt_paid')
        .lean();

    let expectedCash = 0;
    let expectedBankPaid = 0;
    let expectedBankPending = 0;

    for (const inv of invoices) {
        const p = derivePaymentSplitForLegacyInvoice(inv);
        expectedCash += Number(p.cash) || 0;
        if ((Number(p.bank_transfer) || 0) > 0) {
            if (String(inv.payment_status) === 'paid') expectedBankPaid += Number(p.bank_transfer) || 0;
            else expectedBankPending += Number(p.bank_transfer) || 0;
        }
    }
    return {
        expected_cash: Math.round(expectedCash),
        expected_bank: Math.round(expectedBankPaid),
        expected_bank_pending: Math.round(expectedBankPending),
    };
}

// GET /api/shifts/current
router.get('/current', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = req.user.storeId;
        const shift = await ShiftSession.findOne({ store_id: storeId, status: 'open' })
            .sort({ opened_at: -1 })
            .lean();
        return res.json({ shift: shift || null });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/shifts/open
router.post('/open', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = req.user.storeId;
        const opening_cash = normalizeNonNegativeInt(req.body?.opening_cash);

        const existing = await ShiftSession.findOne({ store_id: storeId, status: 'open' }).select('_id').lean();
        if (existing) {
            return res.status(409).json({ code: 'SHIFT_ALREADY_OPEN', message: 'Đang có ca mở trong cửa hàng.' });
        }

        const shift = await ShiftSession.create({
            store_id: storeId,
            opened_by: req.user.id,
            opened_at: new Date(),
            status: 'open',
            opening_cash,
            reconciliation_status: 'pending',
        });

        await ShiftUser.create({
            shift_id: shift._id,
            user_id: req.user.id,
            joined_at: new Date(),
            role_in_shift: 'primary',
        });

        return res.status(201).json({ shift });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/shifts/:id/join
router.post('/:id/join', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid shift id' });
        const shift = await ShiftSession.findById(id);
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        if (String(shift.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền truy cập ca này.' });
        }
        if (shift.status !== 'open') {
            return res.status(409).json({ code: 'SHIFT_NOT_OPEN', message: 'Ca đã đóng.' });
        }
        const role_in_shift = String(req.body?.role_in_shift || 'support');
        await ShiftUser.create({
            shift_id: shift._id,
            user_id: req.user.id,
            joined_at: new Date(),
            role_in_shift: role_in_shift === 'primary' ? 'primary' : 'support',
        });
        return res.json({ ok: true });
    } catch (err) {
        if (String(err?.code) === '11000') {
            return res.status(409).json({ code: 'ALREADY_IN_SHIFT', message: 'Bạn đang ở trong ca này.' });
        }
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/shifts/:id/leave
router.post('/:id/leave', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid shift id' });
        const shift = await ShiftSession.findById(id).select('store_id status').lean();
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        if (String(shift.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền truy cập ca này.' });
        }
        await ShiftUser.updateOne(
            { shift_id: id, user_id: req.user.id, left_at: null },
            { $set: { left_at: new Date() } }
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/shifts/:id/close
router.post('/:id/close', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid shift id' });

        const shift = await ShiftSession.findById(id);
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        if (String(shift.store_id) !== String(req.user.storeId) && String(req.user?.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Không có quyền đóng ca này.' });
        }
        if (shift.status !== 'open') {
            return res.status(409).json({ code: 'SHIFT_ALREADY_CLOSED', message: 'Ca đã đóng.' });
        }

        const actual_cash = normalizeNonNegativeInt(req.body?.actual_cash);
        const actual_bank = normalizeNonNegativeInt(req.body?.actual_bank);
        const reconciliation_status = String(req.body?.reconciliation_status || 'pending');
        const reconciliation_note = String(req.body?.reconciliation_note || '').trim();

        const expected = await computeShiftExpected(shift.store_id, shift._id);

        const target = normalizeNonNegativeInt(shift.target_float_cash || 1000000);
        const openingCash = normalizeNonNegativeInt(shift.opening_cash);
        const needFloat = Math.max(0, target - openingCash);
        const cash_to_keep = Math.min(needFloat, actual_cash);
        const cash_to_handover = Math.max(0, actual_cash - cash_to_keep);

        shift.expected_cash = expected.expected_cash;
        shift.expected_bank = expected.expected_bank;
        shift.expected_bank_pending = expected.expected_bank_pending;
        shift.actual_cash = actual_cash;
        shift.actual_bank = actual_bank;
        shift.cash_to_keep = cash_to_keep;
        shift.cash_to_handover = cash_to_handover;
        shift.discrepancy_cash = Math.round(actual_cash - expected.expected_cash);
        shift.discrepancy_bank = Math.round(actual_bank - expected.expected_bank);
        shift.reconciliation_status = ['pending', 'confirmed', 'disputed'].includes(reconciliation_status)
            ? reconciliation_status
            : 'pending';
        shift.reconciliation_note = reconciliation_note;
        shift.status = 'closed';
        shift.closed_by = req.user.id;
        shift.closed_at = new Date();
        shift.updated_at = new Date();
        await shift.save();

        return res.json({ shift });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/shifts/:id/report
router.get('/:id/report', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid shift id' });
        const shift = await ShiftSession.findById(id).lean();
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        const userRole = String(req.user?.role || '').toLowerCase();
        if (userRole !== 'admin' && String(shift.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền xem ca này.' });
        }
        const expected = await computeShiftExpected(shift.store_id, shift._id);
        const users = await ShiftUser.find({ shift_id: id }).populate('user_id', 'fullName email role employeeCode').lean();
        return res.json({
            shift,
            expected,
            users,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;

