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
            enum: ['confirmed', 'cancelled', 'pending'],
            default: 'confirmed',
        },
        invoice_at: {
            type: Date,
            default: Date.now,
        },
        payment_method: {
            type: String,
            enum: ['cash', 'bank_transfer', 'credit', 'card', 'debt'],
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
                line_id: {
                    type: String,
                    trim: true,
                },
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
                cost_price: {
                    type: Number,
                    default: 0,
                },
                discount: {
                    type: Number,
                    default: 0,
                },
                line_total: {
                    type: Number,
                    required: true,
                },
                line_profit: {
                    type: Number,
                    default: 0,
                },
                line_updated_at: {
                    type: Date,
                    default: null,
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
        previous_debt_paid: {
            type: Number,
            default: 0,
        },
        /** Đã áp dụng trừ nợ cũ + chốt HĐ ghi nợ (tránh chạy 2 lần; CK chỉ set sau SePay paid) */
        previous_debt_settled: {
            type: Boolean,
            default: false,
        },
        debt_settlement_note: {
            type: String,
            trim: true,
            default: '',
        },
        debt_settlement_by_invoice_id: {
            type: Schema.Types.ObjectId,
            ref: 'SalesInvoice',
            default: null,
            index: true,
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
