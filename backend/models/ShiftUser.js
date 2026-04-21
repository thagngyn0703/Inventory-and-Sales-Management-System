const { Schema, model } = require('mongoose');

const shiftUserSchema = new Schema(
    {
        shift_id: {
            type: Schema.Types.ObjectId,
            ref: 'ShiftSession',
            required: true,
            index: true,
        },
        user_id: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        joined_at: {
            type: Date,
            default: Date.now,
            index: true,
        },
        left_at: {
            type: Date,
            default: null,
            index: true,
        },
        role_in_shift: {
            type: String,
            enum: ['primary', 'support'],
            default: 'primary',
        },
        created_at: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

shiftUserSchema.index(
    { shift_id: 1, user_id: 1, left_at: 1 },
    { unique: true, partialFilterExpression: { left_at: null } }
);

module.exports = model('ShiftUser', shiftUserSchema);

