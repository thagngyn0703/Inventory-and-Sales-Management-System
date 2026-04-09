const { Schema, model } = require('mongoose');

/**
 * Phân bổ tiền từ một SupplierPayment vào một SupplierPayable.
 * Cho phép: 1 payment → nhiều payable, 1 payable ← nhiều payment.
 */
const supplierPaymentAllocationSchema = new Schema(
    {
        payment_id: {
            type: Schema.Types.ObjectId,
            ref: 'SupplierPayment',
            required: true,
            index: true,
        },
        payable_id: {
            type: Schema.Types.ObjectId,
            ref: 'SupplierPayable',
            required: true,
            index: true,
        },
        amount: { type: Number, required: true, min: 0.01 },
        created_at: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

supplierPaymentAllocationSchema.index({ payment_id: 1, payable_id: 1 });

module.exports = model('SupplierPaymentAllocation', supplierPaymentAllocationSchema);
