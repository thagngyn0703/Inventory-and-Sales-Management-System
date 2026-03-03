const { Schema, model } = require('mongoose');

const stocktakeSchema = new Schema(
    {
        warehouse_id: {
            type: Schema.Types.ObjectId,
            ref: 'Warehouse',
            required: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['in_progress', 'completed', 'cancelled'],
            default: 'in_progress',
        },
        snapshot_at: {
            type: Date,
            default: Date.now,
        },
        items: [
            {
                product_id: {
                    type: Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                system_qty: {
                    type: Number,
                    required: true,
                },
                actual_qty: {
                    type: Number,
                    required: true,
                },
                variance: {
                    type: Number,
                },
            },
        ],
        completed_at: {
            type: Date,
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

module.exports = model('Stocktake', stocktakeSchema);
