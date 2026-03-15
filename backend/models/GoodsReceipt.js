const { Schema, model } = require('mongoose');

const goodsReceiptSchema = new Schema(
    {
        po_id: {
            type: Schema.Types.ObjectId,
            ref: 'PurchaseOrder',
            required: false,
        },
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
            required: true,
        },
        received_by: {
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
            enum: ['draft', 'pending', 'approved', 'rejected'],
            default: 'draft',
        },
        reason: {
            type: String,
            trim: true,
        },
        received_at: {
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
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                unit_cost: {
                    type: Number,
                    required: true,
                },
                unit_name: {
                    type: String,
                    default: 'Cái',
                },
                ratio: {
                    type: Number,
                    default: 1,
                },
            },
        ],
        total_amount: {
            type: Number,
            default: 0,
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

module.exports = model('GoodsReceipt', goodsReceiptSchema);
