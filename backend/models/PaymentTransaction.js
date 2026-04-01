const { Schema, model } = require('mongoose');

const paymentTransactionSchema = new Schema(
  {
    provider: {
      type: String,
      default: 'sepay',
      index: true,
    },
    // ID giao dịch từ SePay — unique để chống xử lý lặp (idempotent)
    provider_txn_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    invoice_id: {
      type: Schema.Types.ObjectId,
      ref: 'SalesInvoice',
      default: null,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    payment_ref_matched: {
      type: String,
      trim: true,
    },
    // received: nhận webhook | matched: đã đối soát hóa đơn | unmatched: không tìm được hóa đơn
    status: {
      type: String,
      enum: ['received', 'matched', 'unmatched', 'duplicate'],
      default: 'received',
      index: true,
    },
    raw_payload: {
      type: Schema.Types.Mixed,
    },
    received_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: false }
);

module.exports = model('PaymentTransaction', paymentTransactionSchema);
