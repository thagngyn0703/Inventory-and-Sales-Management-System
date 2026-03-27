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
                    trim: true,
                },
                ratio: {
                    type: Number,
                    default: 1,
                },
                expiry_date: {
                    type: Date,
                },
            },
        ],
        total_amount: {
            type: Number,
            default: 0,
        },
        reason: {
            type: String,
            trim: true,
        },
        updated_at: {
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

module.exports = model('GoodsReceipt', goodsReceiptSchema);
