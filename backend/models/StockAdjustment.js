const { Schema, model } = require('mongoose');

const stockAdjustmentSchema = new Schema(
    {
        warehouse_id: {
            type: Schema.Types.ObjectId,
            ref: 'Warehouse',
            required: false,
        },
        stocktake_id: {
            type: Schema.Types.ObjectId,
            ref: 'Stocktake',
            required: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        approved_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        reason: {
            type: String,
            trim: true,
        },
        items: [
            {
                product_id: {
                    type: Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                adjusted_qty: {
                    type: Number,
                    required: true,
                },
            },
        ],
        created_at: {
            type: Date,
            default: Date.now,
        },
        approved_at: {
            type: Date,
        },
    },
    {
        timestamps: false,
    }
);

module.exports = model('StockAdjustment', stockAdjustmentSchema);
