const { Schema, model } = require('mongoose');

const salesInvoiceSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: false,
            index: true,
        },
        customer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: false
        },
        recipient_name: {
            type: String,
            trim: false,
            default: "Khách lẻ"
        },

        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        /**
         * Snapshot bất biến tại thời điểm bán — không bị ảnh hưởng khi user đổi tên/role sau này.
         * Dùng cho audit trail, báo cáo doanh số theo người bán, in hóa đơn.
         */
        seller_name: { type: String, default: '' },
        seller_role: { type: String, default: '' },
        seller_code: { type: String, default: '' },
        status: {
            type: String,
            enum: ['confirmed', 'cancelled', 'pending'],
            default: 'confirmed',
        },
        invoice_at: {
            type: Date,
            default: Date.now,
        },
        payment_method: {
            type: String,
            enum: ['cash', 'bank_transfer', 'credit', 'card', 'debt', 'split'],
            default: 'cash',
        },
        payment_status: {
            type: String,
            enum: ['unpaid', 'partial', 'paid'],
            default: 'unpaid',
            index: true,
        },
        payment_ref: {
            type: String,
            trim: true,
            index: true,
            sparse: true,
        },
        paid_at: {
            type: Date,
            default: null,
        },
        /**
         * Payment split (single source of truth).
         * - cash: tiền mặt thu tại quầy
         * - bank_transfer: tiền chuyển khoản (SePay đối soát theo payment_ref)
         *
         * Backward-compatible: nếu doc cũ chỉ có payment_method, hệ thống sẽ suy ra payment khi cần.
         */
        payment: {
            cash: { type: Number, default: 0, min: 0 },
            bank_transfer: { type: Number, default: 0, min: 0 },
        },
        shift_id: {
            type: Schema.Types.ObjectId,
            ref: 'ShiftSession',
            required: false,
            index: true,
        },
        items: [
            {
                line_id: {
                    type: String,
                    trim: true,
                },
                product_id: {
                    type: Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                unit_id: {
                    type: Schema.Types.ObjectId,
                    ref: 'ProductUnit',
                    required: false,
                },
                unit_name: {
                    type: String,
                    trim: true,
                    default: '',
                },
                exchange_value: {
                    type: Number,
                    default: 1,
                    min: 0.0001,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                base_quantity: {
                    type: Number,
                    default: 0,
                    min: 0,
                },
                unit_price: {
                    type: Number,
                    required: true,
                },
                cost_price: {
                    type: Number,
                    default: 0,
                },
                discount: {
                    type: Number,
                    default: 0,
                },
                line_total: {
                    type: Number,
                    required: true,
                },
                vat_rate_snapshot: {
                    type: Number,
                    default: 0,
                    min: 0,
                    max: 100,
                },
                line_subtotal_amount: {
                    type: Number,
                    default: 0,
                },
                line_tax_amount: {
                    type: Number,
                    default: 0,
                },
                line_net_total: {
                    type: Number,
                    default: 0,
                },
                line_profit: {
                    type: Number,
                    default: 0,
                },
                line_updated_at: {
                    type: Date,
                    default: null,
                },
            },
        ],
        total_amount: {
            type: Number,
            default: 0,
        },
        subtotal_amount: {
            type: Number,
            default: 0,
        },
        tax_amount: {
            type: Number,
            default: 0,
        },
        tax_rate_snapshot: {
            type: Number,
            default: 0,
        },
        tax_is_mixed: {
            type: Boolean,
            default: false,
        },
        /**
         * Compliance / e-invoice preparation fields (phase 2 integration ready).
         * Phase 1 only stores snapshots + issuance lifecycle state.
         */
        compliance_issue_status: {
            type: String,
            enum: ['not_issued', 'issued', 'cancelled', 'replaced'],
            default: 'not_issued',
            index: true,
        },
        compliance_issued_at: { type: Date, default: null },
        compliance_invoice_number: { type: String, trim: true, default: '' },
        compliance_series: { type: String, trim: true, default: '' },
        compliance_provider: { type: String, trim: true, default: '' },
        compliance_provider_ref: { type: String, trim: true, default: '' },
        compliance_payload_snapshot: { type: Schema.Types.Mixed, default: null },

        seller_legal_snapshot: { type: Schema.Types.Mixed, default: null },
        buyer_legal_snapshot: { type: Schema.Types.Mixed, default: null },
        returned_total_amount: {
            type: Number,
            default: 0,
        },
        returned_subtotal_amount: {
            type: Number,
            default: 0,
        },
        returned_tax_amount: {
            type: Number,
            default: 0,
        },
        paid_amount: {
            type: Number,
            default: 0,
        },
        previous_debt_paid: {
            type: Number,
            default: 0,
        },
        /** Đã áp dụng trừ nợ cũ + chốt HĐ ghi nợ (tránh chạy 2 lần; CK chỉ set sau SePay paid) */
        previous_debt_settled: {
            type: Boolean,
            default: false,
        },
        invoice_level_discount: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_redeem_points: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_redeem_value: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_promo_discount: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_eligible_amount: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_earned_points: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_earned_settled: {
            type: Boolean,
            default: false,
        },
        loyalty_reversed_points: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_refunded_redeem_points: {
            type: Number,
            default: 0,
            min: 0,
        },
        loyalty_policy_version: {
            type: Number,
            default: 1,
        },
        loyalty_settings_snapshot: {
            type: Schema.Types.Mixed,
            default: null,
        },
        debt_settlement_note: {
            type: String,
            trim: true,
            default: '',
        },
        debt_settlement_by_invoice_id: {
            type: Schema.Types.ObjectId,
            ref: 'SalesInvoice',
            default: null,
            index: true,
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
    {
        timestamps: false,
    }
);

salesInvoiceSchema.index({ store_id: 1, created_at: -1, _id: -1 });
salesInvoiceSchema.index({ store_id: 1, shift_id: 1, created_at: -1 });
salesInvoiceSchema.index({ store_id: 1, created_by: 1, created_at: -1 });

module.exports = model('SalesInvoice', salesInvoiceSchema);
