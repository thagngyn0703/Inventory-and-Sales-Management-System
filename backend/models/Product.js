const { Schema, model } = require('mongoose');

const productSchema = new Schema(
    {
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
            required: false,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        sku: {
            type: String,
            required: true,
            trim: true,
        },
        barcode: {
            type: String,
            trim: true,
        },
        image_urls: [{
            type: String,
            trim: true,
        }],
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
        expiry_date: {
            type: Date,
        },
        
        
        base_unit: {
            type: String,
            trim: true,
            default: 'Cái',
        },

        selling_units: [{
            name: { type: String, trim: true, required: true },
            ratio: { type: Number, required: true, min: 0.001 },
            sale_price: { type: Number, required: true, min: 0 },
        }],
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

productSchema.index({ storeId: 1, sku: 1 }, { unique: true });
// Một barcode chỉ thuộc một sản phẩm trong cùng cửa hàng (bỏ qua doc không có barcode)
productSchema.index({ storeId: 1, barcode: 1 }, { unique: true, sparse: true });

module.exports = model('Product', productSchema);
