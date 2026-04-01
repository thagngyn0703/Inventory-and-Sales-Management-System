const { Schema, model } = require('mongoose');

const salesInvoiceSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
        },
        customer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: false
        },
        recipient_name: {
            type: String,
            trim: false,
            default: "Khách lẻ"
        },

        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['confirmed', 'cancelled'],
            default: 'confirmed',
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
        payment_status: {
            type: String,
            enum: ['unpaid', 'partial', 'paid'],
            default: 'unpaid',
            index: true,
        },
        payment_ref: {
            type: String,
            trim: true,
            index: true,
            sparse: true,
        },
        paid_at: {
            type: Date,
            default: null,
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
