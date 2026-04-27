const SupplierPayable = require('../models/SupplierPayable');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const Supplier = require('../models/Supplier');

/**
 * Tính lại paid_amount / remaining_amount / status cho một payable
 * dựa trên tổng các allocation đã ghi.
 * @param {string|ObjectId} payableId
 * @param {object} [sessionOpts] - { session } nếu trong transaction
 */
async function recalculatePayable(payableId, sessionOpts = {}) {
    const { session } = sessionOpts;

    const agg = await SupplierPaymentAllocation.aggregate([
        { $match: { payable_id: payableId } },
        { $group: { _id: null, total_paid: { $sum: '$amount' } } },
    ]);
    const totalPaid = agg[0]?.total_paid ?? 0;

    const payable = session
        ? await SupplierPayable.findById(payableId).session(session)
        : await SupplierPayable.findById(payableId);

    if (!payable) return null;

    payable.paid_amount = Math.round(totalPaid * 100) / 100;
    payable.remaining_amount = Math.max(
        0,
        Math.round((payable.total_amount - payable.paid_amount) * 100) / 100
    );

    if (payable.paid_amount <= 0) {
        payable.status = 'open';
    } else if (payable.remaining_amount <= 0) {
        payable.status = 'paid';
    } else {
        payable.status = 'partial';
    }

    payable.updated_at = new Date();
    await payable.save(session ? { session } : {});
    return payable;
}

/**
 * Cập nhật cache Supplier.payable_account = tổng remaining của
 * các payable chưa thanh toán đủ (open | partial) thuộc NCC + store.
 * @param {string|ObjectId} supplierId
 * @param {string|ObjectId} storeId
 */
async function refreshSupplierPayableCache(supplierId, storeId) {
    const agg = await SupplierPayable.aggregate([
        {
            $match: {
                supplier_id: supplierId,
                storeId: storeId,
                status: { $in: ['open', 'partial'] },
            },
        },
        { $group: { _id: null, total_remaining: { $sum: '$remaining_amount' } } },
    ]);
    const totalRemaining = agg[0]?.total_remaining ?? 0;

    await Supplier.findByIdAndUpdate(supplierId, {
        payable_account: Math.round(totalRemaining * 100) / 100,
        current_debt: Math.round(totalRemaining * 100) / 100,
        updated_at: new Date(),
    });
}

module.exports = { recalculatePayable, refreshSupplierPayableCache };
