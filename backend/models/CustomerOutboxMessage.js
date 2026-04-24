const { Schema, model } = require('mongoose');

/**
 * CustomerOutboxMessage
 * Một bản ghi = một lần gửi tin nhắn đến khách hàng qua Zalo/SMS.
 * Được tạo bởi manager/staff, worker sẽ xử lý gửi thật.
 */
const customerOutboxSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        customer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
            index: true,
        },
        // 'DEBT_REMINDER' | 'LOYALTY_UPDATE'
        type: {
            type: String,
            enum: ['DEBT_REMINDER', 'LOYALTY_UPDATE'],
            required: true,
            index: true,
        },
        // Kênh gửi ưu tiên: Zalo trước, fallback SMS
        channels: {
            type: [String],
            enum: ['ZALO', 'SMS'],
            default: ['ZALO', 'SMS'],
        },
        // Dữ liệu để render nội dung tin nhắn
        payload: {
            type: Schema.Types.Mixed,
            default: {},
        },
        // Nội dung đã render sẵn
        message_text: {
            type: String,
            default: '',
            trim: true,
        },
        // 'queued' | 'processing' | 'sent' | 'failed' | 'skipped'
        status: {
            type: String,
            enum: ['queued', 'processing', 'sent', 'failed', 'skipped'],
            default: 'queued',
            index: true,
        },
        // Kênh đã gửi thành công
        sent_channel: {
            type: String,
            enum: ['ZALO', 'SMS', null],
            default: null,
        },
        // Thông tin từ provider sau khi gửi
        provider_response: {
            type: Schema.Types.Mixed,
            default: null,
        },
        error_message: {
            type: String,
            default: '',
        },
        attempt: {
            type: Number,
            default: 0,
        },
        max_attempts: {
            type: Number,
            default: 3,
        },
        // Thời điểm gửi thành công
        sent_at: {
            type: Date,
            default: null,
        },
        // Lên lịch (null = gửi ngay)
        scheduled_at: {
            type: Date,
            default: null,
        },
        // Chống spam: key để dedup nếu gửi lại trong 24h
        idempotency_key: {
            type: String,
            default: '',
            trim: true,
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        // Thông tin tham chiếu (hóa đơn, v.v.)
        reference_model: { type: String, default: '' },
        reference_id: { type: Schema.Types.ObjectId, default: null },
    },
    { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Chống spam: chỉ 1 tin cùng key trong 24h
customerOutboxSchema.index(
    { idempotency_key: 1 },
    { unique: true, sparse: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);
customerOutboxSchema.index({ store_id: 1, status: 1, created_at: -1 });
customerOutboxSchema.index({ customer_id: 1, type: 1, created_at: -1 });

module.exports = model('CustomerOutboxMessage', customerOutboxSchema);
