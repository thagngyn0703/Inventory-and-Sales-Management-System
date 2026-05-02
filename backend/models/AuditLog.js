const { Schema, model } = require('mongoose');

const auditLogSchema = new Schema(
    {
        store_id: { type: Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
        actor_id: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        action: { type: String, required: true, trim: true, index: true },
        entity_type: { type: String, required: true, trim: true, index: true },
        entity_id: { type: Schema.Types.ObjectId, default: null, index: true },
        note: { type: String, default: '', trim: true },
        metadata: { type: Schema.Types.Mixed, default: null },
        created_at: { type: Date, default: Date.now, index: true },
    },
    { timestamps: false }
);

auditLogSchema.index({ store_id: 1, created_at: -1 });
auditLogSchema.index({ entity_type: 1, entity_id: 1, created_at: -1 });

module.exports = model('AuditLog', auditLogSchema);
