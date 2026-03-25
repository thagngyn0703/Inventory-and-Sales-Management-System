const { Schema, model } = require('mongoose');

const passwordResetSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        token: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

passwordResetSchema.index({ email: 1 });
passwordResetSchema.index({ token: 1 });

module.exports = model('PasswordReset', passwordResetSchema);
