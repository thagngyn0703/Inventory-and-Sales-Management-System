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
            min: 0,
        },
        credit_limit: {
            type: Number,
            default: 0,
        },
        is_regular: {
            type: Boolean,
            default: false,
        },
        loyalty_points: {
            type: Number,
            default: 0,
        },
        lifetime_points_earned: {
            type: Number,
            default: 0,
            min: 0,
        },
        lifetime_points_used: {
            type: Number,
            default: 0,
            min: 0,
        },
        last_loyalty_activity_at: {
            type: Date,
            default: null,
        },
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            default: null,
            index: true,
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

customerSchema.pre('save', function customerDebtClamp(next) {
    if (this.isModified('debt_account') && this.debt_account != null && this.debt_account < 0) {
        this.debt_account = 0;
    }
    next();
});

// Compound unique index: SĐT chỉ unique trong cùng 1 cửa hàng, không global
customerSchema.index({ phone: 1, store_id: 1 }, { unique: true, sparse: true });

module.exports = model('Customer', customerSchema);
