const { Schema, model } = require('mongoose');

const salesInvoiceSchema = new Schema(
    {
        customer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'confirmed', 'paid', 'cancelled'],
            default: 'draft',
        },
        invoice_at: {
            type: Date,
            default: Date.now,
        },
        payment_method: {
            type: String,
            enum: ['cash', 'bank_transfer', 'credit', 'card'],
            default: 'cash',
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
                },
                discount: {
                    type: Number,
                    default: 0,
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
        paid_amount: {
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

module.exports = model('SalesInvoice', salesInvoiceSchema);
