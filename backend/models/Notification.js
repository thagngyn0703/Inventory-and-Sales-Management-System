const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
    {
        user_id: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            default: null,
            index: true,
        },
        type: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        is_read: {
            type: Boolean,
            default: false,
        },
        related_entity: {
            type: String,
        },
        related_id: {
            type: Schema.Types.ObjectId,
        },
        unique_key: {
            type: String,
            trim: true,
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

notificationSchema.index({ user_id: 1, storeId: 1, is_read: 1, created_at: -1 });
notificationSchema.index({ unique_key: 1 }, { unique: true, sparse: true });

module.exports = model('Notification', notificationSchema);
