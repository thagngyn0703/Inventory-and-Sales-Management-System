const { Schema, model } = require('mongoose');

const productSchema = new Schema(
    {
        category_id: {
            type: Schema.Types.ObjectId,
            ref: 'Category',
            required: false,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        sku: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        barcode: {
            type: String,
            trim: true,
        },
        cost_price: {
            type: Number,
            default: 0,
        },
        sale_price: {
            type: Number,
            default: 0,
        },
        stock_qty: {
            type: Number,
            default: 0,
        },
        reorder_level: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
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

module.exports = model('Product', productSchema);
