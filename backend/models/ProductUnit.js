const { Schema, model } = require('mongoose');

const productUnitSchema = new Schema(
    {
        product_id: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            index: true,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
        },
        unit_name: {
            type: String,
            required: true,
            trim: true,
        },
        exchange_value: {
            type: Number,
            required: true,
            min: 0.0001,
            default: 1,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        barcode: {
            type: String,
            trim: true,
        },
        is_base: {
            type: Boolean,
            default: false,
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
    { timestamps: false }
);

productUnitSchema.index({ storeId: 1, barcode: 1 }, { unique: true, sparse: true });
productUnitSchema.index({ product_id: 1, unit_name: 1 }, { unique: true });

module.exports = model('ProductUnit', productUnitSchema);
