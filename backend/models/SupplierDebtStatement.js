const { Schema, model } = require('mongoose');

const supplierDebtStatementSchema = new Schema(
    {
        supplier_id: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
        period_from: { type: Date, required: true },
        period_to: { type: Date, required: true },
        total_remaining_amount: { type: Number, required: true, min: 0 },
        installment_count: { type: Number, default: 1, min: 1 },
        installment_schedule: [
            {
                due_date: { type: Date, required: true },
                amount: { type: Number, required: true, min: 0 },
                note: { type: String, default: '', trim: true },
            },
        ],
        status: {
            type: String,
            enum: ['draft', 'store_signed', 'supplier_signed', 'fully_signed', 'cancelled'],
            default: 'draft',
            index: true,
        },
        store_signed_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        store_signed_at: { type: Date, default: null },
        supplier_signed_name: { type: String, default: '', trim: true },
        supplier_signed_at: { type: Date, default: null },
        signature_note: { type: String, default: '', trim: true },
        created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        created_at: { type: Date, default: Date.now },
        updated_at: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

supplierDebtStatementSchema.index({ storeId: 1, supplier_id: 1, created_at: -1 });

module.exports = model('SupplierDebtStatement', supplierDebtStatementSchema);
