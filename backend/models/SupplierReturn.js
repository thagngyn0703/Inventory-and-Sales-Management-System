const { Schema, model } = require('mongoose');

const supplierReturnSchema = new Schema(
    {
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
            required: true,
            index: true,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        total_amount: {
            type: Number,
            required: true,
            min: 0,
        },
        reason: {
            type: String,
            trim: true,
        },
        note: {
            type: String,
            trim: true,
        },
        reference_code: {
            type: String,
            trim: true,
        },
        return_date: {
            type: Date,
            default: Date.now,
        },
        status: {
            type: String,
            enum: ['approved'],
            default: 'approved',
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        approved_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        approved_at: {
            type: Date,
            default: Date.now,
        },
        payment_id: {
            type: Schema.Types.ObjectId,
            ref: 'SupplierPayment',
        },
        allocation_ids: [{
            type: Schema.Types.ObjectId,
            ref: 'SupplierPaymentAllocation',
        }],
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: false }
);

supplierReturnSchema.index({ storeId: 1, supplier_id: 1, created_at: -1 });

module.exports = model('SupplierReturn', supplierReturnSchema);
