const { Schema, model } = require('mongoose');

const DEFAULT_LOYALTY_SETTINGS = {
    enabled: false,
    earn: {
        spend_amount_vnd: 20000,
        points: 1,
        min_invoice_amount_vnd: 20000,
    },
    redeem: {
        point_value_vnd: 500,
        min_points: 10,
        max_percent_per_invoice: 50,
        allow_with_promotion: false,
    },
    expiry_months: 12,
    milestones: [
        { points: 10, value_vnd: 5000 },
        { points: 20, value_vnd: 15000 },
        { points: 50, value_vnd: 50000 },
    ],
};

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
         * Thông tin ngân hàng để sinh QR thu nợ/thanh toán.
         * Nếu không cấu hình, QR thu nợ sẽ không hiển thị.
         */
        bank_id: {
            type: String,
            default: '',
            trim: true,
        },
        bank_account: {
            type: String,
            default: '',
            trim: true,
        },
        bank_account_name: {
            type: String,
            default: '',
            trim: true,
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
        loyalty_settings: {
            type: Schema.Types.Mixed,
            default: () => ({ ...DEFAULT_LOYALTY_SETTINGS }),
        },
        loyalty_policy_version: {
            type: Number,
            default: 1,
            min: 1,
        },
    },
    { timestamps: true }
);

module.exports = model('Store', storeSchema);
