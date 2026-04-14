const { Schema, model } = require('mongoose');

const storeSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        address: {
            type: String,
            default: '',
            trim: true,
        },
        phone: {
            type: String,
            default: '',
            trim: true,
        },
        managerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        tax_rate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        price_includes_tax: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = model('Store', storeSchema);
