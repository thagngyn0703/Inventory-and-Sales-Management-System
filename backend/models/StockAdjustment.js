const { Schema, model } = require('mongoose');

const stockAdjustmentSchema = new Schema(
    {
        warehouse_id: {
            type: Schema.Types.ObjectId,
            ref: 'Warehouse',
            required: false,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
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
        is_reverted: {
            type: Boolean,
            default: false,
        },
        reverted_at: {
            type: Date,
        },
        reverted_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        revert_reason: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        timestamps: false,
    }
);

module.exports = model('StockAdjustment', stockAdjustmentSchema);
