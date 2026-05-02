const { Schema, model } = require('mongoose');

const shiftSessionSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        opened_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        closed_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },
        opened_at: {
            type: Date,
            default: Date.now,
            index: true,
        },
        closed_at: {
            type: Date,
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: ['open', 'closed'],
            default: 'open',
            index: true,
        },
        opening_cash: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Expected (derived from invoices as source of truth)
        expected_cash: { type: Number, default: 0, min: 0 },
        expected_bank: { type: Number, default: 0, min: 0 },
        expected_bank_pending: { type: Number, default: 0, min: 0 },

        // Actual counted on close
        actual_cash: { type: Number, default: 0, min: 0 },
        actual_bank: { type: Number, default: 0, min: 0 },

        // Cash float rule (target 1,000,000 VND)
        target_float_cash: { type: Number, default: 1000000, min: 0 },
        cash_to_keep: { type: Number, default: 0, min: 0 },
        cash_to_handover: { type: Number, default: 0, min: 0 },

        // Discrepancies
        discrepancy_cash: { type: Number, default: 0 },
        discrepancy_bank: { type: Number, default: 0 },
        sales_snapshot: {
            total_invoice_count: { type: Number, default: 0, min: 0 },
            total_confirmed_revenue: { type: Number, default: 0, min: 0 },
            total_cash_collected: { type: Number, default: 0, min: 0 },
            total_bank_collected: { type: Number, default: 0, min: 0 },
        },

        reconciliation_status: {
            type: String,
            enum: ['pending', 'confirmed', 'disputed'],
            default: 'pending',
            index: true,
        },
        reconciliation_note: {
            type: String,
            trim: true,
            default: '',
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
        updated_at: {
            type: Date,
            default: null,
        },
    },
    { timestamps: false }
);

// Only one open shift per store at a time
shiftSessionSchema.index(
    { store_id: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'open' } }
);
shiftSessionSchema.index({ store_id: 1, opened_at: -1, _id: -1 });

module.exports = model('ShiftSession', shiftSessionSchema);

