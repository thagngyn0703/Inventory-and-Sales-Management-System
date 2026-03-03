const { Schema, model } = require('mongoose');

const salesReturnSchema = new Schema(
    {
        invoice_id: {
            type: Schema.Types.ObjectId,
            ref: 'SalesInvoice',
            required: true,
        },
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
        warehouse_id: {
            type: Schema.Types.ObjectId,
            ref: 'Warehouse',
            required: true,
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
                disposition: {
                    type: String,
                    enum: ['restock', 'scrap', 'repair'],
                    default: 'restock',
                },
            },
        ],
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
