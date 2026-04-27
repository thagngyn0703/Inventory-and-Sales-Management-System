/**
 * routes/customerNotify.js
 * API "bấm là gửi luôn" — gửi tin Zalo/SMS đến khách hàng.
 *
 * POST /api/customer-notify/debt-reminder    → nhắc nợ
 * POST /api/customer-notify/loyalty-update   → thông báo tích điểm
 * GET  /api/customer-notify/history          → lịch sử gửi tin
 * POST /api/customer-notify/:id/retry        → gửi lại job thất bại
 */

const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Store = require('../models/Store');
const SalesInvoice = require('../models/SalesInvoice');
const CustomerOutboxMessage = require('../models/CustomerOutboxMessage');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAndSend, processJob } = require('../utils/notifyWorker');
const { getNextNudge, normalizeLoyaltySettings } = require('../utils/loyalty');

const router = express.Router();

// ─── helpers ─────────────────────────────────────────────────────────────────
function assertStore(req, res) {
    const storeId = req.user?.storeId;
    if (!storeId || !mongoose.isValidObjectId(storeId)) {
        res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
        return null;
    }
    return storeId;
}

async function getStoreInfo(storeId) {
    return Store.findById(storeId).select('name phone bank_id bank_account bank_account_name loyalty_settings').lean();
}

function buildVietQRLink({ bankId, accountNumber, accountName, amount, description }) {
    if (!bankId || !accountNumber || !amount) return '';
    const encoded = encodeURIComponent(String(description || '').slice(0, 50));
    return `https://img.vietqr.io/image/${bankId}-${accountNumber}-compact.png?amount=${Math.round(amount)}&addInfo=${encoded}&accountName=${encodeURIComponent(accountName || '')}`;
}

// ─── Dedup key: chống spam 24h ────────────────────────────────────────────────
function debtIdempotencyKey(storeId, customerId) {
    const today = new Date().toISOString().slice(0, 10);
    return `debt:${storeId}:${customerId}:${today}`;
}

function loyaltyIdempotencyKey(storeId, customerId, invoiceId) {
    return `loyalty:${storeId}:${customerId}:${invoiceId}`;
}

// ─── POST /api/customer-notify/debt-reminder ─────────────────────────────────
router.post(
    '/debt-reminder',
    requireAuth,
    requireRole(['staff', 'manager', 'admin']),
    async (req, res) => {
        try {
            const storeId = assertStore(req, res);
            if (!storeId) return;

            const { customer_id, override_amount, overdue_days = 0, force_resend = false } = req.body;
            if (!customer_id || !mongoose.isValidObjectId(customer_id)) {
                return res.status(400).json({ message: 'customer_id không hợp lệ' });
            }

            // Lấy thông tin khách + kiểm tra store
            const customer = await Customer.findOne({
                _id: customer_id,
                store_id: storeId,
            }).select('full_name phone debt_account store_id').lean();
            if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng trong cửa hàng hiện tại.' });
            if (!customer.phone) return res.status(422).json({ message: 'Khách hàng chưa có số điện thoại.' });

            const debtAmount = Number(override_amount ?? customer.debt_account ?? 0);
            if (debtAmount <= 0) {
                return res.status(422).json({ message: 'Khách hàng không có công nợ cần nhắc.' });
            }

            const store = await getStoreInfo(storeId);
            const qrLink = buildVietQRLink({
                bankId: store?.bank_id,
                accountNumber: store?.bank_account,
                accountName: store?.bank_account_name,
                amount: debtAmount,
                description: `No ${customer.full_name || ''}`.slice(0, 50),
            });

            const idemKey = force_resend ? '' : debtIdempotencyKey(storeId, customer_id);

            const { job, sendResult } = await createAndSend({
                storeId,
                customerId: customer_id,
                type: 'DEBT_REMINDER',
                payload: {
                    customerName: customer.full_name,
                    storeName: store?.name || '',
                    debtAmount,
                    overdueDays: Number(overdue_days) || 0,
                    qrLink,
                    storePhone: store?.phone || '',
                },
                channels: ['ZALO', 'SMS'],
                referenceModel: 'Customer',
                referenceId: customer_id,
                createdBy: req.user.id,
                idempotencyKey: idemKey,
            });

            return res.json({
                success: sendResult.success,
                channel: sendResult.channel || null,
                already_sent: sendResult.alreadySent || false,
                error: sendResult.error || null,
                job_id: String(job._id),
                message_preview: job.message_text,
            });
        } catch (err) {
            console.error('[customerNotify] debt-reminder error:', err);
            return res.status(500).json({ message: err.message || 'Server error' });
        }
    }
);

