const { Schema, model } = require('mongoose');

const supplierContactSchema = new Schema(
    {
        name: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        position: { type: String, trim: true },
        note: { type: String, trim: true },
    },
    { _id: false }
);

const supplierSchema = new Schema(
    {
        code: {
            type: String,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        address: {
            type: String,
            trim: true,
        },
        tax_code: {
            type: String,
            trim: true,
        },
        contacts: {
            type: [supplierContactSchema],
            default: [],
        },
        note: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        payable_account: {
            type: Number,
            default: 0,
        },
        // Số ngày nợ mặc định — dùng để tự tính due_date khi tạo payable
        default_payment_term_days: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Ảnh mã QR chuyển khoản của nhà cung cấp (URL).
        bank_qr_image_url: {
            type: String,
            trim: true,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            default: null,
            index: true,
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
        updated_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: false,
    }
);

supplierSchema.index({ name: 1 });
supplierSchema.index({ code: 1 });
supplierSchema.index({ storeId: 1, name: 1 });

module.exports = model('Supplier', supplierSchema);
