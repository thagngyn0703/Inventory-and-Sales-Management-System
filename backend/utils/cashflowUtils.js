const mongoose = require('mongoose');
const CashFlow = require('../models/CashFlow');

function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

function mapPaymentMethodToCashFlow(method) {
    const m = String(method || '').toLowerCase();
    if (m === 'cash') return 'CASH';
    if (m === 'bank_transfer' || m === 'card' || m === 'credit') return 'BANK_TRANSFER';
    if (m === 'e_wallet') return 'E_WALLET';
    return 'OTHER';
}

function normalizeCategory(category, type, isSystem = false) {
    const raw = String(category || '').trim().toUpperCase();
    if (raw) return raw;
    const normalizedType = String(type || '').toUpperCase();
    if (isSystem) return normalizedType === 'INCOME' ? 'SYSTEM_INCOME' : 'SYSTEM_EXPENSE';
    return normalizedType === 'INCOME' ? 'MANUAL_INCOME' : 'MANUAL_EXPENSE';
}

async function upsertSystemCashFlow({
    storeId,
    type,
    category,
    amount,
    paymentMethod,
    referenceModel,
    referenceId,
    note,
    actorId,
    transactedAt,
    session,
}) {
    if (!storeId || !referenceModel || !referenceId) return null;
    if (!mongoose.isValidObjectId(storeId) || !mongoose.isValidObjectId(referenceId)) return null;
    const normalizedAmount = round2(amount);
    if (normalizedAmount <= 0) return null;

    const filter = {
        storeId,
        is_system: true,
        type: String(type || '').toUpperCase(),
        category: normalizeCategory(category, type, true),
        reference_model: String(referenceModel || '').trim(),
        reference_id: referenceId,
    };

    const update = {
        $set: {
            amount: normalizedAmount,
            payment_method: mapPaymentMethodToCashFlow(paymentMethod),
            note: note ? String(note).trim() : undefined,
            actor_id: actorId || undefined,
            transacted_at: transactedAt ? new Date(transactedAt) : new Date(),
        },
        $setOnInsert: {
            created_at: new Date(),
            storeId,
            is_system: true,
            type: String(type || '').toUpperCase(),
            category: normalizeCategory(category, type, true),
            reference_model: String(referenceModel || '').trim(),
            reference_id: referenceId,
        },
    };

    const q = CashFlow.findOneAndUpdate(filter, update, { upsert: true, new: true });
    if (session) q.session(session);
    return q;
}

module.exports = {
    mapPaymentMethodToCashFlow,
    normalizeCategory,
    upsertSystemCashFlow,
};
