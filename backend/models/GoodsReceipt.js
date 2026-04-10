const { Schema, model } = require('mongoose');

const goodsReceiptSchema = new Schema(
    {
        po_id: {
            type: Schema.Types.ObjectId,
            ref: 'PurchaseOrder',
            required: false,
        },
        supplier_id: {
            type: Schema.Types.ObjectId,
            ref: 'Supplier',
            required: false,
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        received_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        approved_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        status: {
            type: String,
            enum: ['draft', 'pending', 'approved', 'rejected'],
            default: 'draft',
        },
        received_at: {
            type: Date,
            default: Date.now,
        },
        items: [
            {
                product_id: {
                    type: Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                unit_cost: {
                    type: Number,
                    required: true,
                },
                // Giá gốc (theo đơn vị dòng) mà hệ thống có tại thời điểm staff tạo phiếu — chỉ để đối chiếu
                system_unit_cost: {
                    type: Number,
                    default: 0,
                },
                unit_name: {
                    type: String,
                    trim: true,
                },
                ratio: {
                    type: Number,
                    default: 1,
                },
                // Ghi chú chênh lệch giá do staff ghi nhận (nếu có)
                price_gap_note: {
                    type: String,
                    trim: true,
                },
                expiry_date: {
                    type: Date,
                },
            },
        ],
        total_amount: {
            type: Number,
            default: 0,
        },
        reason: {
            type: String,
            trim: true,
        },
        rejection_reason: {
            type: String,
            trim: true,
        },
        // Thông tin thanh toán NCC — ghi nhận khi duyệt
        payment_type: {
            type: String,
            enum: ['cash', 'credit', 'partial'],
        },
        amount_paid_at_approval: {
            type: Number,
            default: 0,
            min: 0,
        },
        due_date_payable: {
            type: Date,
        },
        updated_at: {
            type: Date,
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: false,
    }
);

module.exports = model('GoodsReceipt', goodsReceiptSchema);
