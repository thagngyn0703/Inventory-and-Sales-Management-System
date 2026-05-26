const { Schema, model } = require('mongoose');

const posRegisterSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: false }
);

posRegisterSchema.index({ store_id: 1, sort_order: 1, _id: 1 });

module.exports = model('PosRegister', posRegisterSchema);
