const { Schema, model } = require('mongoose');

const stockHistorySchema = new Schema(
    {
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        product_id: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            trim: true,
        },
        reference_type: {
            type: String,
            trim: true,
        },
        reference_id: {
            type: Schema.Types.ObjectId,
        },
        before_qty: {
            type: Number,
            required: true,
        },
        change_qty: {
            type: Number,
            required: true,
        },
        after_qty: {
            type: Number,
            required: true,
        },
        unit_cost: {
            type: Number,
            default: null,
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

stockHistorySchema.index({ storeId: 1, product_id: 1, created_at: -1 });
stockHistorySchema.index({ reference_type: 1, reference_id: 1, created_at: -1 });

module.exports = model('StockHistory', stockHistorySchema);
