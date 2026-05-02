const AuditLog = require('../models/AuditLog');

async function logAudit({
    storeId = null,
    actorId = null,
    action,
    entityType,
    entityId = null,
    note = '',
    metadata = null,
}) {
    if (!action || !entityType) return;
    await AuditLog.create({
        store_id: storeId || null,
        actor_id: actorId || null,
        action: String(action).trim(),
        entity_type: String(entityType).trim(),
        entity_id: entityId || null,
        note: String(note || '').trim(),
        metadata: metadata || null,
        created_at: new Date(),
    });
}

module.exports = { logAudit };
