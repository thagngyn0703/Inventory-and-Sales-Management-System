function roundVnd(v) {
    return Math.round(Number(v) || 0);
}

function normalizeNonNegativeInt(v) {
    const n = roundVnd(v);
    return n > 0 ? n : 0;
}

function sumPayment(payment) {
    const cash = normalizeNonNegativeInt(payment?.cash);
    const bank_transfer = normalizeNonNegativeInt(payment?.bank_transfer);
    return { cash, bank_transfer, total: cash + bank_transfer };
}

/**
 * Normalize invoice payment split.
 *
 * Rules:
 * - expected_total = invoice_total + previous_debt_paid (when applicable)
 * - If payment provided: must sum to expected_total (except debt invoices where expected_total may be 0)
 * - If not provided: infer from payment_method
 * - payment_method becomes 'split' when both cash and bank_transfer > 0
 */
function normalizeInvoicePayment({
    payment_method,
    payment,
    expected_total,
    allowZero = false,
}) {
    const expected = normalizeNonNegativeInt(expected_total);
    const method = String(payment_method || 'cash').toLowerCase();

    if (payment && typeof payment === 'object') {
        const p = sumPayment(payment);
        if (!allowZero && expected > 0 && p.total !== expected) {
            return {
                ok: false,
                code: 'PAYMENT_SPLIT_INVALID',
                message: `Payment split không khớp tổng tiền cần thu (${expected}).`,
                expected_total: expected,
                provided_total: p.total,
            };
        }
        const outMethod = p.cash > 0 && p.bank_transfer > 0 ? 'split' : p.bank_transfer > 0 ? 'bank_transfer' : 'cash';
        return {
            ok: true,
            payment_method: outMethod,
            payment: { cash: p.cash, bank_transfer: p.bank_transfer },
        };
    }

    if (method === 'bank_transfer') {
        return { ok: true, payment_method: 'bank_transfer', payment: { cash: 0, bank_transfer: expected } };
    }
    if (method === 'card' || method === 'credit') {
        return { ok: true, payment_method: method, payment: { cash: 0, bank_transfer: expected } };
    }
    if (method === 'debt') {
        // debt invoice: not collected now (expected_total for immediate collection = 0)
        return { ok: true, payment_method: 'debt', payment: { cash: 0, bank_transfer: 0 } };
    }
    // default cash
    return { ok: true, payment_method: 'cash', payment: { cash: expected, bank_transfer: 0 } };
}

module.exports = {
    normalizeInvoicePayment,
    sumPayment,
    normalizeNonNegativeInt,
};

