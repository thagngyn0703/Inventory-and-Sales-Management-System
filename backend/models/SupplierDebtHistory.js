const { Schema, model } = require('mongoose');

const supplierDebtHistorySchema = new Schema(
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
        type: {
            type: String,
            enum: ['DEBT_INCREASE_GR', 'DEBT_DECREASE_PAYMENT', 'DEBT_DECREASE_RETURN'],
            required: true,
        },
        reference_type: {
            type: String,
            trim: true,
        },
        reference_id: {
            type: Schema.Types.ObjectId,
        },
        before_debt: {
            type: Number,
            required: true,
            default: 0,
        },
        change_amount: {
            type: Number,
            required: true,
            default: 0,
        },
        after_debt: {
            type: Number,
            required: true,
            default: 0,
        },
        note: {
            type: String,
            trim: true,
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
    {
        timestamps: false,
    }
);

supplierDebtHistorySchema.index({ storeId: 1, supplier_id: 1, created_at: -1 });
supplierDebtHistorySchema.index({ reference_type: 1, reference_id: 1, created_at: -1 });

module.exports = model('SupplierDebtHistory', supplierDebtHistorySchema);
