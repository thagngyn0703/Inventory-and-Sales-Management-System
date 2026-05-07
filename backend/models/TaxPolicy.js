const { Schema, model } = require('mongoose');

const taxPolicySchema = new Schema(
    {
        scope: {
            type: String,
            enum: ['global', 'store'],
            default: 'global',
            index: true,
        },
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            default: null,
            index: true,
        },
        version_code: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        effective_from: {
            type: Date,
            required: true,
            index: true,
        },
        effective_to: {
            type: Date,
            default: null,
            index: true,
        },
        strict_compliance: {
            type: Boolean,
            default: true,
        },
        rounding_mode: {
            type: String,
            enum: ['half_up'],
            default: 'half_up',
        },
        legal_basis_ref: {
            type: String,
            default: '',
            trim: true,
        },
        exclusion_rules: {
            type: [String],
            default: [],
        },
        vat_reduction_rule: {
            eligible: { type: Boolean, default: true },
            reduced_rate: { type: Number, default: 8, min: 0, max: 100 },
            effective_from: { type: Date, default: null },
            effective_to: { type: Date, default: null },
            excluded_categories: { type: [String], default: [] },
            exclusion_rules: { type: [String], default: [] },
            eligible_categories: { type: [String], default: [] },
        },
        tax_category_rules: {
            type: Schema.Types.Mixed,
            default: {},
        },
        legal_basis: {
            law: { type: String, default: '', trim: true },
            article: { type: String, default: '', trim: true },
            clause: { type: String, default: '', trim: true },
            note: { type: String, default: '', trim: true },
        },
        mandatory_reason_codes: {
            type: [String],
            default: [],
        },
        allowed_store_profiles: {
            type: [String],
            default: ['default'],
        },
        approval_state: {
            type: String,
            enum: ['draft', 'in_review', 'approved', 'active', 'inactive'],
            default: 'draft',
            index: true,
        },
        change_reason_code: {
            type: String,
            default: '',
            trim: true,
        },
        change_note: {
            type: String,
            default: '',
            trim: true,
        },
        supersedes_policy_id: {
            type: Schema.Types.ObjectId,
            ref: 'TaxPolicy',
            default: null,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        reviewed_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        approved_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        approved_at: {
            type: Date,
            default: null,
        },
        activated_at: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

taxPolicySchema.index({ scope: 1, store_id: 1, version_code: 1 }, { unique: true });
taxPolicySchema.index({ scope: 1, store_id: 1, approval_state: 1, effective_from: -1 });

module.exports = model('TaxPolicy', taxPolicySchema);
