const { Schema, model } = require('mongoose');

const purchaseOrderSchema = new Schema(
    {
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
            required: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'pending', 'approved', 'received', 'cancelled'],
            default: 'draft',
        },
        expected_date: {
            type: Date,
        },
        note: {
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
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                unit_cost: {
                    type: Number,
                    required: true,
                },
                line_total: {
                    type: Number,
                    required: true,
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
        updated_at: {
            type: Date,
            default: Date.now,
        },
        cancel_reason: {
            type: String,
            trim: true,
        },
        cancelled_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        cancelled_at: {
            type: Date,
        },
    },
    {
        timestamps: false,
    }
);

module.exports = model('PurchaseOrder', purchaseOrderSchema);
