const { Schema, model } = require('mongoose');

const customerSchema = new Schema(
    {
        full_name: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
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
        debt_account: {
            type: Number,
            default: 0,
        },
        credit_limit: {
            type: Number,
            default: 0,
        },
        is_regular: {
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
    {
        timestamps: false,
    }
);

module.exports = model('Customer', customerSchema);
