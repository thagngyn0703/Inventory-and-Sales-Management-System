const SalesInvoice = require('../models/SalesInvoice');
const { applyCustomerDebtAfterNewInvoice } = require('./customerDebt');

/**
 * Sau khi hóa đơn chuyển khoản được đánh dấu paid (SePay), mới trừ nợ khách và
 * chốt các hóa đơn ghi nợ pending — tránh trạng thái "đã thanh toán" khi chưa có tiền.
 * Idempotent: chỉ một luồng thắng nhờ findOneAndUpdate có điều kiện.
 */
async function settlePreviousDebtIfNeeded(invoiceId) {
    if (!invoiceId) return { settled: false, reason: 'no_id' };

    const id = String(invoiceId);

    const inv = await SalesInvoice.findOneAndUpdate(
        {
            _id: id,
            payment_status: 'paid',
            previous_debt_paid: { $gt: 0 },
            previous_debt_settled: { $ne: true },
        },
        { $set: { previous_debt_settled: true } },
        { new: true }
    );

    if (!inv) {
        return { settled: false, reason: 'skip' };
    }

    try {
        const payOld = Math.abs(Number(inv.previous_debt_paid) || 0);
        if (!inv.customer_id || payOld <= 0) {
            await SalesInvoice.updateOne({ _id: inv._id }, { $set: { previous_debt_settled: false } });
            return { settled: false, reason: 'no_customer_or_amount' };
        }

        await applyCustomerDebtAfterNewInvoice(inv.customer_id, { addDebt: 0, payOldDebt: payOld });

        await SalesInvoice.updateMany(
            { customer_id: inv.customer_id, status: 'pending', payment_method: 'debt' },
            {
                $set: {
                    status: 'confirmed',
                    payment_status: 'paid',
                    paid_at: new Date(),
                    updated_at: new Date(),
                },
            }
        );

        return { settled: true, reason: 'ok' };
    } catch (err) {
        await SalesInvoice.updateOne({ _id: inv._id }, { $set: { previous_debt_settled: false } }).catch(() => {});
        throw err;
    }
}

module.exports = {
    settlePreviousDebtIfNeeded,
};
