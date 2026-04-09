const { Schema, model } = require('mongoose');

/**
 * Lần thanh toán cho nhà cung cấp.
 * Một payment có thể phân bổ vào nhiều SupplierPayable qua SupplierPaymentAllocation.
 */
const supplierPaymentSchema = new Schema(
    {
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
            required: true,
            index: true,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },

        total_amount: { type: Number, required: true, min: 0.01 },

        payment_date: { type: Date, default: Date.now },
        payment_method: {
            type: String,
            enum: ['cash', 'bank_transfer', 'e_wallet', 'other'],
            default: 'cash',
        },
        reference_code: { type: String, trim: true },
        note: { type: String, trim: true },

        created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        created_at: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

supplierPaymentSchema.index({ supplier_id: 1, storeId: 1, payment_date: -1 });

module.exports = model('SupplierPayment', supplierPaymentSchema);
