const mongoose = require('mongoose');

/**
 * Điều chỉnh dư nợ: delta > 0 tăng nợ, delta < 0 giảm nợ. Luôn giữ debt_account >= 0 (pipeline update, atomic).
 */
async function adjustCustomerDebtAccount(customerId, delta, options = {}) {
    if (customerId == null || customerId === '') return;
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) return;

    const Customer = mongoose.model('Customer');
    const id = mongoose.isValidObjectId(customerId)
        ? new mongoose.Types.ObjectId(String(customerId))
        : customerId;

    const pipeline = [
        {
            $set: {
                debt_account: {
                    $max: [0, { $add: [{ $ifNull: ['$debt_account', 0] }, d] }],
                },
                updated_at: new Date(),
            },
        },
    ];

    const q = Customer.updateOne({ _id: id }, pipeline);
    if (options.session) q.session(options.session);
    await q;
}

/**
 * Một lần cập nhật sau tạo HĐ: cộng nợ đơn (nếu ghi nợ) và trừ tiền trả nợ cũ; kết quả không âm.
 */
async function applyCustomerDebtAfterNewInvoice(
    customerId,
    { addDebt = 0, payOldDebt = 0 },
    options = {}
) {
    if (customerId == null || customerId === '') return;
    const add = Math.max(0, Number(addDebt) || 0);
    const pay = Math.max(0, Number(payOldDebt) || 0);
    if (add === 0 && pay === 0) return;

    const Customer = mongoose.model('Customer');
    const id = mongoose.isValidObjectId(customerId)
        ? new mongoose.Types.ObjectId(String(customerId))
        : customerId;

    const pipeline = [
        {
            $set: {
                debt_account: {
                    $max: [
                        0,
                        {
                            $subtract: [
                                { $add: [{ $ifNull: ['$debt_account', 0] }, add] },
                                pay,
                            ],
                        },
                    ],
                },
                updated_at: new Date(),
            },
        },
    ];

    const q = Customer.updateOne({ _id: id }, pipeline);
    if (options.session) q.session(options.session);
    await q;
}

module.exports = {
    adjustCustomerDebtAccount,
    applyCustomerDebtAfterNewInvoice,
};
