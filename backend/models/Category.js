const { Schema, model } = require('mongoose');

const categorySchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        is_active: {
            type: Boolean,
            default: true,
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        // we don't need updatedAt for now, but we could enable timestamps
        timestamps: false,
    }
);

module.exports = model('Category', categorySchema);
