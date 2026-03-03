const { Schema, model } = require('mongoose');

const emailLogSchema = new Schema(
    {
        to_email: {
            type: String,
            required: true,
        },
        subject: {
            type: String,
            required: true,
        },
        delivery_status: {
            type: String,
            enum: ['pending', 'sent', 'failed'],
            default: 'pending',
        },
        sent_at: {
            type: Date,
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

module.exports = model('EmailLog', emailLogSchema);
