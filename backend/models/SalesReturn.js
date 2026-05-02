const { Schema, model } = require('mongoose');

const salesReturnSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
        },
        invoice_id: {
            type: Schema.Types.ObjectId,
            ref: 'SalesInvoice',
            required: true,
        },
        customer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: false,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        return_at: {
            type: Date,
            default: Date.now,
        },
        reason: {
            type: String,
            trim: true,
        },
        reason_code: {
            type: String,
            enum: ['customer_changed_mind', 'defective', 'expired', 'other'],
            default: 'other',
            index: true,
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
                unit_price: {
                    type: Number,
                    required: true,
                }
            },
        ],
        total_amount: {
            type: Number,
            default: 0,
        },
        subtotal_amount: {
            type: Number,
            default: 0,
        },
        tax_amount: {
            type: Number,
            default: 0,
        },
        tax_rate_snapshot: {
            type: Number,
            default: 0,
        },
        approved_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        approved_at: {
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

module.exports = model('SalesReturn', salesReturnSchema);
