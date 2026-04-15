const { Schema, model } = require('mongoose');

const cashFlowSchema = new Schema(
    {
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['INCOME', 'EXPENSE'],
            required: true,
            index: true,
        },
        category: {
            type: String,
            default: 'UNCATEGORIZED',
            trim: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01,
        },
        payment_method: {
            type: String,
            enum: ['CASH', 'BANK_TRANSFER', 'E_WALLET', 'OTHER'],
            default: 'CASH',
            index: true,
        },
        is_system: {
            type: Boolean,
            default: false,
            index: true,
        },
        reference_model: {
            type: String,
            trim: true,
        },
        reference_id: {
            type: Schema.Types.ObjectId,
        },
        note: {
            type: String,
            trim: true,
        },
        transacted_at: {
            type: Date,
            default: Date.now,
            index: true,
        },
        actor_id: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: false }
);

cashFlowSchema.index({ storeId: 1, transacted_at: -1, _id: -1 });
cashFlowSchema.index({ storeId: 1, type: 1, transacted_at: -1 });
cashFlowSchema.index({ storeId: 1, category: 1, transacted_at: -1 });
cashFlowSchema.index({ storeId: 1, reference_model: 1, reference_id: 1 });
cashFlowSchema.index(
    { storeId: 1, is_system: 1, type: 1, category: 1, reference_model: 1, reference_id: 1 },
    {
        unique: true,
        partialFilterExpression: {
            is_system: true,
            reference_model: { $exists: true, $type: 'string' },
            reference_id: { $exists: true },
        },
    }
);

module.exports = model('CashFlow', cashFlowSchema);
