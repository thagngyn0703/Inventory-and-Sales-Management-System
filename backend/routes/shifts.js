const express = require('express');
const mongoose = require('mongoose');
const ShiftSession = require('../models/ShiftSession');
const ShiftUser = require('../models/ShiftUser');
const SalesInvoice = require('../models/SalesInvoice');
const User = require('../models/User');
const PosRegister = require('../models/PosRegister');
const { ensureRegistersAndMigrateLegacyOpenShift } = require('../utils/posRegisterBootstrap');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sumPayment, normalizeNonNegativeInt } = require('../utils/invoicePaymentUtils');
const { decorateInvoiceListDisplayCode } = require('../utils/invoiceDisplayCode');

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

/** Trả về ObjectId string hợp lệ hoặc null nếu cần client chọn quầy (nhiều quầy). */
async function resolveRegisterId(storeId, rawFromClient) {
    await ensureRegistersAndMigrateLegacyOpenShift(storeId);
    const trimmed = rawFromClient != null ? String(rawFromClient).trim() : '';
    if (trimmed && mongoose.isValidObjectId(trimmed)) {
        const ok = await PosRegister.findOne({
            _id: trimmed,
            store_id: storeId,
            is_active: true,
        })
            .select('_id name')
            .lean();
        if (ok) return { id: String(ok._id), name: ok.name || '' };
        return null;
    }
    const regs = await PosRegister.find({ store_id: storeId, is_active: true }).sort({ sort_order: 1, _id: 1 }).lean();
    if (regs.length === 1) return { id: String(regs[0]._id), name: regs[0].name || '' };
    return null;
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

function parseLocalDateStart(dateText) {
    const raw = String(dateText || '').trim();
    if (!raw) return null;
    let y = 0;
    let m = 0;
    let d = 0;
    if (raw.includes('-')) {
        [y, m, d] = raw.split('-').map((x) => Number(x));
    } else if (raw.includes('/')) {
        // Support browser-locale payloads like MM/DD/YYYY
        const parts = raw.split('/').map((x) => Number(x));
        if (parts.length === 3) {
            m = parts[0];
            d = parts[1];
            y = parts[2];
        }
    }
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseLocalDateEnd(dateText) {
    const raw = String(dateText || '').trim();
    if (!raw) return null;
    let y = 0;
    let m = 0;
    let d = 0;
    if (raw.includes('-')) {
        [y, m, d] = raw.split('-').map((x) => Number(x));
    } else if (raw.includes('/')) {
        const parts = raw.split('/').map((x) => Number(x));
        if (parts.length === 3) {
            m = parts[0];
            d = parts[1];
            y = parts[2];
        }
    }
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function buildShiftInvoiceFilter(shift, participantUserIds = []) {
    const openedAt = shift?.opened_at ? new Date(shift.opened_at) : null;
    const closedAt = shift?.closed_at ? new Date(shift.closed_at) : new Date();
    const fallbackConditions = [];
    if (openedAt && !Number.isNaN(openedAt.getTime())) {
        fallbackConditions.push({
            invoice_at: {
                $gte: openedAt,
                $lte: closedAt,
            },
        });
    }
    return {
        store_id: shift.store_id,
        status: 'confirmed',
        $or: [
            { shift_id: shift._id },
            { $and: fallbackConditions },
        ],
    };
}

async function computeShiftExpected(shift, participantUserIds = []) {
    const filter = buildShiftInvoiceFilter(shift, participantUserIds);
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

async function computeShiftSalesSnapshot(shift, participantUserIds = []) {
    const invoices = await SalesInvoice.find(buildShiftInvoiceFilter(shift, participantUserIds))
        .select('payment total_amount')
        .lean();
    let cashCollected = 0;
    let bankCollected = 0;
    let totalRevenue = 0;
    for (const inv of invoices) {
        const p = sumPayment(inv.payment || {});
        cashCollected += Number(p.cash) || 0;
        bankCollected += Number(p.bank_transfer) || 0;
        totalRevenue += Number(inv.total_amount) || 0;
    }
    return {
        total_invoice_count: invoices.length,
        total_confirmed_revenue: Math.round(totalRevenue),
        total_cash_collected: Math.round(cashCollected),
        total_bank_collected: Math.round(bankCollected),
    };
}

async function computeShiftKpis(shift, participantUserIds = []) {
    const baseMatch = buildShiftInvoiceFilter(shift, participantUserIds);
    const [invoiceAgg = { invoice_count: 0, total_revenue: 0 }, profitAgg = { total_profit: 0 }] = await Promise.all([
        SalesInvoice.aggregate([
            {
                $match: baseMatch,
            },
            {
                $group: {
                    _id: null,
                    invoice_count: { $sum: 1 },
                    total_revenue: { $sum: { $ifNull: ['$total_amount', 0] } },
                },
            },
            { $project: { _id: 0, invoice_count: 1, total_revenue: 1 } },
        ]),
        SalesInvoice.aggregate([
            {
                $match: baseMatch,
            },
            { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: null,
                    total_profit: { $sum: { $ifNull: ['$items.line_profit', 0] } },
                },
            },
            { $project: { _id: 0, total_profit: 1 } },
        ]),
    ]);

    return {
        invoice_count: Math.max(0, Math.round(Number(invoiceAgg.invoice_count) || 0)),
        total_revenue: Math.max(0, Math.round(Number(invoiceAgg.total_revenue) || 0)),
        total_profit: Math.round(Number(profitAgg.total_profit) || 0),
    };
}

// GET /api/shifts/current?register_id=
router.get('/current', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = req.user.storeId;
        const resolved = await resolveRegisterId(storeId, req.query?.register_id);
        if (!resolved) {
            return res.status(400).json({
                code: 'REGISTER_REQUIRED',
                message: 'Vui lòng chọn quầy thanh toán để kiểm tra ca.',
            });
        }
        const shift = await ShiftSession.findOne({
            store_id: storeId,
            register_id: resolved.id,
            status: 'open',
        })
            .populate('opened_by', 'fullName email')
            .populate('register_id', 'name sort_order')
            .lean();
        return res.json({ shift: shift || null, register_id: resolved.id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/shifts?status=&from=&to=&user_id=&page=&limit=&keyword=
router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const page = Math.max(1, Number(req.query?.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
        const status = String(req.query?.status || '').trim();
        const from = String(req.query?.from || '').trim();
        const to = String(req.query?.to || '').trim();
        const keyword = String(req.query?.keyword || '').trim();
        const userId = String(req.query?.user_id || '').trim();
        const role = String(req.user?.role || '').toLowerCase();

        const filter = {};
        if (role !== 'admin') {
            filter.store_id = req.user.storeId;
        } else if (req.user?.storeId) {
            filter.store_id = req.user.storeId;
        }

        if (status === 'open' || status === 'closed') {
            filter.status = status;
        }

        if (userId && mongoose.isValidObjectId(userId)) {
            filter.opened_by = userId;
        }

        if (from || to) {
            const fromStart = from ? parseLocalDateStart(from) : null;
            const toEnd = to ? parseLocalDateEnd(to) : null;
            const overlapAnd = [];
            // Shift must start before/at range end
            if (toEnd) {
                overlapAnd.push({ opened_at: { $lte: toEnd } });
            }
            // Shift must end after/at range start, or still open
            if (fromStart) {
                overlapAnd.push({
                    $or: [
                        { closed_at: null },
                        { closed_at: { $gte: fromStart } },
                    ],
                });
            }
            if (overlapAnd.length > 0) {
                filter.$and = [...(filter.$and || []), ...overlapAnd];
            }
        }

        if (keyword) {
            const regex = new RegExp(keyword, 'i');
            const matchedUsers = await User.find({
                $or: [{ fullName: regex }, { email: regex }, { employeeCode: regex }],
            })
                .select('_id')
                .lean();
            const matchedUserIds = matchedUsers.map((u) => u._id);
            if (matchedUserIds.length > 0) {
                filter.$or = [{ opened_by: { $in: matchedUserIds } }, { closed_by: { $in: matchedUserIds } }];
            } else {
                return res.json({ shifts: [], total: 0, page, limit, totalPages: 0 });
            }
        }

        const total = await ShiftSession.countDocuments(filter);
        const shifts = await ShiftSession.find(filter)
            .populate('opened_by', 'fullName email employeeCode role')
            .populate('closed_by', 'fullName email employeeCode role')
            .populate('register_id', 'name sort_order')
            .sort({ opened_at: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const shiftIds = shifts.map((s) => s._id);
        const shiftUsers = shiftIds.length > 0
            ? await ShiftUser.find({ shift_id: { $in: shiftIds } })
                .populate('user_id', 'fullName email employeeCode role')
                .lean()
            : [];

        const usersByShift = new Map();
        for (const su of shiftUsers) {
            const key = String(su.shift_id);
            if (!usersByShift.has(key)) usersByShift.set(key, []);
            usersByShift.get(key).push({
                _id: su._id,
                user: su.user_id || null,
                joined_at: su.joined_at || null,
                left_at: su.left_at || null,
                role_in_shift: su.role_in_shift || 'support',
            });
        }

        const enriched = await Promise.all(
            shifts.map(async (shift) => {
                const participantUserIds = (usersByShift.get(String(shift._id)) || [])
                    .map((x) => x?.user?._id || x?.user)
                    .filter(Boolean);
                const kpis = await computeShiftKpis(shift, participantUserIds);
                return {
                    ...shift,
                    kpis,
                    users: usersByShift.get(String(shift._id)) || [],
                };
            })
        );

        return res.json({
            shifts: enriched,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// POST /api/shifts/open  body: { opening_cash, register_id? }
router.post('/open', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const storeId = req.user.storeId;
        const opening_cash = normalizeNonNegativeInt(req.body?.opening_cash);

        const resolved = await resolveRegisterId(storeId, req.body?.register_id);
        if (!resolved) {
            return res.status(400).json({
                code: 'REGISTER_REQUIRED',
                message: 'Vui lòng chọn quầy thanh toán trước khi mở ca.',
            });
        }

        const existing = await ShiftSession.findOne({
            store_id: storeId,
            register_id: resolved.id,
            status: 'open',
        })
            .select('_id opened_by opened_at register_id')
            .populate('opened_by', 'fullName email')
            .populate('register_id', 'name')
            .lean();
        if (existing) {
            return res.status(409).json({
                code: 'SHIFT_ALREADY_OPEN',
                message: `Quầy ${resolved.name || 'này'} đang có ca mở.`,
                open_shift: {
                    _id: existing._id,
                    opened_at: existing.opened_at || null,
                    opened_by: existing.opened_by || null,
                    register_id: existing.register_id || null,
                    store_id: storeId,
                },
            });
        }

        const shift = await ShiftSession.create({
            store_id: storeId,
            register_id: resolved.id,
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

        const populated = await ShiftSession.findById(shift._id)
            .populate('opened_by', 'fullName email')
            .populate('register_id', 'name sort_order')
            .lean();
        return res.status(201).json({ shift: populated || shift });
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
router.post('/:id/close', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid shift id' });

        const shift = await ShiftSession.findById(id);
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        const userRole = String(req.user?.role || '').toLowerCase();
        const isPrivileged = userRole === 'manager' || userRole === 'admin';
        const isOwner = String(shift.opened_by) === String(req.user.id);
        const isOverrideClose = Boolean(req.body?.override_close);
        if (String(shift.store_id) !== String(req.user.storeId) && userRole !== 'admin') {
            return res.status(403).json({ message: 'Không có quyền đóng ca này.' });
        }
        // Mặc định: ai mở ca thì người đó đóng ca.
        // Dự phòng: manager/admin có thể đóng ca hộ khi bật override_close.
        if (!isOwner && !(isPrivileged && isOverrideClose)) {
            return res.status(403).json({
                code: 'SHIFT_CLOSE_FORBIDDEN',
                message: 'Chỉ người mở ca mới được phép đóng ca này.',
            });
        }
        if (shift.status !== 'open') {
            return res.status(409).json({ code: 'SHIFT_ALREADY_CLOSED', message: 'Ca đã đóng.' });
        }

        const hasActualCash = req.body?.actual_cash !== undefined && req.body?.actual_cash !== null && String(req.body?.actual_cash) !== '';
        if (!hasActualCash) {
            return res.status(400).json({
                code: 'SHIFT_RECONCILIATION_REQUIRED',
                message: 'Vui lòng nhập tổng tiền mặt kiểm đếm khi đóng ca.',
            });
        }
        const actual_cash = normalizeNonNegativeInt(req.body?.actual_cash);
        const reconciliation_status = String(req.body?.reconciliation_status || 'pending');
        const reconciliation_note = String(req.body?.reconciliation_note || '').trim();

        const participantUsers = await ShiftUser.find({ shift_id: shift._id }).select('user_id').lean();
        const participantUserIds = participantUsers.map((x) => x.user_id).filter(Boolean);
        const expected = await computeShiftExpected(shift, participantUserIds);
        const actual_bank = req.body?.actual_bank === undefined || req.body?.actual_bank === null || String(req.body?.actual_bank) === ''
            ? normalizeNonNegativeInt(expected.expected_bank)
            : normalizeNonNegativeInt(req.body?.actual_bank);

        const targetFloatCash = normalizeNonNegativeInt(shift.target_float_cash || 1000000);
        const cash_to_keep = Math.min(targetFloatCash, actual_cash);
        const cash_to_handover = Math.max(0, actual_cash - cash_to_keep);

        shift.expected_cash = expected.expected_cash;
        shift.expected_bank = expected.expected_bank;
        shift.expected_bank_pending = expected.expected_bank_pending;
        shift.actual_cash = actual_cash;
        shift.actual_bank = actual_bank;
        shift.target_float_cash = targetFloatCash;
        shift.cash_to_keep = cash_to_keep;
        shift.cash_to_handover = cash_to_handover;
        shift.discrepancy_cash = Math.round(actual_cash - expected.expected_cash);
        shift.discrepancy_bank = Math.round(actual_bank - expected.expected_bank);
        const absCashDiscrepancy = Math.abs(Math.round(actual_cash - expected.expected_cash));
        const absBankDiscrepancy = Math.abs(Math.round(actual_bank - expected.expected_bank));
        const hasLargeDiscrepancy = absCashDiscrepancy >= 100000 || absBankDiscrepancy >= 100000;
        shift.reconciliation_status = ['pending', 'confirmed', 'disputed'].includes(reconciliation_status)
            ? reconciliation_status
            : hasLargeDiscrepancy
                ? 'disputed'
                : 'confirmed';
        if (hasLargeDiscrepancy && shift.reconciliation_status === 'confirmed') {
            shift.reconciliation_status = 'disputed';
        }
        const overrideNote = !isOwner && isOverrideClose
            ? `Đóng ca hộ bởi ${req.user.email || req.user.id} lúc ${new Date().toLocaleString('vi-VN')}.`
            : '';
        shift.reconciliation_note = [overrideNote, reconciliation_note].filter(Boolean).join(' ');
        shift.sales_snapshot = await computeShiftSalesSnapshot(shift, participantUserIds);
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

// GET /api/shifts/:id/invoices?page=&limit=
router.get('/:id/invoices', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        if (!assertStoreScope(req, res)) return;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid shift id' });
        const page = Math.max(1, Number(req.query?.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
        const shift = await ShiftSession.findById(id).lean();
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        const userRole = String(req.user?.role || '').toLowerCase();
        if (userRole !== 'admin' && String(shift.store_id) !== String(req.user.storeId)) {
            return res.status(403).json({ message: 'Không có quyền xem ca này.' });
        }

        const participantUsers = await ShiftUser.find({ shift_id: shift._id }).select('user_id').lean();
        const participantUserIds = participantUsers.map((x) => x.user_id).filter(Boolean);
        const filter = buildShiftInvoiceFilter(shift, participantUserIds);
        const total = await SalesInvoice.countDocuments(filter);
        const invoices = await SalesInvoice.find(filter)
            .sort({ invoice_at: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('created_by', 'fullName email employeeCode role')
            .populate('customer_id', 'full_name phone')
            .populate('items.product_id', 'name sku')
            .lean();

        return res.json({
            shift,
            invoices: decorateInvoiceListDisplayCode(invoices),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/shifts/:id/report
router.get('/:id/report', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
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
        const participantUsers = await ShiftUser.find({ shift_id: shift._id }).select('user_id').lean();
        const participantUserIds = participantUsers.map((x) => x.user_id).filter(Boolean);
        const expected = await computeShiftExpected(shift, participantUserIds);
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

