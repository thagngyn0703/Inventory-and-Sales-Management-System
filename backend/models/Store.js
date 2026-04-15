const { Schema, model } = require('mongoose');

const storeSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        address: {
            type: String,
            default: '',
            trim: true,
        },
        phone: {
            type: String,
            default: '',
            trim: true,
        },
        managerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        tax_rate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        price_includes_tax: {
            type: Boolean,
            default: true,
        },
        /**
         * Loại hình kinh doanh — quyết định cách xử lý thuế:
         *   ho_kinh_doanh → thuế khoán cố định, KHÔNG thu VAT trên hóa đơn (tax_rate luôn = 0)
         *   doanh_nghiep  → kê khai VAT theo từng hóa đơn (tax_rate tự do 0-100)
         */
        business_type: {
            type: String,
            enum: ['ho_kinh_doanh', 'doanh_nghiep'],
            default: 'ho_kinh_doanh',
        },
    },
    { timestamps: true }
);

module.exports = model('Store', storeSchema);
