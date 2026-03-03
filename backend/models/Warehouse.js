const { Schema, model } = require('mongoose');

const warehouseSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
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
    },
    {
        timestamps: false,
    }
);

module.exports = model('Warehouse', warehouseSchema);