// ─── POST /api/customer-notify/loyalty-update ────────────────────────────────
router.post(
    '/loyalty-update',
    requireAuth,
    requireRole(['staff', 'manager', 'admin']),
    async (req, res) => {
        try {
            const storeId = assertStore(req, res);
            if (!storeId) return;

            const { customer_id, invoice_id, earned_points, redeemed_points = 0 } = req.body;
            if (!customer_id || !mongoose.isValidObjectId(customer_id)) {
                return res.status(400).json({ message: 'customer_id không hợp lệ' });
            }
            if (!earned_points && !redeemed_points) {
                return res.status(422).json({ message: 'Không có thay đổi điểm để thông báo.' });
            }

            const customer = await Customer.findOne({ _id: customer_id, store_id: storeId })
                .select('full_name phone loyalty_points')
                .lean();
            if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng.' });
            if (!customer.phone) return res.status(422).json({ message: 'Khách hàng chưa có số điện thoại.' });

            const store = await getStoreInfo(storeId);
            const loyaltySettings = normalizeLoyaltySettings(store?.loyalty_settings || {});
            const currentPoints = Number(customer.loyalty_points || 0);
            const nextMilestone = getNextNudge(currentPoints, loyaltySettings.milestones || []);

            const idemKey = invoice_id ? loyaltyIdempotencyKey(storeId, customer_id, invoice_id) : '';

            const { job, sendResult } = await createAndSend({
                storeId,
                customerId: customer_id,
                type: 'LOYALTY_UPDATE',
                payload: {
                    customerName: customer.full_name,
                    storeName: store?.name || '',
                    earnedPoints: Number(earned_points || 0),
                    currentPoints,
                    nextMilestone: nextMilestone
                        ? { points_needed: nextMilestone.points_needed, value_vnd: nextMilestone.reward_value_vnd }
                        : null,
                    redeemedPoints: Number(redeemed_points || 0),
                },
                channels: ['ZALO', 'SMS'],
                referenceModel: invoice_id ? 'SalesInvoice' : 'Customer',
                referenceId: invoice_id && mongoose.isValidObjectId(invoice_id) ? invoice_id : customer_id,
                createdBy: req.user.id,
                idempotencyKey: idemKey,
            });

            return res.json({
                success: sendResult.success,
                channel: sendResult.channel || null,
                already_sent: sendResult.alreadySent || false,
                error: sendResult.error || null,
                job_id: String(job._id),
                message_preview: job.message_text,
            });
        } catch (err) {
            console.error('[customerNotify] loyalty-update error:', err);
            return res.status(500).json({ message: err.message || 'Server error' });
        }
    }
);

// ─── GET /api/customer-notify/history ────────────────────────────────────────
router.get(
    '/history',
    requireAuth,
    requireRole(['staff', 'manager', 'admin']),
    async (req, res) => {
        try {
            const storeId = assertStore(req, res);
            if (!storeId) return;

            const { customer_id, type, status, limit = 50, page = 1 } = req.query;
            const filter = { store_id: storeId };
            if (customer_id && mongoose.isValidObjectId(customer_id)) filter.customer_id = customer_id;
            if (type) filter.type = type;
            if (status) filter.status = status;

            const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
            const [list, total] = await Promise.all([
                CustomerOutboxMessage.find(filter)
                    .sort({ created_at: -1 })
                    .skip(skip)
                    .limit(Math.min(100, Number(limit)))
                    .populate('customer_id', 'full_name phone')
                    .lean(),
                CustomerOutboxMessage.countDocuments(filter),
            ]);

            return res.json({ list, total, page: Number(page), limit: Math.min(100, Number(limit)) });
        } catch (err) {
            return res.status(500).json({ message: err.message || 'Server error' });
        }
    }
);

// ─── POST /api/customer-notify/:id/retry ─────────────────────────────────────
router.post(
    '/:id/retry',
    requireAuth,
    requireRole(['staff', 'manager', 'admin']),
    async (req, res) => {
        try {
            const storeId = assertStore(req, res);
            if (!storeId) return;

            const { id } = req.params;
            if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid job id' });

            const job = await CustomerOutboxMessage.findOne({ _id: id, store_id: storeId }).lean();
            if (!job) return res.status(404).json({ message: 'Không tìm thấy job.' });
            if (job.status === 'sent') return res.json({ success: true, alreadySent: true, channel: job.sent_channel });

            // Reset để thử lại
            await CustomerOutboxMessage.updateOne(
                { _id: id },
                { $set: { status: 'queued', attempt: 0, error_message: '', idempotency_key: '' } }
            );

            const sendResult = await processJob(id);
            return res.json({ success: sendResult.success, channel: sendResult.channel || null, error: sendResult.error || null });
        } catch (err) {
            return res.status(500).json({ message: err.message || 'Server error' });
        }
    }
);

module.exports = router;
