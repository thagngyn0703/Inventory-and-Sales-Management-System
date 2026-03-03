const { Schema, model } = require('mongoose');

const unauthenticatedUserSchema = new Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ['manager', 'warehouse_staff', 'sales_staff'],
            required: true,
        },
        verificationToken: {
            type: String,
            required: true,
        },
        verificationTokenExpires: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

// Index để tìm nhanh theo email và token
unauthenticatedUserSchema.index({ email: 1 });
unauthenticatedUserSchema.index({ verificationToken: 1 });

module.exports = model('UnauthenticatedUser', unauthenticatedUserSchema);
