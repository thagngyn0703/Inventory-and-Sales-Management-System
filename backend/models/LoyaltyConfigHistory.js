const { Schema, model } = require('mongoose');

const loyaltyConfigHistorySchema = new Schema(
    {
        store_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
        changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        before_config: { type: Schema.Types.Mixed, default: null },
        after_config: { type: Schema.Types.Mixed, default: null },
        before_version: { type: Number, default: 1 },
        after_version: { type: Number, default: 1 },
        change_reason: { type: String, default: '', trim: true },
        source: { type: String, default: 'manager_ui', trim: true },
    },
    { timestamps: { createdAt: 'changed_at', updatedAt: false } }
);

module.exports = model('LoyaltyConfigHistory', loyaltyConfigHistorySchema);
