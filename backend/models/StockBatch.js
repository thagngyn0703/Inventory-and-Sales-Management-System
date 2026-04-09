const { Schema, model } = require('mongoose');

const stockBatchSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            index: true,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        initial_qty: {
            type: Number,
            required: true,
            min: 0,
        },
        remaining_qty: {
            type: Number,
            required: true,
            min: 0,
        },
        unit_cost: {
            type: Number,
            required: true,
            min: 0,
        },
        received_at: {
            type: Date,
            default: Date.now,
            index: true,
        },
        receipt_id: {
            type: Schema.Types.ObjectId,
            ref: 'GoodsReceipt',
        },
    },
    {
        timestamps: true,
    }
);

module.exports = model('StockBatch', stockBatchSchema);
