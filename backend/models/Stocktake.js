const { Schema, model } = require('mongoose');

const stocktakeSchema = new Schema(
    {
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'submitted', 'completed', 'cancelled'],
            default: 'draft',
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
                    default: null,
                },
                variance: {
                    type: Number,
                    default: null,
                },
                reason: {
                    type: String,
                    trim: true,
                    default: '',
                },
            },
        ],
        completed_at: {
            type: Date,
        },
        reject_reason: {
            type: String,
            trim: true,
            default: '',
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
        updated_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: false,
    }
);

module.exports = model('Stocktake', stocktakeSchema);
