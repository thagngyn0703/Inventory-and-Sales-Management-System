const SalesInvoice = require('../models/SalesInvoice');
const { applyCustomerDebtAfterNewInvoice } = require('./customerDebt');

function getInvoiceRefLabel(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return '#N/A';
    return `#${id}`;
}

/**
 * BUG-02: FIFO settlement — đóng từng hóa đơn pending cũ nhất trước,
 * chỉ khi số tiền đủ để đóng hoàn toàn. Không đóng khi không đủ tiền.
 */
async function fifoSettleDebtInvoicesSePay(customerId, payAmount, settlementInvoiceId) {
    const pendingInvoices = await SalesInvoice.find({
        customer_id: customerId,
        status: 'pending',
        payment_method: 'debt',
    }).sort({ created_at: 1 });

    let unallocated = Math.abs(Number(payAmount) || 0);
    const now = new Date();
    for (const inv of pendingInvoices) {
        if (unallocated <= 0) break;
        if (unallocated >= inv.total_amount) {
            await SalesInvoice.updateOne(
                { _id: inv._id },
                {
                    $set: {
                        status: 'confirmed',
                        payment_status: 'paid',
                        paid_at: now,
                        updated_at: now,
                        debt_settlement_note: `Trả nợ thông qua đơn hàng ${getInvoiceRefLabel(settlementInvoiceId)}`,
                        debt_settlement_by_invoice_id: settlementInvoiceId,
                    },
                }
            );
            unallocated -= inv.total_amount;
        } else {
            break;
        }
    }
}

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

        // BUG-02: FIFO thay updateMany — chỉ đóng hóa đơn khi đủ tiền
        await fifoSettleDebtInvoicesSePay(inv.customer_id, payOld, inv._id);

        return { settled: true, reason: 'ok' };
    } catch (err) {
        await SalesInvoice.updateOne({ _id: inv._id }, { $set: { previous_debt_settled: false } }).catch(() => {});
        throw err;
    }
}

module.exports = {
    settlePreviousDebtIfNeeded,
};
