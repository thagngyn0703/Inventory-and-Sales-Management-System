const { Schema, model } = require('mongoose');

const customerDebtPaymentSchema = new Schema(
    {
        customer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
            index: true,
        },
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            default: null,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 1,
        },
        payment_method: {
            type: String,
            enum: ['cash', 'bank_transfer'],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'confirmed', 'cancelled'],
            default: 'confirmed',
            index: true,
        },
        payment_ref: {
            type: String,
            trim: true,
            default: '',
            index: true,
        },
        provider_txn_id: {
            type: String,
            trim: true,
            default: '',
        },
        note: {
            type: String,
            trim: true,
            default: '',
        },
        received_at: {
            type: Date,
            default: Date.now,
            index: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: false,
    }
);

// Một mã tham chiếu chỉ dùng trong đúng 1 cửa hàng để tránh nhầm lẫn liên cửa hàng.
customerDebtPaymentSchema.index(
    { store_id: 1, payment_ref: 1 },
    {
        unique: true,
        partialFilterExpression: {
            payment_ref: { $type: 'string', $gt: '' },
                status: { $in: ['pending', 'processing', 'confirmed'] },
        },
    }
);

// Một provider transaction id chỉ được xác nhận một lần trên toàn hệ thống.
customerDebtPaymentSchema.index(
    { provider_txn_id: 1 },
    {
        unique: true,
        partialFilterExpression: {
            provider_txn_id: { $type: 'string', $gt: '' },
        },
    }
);

module.exports = model('CustomerDebtPayment', customerDebtPaymentSchema);
