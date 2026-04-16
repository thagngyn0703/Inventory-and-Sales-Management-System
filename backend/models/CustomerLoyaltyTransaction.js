const { Schema, model } = require('mongoose');

const loyaltyTxnSchema = new Schema(
    {
        store_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
        customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
        type: {
            type: String,
            enum: ['EARN', 'REDEEM', 'REFUND', 'ADJUST', 'EXPIRE', 'REVERSAL'],
            required: true,
            index: true,
        },
        points: { type: Number, required: true },
        value_vnd: { type: Number, required: true, default: 0 },
        reference_model: { type: String, default: '', trim: true },
        reference_id: { type: Schema.Types.ObjectId, default: null, index: true },
        balance_after: { type: Number, required: true },
        note: { type: String, default: '', trim: true },
        idempotency_key: { type: String, default: '', trim: true },
        created_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

loyaltyTxnSchema.index(
    { idempotency_key: 1, customer_id: 1 },
    { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);

module.exports = model('CustomerLoyaltyTransaction', loyaltyTxnSchema);
