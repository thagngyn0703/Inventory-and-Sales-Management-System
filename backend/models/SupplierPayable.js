const { Schema, model } = require('mongoose');

/**
 * Khoản phải trả cho nhà cung cấp (Accounts Payable).
 * 1 GoodsReceipt đã duyệt → tạo đúng 1 SupplierPayable (unique source_id).
 * paid_amount / remaining_amount được đồng bộ từ tổng SupplierPaymentAllocation.
 * Không cho sửa tay paid_amount / remaining_amount ngoài luồng payment.
 */
const supplierPayableSchema = new Schema(
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

        // Nguồn gốc phát sinh nợ
        source_type: {
            type: String,
            enum: ['goods_receipt'],
            default: 'goods_receipt',
        },
        source_id: {
            type: Schema.Types.ObjectId,
            ref: 'GoodsReceipt',
            required: true,
        },

        total_amount: { type: Number, required: true, min: 0 },
        paid_amount: { type: Number, default: 0, min: 0 },
        remaining_amount: { type: Number, default: 0, min: 0 },

        // open: chưa trả gì | partial: trả một phần | paid: trả đủ | cancelled: hủy
        // overdue được tính động khi đọc: remaining > 0 && due_date < today
        status: {
            type: String,
            enum: ['open', 'partial', 'paid', 'cancelled'],
            default: 'open',
        },

        due_date: { type: Date },

        note: { type: String, trim: true },
        created_by: { type: Schema.Types.ObjectId, ref: 'User' },
        created_at: { type: Date, default: Date.now },
        updated_at: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

// Đảm bảo 1 phiếu nhập chỉ tạo 1 khoản nợ
supplierPayableSchema.index(
    { storeId: 1, source_type: 1, source_id: 1 },
    { unique: true }
);
supplierPayableSchema.index({ supplier_id: 1, storeId: 1, status: 1 });

module.exports = model('SupplierPayable', supplierPayableSchema);
