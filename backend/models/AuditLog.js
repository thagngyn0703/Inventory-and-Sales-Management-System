const { Schema, model } = require('mongoose');

const auditLogSchema = new Schema(
    {
        user_id: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        action: {
            type: String,
            required: true,
        },
        entity: {
            type: String,
            required: true,
        },
        entity_id: {
            type: Schema.Types.ObjectId,
        },
        ip_address: {
            type: String,
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

module.exports = model('AuditLog', auditLogSchema);
